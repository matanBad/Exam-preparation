import { getAccessibleCourseIds } from "./student-access";
import {
  getStudentActivities,
  getEligibleSummaries,
  clamp,
  type StudentActivity,
} from "./student-analytics";

export interface ReadinessResult {
  readinessScore: number | null;
  readinessLabel: string;
  message: string | null;
}

// Fewer than this many graded activities and we don't pretend to know how
// ready the student is — we ask for more data instead.
const MIN_ACTIVITIES = 2;

const INSUFFICIENT: ReadinessResult = {
  readinessScore: null,
  readinessLabel: "Not enough data",
  message:
    "Complete more exams or practice sessions to calculate readiness.",
};

function labelFor(score: number): string {
  if (score >= 85) return "Exam ready";
  if (score >= 70) return "Good progress";
  if (score >= 40) return "Getting there";
  return "Needs significant practice";
}

function buildMessage(score: number, weakCount: number): string {
  if (weakCount > 0) {
    return `You're improving, but ${weakCount} topic${weakCount === 1 ? "" : "s"} still need${weakCount === 1 ? "s" : ""} practice.`;
  }
  if (score >= 85) return "You're well prepared across your topics.";
  if (score >= 70) return "You're on track — keep practicing to stay sharp.";
  return "Keep practicing to raise your readiness.";
}

export interface ReadinessContext {
  activities?: StudentActivity[];
  accessible?: Set<number>;
  // When set, the weak-area health component is restricted to this course, so
  // the result reflects readiness for a single course rather than overall.
  courseId?: number;
}

// Composite exam-readiness estimate (0-100). Weighting:
//   average accuracy 45% + recent progress 20% + weak-area health 20%
//   + practice consistency 15%. Returns a null score (with an explanatory
// label/message) when there isn't enough graded activity to judge.
export async function computeReadiness(
  userId: number,
  ctx: ReadinessContext = {},
): Promise<ReadinessResult> {
  const accessible = ctx.accessible ?? (await getAccessibleCourseIds(userId));
  const activities = ctx.activities ?? (await getStudentActivities(userId));

  if (activities.length < MIN_ACTIVITIES) return INSUFFICIENT;

  const averageAccuracy =
    activities.reduce((s, a) => s + a.score, 0) / activities.length;

  // Recent progress: compare the more recent half of activities to the
  // earlier half. activities are already chronological (oldest first).
  const mid = Math.floor(activities.length / 2);
  const earlier = activities.slice(0, mid);
  const later = activities.slice(mid);
  const avg = (arr: StudentActivity[]) =>
    arr.reduce((s, a) => s + a.score, 0) / arr.length;
  const earlierAvg = earlier.length ? avg(earlier) : avg(later);
  const laterAvg = avg(later);
  const recentProgressScore = clamp(50 + (laterAvg - earlierAvg) * 2.5, 0, 100);

  // Weak-area health: each weak/needs-practice topic chips away at readiness.
  // Scope to a single course when requested (course-level readiness).
  const allEligible = await getEligibleSummaries(userId, accessible);
  const eligible =
    ctx.courseId != null
      ? allEligible.filter((s) => s.courseId === ctx.courseId)
      : allEligible;
  const weakCount = eligible.filter(
    (s) => s.weaknessLevel === "weak" || s.weaknessLevel === "needs_practice",
  ).length;
  const weakAreaAdjustment = clamp(100 - weakCount * 12, 0, 100);

  // Practice consistency: reward recent practice activity (last 14 days).
  const now = Date.now();
  const recentPractice = activities.filter(
    (a) =>
      a.type === "practice" &&
      a.date != null &&
      now - a.date.getTime() <= 14 * 86_400_000,
  ).length;
  const practiceConsistencyScore = clamp(recentPractice * 25, 0, 100);

  const raw =
    averageAccuracy * 0.45 +
    recentProgressScore * 0.2 +
    weakAreaAdjustment * 0.2 +
    practiceConsistencyScore * 0.15;
  const readinessScore = Math.round(clamp(raw, 0, 100));

  return {
    readinessScore,
    readinessLabel: labelFor(readinessScore),
    message: buildMessage(readinessScore, weakCount),
  };
}
