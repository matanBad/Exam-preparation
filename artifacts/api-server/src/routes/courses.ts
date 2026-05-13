import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  topicsTable,
} from "@workspace/db";
import {
  ListCoursesResponse,
  CreateCourseBody,
  GetCourseParams,
  GetCourseResponse,
  UpdateCourseParams,
  UpdateCourseBody,
  UpdateCourseResponse,
  ListCourseTopicsParams,
  ListCourseTopicsResponse,
  CreateTopicParams,
  CreateTopicBody,
  UpdateTopicParams,
  UpdateTopicBody,
  UpdateTopicResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/courses",
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req.auth!;
    let courses;
    if (auth.role === "student") {
      const enrolled = await db
        .select({ courseId: enrollmentsTable.courseId })
        .from(enrollmentsTable)
        .where(eq(enrollmentsTable.userId, auth.userId));
      const ids = enrolled.map((e) => e.courseId);
      courses = ids.length
        ? await db
            .select()
            .from(coursesTable)
            .where(inArray(coursesTable.id, ids))
        : [];
    } else {
      courses = await db.select().from(coursesTable);
    }
    res.json(ListCoursesResponse.parse(courses));
  },
);

router.post(
  "/courses",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateCourseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [course] = await db
      .insert(coursesTable)
      .values({
        courseCode: parsed.data.courseCode,
        courseName: parsed.data.courseName,
        semester: parsed.data.semester ?? null,
        academicYear: parsed.data.academicYear ?? null,
      })
      .returning();
    res.status(201).json(GetCourseResponse.parse(course));
  },
);

router.get(
  "/courses/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetCourseParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const auth = req.auth!;
    if (auth.role === "student") {
      const [enr] = await db
        .select()
        .from(enrollmentsTable)
        .where(
          and(
            eq(enrollmentsTable.userId, auth.userId),
            eq(enrollmentsTable.courseId, params.data.id),
          ),
        );
      if (!enr) {
        res.status(403).json({ error: "Not enrolled in this course" });
        return;
      }
    }
    const [course] = await db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.id, params.data.id));
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(GetCourseResponse.parse(course));
  },
);

router.put(
  "/courses/:id",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const params = UpdateCourseParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateCourseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(coursesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(coursesTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(UpdateCourseResponse.parse(updated));
  },
);

router.get(
  "/courses/:id/topics",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListCourseTopicsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const auth = req.auth!;
    if (auth.role === "student") {
      const [enr] = await db
        .select()
        .from(enrollmentsTable)
        .where(
          and(
            eq(enrollmentsTable.userId, auth.userId),
            eq(enrollmentsTable.courseId, params.data.id),
          ),
        );
      if (!enr) {
        res.status(403).json({ error: "Not enrolled in this course" });
        return;
      }
    }
    const topics = await db
      .select()
      .from(topicsTable)
      .where(eq(topicsTable.courseId, params.data.id));
    res.json(ListCourseTopicsResponse.parse(topics));
  },
);

router.post(
  "/courses/:id/topics",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const params = CreateTopicParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateTopicBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [topic] = await db
      .insert(topicsTable)
      .values({
        courseId: params.data.id,
        topicName: parsed.data.topicName,
        parentTopicId: parsed.data.parentTopicId ?? null,
        weight: parsed.data.weight ?? null,
      })
      .returning();
    res.status(201).json(topic);
  },
);

router.put(
  "/topics/:id",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const params = UpdateTopicParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateTopicBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.topicName !== undefined)
      updateValues.topicName = parsed.data.topicName;
    if (parsed.data.parentTopicId !== undefined)
      updateValues.parentTopicId = parsed.data.parentTopicId;
    if (parsed.data.weight !== undefined)
      updateValues.weight = parsed.data.weight;
    if (parsed.data.status !== undefined)
      updateValues.status = parsed.data.status;

    const [updated] = await db
      .update(topicsTable)
      .set(updateValues)
      .where(eq(topicsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    res.json(UpdateTopicResponse.parse(updated));
  },
);

export default router;

// expose a helper for `and` if needed elsewhere
export { and };
