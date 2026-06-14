import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  topicsTable,
  questionsTable,
  mockExamsTable,
  mockExamQuestionsTable,
  practiceSessionsTable,
  practiceSessionQuestionsTable,
  studentMilestonesTable,
} from "@workspace/db";
import { getAccessibleCourseIds } from "./student-access";
import { computeReadiness } from "./readiness";
import {
  getStudentActivities,
  getStudentTopicPerformance,
  round2,
} from "./student-analytics";

const mean = (xs: number[]): number | null =>
  xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

// A graded answer counts as correct when it earned full marks (preferred) or,
// for legacy rows without scores, when the isCorrect flag is set.
function attemptCorrect(
  isCorrect: boolean | null,
  earned: number | null,
  max: number | null,
): boolean {
  if (earned != null && max != null && max > 0) return earned >= max;
  return isCorrect === true;
}

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

interface QAgg {
  attempts: number;
  incorrect: number;
}

// The questions THIS student got wrong most often in a single course, drawn
// from their submitted mock exams and answered practice questions. Unlike the
// lecturer "problematic questions" view (which aggregates the whole class), this
// is personal, so a single wrong attempt is enough to surface a question.
async function buildStudentFailedQuestions(
  userId: number,
  courseId: number,
  courseName: string | null,
) {
  const agg = new Map<number, QAgg>();
  const bump = (questionId: number, correct: boolean) => {
    let q = agg.get(questionId);
    if (!q) {
      q = { attempts: 0, incorrect: 0 };
      agg.set(questionId, q);
    }
    q.attempts += 1;
    if (!correct) q.incorrect += 1;
  };

  const examRows = await db
    .select({
      questionId: mockExamQuestionsTable.questionId,
      isCorrect: mockExamQuestionsTable.isCorrect,
      earnedScore: mockExamQuestionsTable.earnedScore,
      maxScore: mockExamQuestionsTable.maxScore,
    })
    .from(mockExamQuestionsTable)
    .innerJoin(mockExamsTable, eq(mockExamsTable.id, mockExamQuestionsTable.examId))
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, mockExamQuestionsTable.questionId),
    )
    .where(
      and(
        eq(mockExamsTable.userId, userId),
        eq(mockExamsTable.status, "submitted"),
        eq(questionsTable.courseId, courseId),
      ),
    );
  for (const r of examRows) {
    bump(r.questionId, attemptCorrect(r.isCorrect, r.earnedScore, r.maxScore));
  }

  const practiceRows = await db
    .select({
      questionId: practiceSessionQuestionsTable.questionId,
      isCorrect: practiceSessionQuestionsTable.isCorrect,
      earnedScore: practiceSessionQuestionsTable.earnedScore,
      maxScore: practiceSessionQuestionsTable.maxScore,
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
        eq(questionsTable.courseId, courseId),
      ),
    );
  for (const r of practiceRows) {
    bump(r.questionId, attemptCorrect(r.isCorrect, r.earnedScore, r.maxScore));
  }

  const failed = [...agg.entries()].filter(([, q]) => q.incorrect > 0);
  if (failed.length === 0) return [];

  const ids = failed.map(([id]) => id);
  const rows = await db
    .select({
      id: questionsTable.id,
      questionText: questionsTable.questionText,
      courseId: questionsTable.courseId,
      topicId: questionsTable.topicId,
      subtopicId: questionsTable.subtopicId,
      difficultyLevel: questionsTable.difficultyLevel,
      status: questionsTable.status,
    })
    .from(questionsTable)
    .where(inArray(questionsTable.id, ids));
  const detail = new Map(rows.map((r) => [r.id, r]));

  const topicIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.topicId, r.subtopicId].filter((x): x is number => x != null),
      ),
    ),
  ];
  const topicNames = new Map<number, string>();
  if (topicIds.length) {
    const trows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, topicIds));
    for (const t of trows) topicNames.set(t.id, t.topicName);
  }

  const out = [];
  for (const [id, q] of failed) {
    const d = detail.get(id);
    if (!d || d.status === "archived") continue;
    out.push({
      questionId: id,
      questionPreview: preview(d.questionText),
      courseId,
      courseName,
      topicId: d.topicId,
      topicName: d.topicId != null ? (topicNames.get(d.topicId) ?? null) : null,
      subtopicId: d.subtopicId,
      subtopicName:
        d.subtopicId != null ? (topicNames.get(d.subtopicId) ?? null) : null,
      difficultyLevel: d.difficultyLevel,
      attemptsCount: q.attempts,
      incorrectRate: round2((q.incorrect / q.attempts) * 100),
      status: d.status,
    });
  }
  out.sort(
    (a, b) =>
      b.incorrectRate - a.incorrectRate || b.attemptsCount - a.attemptsCount,
  );
  return out.slice(0, 5);
}

// Per-course analytics for a single student. Caller (route) verifies the
// student may access the course before invoking this.
export async function getStudentCourseAnalytics(
  userId: number,
  courseId: number,
) {
  const [course] = await db
    .select({ id: coursesTable.id, courseName: coursesTable.courseName })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  const courseName = course?.courseName ?? null;

  const accessible = await getAccessibleCourseIds(userId);

  const activities = (await getStudentActivities(userId)).filter(
    (a) => a.courseId === courseId,
  );
  const averageScoreExam = mean(
    activities.filter((a) => a.type === "mock_exam").map((a) => a.score),
  );
  const averageScorePractice = mean(
    activities.filter((a) => a.type === "practice").map((a) => a.score),
  );

  const readiness = await computeReadiness(userId, {
    activities,
    accessible,
    courseId,
  });

  const topicPerformance = (
    await getStudentTopicPerformance(userId, accessible)
  ).filter((t) => t.courseId === courseId);

  const milestoneRows = await db
    .select({ id: studentMilestonesTable.id })
    .from(studentMilestonesTable)
    .where(
      and(
        eq(studentMilestonesTable.userId, userId),
        eq(studentMilestonesTable.courseId, courseId),
      ),
    );

  const progressTrend = activities.map((a) => ({
    date: a.date ? a.date.toISOString() : null,
    type: a.type,
    label: a.type === "mock_exam" ? "Mock Exam" : "Practice",
    courseId: a.courseId,
    courseName,
    score: a.score,
    earnedScore: a.earnedScore,
    maxScore: a.maxScore,
  }));

  const mostFailedQuestions = await buildStudentFailedQuestions(
    userId,
    courseId,
    courseName,
  );

  return {
    courseId,
    courseName,
    averageScoreExam,
    averageScorePractice,
    readinessScore: readiness.readinessScore,
    readinessLabel: readiness.readinessLabel,
    readinessMessage: readiness.message,
    milestonesCount: milestoneRows.length,
    topicPerformance,
    progressTrend,
    mostFailedQuestions,
  };
}
