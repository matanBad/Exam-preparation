import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  coursesTable,
  topicsTable,
  questionsTable,
  mockExamsTable,
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
    const users = parsed.data.role
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.role, parsed.data.role))
      : await db.select().from(usersTable);
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
    const { fullName, email, password, role, accountStatus } = parsed.data;
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(usersTable)
      .values({
        fullName,
        email,
        passwordHash,
        role,
        accountStatus: accountStatus ?? "active",
      })
      .returning();
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
    const [updated] = await db
      .update(usersTable)
      .set(updateValues)
      .where(eq(usersTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(UpdateUserResponse.parse(updated));
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
