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
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

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
