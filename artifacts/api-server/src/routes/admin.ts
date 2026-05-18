import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  topicsTable,
  questionsTable,
  mockExamsTable,
  accountDeletionRequestsTable,
  lecturerProgramsTable,
  programsTable,
  courseOfferingsTable,
  enrollmentsTable,
} from "@workspace/db";
import {
  ListUsersQueryParams,
  ListUsersResponse,
  GetAdminOverviewResponse,
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  DeleteUserParams,
  ListDeletionRequestsResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { hashPassword } from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = ListUsersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const baseRows = parsed.data.role
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.role, parsed.data.role))
      : await db.select().from(usersTable);

    // Enrich student rows with program name/code; lecturer rows with the list
    // of programs they teach (program ids). Names are resolved on the client
    // via the existing programs list to keep the API surface unchanged.
    const studentProgramIds = Array.from(
      new Set(
        baseRows
          .filter((u) => u.role === "student" && u.programId != null)
          .map((u) => u.programId as number),
      ),
    );
    const lecturerIds = baseRows
      .filter((u) => u.role === "lecturer")
      .map((u) => u.id);

    const programRows = studentProgramIds.length
      ? await db
          .select({
            id: programsTable.id,
            name: programsTable.name,
            code: programsTable.code,
          })
          .from(programsTable)
          .where(inArray(programsTable.id, studentProgramIds))
      : [];
    const programById = new Map(programRows.map((p) => [p.id, p]));

    const lecturerLinks = lecturerIds.length
      ? await db
          .select({
            lecturerId: lecturerProgramsTable.lecturerId,
            programId: lecturerProgramsTable.programId,
          })
          .from(lecturerProgramsTable)
          .where(inArray(lecturerProgramsTable.lecturerId, lecturerIds))
      : [];
    const lecturerProgramIds = new Map<number, number[]>();
    for (const l of lecturerLinks) {
      const arr = lecturerProgramIds.get(l.lecturerId) ?? [];
      arr.push(l.programId);
      lecturerProgramIds.set(l.lecturerId, arr);
    }

    const users = baseRows.map((u) => {
      if (u.role === "student" && u.programId != null) {
        const p = programById.get(u.programId);
        return {
          ...u,
          programName: p?.name ?? null,
          programCode: p?.code ?? null,
        };
      }
      if (u.role === "lecturer") {
        return { ...u, programIds: lecturerProgramIds.get(u.id) ?? [] };
      }
      return u;
    });
    res.json(ListUsersResponse.parse(users));
  },
);

router.post(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { fullName, email, password, role, accountStatus, programId, programIds } =
      parsed.data;
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    // Validate program references (if provided) before creating the user.
    const programIdsToLink =
      role === "lecturer" && programIds ? programIds : [];
    const programIdsToCheck = [
      ...(role === "student" && programId != null ? [programId] : []),
      ...programIdsToLink,
    ];
    if (programIdsToCheck.length > 0) {
      const rows = await db
        .select({ id: programsTable.id })
        .from(programsTable)
        .where(inArray(programsTable.id, programIdsToCheck));
      const found = new Set(rows.map((r) => r.id));
      const missing = programIdsToCheck.filter((id) => !found.has(id));
      if (missing.length > 0) {
        res
          .status(400)
          .json({ error: `Unknown program id(s): ${missing.join(", ")}` });
        return;
      }
    }
    const passwordHash = await hashPassword(password);
    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(usersTable)
        .values({
          fullName,
          email,
          passwordHash,
          role,
          accountStatus: accountStatus ?? "active",
          programId: role === "student" ? (programId ?? null) : null,
        })
        .returning();
      if (programIdsToLink.length > 0) {
        await tx.insert(lecturerProgramsTable).values(
          programIdsToLink.map((pid) => ({
            lecturerId: u.id,
            programId: pid,
          })),
        );
      }
      return u;
    });
    const { passwordHash: _ph, ...safe } = created;
    res.status(201).json(safe);
  },
);

router.patch(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = UpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (
      parsed.data.role &&
      parsed.data.role !== "admin" &&
      req.auth!.userId === params.data.id
    ) {
      res.status(400).json({ error: "Admins cannot demote their own account" });
      return;
    }
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.fullName !== undefined)
      updateValues.fullName = parsed.data.fullName;
    if (parsed.data.role !== undefined) updateValues.role = parsed.data.role;
    if (parsed.data.accountStatus !== undefined)
      updateValues.accountStatus = parsed.data.accountStatus;

    // Run the prior-status read, update, and any auto-enrollment in a single
    // transaction with a row lock on the user, so two concurrent approvals
    // can't both observe the prior non-active status and double-insert.
    const txResult = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, params.data.id))
        .for("update");
      if (!existing) {
        return { notFound: true as const };
      }

      const [updated] = await tx
        .update(usersTable)
        .set(updateValues)
        .where(eq(usersTable.id, params.data.id))
        .returning();
      if (!updated) {
        return { notFound: true as const };
      }

      // Auto-enrollment on approval: when an admin moves a student from a
      // non-active status to active, enroll them in every active course
      // that has an existing offering in their program. Idempotent via
      // ON CONFLICT DO NOTHING on the (user_id, course_id) unique index.
      const becameActive =
        updated.role === "student" &&
        updated.accountStatus === "active" &&
        existing.accountStatus !== "active" &&
        updated.programId != null;
      let enrolled = 0;
      if (becameActive) {
        const offerings = await tx
          .selectDistinct({ courseId: courseOfferingsTable.courseId })
          .from(courseOfferingsTable)
          .innerJoin(
            coursesTable,
            eq(coursesTable.id, courseOfferingsTable.courseId),
          )
          .where(
            and(
              eq(courseOfferingsTable.programId, updated.programId as number),
              eq(coursesTable.status, "active"),
            ),
          );
        if (offerings.length > 0) {
          const inserted = await tx
            .insert(enrollmentsTable)
            .values(
              offerings.map((o) => ({
                userId: updated.id,
                courseId: o.courseId,
                enrollmentStatus: "active",
              })),
            )
            .onConflictDoNothing({
              target: [enrollmentsTable.userId, enrollmentsTable.courseId],
            })
            .returning({ id: enrollmentsTable.id });
          enrolled = inserted.length;
        }
      }
      return { notFound: false as const, updated, enrolled, becameActive };
    });

    if (txResult.notFound) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (txResult.becameActive) {
      req.log.info(
        { userId: txResult.updated.id, enrolled: txResult.enrolled },
        "auto-enrolled approved student",
      );
    }
    res.json(UpdateUserResponse.parse(txResult.updated));
  },
);

router.delete(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = DeleteUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (req.auth!.userId === params.data.id) {
      res.status(400).json({ error: "Admins cannot delete their own account" });
      return;
    }
    const deleted = await db
      .delete(usersTable)
      .where(eq(usersTable.id, params.data.id))
      .returning({ id: usersTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.status(204).end();
  },
);

router.get(
  "/admin/deletion-requests",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(accountDeletionRequestsTable)
      .orderBy(desc(accountDeletionRequestsTable.deletedAt));
    res.json(ListDeletionRequestsResponse.parse(rows));
  },
);

router.get(
  "/admin/overview",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const [{ count: totalUsers }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);
    const [{ count: totalCourses }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(coursesTable);
    const [{ count: totalTopics }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(topicsTable);
    const [{ count: totalQuestions }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(questionsTable);
    const [{ count: totalExams }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mockExamsTable);

    const usersByRole = await db
      .select({
        role: usersTable.role,
        count: sql<number>`count(*)::int`,
      })
      .from(usersTable)
      .groupBy(usersTable.role);
    const roleCount = (r: string) =>
      usersByRole.find((u) => u.role === r)?.count ?? 0;

    const questionsByStatus = await db
      .select({
        status: questionsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(questionsTable)
      .groupBy(questionsTable.status);
    const qByStatus = (s: string) =>
      questionsByStatus.find((q) => q.status === s)?.count ?? 0;

    const [{ count: submittedExams }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mockExamsTable)
      .where(eq(mockExamsTable.status, "submitted"));

    res.json(
      GetAdminOverviewResponse.parse({
        totals: {
          users: totalUsers,
          students: roleCount("student"),
          lecturers: roleCount("lecturer"),
          admins: roleCount("admin"),
          courses: totalCourses,
          topics: totalTopics,
          questions: totalQuestions,
          approvedQuestions: qByStatus("approved"),
          archivedQuestions: qByStatus("archived"),
          exams: totalExams,
          submittedExams,
        },
      }),
    );
  },
);

export default router;
