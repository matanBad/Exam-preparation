import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  topicsTable,
  mockExamsTable,
  practiceSessionsTable,
  performanceSummaryTable,
} from "@workspace/db";
import { getAccessibleCourseIds } from "./student-access";
import { MIN_ATTEMPTS, priorityForLevel, type WeaknessLevel } from "./analytics";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// One graded activity (a submitted mock exam or a completed practice session)
// normalized to a 0-100 score so exams and practice can be compared directly.
export interface StudentActivity {
  type: "mock_exam" | "practice";
  courseId: number;
  date: Date | null;
  score: number;
  earnedScore: number | null;
  maxScore: number | null;
}

// Returns the student's graded activities sorted chronologically (oldest first).
// Mock-exam score is already a 0-100 percentage; practice is earned/max * 100.
export async function getStudentActivities(
  userId: number,
): Promise<StudentActivity[]> {
  const exams = await db
    .select({
      courseId: mockExamsTable.courseId,
      score: mockExamsTable.score,
      submittedAt: mockExamsTable.submittedAt,
    })
    .from(mockExamsTable)
    .where(
      and(
        eq(mockExamsTable.userId, userId),
        eq(mockExamsTable.status, "submitted"),
      ),
    );

  const practices = await db
    .select({
      courseId: practiceSessionsTable.courseId,
      earnedScore: practiceSessionsTable.earnedScore,
      totalMaxScore: practiceSessionsTable.totalMaxScore,
      completedAt: practiceSessionsTable.completedAt,
    })
    .from(practiceSessionsTable)
    .where(
      and(
        eq(practiceSessionsTable.userId, userId),
        eq(practiceSessionsTable.status, "completed"),
      ),
    );

  const out: StudentActivity[] = [];
  for (const e of exams) {
    if (e.score == null) continue;
    out.push({
      type: "mock_exam",
      courseId: e.courseId,
      date: e.submittedAt,
      score: round2(e.score),
      earnedScore: null,
      maxScore: null,
    });
  }
  for (const p of practices) {
    // A completed session with no scored questions can't be turned into a
    // meaningful percentage; skip it rather than report a misleading 0%.
    if (p.totalMaxScore <= 0) continue;
    out.push({
      type: "practice",
      courseId: p.courseId,
      date: p.completedAt,
      score: round2((p.earnedScore / p.totalMaxScore) * 100),
      earnedScore: round2(p.earnedScore),
      maxScore: round2(p.totalMaxScore),
    });
  }
  out.sort(
    (a, b) =>
      (a.date?.getTime() ?? Number.POSITIVE_INFINITY) -
      (b.date?.getTime() ?? Number.POSITIVE_INFINITY),
  );
  return out;
}

export type PerformanceRow = typeof performanceSummaryTable.$inferSelect;

// Performance-summary rows with enough attempts to be trustworthy and for
// courses the student can still access.
export async function getEligibleSummaries(
  userId: number,
  accessible?: Set<number>,
): Promise<PerformanceRow[]> {
  const acc = accessible ?? (await getAccessibleCourseIds(userId));
  const rows = await db
    .select()
    .from(performanceSummaryTable)
    .where(eq(performanceSummaryTable.userId, userId));
  return rows.filter(
    (r) => r.attemptsCount >= MIN_ATTEMPTS && acc.has(r.courseId),
  );
}

export async function getNameMaps(
  courseIds: number[],
  topicIds: number[],
): Promise<{ courseNames: Map<number, string>; topicNames: Map<number, string> }> {
  const courseNames = new Map<number, string>();
  if (courseIds.length) {
    const rows = await db
      .select({ id: coursesTable.id, courseName: coursesTable.courseName })
      .from(coursesTable)
      .where(inArray(coursesTable.id, courseIds));
    for (const c of rows) courseNames.set(c.id, c.courseName);
  }
  const topicNames = new Map<number, string>();
  if (topicIds.length) {
    const rows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, topicIds));
    for (const t of rows) topicNames.set(t.id, t.topicName);
  }
  return { courseNames, topicNames };
}

export interface TopicPerformanceItem {
  courseId: number;
  courseName: string | null;
  topicId: number;
  topicName: string | null;
  subtopicId: number | null;
  subtopicName: string | null;
  accuracyRate: number;
  weaknessLevel: WeaknessLevel;
  weaknessScore: number;
  attemptsCount: number;
  priority: ReturnType<typeof priorityForLevel>;
}

// The student's per-topic/subtopic performance, weakest first.
export async function getStudentTopicPerformance(
  userId: number,
  accessible?: Set<number>,
): Promise<TopicPerformanceItem[]> {
  const acc = accessible ?? (await getAccessibleCourseIds(userId));
  const eligible = await getEligibleSummaries(userId, acc);
  eligible.sort(
    (a, b) =>
      b.weaknessScore - a.weaknessScore ||
      b.repeatedMistakeCount - a.repeatedMistakeCount ||
      a.accuracyRate - b.accuracyRate,
  );

  const courseIds = [...new Set(eligible.map((r) => r.courseId))];
  const topicIds = [
    ...new Set(
      eligible.flatMap((r) =>
        [r.topicId, r.subtopicId].filter((x): x is number => x != null),
      ),
    ),
  ];
  const { courseNames, topicNames } = await getNameMaps(courseIds, topicIds);

  return eligible.map((r) => {
    const level = r.weaknessLevel as WeaknessLevel;
    return {
      courseId: r.courseId,
      courseName: courseNames.get(r.courseId) ?? null,
      topicId: r.topicId,
      topicName: topicNames.get(r.topicId) ?? null,
      subtopicId: r.subtopicId,
      subtopicName:
        r.subtopicId != null ? (topicNames.get(r.subtopicId) ?? null) : null,
      accuracyRate: r.accuracyRate,
      weaknessLevel: level,
      weaknessScore: r.weaknessScore,
      attemptsCount: r.attemptsCount,
      priority: priorityForLevel(level),
    };
  });
}
