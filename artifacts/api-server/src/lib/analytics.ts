import { and, eq } from "drizzle-orm";
import {
  db,
  questionsTable,
  topicsTable,
  mockExamsTable,
  mockExamQuestionsTable,
  practiceSessionsTable,
  practiceSessionQuestionsTable,
  performanceSummaryTable,
  recommendationsTable,
} from "@workspace/db";

// A topic/subtopic must have at least this many answered attempts before we
// will surface it as a weak area or generate recommendations for it. Prevents
// flagging topics weak from one or two unlucky answers.
export const MIN_ATTEMPTS = 3;

export type WeaknessLevel = "strong" | "needs_practice" | "weak";
export type Priority = "high" | "medium" | "low";

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// One normalized answered-question attempt, sourced from either a submitted
// mock exam or an answered practice question.
interface Attempt {
  courseId: number;
  topicId: number | null;
  subtopicId: number | null;
  correct: boolean;
  earnedScore: number | null;
  maxScore: number | null;
  responseTimeSeconds: number | null;
  lowConfidence: boolean;
  activityAt: Date | null;
}

// Correct if is_correct is true OR the full score was earned. Falls back to
// is_correct when per-question scores are missing (legacy rows).
function isAttemptCorrect(
  isCorrect: boolean | null,
  earnedScore: number | null,
  maxScore: number | null,
): boolean {
  if (earnedScore != null && maxScore != null && maxScore > 0) {
    return earnedScore >= maxScore;
  }
  return isCorrect === true;
}

function levelForScore(score: number): WeaknessLevel {
  if (score >= 70) return "weak";
  if (score >= 40) return "needs_practice";
  return "strong";
}

interface GroupAgg {
  courseId: number;
  topicId: number;
  subtopicId: number | null;
  attempts: number;
  correct: number;
  incorrect: number;
  earned: number;
  possible: number;
  responseTimes: number[];
  lowConfidence: number;
  lastActivityAt: Date | null;
}

async function collectAttempts(userId: number): Promise<Attempt[]> {
  const examRows = await db
    .select({
      courseId: questionsTable.courseId,
      topicId: questionsTable.topicId,
      subtopicId: questionsTable.subtopicId,
      isCorrect: mockExamQuestionsTable.isCorrect,
      earnedScore: mockExamQuestionsTable.earnedScore,
      maxScore: mockExamQuestionsTable.maxScore,
      responseTimeSeconds: mockExamQuestionsTable.responseTimeSeconds,
      submittedAt: mockExamsTable.submittedAt,
    })
    .from(mockExamQuestionsTable)
    .innerJoin(
      mockExamsTable,
      eq(mockExamsTable.id, mockExamQuestionsTable.examId),
    )
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, mockExamQuestionsTable.questionId),
    )
    .where(
      and(
        eq(mockExamsTable.userId, userId),
        eq(mockExamsTable.status, "submitted"),
      ),
    );

  const practiceRows = await db
    .select({
      courseId: questionsTable.courseId,
      topicId: questionsTable.topicId,
      subtopicId: questionsTable.subtopicId,
      isCorrect: practiceSessionQuestionsTable.isCorrect,
      earnedScore: practiceSessionQuestionsTable.earnedScore,
      maxScore: practiceSessionQuestionsTable.maxScore,
      responseTimeSeconds: practiceSessionQuestionsTable.responseTimeSeconds,
      confidenceLevel: practiceSessionQuestionsTable.confidenceLevel,
      answeredAt: practiceSessionQuestionsTable.answeredAt,
    })
    .from(practiceSessionQuestionsTable)
    .innerJoin(
      practiceSessionsTable,
      eq(practiceSessionsTable.id, practiceSessionQuestionsTable.sessionId),
    )
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, practiceSessionQuestionsTable.questionId),
    )
    .where(
      and(
        eq(practiceSessionsTable.userId, userId),
        eq(practiceSessionQuestionsTable.status, "answered"),
      ),
    );

  const attempts: Attempt[] = [];
  for (const r of examRows) {
    attempts.push({
      courseId: r.courseId,
      topicId: r.topicId,
      subtopicId: r.subtopicId,
      correct: isAttemptCorrect(r.isCorrect, r.earnedScore, r.maxScore),
      earnedScore: r.earnedScore,
      maxScore: r.maxScore,
      responseTimeSeconds: r.responseTimeSeconds,
      lowConfidence: false,
      activityAt: r.submittedAt,
    });
  }
  for (const r of practiceRows) {
    attempts.push({
      courseId: r.courseId,
      topicId: r.topicId,
      subtopicId: r.subtopicId,
      correct: isAttemptCorrect(r.isCorrect, r.earnedScore, r.maxScore),
      earnedScore: r.earnedScore,
      maxScore: r.maxScore,
      responseTimeSeconds: r.responseTimeSeconds,
      lowConfidence: r.confidenceLevel === "low",
      activityAt: r.answeredAt,
    });
  }
  return attempts;
}

interface ComputedSummary extends GroupAgg {
  accuracyRate: number;
  averageResponseTime: number | null;
  repeatedMistakeCount: number;
  weaknessScore: number;
  weaknessLevel: WeaknessLevel;
}

function computeSummaries(attempts: Attempt[]): ComputedSummary[] {
  const groups = new Map<string, GroupAgg>();
  for (const a of attempts) {
    // Questions with no topic can't be turned into a topic recommendation.
    if (a.topicId == null) continue;
    const key = `${a.courseId}:${a.topicId}:${a.subtopicId ?? "null"}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        courseId: a.courseId,
        topicId: a.topicId,
        subtopicId: a.subtopicId,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        earned: 0,
        possible: 0,
        responseTimes: [],
        lowConfidence: 0,
        lastActivityAt: null,
      };
      groups.set(key, g);
    }
    g.attempts += 1;
    if (a.correct) g.correct += 1;
    else g.incorrect += 1;
    if (a.earnedScore != null) g.earned += a.earnedScore;
    if (a.maxScore != null) g.possible += a.maxScore;
    if (a.responseTimeSeconds != null)
      g.responseTimes.push(a.responseTimeSeconds);
    if (a.lowConfidence) g.lowConfidence += 1;
    if (a.activityAt && (!g.lastActivityAt || a.activityAt > g.lastActivityAt)) {
      g.lastActivityAt = a.activityAt;
    }
  }

  const out: ComputedSummary[] = [];
  for (const g of groups.values()) {
    const incorrectRate = g.attempts > 0 ? g.incorrect / g.attempts : 0;
    // Wrong attempts beyond the first count as repeated mistakes.
    const repeatedMistakeCount = Math.max(0, g.incorrect - 1);
    const repeatedFactor =
      g.attempts > 0 ? Math.min(1, repeatedMistakeCount / g.attempts) : 0;
    const lowConfidenceFactor =
      g.attempts > 0 ? g.lowConfidence / g.attempts : 0;
    // No reliable per-topic response-time benchmark yet, so this stays 0.
    const slowResponseFactor = 0;
    const weaknessScore = round2(
      clamp(
        incorrectRate * 60 +
          repeatedFactor * 20 +
          lowConfidenceFactor * 10 +
          slowResponseFactor * 10,
        0,
        100,
      ),
    );
    let weaknessLevel = levelForScore(weaknessScore);
    // Not enough data to confidently call something weak.
    if (g.attempts < MIN_ATTEMPTS && weaknessLevel === "weak") {
      weaknessLevel = "needs_practice";
    }
    out.push({
      ...g,
      accuracyRate: g.attempts > 0 ? round2((g.correct / g.attempts) * 100) : 0,
      averageResponseTime: g.responseTimes.length
        ? round2(
            g.responseTimes.reduce((s, t) => s + t, 0) / g.responseTimes.length,
          )
        : null,
      repeatedMistakeCount,
      weaknessScore,
      weaknessLevel,
    });
  }
  return out;
}

export function priorityForLevel(level: WeaknessLevel): Priority {
  if (level === "weak") return "high";
  if (level === "needs_practice") return "medium";
  return "low";
}

interface DesiredRec {
  courseId: number;
  topicId: number;
  subtopicId: number | null;
  recommendationType:
    | "practice_topic"
    | "retry_mistakes"
    | "review_subtopic";
  recommendationText: string;
  priority: Priority;
}

function dedupeKey(
  courseId: number,
  topicId: number | null,
  subtopicId: number | null,
  type: string,
): string {
  return `${courseId}:${topicId ?? "null"}:${subtopicId ?? "null"}:${type}`;
}

// Recompute the student's performance_summary rows and refresh their
// recommendations. Idempotent: summaries are rebuilt from scratch and
// recommendations are upserted by (course, topic, subtopic, type).
export async function recalculateForUser(userId: number): Promise<{
  summariesUpdated: number;
  weakAreasCount: number;
  recommendationsCount: number;
}> {
  const attempts = await collectAttempts(userId);
  const summaries = computeSummaries(attempts);

  // Names for recommendation text.
  const topicIds = new Set<number>();
  for (const s of summaries) {
    topicIds.add(s.topicId);
    if (s.subtopicId != null) topicIds.add(s.subtopicId);
  }
  const topicNames = new Map<number, string>();
  if (topicIds.size) {
    const rows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable);
    for (const r of rows) topicNames.set(r.id, r.topicName);
  }

  const eligible = summaries.filter((s) => s.attempts >= MIN_ATTEMPTS);

  // A recommendation is considered satisfied once the student has practiced its
  // topic/subtopic at least twice at >= 80% accuracy, even if the weakness
  // formula hasn't fully cleared. We collect those "mastered" keys and skip
  // generating recs for them, so the no-longer-desired pass below auto-completes
  // any active rec the student worked through.
  const MASTERY_ACCURACY = 80;
  const MASTERY_MIN_SESSIONS = 2;
  const masteredTopic = new Map<string, number>();
  const masteredSubtopic = new Map<string, number>();
  const completedPractice = await db
    .select({
      courseId: practiceSessionsTable.courseId,
      topicId: practiceSessionsTable.topicId,
      subtopicId: practiceSessionsTable.subtopicId,
      earnedScore: practiceSessionsTable.earnedScore,
      totalMaxScore: practiceSessionsTable.totalMaxScore,
      correctCount: practiceSessionsTable.correctCount,
      totalQuestions: practiceSessionsTable.totalQuestions,
    })
    .from(practiceSessionsTable)
    .where(
      and(
        eq(practiceSessionsTable.userId, userId),
        eq(practiceSessionsTable.status, "completed"),
      ),
    );
  for (const p of completedPractice) {
    const accuracy =
      p.totalMaxScore > 0
        ? (p.earnedScore / p.totalMaxScore) * 100
        : p.totalQuestions > 0
          ? (p.correctCount / p.totalQuestions) * 100
          : 0;
    if (accuracy < MASTERY_ACCURACY) continue;
    // A subtopic-scoped session proves mastery of that subtopic ONLY — it must
    // not credit the parent topic (mastering one child shouldn't clear the
    // whole-topic recommendation). A whole-topic session (no subtopic) credits
    // the topic.
    if (p.subtopicId != null) {
      const k = `${p.courseId}:${p.subtopicId}`;
      masteredSubtopic.set(k, (masteredSubtopic.get(k) ?? 0) + 1);
    } else if (p.topicId != null) {
      const k = `${p.courseId}:${p.topicId}`;
      masteredTopic.set(k, (masteredTopic.get(k) ?? 0) + 1);
    }
  }
  const topicMastered = (courseId: number, topicId: number): boolean =>
    (masteredTopic.get(`${courseId}:${topicId}`) ?? 0) >= MASTERY_MIN_SESSIONS;
  const isMasteredViaPractice = (
    courseId: number,
    topicId: number,
    subtopicId: number | null,
  ): boolean =>
    subtopicId != null
      ? // A subtopic rec clears when the student mastered that subtopic, OR when
        // they mastered the whole parent topic with topic-level practice.
        (masteredSubtopic.get(`${courseId}:${subtopicId}`) ?? 0) >=
          MASTERY_MIN_SESSIONS || topicMastered(courseId, topicId)
      : topicMastered(courseId, topicId);

  // Build the set of recommendations the student should currently have.
  const desired: DesiredRec[] = [];
  for (const s of eligible) {
    if (isMasteredViaPractice(s.courseId, s.topicId, s.subtopicId)) continue;
    const label =
      (s.subtopicId != null ? topicNames.get(s.subtopicId) : undefined) ??
      topicNames.get(s.topicId) ??
      "this topic";
    if (s.weaknessLevel === "weak" || s.weaknessLevel === "needs_practice") {
      const type = s.subtopicId != null ? "review_subtopic" : "practice_topic";
      const priority: Priority =
        s.weaknessLevel === "weak" ? "high" : "medium";
      const text =
        s.weaknessLevel === "weak"
          ? `Practice ${label} because your accuracy is ${Math.round(s.accuracyRate)}%.`
          : `Review ${label} because this topic needs more practice (accuracy ${Math.round(s.accuracyRate)}%).`;
      desired.push({
        courseId: s.courseId,
        topicId: s.topicId,
        subtopicId: s.subtopicId,
        recommendationType: type,
        recommendationText: text,
        priority,
      });
    }
    if (s.repeatedMistakeCount > 0) {
      desired.push({
        courseId: s.courseId,
        topicId: s.topicId,
        subtopicId: s.subtopicId,
        recommendationType: "retry_mistakes",
        recommendationText: `Retry previous mistakes in ${label} to reduce repeated errors.`,
        priority: s.weaknessLevel === "weak" ? "high" : "medium",
      });
    }
  }

  await db.transaction(async (tx) => {
    // Rebuild summaries from scratch (derived data, safe to replace).
    await tx
      .delete(performanceSummaryTable)
      .where(eq(performanceSummaryTable.userId, userId));
    if (summaries.length) {
      const now = new Date();
      await tx.insert(performanceSummaryTable).values(
        summaries.map((s) => ({
          userId,
          courseId: s.courseId,
          topicId: s.topicId,
          subtopicId: s.subtopicId,
          attemptsCount: s.attempts,
          correctCount: s.correct,
          incorrectCount: s.incorrect,
          totalEarnedScore: round2(s.earned),
          totalPossibleScore: round2(s.possible),
          accuracyRate: s.accuracyRate,
          averageResponseTime: s.averageResponseTime,
          lowConfidenceCount: s.lowConfidence,
          repeatedMistakeCount: s.repeatedMistakeCount,
          weaknessScore: s.weaknessScore,
          weaknessLevel: s.weaknessLevel,
          lastActivityAt: s.lastActivityAt,
          updatedAt: now,
        })),
      );
    }

    // Upsert recommendations: update active ones, reactivate completed ones,
    // never resurrect dismissed ones, and complete those no longer needed.
    const existing = await tx
      .select()
      .from(recommendationsTable)
      .where(eq(recommendationsTable.userId, userId));
    const existingByKey = new Map<string, (typeof existing)[number]>();
    for (const r of existing) {
      existingByKey.set(
        dedupeKey(r.courseId, r.topicId, r.subtopicId, r.recommendationType),
        r,
      );
    }

    const desiredKeys = new Set<string>();
    const now = new Date();
    for (const d of desired) {
      const key = dedupeKey(
        d.courseId,
        d.topicId,
        d.subtopicId,
        d.recommendationType,
      );
      desiredKeys.add(key);
      const found = existingByKey.get(key);
      if (!found) {
        await tx.insert(recommendationsTable).values({
          userId,
          courseId: d.courseId,
          topicId: d.topicId,
          subtopicId: d.subtopicId,
          recommendationType: d.recommendationType,
          recommendationText: d.recommendationText,
          priority: d.priority,
          status: "active",
          source: "performance_summary",
        });
      } else if (found.status === "dismissed") {
        // Respect the student's choice to dismiss; leave untouched.
        continue;
      } else {
        await tx
          .update(recommendationsTable)
          .set({
            recommendationText: d.recommendationText,
            priority: d.priority,
            status: "active",
            updatedAt: now,
          })
          .where(eq(recommendationsTable.id, found.id));
      }
    }

    // Performance improved (or data went away): complete active recs that are
    // no longer warranted. Dismissed/completed recs are left as-is.
    for (const r of existing) {
      if (r.status !== "active") continue;
      const key = dedupeKey(
        r.courseId,
        r.topicId,
        r.subtopicId,
        r.recommendationType,
      );
      if (!desiredKeys.has(key)) {
        await tx
          .update(recommendationsTable)
          .set({ status: "completed", updatedAt: now })
          .where(eq(recommendationsTable.id, r.id));
      }
    }
  });

  const weakAreasCount = eligible.filter(
    (s) => s.weaknessLevel === "weak" || s.weaknessLevel === "needs_practice",
  ).length;

  const activeRecs = await db
    .select({ id: recommendationsTable.id })
    .from(recommendationsTable)
    .where(
      and(
        eq(recommendationsTable.userId, userId),
        eq(recommendationsTable.status, "active"),
      ),
    );

  return {
    summariesUpdated: summaries.length,
    weakAreasCount,
    recommendationsCount: activeRecs.length,
  };
}
