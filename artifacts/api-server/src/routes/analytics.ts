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
  GetStudentTopicPerformanceResponse,
  GetStudentProgressOverTimeResponse,
  GetStudentReadinessScoreResponse,
  GetLecturerProblematicQuestionsResponse,
  GetLecturerProblematicQuestionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  recalculateForUser,
  priorityForLevel,
  MIN_ATTEMPTS,
  type WeaknessLevel,
} from "../lib/analytics";
import { getAccessibleCourseIds } from "../lib/student-access";
import {
  getStudentTopicPerformance,
  getStudentActivities,
  getNameMaps,
} from "../lib/student-analytics";
import { computeReadiness } from "../lib/readiness";
import {
  getLecturerCourseIds,
  getLecturerProblematicQuestions,
} from "../lib/lecturer-analytics";

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

router.get(
  "/analytics/student/topic-performance",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const items = await getStudentTopicPerformance(req.auth!.userId);
    res.json(GetStudentTopicPerformanceResponse.parse(items));
  },
);

router.get(
  "/analytics/student/progress-over-time",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const activities = await getStudentActivities(req.auth!.userId);
    const courseIds = [...new Set(activities.map((a) => a.courseId))];
    const { courseNames } = await getNameMaps(courseIds, []);
    const points = activities.map((a) => ({
      date: a.date ? a.date.toISOString() : null,
      type: a.type,
      label: a.type === "mock_exam" ? "Mock Exam" : "Practice",
      courseId: a.courseId,
      courseName: courseNames.get(a.courseId) ?? null,
      score: a.score,
      earnedScore: a.earnedScore,
      maxScore: a.maxScore,
    }));
    res.json(GetStudentProgressOverTimeResponse.parse(points));
  },
);

router.get(
  "/analytics/student/readiness-score",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const result = await computeReadiness(req.auth!.userId);
    res.json(GetStudentReadinessScoreResponse.parse(result));
  },
);

router.get(
  "/analytics/lecturer/problematic-questions",
  requireAuth,
  requireRole("lecturer"),
  async (req, res): Promise<void> => {
    const lecturerId = req.auth!.userId;
    const { courseId } = GetLecturerProblematicQuestionsQueryParams.parse(
      req.query,
    );
    if (courseId != null) {
      const taught = await getLecturerCourseIds(lecturerId);
      if (!taught.has(courseId)) {
        res
          .status(403)
          .json({ error: "You do not teach this course." });
        return;
      }
    }
    const items = await getLecturerProblematicQuestions(lecturerId, courseId);
    res.json(GetLecturerProblematicQuestionsResponse.parse(items));
  },
);

export default router;
