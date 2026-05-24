import { Router, type IRouter } from "express";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  coursesTable,
  enrollmentsTable,
  topicsTable,
  usersTable,
  courseOfferingsTable,
  programsTable,
  questionsTable,
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
 * - student: courses that satisfy ALL of:
 *     (a) the student belongs to a program,
 *     (b) the course has an active offering in that program,
 *     (c) the student is enrolled in that course.
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
    const offered = await db
      .selectDistinct({ courseId: courseOfferingsTable.courseId })
      .from(courseOfferingsTable)
      .where(eq(courseOfferingsTable.programId, me.programId));
    const offeredIds = new Set(offered.map((r) => r.courseId));
    if (offeredIds.size === 0) return [];
    const enrolled = await db
      .select({ courseId: enrollmentsTable.courseId })
      .from(enrollmentsTable)
      .where(
        and(
          eq(enrollmentsTable.userId, auth.userId),
          eq(enrollmentsTable.enrollmentStatus, "active"),
        ),
      );
    return enrolled
      .map((e) => e.courseId)
      .filter((cid) => offeredIds.has(cid));
  }
  // lecturer
  const rows = await db
    .selectDistinct({ courseId: courseOfferingsTable.courseId })
    .from(courseOfferingsTable)
    .where(eq(courseOfferingsTable.lecturerId, auth.userId));
  return rows.map((r) => r.courseId);
}

/**
 * Returns true when `userId` teaches an offering of `courseId`.
 * Used to gate topic management for lecturers.
 */
async function lecturerTeachesCourse(
  userId: number,
  courseId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: courseOfferingsTable.id })
    .from(courseOfferingsTable)
    .where(
      and(
        eq(courseOfferingsTable.lecturerId, userId),
        eq(courseOfferingsTable.courseId, courseId),
      ),
    );
  return !!row;
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
        offeringStudyYear: courseOfferingsTable.studyYear,
        offeringSemester: courseOfferingsTable.semester,
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

    // Aggregate per-course question counts on the server so the client
    // doesn't have to download the full question bank just to render
    // overview cards. Counts are bounded to the same visible course set
    // so they always match what the caller can actually open.
    // Students always see the approved bank; pending/draft is a privileged
    // count (admins see all, lecturers see only courses they teach — the
    // visibility filter via ids has already been applied).
    const visibleCourseIdList = Array.from(byCourse.keys());
    const countRows = visibleCourseIdList.length
      ? await db
          .select({
            courseId: questionsTable.courseId,
            approved: sql<number>`COUNT(*) FILTER (WHERE ${questionsTable.status} = 'approved')`.mapWith(Number),
            pending: sql<number>`COUNT(*) FILTER (WHERE ${questionsTable.status} IN ('pending','draft'))`.mapWith(Number),
          })
          .from(questionsTable)
          .where(inArray(questionsTable.courseId, visibleCourseIdList))
          .groupBy(questionsTable.courseId)
      : [];
    const countsByCourse = new Map(
      countRows.map((r) => [r.courseId, { approved: r.approved, pending: r.pending }]),
    );

    const courses = Array.from(byCourse.values()).map((r) => {
      const c = countsByCourse.get(r.course.id);
      return {
        ...r.course,
        offeringId: r.offeringId,
        studyYear: r.offeringStudyYear,
        offeringSemester: r.offeringSemester,
        programId: r.programId,
        programName: r.programName,
        programCode: r.programCode,
        lecturerId: r.lecturerId,
        lecturerName: r.lecturerName,
        approvedQuestionCount: c?.approved ?? 0,
        pendingQuestionCount:
          auth.role === "student" ? 0 : (c?.pending ?? 0),
      };
    });
    res.json(ListCoursesResponse.parse(courses));
  },
);

router.post(
  "/courses",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateCourseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Admin-only: lecturerId must be provided explicitly.
    const lecturerId = parsed.data.lecturerId ?? null;
    if (!lecturerId) {
      res
        .status(400)
        .json({ error: "lecturerId is required when creating a course" });
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
    if (!off) return false;
    // Also require an active enrollment in this course.
    const [enr] = await db
      .select({ id: enrollmentsTable.id })
      .from(enrollmentsTable)
      .where(
        and(
          eq(enrollmentsTable.userId, auth.userId),
          eq(enrollmentsTable.courseId, courseId),
          eq(enrollmentsTable.enrollmentStatus, "active"),
        ),
      );
    return !!enr;
  }
  // lecturer
  return lecturerTeachesCourse(auth.userId, courseId);
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
    // Pick the offering that matches the caller (student: same program,
    // lecturer: same lecturer id, admin: any) for enrichment.
    const [me] = auth.role === "student"
      ? await db
          .select({ programId: usersTable.programId })
          .from(usersTable)
          .where(eq(usersTable.id, auth.userId))
      : [{ programId: null as number | null }];

    const joinConditions: SQL[] = [
      eq(courseOfferingsTable.courseId, coursesTable.id),
    ];
    if (auth.role === "student" && me.programId) {
      joinConditions.push(eq(courseOfferingsTable.programId, me.programId));
    } else if (auth.role === "lecturer") {
      joinConditions.push(eq(courseOfferingsTable.lecturerId, auth.userId));
    }

    const rows = await db
      .select({
        course: coursesTable,
        offeringId: courseOfferingsTable.id,
        offeringStudyYear: courseOfferingsTable.studyYear,
        offeringSemester: courseOfferingsTable.semester,
        programId: programsTable.id,
        programName: programsTable.name,
        programCode: programsTable.code,
        lecturerId: usersTable.id,
        lecturerName: usersTable.fullName,
      })
      .from(coursesTable)
      .leftJoin(courseOfferingsTable, and(...joinConditions))
      .leftJoin(programsTable, eq(programsTable.id, courseOfferingsTable.programId))
      .leftJoin(usersTable, eq(usersTable.id, courseOfferingsTable.lecturerId))
      .where(eq(coursesTable.id, params.data.id));
    if (rows.length === 0) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    // Prefer a row that has offering enrichment if multiple exist.
    const row = rows.find((r) => r.offeringId != null) ?? rows[0];
    res.json(
      GetCourseResponse.parse({
        ...row.course,
        offeringId: row.offeringId,
        studyYear: row.offeringStudyYear,
        offeringSemester: row.offeringSemester,
        programId: row.programId,
        programName: row.programName,
        programCode: row.programCode,
        lecturerId: row.lecturerId,
        lecturerName: row.lecturerName,
      }),
    );
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

/**
 * Lecturers may only manage topics on courses they teach an offering of.
 * Admin bypass. Returns true if the action is allowed.
 */
async function canManageTopicsForCourse(
  auth: { role: string; userId: number },
  courseId: number,
): Promise<boolean> {
  if (auth.role === "admin") return true;
  if (auth.role !== "lecturer") return false;
  return lecturerTeachesCourse(auth.userId, courseId);
}

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
    const auth = req.auth!;
    if (!(await canManageTopicsForCourse(auth, params.data.id))) {
      res
        .status(403)
        .json({ error: "You can only manage topics for courses you teach" });
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
    const auth = req.auth!;
    const [existingTopic] = await db
      .select({ courseId: topicsTable.courseId })
      .from(topicsTable)
      .where(eq(topicsTable.id, params.data.id));
    if (!existingTopic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    if (!(await canManageTopicsForCourse(auth, existingTopic.courseId))) {
      res
        .status(403)
        .json({ error: "You can only manage topics for courses you teach" });
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
    const auth = req.auth!;
    const [existingTopic] = await db
      .select({ courseId: topicsTable.courseId })
      .from(topicsTable)
      .where(eq(topicsTable.id, params.data.id));
    if (!existingTopic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    if (!(await canManageTopicsForCourse(auth, existingTopic.courseId))) {
      res
        .status(403)
        .json({ error: "You can only manage topics for courses you teach" });
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
