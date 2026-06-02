import { and, count, desc, eq, max } from "drizzle-orm";
import {
  db,
  learningStreaksTable,
  studentMilestonesTable,
  notificationsTable,
  mockExamsTable,
  practiceSessionsTable,
  performanceSummaryTable,
  recommendationsTable,
  topicsTable,
} from "@workspace/db";
import { createNotificationIfNotExists } from "./notifications";
import { logger } from "./logger";

// Engagement service: streaks, milestones, weak-area alerts and study reminders.
//
// Design rules (all enforced here):
// - Real activity only. Counts come from completed practice sessions, submitted
//   mock exams, performance_summary and recommendations — never fabricated.
// - Idempotent / no duplicates. Milestones are gated by the student_milestones
//   unique (userId, milestoneKey) index; notifications by
//   createNotificationIfNotExists.
// - Best-effort. Every exported orchestrator swallows and logs its own errors so
//   a failure here can never break exam submission, practice finish, etc.

// ---------------------------------------------------------------------------
// Date helpers — use the server calendar date (no time component) consistently.
// ---------------------------------------------------------------------------
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Whole-day difference a - b for two YYYY-MM-DD strings.
function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db_ = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db_) / 86_400_000);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Learning streaks
// ---------------------------------------------------------------------------
export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

// Update the student's learning streak for a qualifying activity that happened
// on `activityDate` (defaults to today). Increments at most once per calendar
// day, increments on consecutive days, resets to 1 after a gap. Does NOT create
// any notification — streak milestone notifications are produced by
// checkMilestones so there is exactly one notification per streak threshold.
export async function updateLearningStreak(
  userId: number,
  activityDate: string = toDateStr(new Date()),
): Promise<StreakState> {
  const [existing] = await db
    .select()
    .from(learningStreaksTable)
    .where(eq(learningStreaksTable.userId, userId))
    .limit(1);

  if (!existing) {
    await db.insert(learningStreaksTable).values({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: activityDate,
    });
    return { currentStreak: 1, longestStreak: 1, lastActivityDate: activityDate };
  }

  const last = existing.lastActivityDate;
  let current = existing.currentStreak;

  if (last == null) {
    current = 1;
  } else {
    const gap = diffDays(activityDate, last);
    if (gap === 0) {
      // Same calendar day — no increment, nothing to persist.
      return {
        currentStreak: existing.currentStreak,
        longestStreak: existing.longestStreak,
        lastActivityDate: existing.lastActivityDate,
      };
    }
    if (gap === 1) {
      current = existing.currentStreak + 1;
    } else {
      // Gap > 1 (missed a day) or a stale out-of-order date: restart at 1.
      current = 1;
    }
  }

  const longest = Math.max(existing.longestStreak, current);
  await db
    .update(learningStreaksTable)
    .set({
      currentStreak: current,
      longestStreak: longest,
      lastActivityDate: activityDate,
      updatedAt: new Date(),
    })
    .where(eq(learningStreaksTable.userId, userId));

  return {
    currentStreak: current,
    longestStreak: longest,
    lastActivityDate: activityDate,
  };
}

async function getStreak(userId: number): Promise<StreakState> {
  const [row] = await db
    .select()
    .from(learningStreaksTable)
    .where(eq(learningStreaksTable.userId, userId))
    .limit(1);
  if (!row) {
    return { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
  }
  return {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActivityDate: row.lastActivityDate,
  };
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
type MilestoneType = "practice" | "exam" | "streak" | "recommendation";

interface MilestoneDef {
  key: string;
  type: MilestoneType;
  // Notification type emitted when achieved. Streak milestones use
  // "streak_update"; everything else uses "milestone".
  notificationType: "milestone" | "streak_update";
  title: string;
  message: string;
  actionUrl: string;
}

const MILESTONE_DEFS: MilestoneDef[] = [
  {
    key: "first_practice_completed",
    type: "practice",
    notificationType: "milestone",
    title: "First Practice Completed",
    message: "Great start! You completed your first practice session.",
    actionUrl: "/practice",
  },
  {
    key: "five_practice_sessions",
    type: "practice",
    notificationType: "milestone",
    title: "5 Practice Sessions Completed",
    message: "Nice consistency! You have completed 5 practice sessions.",
    actionUrl: "/practice",
  },
  {
    key: "ten_practice_sessions",
    type: "practice",
    notificationType: "milestone",
    title: "10 Practice Sessions Completed",
    message: "Impressive dedication! You have completed 10 practice sessions.",
    actionUrl: "/practice",
  },
  {
    key: "first_mock_exam_completed",
    type: "exam",
    notificationType: "milestone",
    title: "First Mock Exam Completed",
    message:
      "You completed your first mock exam. Review your results and keep improving.",
    actionUrl: "/exams",
  },
  {
    key: "first_exam_above_80",
    type: "exam",
    notificationType: "milestone",
    title: "Strong Exam Result",
    message: "You scored above 80% on a mock exam. Keep up the good work.",
    actionUrl: "/",
  },
  {
    key: "three_day_streak",
    type: "streak",
    notificationType: "streak_update",
    title: "3-Day Learning Streak",
    message: "You practiced consistently for 3 days.",
    actionUrl: "/engagement",
  },
  {
    key: "seven_day_streak",
    type: "streak",
    notificationType: "streak_update",
    title: "7-Day Learning Streak",
    message: "Excellent consistency! You reached a 7-day learning streak.",
    actionUrl: "/engagement",
  },
  {
    key: "first_recommendation_completed",
    type: "recommendation",
    notificationType: "milestone",
    title: "First Recommendation Completed",
    message: "You completed your first personalized recommendation.",
    actionUrl: "/recommendations",
  },
];

// Evaluate every milestone against the student's REAL activity counts and create
// any newly-earned ones exactly once. The student_milestones unique index is the
// dedup source of truth: we only emit a notification when a fresh milestone row
// is actually inserted.
export async function checkMilestones(userId: number): Promise<void> {
  const [practiceRow] = await db
    .select({ c: count() })
    .from(practiceSessionsTable)
    .where(
      and(
        eq(practiceSessionsTable.userId, userId),
        eq(practiceSessionsTable.status, "completed"),
      ),
    );
  const completedPractice = practiceRow?.c ?? 0;

  const [examRow] = await db
    .select({ c: count(), best: max(mockExamsTable.score) })
    .from(mockExamsTable)
    .where(
      and(
        eq(mockExamsTable.userId, userId),
        eq(mockExamsTable.status, "submitted"),
      ),
    );
  const submittedExams = examRow?.c ?? 0;
  const bestExamScore = examRow?.best ?? null;

  const [recRow] = await db
    .select({ c: count() })
    .from(recommendationsTable)
    .where(
      and(
        eq(recommendationsTable.userId, userId),
        eq(recommendationsTable.status, "completed"),
      ),
    );
  const completedRecommendations = recRow?.c ?? 0;

  const streak = await getStreak(userId);

  const achieved: Record<string, boolean> = {
    first_practice_completed: completedPractice >= 1,
    five_practice_sessions: completedPractice >= 5,
    ten_practice_sessions: completedPractice >= 10,
    first_mock_exam_completed: submittedExams >= 1,
    first_exam_above_80: bestExamScore != null && bestExamScore >= 80,
    three_day_streak: streak.currentStreak >= 3,
    seven_day_streak: streak.currentStreak >= 7,
    first_recommendation_completed: completedRecommendations >= 1,
  };

  for (const def of MILESTONE_DEFS) {
    if (!achieved[def.key]) continue;

    // Atomically claim the milestone. If a row already exists for
    // (userId, milestoneKey) nothing is returned and we skip — no duplicate
    // milestone and no duplicate notification.
    const inserted = await db
      .insert(studentMilestonesTable)
      .values({
        userId,
        milestoneType: def.type,
        milestoneKey: def.key,
      })
      .onConflictDoNothing({
        target: [
          studentMilestonesTable.userId,
          studentMilestonesTable.milestoneKey,
        ],
      })
      .returning({ id: studentMilestonesTable.id });

    if (inserted.length === 0) continue;
    const milestoneId = inserted[0]!.id;

    const { id: notificationId } = await createNotificationIfNotExists({
      userId,
      type: def.notificationType,
      title: def.title,
      message: def.message,
      relatedEntityType: "milestone",
      relatedEntityId: milestoneId,
      actionUrl: def.actionUrl,
    });

    await db
      .update(studentMilestonesTable)
      .set({ notificationId })
      .where(eq(studentMilestonesTable.id, milestoneId));
  }
}

// ---------------------------------------------------------------------------
// Weak-area & recommendation alerts (driven by recalculated analytics)
// ---------------------------------------------------------------------------
const MAX_ALERTS_PER_RUN = 3;

export async function handleAnalyticsUpdated(userId: number): Promise<void> {
  try {
    // High-weakness topics with enough attempts to be trustworthy.
    const weakRows = await db
      .select({
        topicId: performanceSummaryTable.topicId,
        subtopicId: performanceSummaryTable.subtopicId,
        topicName: topicsTable.topicName,
        weaknessScore: performanceSummaryTable.weaknessScore,
      })
      .from(performanceSummaryTable)
      .leftJoin(
        topicsTable,
        eq(topicsTable.id, performanceSummaryTable.topicId),
      )
      .where(
        and(
          eq(performanceSummaryTable.userId, userId),
          eq(performanceSummaryTable.weaknessLevel, "weak"),
        ),
      )
      .orderBy(desc(performanceSummaryTable.weaknessScore))
      .limit(MAX_ALERTS_PER_RUN * 2);

    let created = 0;
    for (const w of weakRows) {
      if (created >= MAX_ALERTS_PER_RUN) break;
      // performanceSummary only surfaces rows once they cross the weakness
      // thresholds, but guard attempts defensively as well.
      const entityId = w.subtopicId ?? w.topicId;
      const name = w.topicName ?? "A topic";
      const { created: didCreate } = await createNotificationIfNotExists({
        userId,
        type: "weak_area_alert",
        title: "Weak Area Alert",
        message: `${name} needs more practice. Start a focused practice session.`,
        relatedEntityType: "weak_area",
        relatedEntityId: entityId,
        actionUrl: "/weak-areas",
      });
      if (didCreate) created += 1;
    }

    // High-priority active recommendations.
    const recRows = await db
      .select({
        id: recommendationsTable.id,
        text: recommendationsTable.recommendationText,
      })
      .from(recommendationsTable)
      .where(
        and(
          eq(recommendationsTable.userId, userId),
          eq(recommendationsTable.status, "active"),
          eq(recommendationsTable.priority, "high"),
        ),
      )
      .orderBy(desc(recommendationsTable.createdAt))
      .limit(MAX_ALERTS_PER_RUN);

    for (const r of recRows) {
      await createNotificationIfNotExists({
        userId,
        type: "recommendation_alert",
        title: "Recommended Focus Area",
        message: r.text,
        relatedEntityType: "recommendation",
        relatedEntityId: r.id,
        actionUrl: "/recommendations",
      });
    }
  } catch (err) {
    logger.warn({ err, userId }, "handleAnalyticsUpdated failed");
  }
}

// ---------------------------------------------------------------------------
// Study reminders (opportunistic, run on dashboard load via /engagement/summary)
// ---------------------------------------------------------------------------
export async function runStudyReminderCheck(userId: number): Promise<void> {
  try {
    const streak = await getStreak(userId);
    const today = toDateStr(new Date());

    // Inactivity in whole days since the last qualifying activity. With no
    // recorded activity we treat the student as "inactive" but only remind when
    // there is something to act on (recommendations / weak areas).
    let inactiveDays = Infinity;
    if (streak.lastActivityDate) {
      inactiveDays = diffDays(today, streak.lastActivityDate);
    }
    if (inactiveDays < 2) return;

    const [recRow] = await db
      .select({ c: count() })
      .from(recommendationsTable)
      .where(
        and(
          eq(recommendationsTable.userId, userId),
          eq(recommendationsTable.status, "active"),
        ),
      );
    const activeRecommendations = recRow?.c ?? 0;

    const [weakRow] = await db
      .select({ c: count() })
      .from(performanceSummaryTable)
      .where(
        and(
          eq(performanceSummaryTable.userId, userId),
          eq(performanceSummaryTable.weaknessLevel, "weak"),
        ),
      );
    const weakAreas = weakRow?.c ?? 0;

    const [activeSessionRow] = await db
      .select({ c: count() })
      .from(practiceSessionsTable)
      .where(
        and(
          eq(practiceSessionsTable.userId, userId),
          eq(practiceSessionsTable.status, "active"),
        ),
      );
    const unfinishedSessions = activeSessionRow?.c ?? 0;

    const hasSomethingToDo =
      activeRecommendations > 0 || weakAreas > 0 || unfinishedSessions > 0;
    if (!hasSomethingToDo) return;

    // At most one study reminder per student per calendar day.
    await createNotificationIfNotExists({
      userId,
      type: "study_reminder",
      title: "Study Reminder",
      message:
        "You have topics waiting for practice. Continue your preparation today.",
      relatedEntityType: null,
      relatedEntityId: null,
      actionUrl: activeRecommendations > 0 ? "/recommendations" : "/practice",
      since: startOfToday(),
    });
  } catch (err) {
    logger.warn({ err, userId }, "runStudyReminderCheck failed");
  }
}

// ---------------------------------------------------------------------------
// Public orchestrators (called from route handlers; never throw)
// ---------------------------------------------------------------------------
export async function handlePracticeCompleted(userId: number): Promise<void> {
  try {
    await updateLearningStreak(userId);
    await checkMilestones(userId);
    await handleAnalyticsUpdated(userId);
  } catch (err) {
    logger.warn({ err, userId }, "handlePracticeCompleted failed");
  }
}

export async function handleExamSubmitted(userId: number): Promise<void> {
  try {
    await updateLearningStreak(userId);
    await checkMilestones(userId);
    await handleAnalyticsUpdated(userId);
  } catch (err) {
    logger.warn({ err, userId }, "handleExamSubmitted failed");
  }
}

export async function handleRecommendationCompleted(
  userId: number,
): Promise<void> {
  try {
    await checkMilestones(userId);
  } catch (err) {
    logger.warn({ err, userId }, "handleRecommendationCompleted failed");
  }
}

// Opportunistic checks run when the student dashboard loads (via
// GET /engagement/summary). Idempotent and de-duplicated.
export async function runDashboardEngagementChecks(
  userId: number,
): Promise<void> {
  try {
    await runStudyReminderCheck(userId);
    await handleAnalyticsUpdated(userId);
  } catch (err) {
    logger.warn({ err, userId }, "runDashboardEngagementChecks failed");
  }
}

// ---------------------------------------------------------------------------
// Read models for the engagement endpoints
// ---------------------------------------------------------------------------
const MILESTONE_TITLES: Record<string, string> = Object.fromEntries(
  MILESTONE_DEFS.map((d) => [d.key, d.title]),
);

export interface EngagementSummary {
  currentStreak: number;
  longestStreak: number;
  milestonesCount: number;
  unreadNotificationsCount: number;
  lastActivityDate: string | null;
}

export async function getEngagementSummary(
  userId: number,
): Promise<EngagementSummary> {
  const streak = await getStreak(userId);
  const [[milestoneRow], [unreadRow]] = await Promise.all([
    db
      .select({ value: count() })
      .from(studentMilestonesTable)
      .where(eq(studentMilestonesTable.userId, userId)),
    db
      .select({ value: count() })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.status, "unread"),
        ),
      ),
  ]);
  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    milestonesCount: milestoneRow?.value ?? 0,
    unreadNotificationsCount: unreadRow?.value ?? 0,
    lastActivityDate: streak.lastActivityDate,
  };
}

export interface MilestoneView {
  milestoneType: string;
  milestoneKey: string;
  title: string;
  achievedAt: Date;
}

export async function getMilestones(userId: number): Promise<MilestoneView[]> {
  const rows = await db
    .select()
    .from(studentMilestonesTable)
    .where(eq(studentMilestonesTable.userId, userId))
    .orderBy(desc(studentMilestonesTable.achievedAt));
  return rows.map((r) => ({
    milestoneType: r.milestoneType,
    milestoneKey: r.milestoneKey,
    title: MILESTONE_TITLES[r.milestoneKey] ?? r.milestoneKey,
    achievedAt: r.achievedAt,
  }));
}
