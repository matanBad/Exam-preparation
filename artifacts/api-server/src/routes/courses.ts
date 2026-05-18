import { Router, type IRouter } from "express";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  topicsTable,
  usersTable,
  courseOfferingsTable,
  programsTable,
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

/**
 * Returns the set of course ids the caller can access.
 * - admin: all courses (returns null meaning "no filter").
 * - student: any course with an offering in the student's program.
 * - lecturer: any course with an offering they teach.
 */
async function visibleCourseIds(auth: {
  role: string;
  userId: number;
}): Promise<number[] | null> {
  if (auth.role === "admin") return null;
  if (auth.role === "student") {
    const [me] = await db
      .select({ programId: usersTable.programId })
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId));
    if (!me?.programId) return [];
    const rows = await db
      .selectDistinct({ courseId: courseOfferingsTable.courseId })
      .from(courseOfferingsTable)
      .where(eq(courseOfferingsTable.programId, me.programId));
    return rows.map((r) => r.courseId);
  }
  // lecturer
  const rows = await db
    .selectDistinct({ courseId: courseOfferingsTable.courseId })
    .from(courseOfferingsTable)
    .where(eq(courseOfferingsTable.lecturerId, auth.userId));
  return rows.map((r) => r.courseId);
}

router.get(
  "/courses",
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req.auth!;
    const ids = await visibleCourseIds(auth);
    if (ids !== null && ids.length === 0) {
      res.json(ListCoursesResponse.parse([]));
      return;
    }
    // Join with one offering (per access scope) for program/lecturer enrichment.
    // Students: filter offerings to their program. Lecturers: filter to their own.
    // Admins: leftJoin any offering (first match).
    const [me] = auth.role === "student"
      ? await db
          .select({ programId: usersTable.programId })
          .from(usersTable)
          .where(eq(usersTable.id, auth.userId))
      : [{ programId: null as number | null }];

    // Build the leftJoin ON-conditions for course_offerings. For admins the only
    // condition is the natural join on course id (we want any offering, if one
    // exists, for enrichment). For students/lecturers we additionally scope to
    // their program / their lecturer id so the enrichment row matches their
    // actual access.
    const joinConditions: SQL[] = [
      eq(courseOfferingsTable.courseId, coursesTable.id),
    ];
    if (auth.role === "student" && me.programId) {
      joinConditions.push(eq(courseOfferingsTable.programId, me.programId));
    } else if (auth.role === "lecturer") {
      joinConditions.push(eq(courseOfferingsTable.lecturerId, auth.userId));
    }

    const baseQuery = db
      .select({
        course: coursesTable,
        offeringId: courseOfferingsTable.id,
        programId: programsTable.id,
        programName: programsTable.name,
        programCode: programsTable.code,
        lecturerId: usersTable.id,
        lecturerName: usersTable.fullName,
      })
      .from(coursesTable)
      .leftJoin(courseOfferingsTable, and(...joinConditions))
      .leftJoin(programsTable, eq(programsTable.id, courseOfferingsTable.programId))
      .leftJoin(usersTable, eq(usersTable.id, courseOfferingsTable.lecturerId));

    const rows = ids === null
      ? await baseQuery
      : await baseQuery.where(inArray(coursesTable.id, ids));

    // Dedupe by course id, preferring rows where we have offering enrichment.
    const byCourse = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      const existing = byCourse.get(r.course.id);
      if (!existing || (!existing.offeringId && r.offeringId)) {
        byCourse.set(r.course.id, r);
      }
    }
    const courses = Array.from(byCourse.values()).map((r) => ({
      ...r.course,
      offeringId: r.offeringId,
      programId: r.programId,
      programName: r.programName,
      programCode: r.programCode,
      lecturerId: r.lecturerId,
      lecturerName: r.lecturerName,
    }));
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
    const auth = req.auth!;

    // Resolve lecturer: caller-default for lecturers, explicit for admins.
    const lecturerId =
      parsed.data.lecturerId ??
      (auth.role === "lecturer" ? auth.userId : null);
    if (!lecturerId) {
      res
        .status(400)
        .json({ error: "lecturerId is required when an admin creates a course" });
      return;
    }
    // Validate program exists.
    const [program] = await db
      .select({ id: programsTable.id })
      .from(programsTable)
      .where(eq(programsTable.id, parsed.data.programId));
    if (!program) {
      res.status(400).json({ error: "Unknown programId" });
      return;
    }
    // Validate lecturer exists and is a lecturer.
    const [lecturer] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, lecturerId));
    if (!lecturer || lecturer.role !== "lecturer") {
      res.status(400).json({ error: "lecturerId must reference a lecturer" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [course] = await tx
        .insert(coursesTable)
        .values({
          courseCode: parsed.data.courseCode,
          courseName: parsed.data.courseName,
          semester: parsed.data.semester ?? null,
          academicYear: parsed.data.academicYear ?? null,
        })
        .returning();
      const [offering] = await tx
        .insert(courseOfferingsTable)
        .values({
          courseId: course.id,
          programId: parsed.data.programId,
          lecturerId,
          semester: parsed.data.semester ?? null,
          academicYear: parsed.data.academicYear ?? null,
        })
        .returning();
      return { course, offering };
    });

    res.status(201).json(
      GetCourseResponse.parse({
        ...result.course,
        offeringId: result.offering.id,
        programId: parsed.data.programId,
        lecturerId,
      }),
    );
  },
);

/**
 * Checks if the caller can access this course. Used by GET /courses/:id
 * and GET /courses/:id/topics.
 */
async function canAccessCourse(
  auth: { role: string; userId: number },
  courseId: number,
): Promise<boolean> {
  if (auth.role === "admin") return true;
  if (auth.role === "student") {
    const [me] = await db
      .select({ programId: usersTable.programId })
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId));
    if (!me?.programId) return false;
    const [off] = await db
      .select({ id: courseOfferingsTable.id })
      .from(courseOfferingsTable)
      .where(
        and(
          eq(courseOfferingsTable.courseId, courseId),
          eq(courseOfferingsTable.programId, me.programId),
        ),
      );
    return !!off;
  }
  // lecturer
  const [off] = await db
    .select({ id: courseOfferingsTable.id })
    .from(courseOfferingsTable)
    .where(
      and(
        eq(courseOfferingsTable.courseId, courseId),
        eq(courseOfferingsTable.lecturerId, auth.userId),
      ),
    );
  return !!off;
}

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
    if (!(await canAccessCourse(auth, params.data.id))) {
      res.status(403).json({ error: "Not assigned to this course" });
      return;
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
    if (!(await canAccessCourse(auth, params.data.id))) {
      res.status(403).json({ error: "Not assigned to this course" });
      return;
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
