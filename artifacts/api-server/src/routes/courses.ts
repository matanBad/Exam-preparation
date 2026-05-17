import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  topicsTable,
  usersTable,
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

router.delete(
  "/topics/:id",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const params = UpdateTopicParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Reparent any subtopics to null so we don't orphan/cascade-destroy them
    await db
      .update(topicsTable)
      .set({ parentTopicId: null })
      .where(eq(topicsTable.parentTopicId, params.data.id));
    const deleted = await db
      .delete(topicsTable)
      .where(eq(topicsTable.id, params.data.id))
      .returning({ id: topicsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    res.status(204).end();
  },
);

router.get(
  "/courses/:id/members",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const rows = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        email: usersTable.email,
        role: usersTable.role,
        accountStatus: usersTable.accountStatus,
      })
      .from(enrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, enrollmentsTable.userId))
      .where(eq(enrollmentsTable.courseId, id));
    res.json(rows);
  },
);

router.post(
  "/courses/:id/members",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string, 10);
    const userId = Number(req.body?.userId);
    if (Number.isNaN(id) || Number.isNaN(userId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [course] = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.id, id));
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!course || !user) {
      res.status(404).json({ error: "Course or user not found" });
      return;
    }
    const [existing] = await db
      .select({ id: enrollmentsTable.id })
      .from(enrollmentsTable)
      .where(
        and(
          eq(enrollmentsTable.userId, userId),
          eq(enrollmentsTable.courseId, id),
        ),
      );
    if (existing) {
      res.status(409).json({ error: "User is already a member of this course" });
      return;
    }
    await db.insert(enrollmentsTable).values({ userId, courseId: id });
    const { passwordHash: _ph, ...safe } = user;
    res.status(201).json(safe);
  },
);

router.delete(
  "/courses/:id/members/:userId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string, 10);
    const userId = parseInt(req.params.userId as string, 10);
    if (Number.isNaN(id) || Number.isNaN(userId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(enrollmentsTable)
      .where(
        and(
          eq(enrollmentsTable.userId, userId),
          eq(enrollmentsTable.courseId, id),
        ),
      )
      .returning({ id: enrollmentsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;

// expose a helper for `and` if needed elsewhere
export { and };
