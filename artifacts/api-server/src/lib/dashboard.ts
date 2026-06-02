import { and, eq } from "drizzle-orm";
import { db, recommendationsTable } from "@workspace/db";
import { getAccessibleCourseIds } from "./student-access";
import { computeReadiness } from "./readiness";
import {
  getStudentActivities,
  getEligibleSummaries,
  getNameMaps,
  getStudentTopicPerformance,
  round2,
} from "./student-analytics";

// Assembles the student dashboard payload from existing data only (submitted
// mock exams, completed practice sessions, performance_summary, recommendations).
// All figures are scoped to the requesting student; nothing is persisted.
export async function getStudentDashboardAnalytics(userId: number) {
  const accessible = await getAccessibleCourseIds(userId);
  const activities = await getStudentActivities(userId);

  const averageScore = activities.length
    ? round2(activities.reduce((s, a) => s + a.score, 0) / activities.length)
    : null;

  // Most recent 5 activities (newest first).
  const recentRaw = [...activities].reverse().slice(0, 5);

  const topicPerformance = await getStudentTopicPerformance(userId, accessible);

  const eligible = await getEligibleSummaries(userId, accessible);
  const weakAreasCount = eligible.filter(
    (s) => s.weaknessLevel === "weak" || s.weaknessLevel === "needs_practice",
  ).length;
  const strongAreasCount = eligible.filter(
    (s) => s.weaknessLevel === "strong",
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

  const readiness = await computeReadiness(userId, { activities, accessible });

  const practiceActivities = activities.filter((a) => a.type === "practice");
  const practiceSessionsCount = practiceActivities.length;
  const recentPracticeAccuracy = practiceActivities.length
    ? practiceActivities[practiceActivities.length - 1].score
    : null;

  // Course names for every course referenced by recent scores or the trend.
  const courseIds = [...new Set(activities.map((a) => a.courseId))];
  const { courseNames } = await getNameMaps(courseIds, []);

  const progressTrend = activities.map((a) => ({
    date: a.date ? a.date.toISOString() : null,
    type: a.type,
    label: a.type === "mock_exam" ? "Mock Exam" : "Practice",
    courseId: a.courseId,
    courseName: courseNames.get(a.courseId) ?? null,
    score: a.score,
    earnedScore: a.earnedScore,
    maxScore: a.maxScore,
  }));

  return {
    averageScore,
    recentScores: recentRaw.map((a) => ({
      type: a.type,
      courseId: a.courseId,
      courseName: courseNames.get(a.courseId) ?? null,
      score: a.score,
      date: a.date ? a.date.toISOString() : null,
    })),
    topicPerformance,
    weakAreasCount,
    strongAreasCount,
    activeRecommendationsCount: activeRecs.length,
    readinessScore: readiness.readinessScore,
    readinessLabel: readiness.readinessLabel,
    readinessMessage: readiness.message,
    practiceSessionsCount,
    recentPracticeAccuracy,
    progressTrend,
  };
}
