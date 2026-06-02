import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  topicsTable,
  performanceSummaryTable,
} from "@workspace/db";
import {
  RecalculateAnalyticsResponse,
  GetWeakAreasResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  recalculateForUser,
  priorityForLevel,
  MIN_ATTEMPTS,
  type WeaknessLevel,
} from "../lib/analytics";
import { getAccessibleCourseIds } from "../lib/student-access";

const router: IRouter = Router();

router.post(
  "/analytics/recalculate",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const result = await recalculateForUser(req.auth!.userId);
    res.json(RecalculateAnalyticsResponse.parse(result));
  },
);

router.get(
  "/analytics/weak-areas",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const userId = req.auth!.userId;
    const accessible = await getAccessibleCourseIds(userId);

    const rows = await db
      .select()
      .from(performanceSummaryTable)
      .where(
        and(
          eq(performanceSummaryTable.userId, userId),
          inArray(performanceSummaryTable.weaknessLevel, [
            "weak",
            "needs_practice",
          ]),
        ),
      )
      .orderBy(
        desc(performanceSummaryTable.weaknessScore),
        desc(performanceSummaryTable.repeatedMistakeCount),
        asc(performanceSummaryTable.accuracyRate),
      );

    // Only surface rows with enough data and for courses the student can access.
    const visible = rows.filter(
      (r) => r.attemptsCount >= MIN_ATTEMPTS && accessible.has(r.courseId),
    );

    const courseIds = [...new Set(visible.map((r) => r.courseId))];
    const topicIds = [
      ...new Set(
        visible.flatMap((r) =>
          [r.topicId, r.subtopicId].filter((x): x is number => x != null),
        ),
      ),
    ];
    const courseNames = new Map<number, string>();
    if (courseIds.length) {
      const crows = await db
        .select({ id: coursesTable.id, courseName: coursesTable.courseName })
        .from(coursesTable)
        .where(inArray(coursesTable.id, courseIds));
      for (const c of crows) courseNames.set(c.id, c.courseName);
    }
    const topicNames = new Map<number, string>();
    if (topicIds.length) {
      const trows = await db
        .select({ id: topicsTable.id, topicName: topicsTable.topicName })
        .from(topicsTable)
        .where(inArray(topicsTable.id, topicIds));
      for (const t of trows) topicNames.set(t.id, t.topicName);
    }

    res.json(
      GetWeakAreasResponse.parse(
        visible.map((r) => ({
          courseId: r.courseId,
          courseName: courseNames.get(r.courseId) ?? null,
          topicId: r.topicId,
          topicName: topicNames.get(r.topicId) ?? null,
          subtopicId: r.subtopicId,
          subtopicName:
            r.subtopicId != null
              ? (topicNames.get(r.subtopicId) ?? null)
              : null,
          accuracyRate: r.accuracyRate,
          attemptsCount: r.attemptsCount,
          correctCount: r.correctCount,
          incorrectCount: r.incorrectCount,
          repeatedMistakeCount: r.repeatedMistakeCount,
          weaknessScore: r.weaknessScore,
          weaknessLevel: r.weaknessLevel as WeaknessLevel,
          priority: priorityForLevel(r.weaknessLevel as WeaknessLevel),
        })),
      ),
    );
  },
);

export default router;
