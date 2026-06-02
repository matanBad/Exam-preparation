import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  topicsTable,
  recommendationsTable,
  type Recommendation,
} from "@workspace/db";
import {
  GetRecommendationsResponse,
  CompleteRecommendationParams,
  CompleteRecommendationResponse,
  DismissRecommendationParams,
  DismissRecommendationResponse,
  GetRevisionPlanResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getAccessibleCourseIds } from "../lib/student-access";
import type { Priority } from "../lib/analytics";

const router: IRouter = Router();

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SUGGESTED_COUNT: Record<Priority, number> = { high: 10, medium: 7, low: 5 };

// Active recommendations for the student, restricted to courses they can still
// access, decorated with course/topic/subtopic names.
async function loadActiveRecommendations(userId: number) {
  const accessible = await getAccessibleCourseIds(userId);
  const rows = await db
    .select()
    .from(recommendationsTable)
    .where(
      and(
        eq(recommendationsTable.userId, userId),
        eq(recommendationsTable.status, "active"),
      ),
    );
  const visible = rows.filter((r) => accessible.has(r.courseId));

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

  return visible.map((r) => ({
    row: r,
    courseName: courseNames.get(r.courseId) ?? null,
    topicName: r.topicId != null ? (topicNames.get(r.topicId) ?? null) : null,
    subtopicName:
      r.subtopicId != null ? (topicNames.get(r.subtopicId) ?? null) : null,
  }));
}

function serialize(
  r: Recommendation,
  courseName: string | null,
  topicName: string | null,
  subtopicName: string | null,
) {
  return {
    id: r.id,
    userId: r.userId,
    courseId: r.courseId,
    courseName,
    topicId: r.topicId,
    topicName,
    subtopicId: r.subtopicId,
    subtopicName,
    recommendationType: r.recommendationType as
      | "practice_topic"
      | "retry_mistakes"
      | "review_subtopic"
      | "revision_plan_item",
    recommendationText: r.recommendationText,
    priority: r.priority as Priority,
    status: r.status as "active" | "completed" | "dismissed",
    source: r.source as "performance_summary" | "mock_exam" | "practice",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get(
  "/recommendations",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const decorated = await loadActiveRecommendations(req.auth!.userId);
    decorated.sort(
      (a, b) =>
        (PRIORITY_RANK[a.row.priority] ?? 9) -
        (PRIORITY_RANK[b.row.priority] ?? 9),
    );
    res.json(
      GetRecommendationsResponse.parse(
        decorated.map((d) =>
          serialize(d.row, d.courseName, d.topicName, d.subtopicName),
        ),
      ),
    );
  },
);

async function updateStatus(
  userId: number,
  id: number,
  status: "completed" | "dismissed",
): Promise<Recommendation | { forbidden: true } | null> {
  const [rec] = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.id, id));
  if (!rec) return null;
  if (rec.userId !== userId) return { forbidden: true };
  const [updated] = await db
    .update(recommendationsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(recommendationsTable.id, id))
    .returning();
  return updated;
}

async function nameLookup(rec: Recommendation) {
  let courseName: string | null = null;
  const [c] = await db
    .select({ courseName: coursesTable.courseName })
    .from(coursesTable)
    .where(eq(coursesTable.id, rec.courseId));
  courseName = c?.courseName ?? null;
  const ids = [rec.topicId, rec.subtopicId].filter(
    (x): x is number => x != null,
  );
  const names = new Map<number, string>();
  if (ids.length) {
    const trows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, ids));
    for (const t of trows) names.set(t.id, t.topicName);
  }
  return {
    courseName,
    topicName: rec.topicId != null ? (names.get(rec.topicId) ?? null) : null,
    subtopicName:
      rec.subtopicId != null ? (names.get(rec.subtopicId) ?? null) : null,
  };
}

router.patch(
  "/recommendations/:id/complete",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const params = CompleteRecommendationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await updateStatus(
      req.auth!.userId,
      params.data.id,
      "completed",
    );
    if (result === null) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    if ("forbidden" in result) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const names = await nameLookup(result);
    res.json(
      CompleteRecommendationResponse.parse(
        serialize(result, names.courseName, names.topicName, names.subtopicName),
      ),
    );
  },
);

router.patch(
  "/recommendations/:id/dismiss",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const params = DismissRecommendationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await updateStatus(
      req.auth!.userId,
      params.data.id,
      "dismissed",
    );
    if (result === null) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    if ("forbidden" in result) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const names = await nameLookup(result);
    res.json(
      DismissRecommendationResponse.parse(
        serialize(result, names.courseName, names.topicName, names.subtopicName),
      ),
    );
  },
);

// Revision-plan ordering buckets (lower = earlier):
// 0 high-priority weak topics/subtopics, 1 repeated mistakes,
// 2 medium-priority topics, 3 everything else.
function planBucket(type: string, priority: string): number {
  if (type === "retry_mistakes") return 1;
  if (priority === "high") return 0;
  if (priority === "medium") return 2;
  return 3;
}

router.get(
  "/revision-plan",
  requireAuth,
  requireRole("student"),
  async (req, res): Promise<void> => {
    const decorated = await loadActiveRecommendations(req.auth!.userId);
    if (decorated.length === 0) {
      res.json(
        GetRevisionPlanResponse.parse({
          hasEnoughData: false,
          message:
            "Not enough activity data yet to generate a revision plan. Complete more exams or practice sessions to get started.",
          items: [],
        }),
      );
      return;
    }

    const sorted = [...decorated].sort((a, b) => {
      const ba = planBucket(a.row.recommendationType, a.row.priority);
      const bb = planBucket(b.row.recommendationType, b.row.priority);
      if (ba !== bb) return ba - bb;
      return (
        (PRIORITY_RANK[a.row.priority] ?? 9) -
        (PRIORITY_RANK[b.row.priority] ?? 9)
      );
    });

    const items = sorted.map((d, idx) => {
      const r = d.row;
      const label = d.subtopicName ?? d.topicName ?? "this topic";
      const priority = r.priority as Priority;
      const title =
        r.recommendationType === "retry_mistakes"
          ? `Retry mistakes in ${label}`
          : `Practice ${label}`;
      return {
        order: idx + 1,
        title,
        reason: r.recommendationText,
        priority,
        recommendationId: r.id,
        recommendationType: r.recommendationType as
          | "practice_topic"
          | "retry_mistakes"
          | "review_subtopic"
          | "revision_plan_item",
        courseId: r.courseId,
        courseName: d.courseName,
        topicId: r.topicId,
        topicName: d.topicName,
        subtopicId: r.subtopicId,
        subtopicName: d.subtopicName,
        suggestedQuestionCount: SUGGESTED_COUNT[priority] ?? 5,
      };
    });

    res.json(
      GetRevisionPlanResponse.parse({
        hasEnoughData: true,
        message: null,
        items,
      }),
    );
  },
);

export default router;
