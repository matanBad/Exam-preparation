import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import {
  db,
  questionsTable,
  answerOptionsTable,
  coursesTable,
  topicsTable,
  usersTable,
  courseOfferingsTable,
} from "@workspace/db";
import {
  ListQuestionsQueryParams,
  ListQuestionsResponse,
  CreateQuestionBody,
  SearchQuestionsQueryParams,
  SearchQuestionsResponse,
  GetQuestionParams,
  GetQuestionResponse,
  UpdateQuestionParams,
  UpdateQuestionBody,
  UpdateQuestionResponse,
  ArchiveQuestionParams,
  ArchiveQuestionResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { createNotification, notifyUsersByRole } from "../lib/notifications";

const router: IRouter = Router();

/**
 * Strategy A: a lecturer "owns" a course if they teach any offering of it.
 */
async function lecturerOwnsCourse(
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

/**
 * Returns the set of course ids the caller can see questions for.
 * - student: courses with an offering in their program.
 * - lecturer: courses they teach an offering of.
 */
async function visibleCourseIdsForQuestions(scope: {
  kind: "student" | "lecturer";
  userId: number;
}): Promise<number[]> {
  if (scope.kind === "student") {
    const [me] = await db
      .select({ programId: usersTable.programId })
      .from(usersTable)
      .where(eq(usersTable.id, scope.userId));
    if (!me?.programId) return [];
    const rows = await db
      .selectDistinct({ courseId: courseOfferingsTable.courseId })
      .from(courseOfferingsTable)
      .where(eq(courseOfferingsTable.programId, me.programId));
    return rows.map((r) => r.courseId);
  }
  const rows = await db
    .selectDistinct({ courseId: courseOfferingsTable.courseId })
    .from(courseOfferingsTable)
    .where(eq(courseOfferingsTable.lecturerId, scope.userId));
  return rows.map((r) => r.courseId);
}

async function loadQuestionsWithOptions(
  filters: SQL[],
  scope:
    | { kind: "admin" }
    | { kind: "student"; userId: number }
    | { kind: "lecturer"; userId: number },
) {
  const allFilters = [...filters];
  if (scope.kind !== "admin") {
    if (scope.kind === "student") {
      allFilters.push(eq(questionsTable.status, "approved"));
    }
    const courseIds = await visibleCourseIdsForQuestions(scope);
    if (courseIds.length === 0) return [];
    allFilters.push(inArray(questionsTable.courseId, courseIds));
  }
  const where = allFilters.length ? and(...allFilters) : undefined;

  const rows = await db
    .select({
      q: questionsTable,
      courseName: coursesTable.courseName,
      topicName: topicsTable.topicName,
    })
    .from(questionsTable)
    .leftJoin(coursesTable, eq(coursesTable.id, questionsTable.courseId))
    .leftJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
    .where(where);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.q.id);
  const opts = await db
    .select()
    .from(answerOptionsTable)
    .where(
      ids.length === 1
        ? eq(answerOptionsTable.questionId, ids[0])
        : or(...ids.map((i) => eq(answerOptionsTable.questionId, i)))!,
    );

  return rows.map((r) => ({
    ...r.q,
    courseName: r.courseName,
    topicName: r.topicName,
    options: opts
      .filter((o) => o.questionId === r.q.id)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }));
}

router.get("/questions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListQuestionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const auth = req.auth!;
  const filters: SQL[] = [];
  if (parsed.data.courseId)
    filters.push(eq(questionsTable.courseId, parsed.data.courseId));
  if (parsed.data.topicId)
    filters.push(eq(questionsTable.topicId, parsed.data.topicId));
  if (parsed.data.difficulty)
    filters.push(eq(questionsTable.difficultyLevel, parsed.data.difficulty));
  if (parsed.data.status)
    filters.push(eq(questionsTable.status, parsed.data.status));
  if (parsed.data.q) {
    const like = `%${parsed.data.q}%`;
    filters.push(
      or(
        ilike(questionsTable.title, like),
        ilike(questionsTable.questionText, like),
      )!,
    );
  }
  const result = await loadQuestionsWithOptions(
    filters,
    auth.role === "admin"
      ? { kind: "admin" }
      : { kind: auth.role, userId: auth.userId },
  );
  res.json(ListQuestionsResponse.parse(result));
});

router.get(
  "/questions/search",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = SearchQuestionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const auth = req.auth!;
    const filters: SQL[] = [];
    if (parsed.data.courseId)
      filters.push(eq(questionsTable.courseId, parsed.data.courseId));
    if (parsed.data.topicId)
      filters.push(eq(questionsTable.topicId, parsed.data.topicId));
    if (parsed.data.difficulty)
      filters.push(eq(questionsTable.difficultyLevel, parsed.data.difficulty));
    if (parsed.data.status)
      filters.push(eq(questionsTable.status, parsed.data.status));
    if (parsed.data.q) {
      const like = `%${parsed.data.q}%`;
      filters.push(
        or(
          ilike(questionsTable.title, like),
          ilike(questionsTable.questionText, like),
        )!,
      );
    }
    const result = await loadQuestionsWithOptions(
      filters,
      auth.role === "admin"
        ? { kind: "admin" }
        : { kind: auth.role, userId: auth.userId },
    );
    res.json(SearchQuestionsResponse.parse(result));
  },
);

router.post(
  "/questions",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const auth = req.auth!;
    const data = parsed.data;
    if (auth.role === "lecturer") {
      const owns = await lecturerOwnsCourse(auth.userId, data.courseId);
      if (!owns) {
        res
          .status(403)
          .json({ error: "You are not assigned to this course" });
        return;
      }
    }
    const [question] = await db
      .insert(questionsTable)
      .values({
        courseId: data.courseId,
        topicId: data.topicId ?? null,
        subtopicId: data.subtopicId ?? null,
        title: data.title,
        questionText: data.questionText,
        questionType: data.questionType,
        difficultyLevel: data.difficultyLevel,
        explanationText: data.explanationText ?? null,
        sourceReference: data.sourceReference ?? null,
        status: data.status ?? "approved",
        createdBy: auth.userId,
      })
      .returning();

    await db.insert(answerOptionsTable).values(
      data.options.map((o, idx) => ({
        questionId: question.id,
        answerText: o.answerText,
        isCorrect: o.isCorrect,
        displayOrder: idx,
      })),
    );

    const [full] = await loadQuestionsWithOptions(
      [eq(questionsTable.id, question.id)],
      { kind: "admin" },
    );
    try {
      await createNotification({
        userId: auth.userId,
        type: "question_created",
        title: "Question created",
        message: `Your question "${question.title}" was added to the bank.`,
        relatedEntityType: "question",
        relatedEntityId: question.id,
      });
      await notifyUsersByRole("admin", {
        type: "question_created",
        title: "New question added",
        message: `A new question "${question.title}" was added to the question bank.`,
        relatedEntityType: "question",
        relatedEntityId: question.id,
      });
    } catch (err) {
      req.log?.warn({ err }, "Failed to create question-created notifications");
    }
    res.status(201).json(GetQuestionResponse.parse(full));
  },
);

router.get(
  "/questions/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetQuestionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const auth = req.auth!;
    const [full] = await loadQuestionsWithOptions(
      [eq(questionsTable.id, params.data.id)],
      auth.role === "admin"
        ? { kind: "admin" }
        : { kind: auth.role, userId: auth.userId },
    );
    if (!full) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.json(GetQuestionResponse.parse(full));
  },
);

router.put(
  "/questions/:id",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const params = UpdateQuestionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    const auth = req.auth!;
    if (auth.role === "lecturer") {
      const [existing] = await db
        .select({ courseId: questionsTable.courseId })
        .from(questionsTable)
        .where(eq(questionsTable.id, params.data.id));
      if (!existing) {
        res.status(404).json({ error: "Question not found" });
        return;
      }
      const targetCourseId = data.courseId ?? existing.courseId;
      const ownsExisting = await lecturerOwnsCourse(
        auth.userId,
        existing.courseId,
      );
      const ownsTarget =
        targetCourseId === existing.courseId
          ? ownsExisting
          : await lecturerOwnsCourse(auth.userId, targetCourseId);
      if (!ownsExisting || !ownsTarget) {
        res
          .status(403)
          .json({ error: "You are not assigned to this course" });
        return;
      }
    }
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "courseId",
      "topicId",
      "subtopicId",
      "title",
      "questionText",
      "questionType",
      "difficultyLevel",
      "explanationText",
      "sourceReference",
      "status",
    ] as const) {
      if (data[key] !== undefined) updateValues[key] = data[key];
    }
    const [updated] = await db
      .update(questionsTable)
      .set(updateValues)
      .where(eq(questionsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    if (data.options) {
      await db
        .delete(answerOptionsTable)
        .where(eq(answerOptionsTable.questionId, params.data.id));
      await db.insert(answerOptionsTable).values(
        data.options.map((o, idx) => ({
          questionId: params.data.id,
          answerText: o.answerText,
          isCorrect: o.isCorrect,
          displayOrder: idx,
        })),
      );
    }
    const [full] = await loadQuestionsWithOptions(
      [eq(questionsTable.id, params.data.id)],
      { kind: "admin" },
    );
    res.json(UpdateQuestionResponse.parse(full));
  },
);

router.patch(
  "/questions/:id/archive",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res): Promise<void> => {
    const params = ArchiveQuestionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const auth = req.auth!;
    if (auth.role === "lecturer") {
      const [existing] = await db
        .select({ courseId: questionsTable.courseId })
        .from(questionsTable)
        .where(eq(questionsTable.id, params.data.id));
      if (!existing) {
        res.status(404).json({ error: "Question not found" });
        return;
      }
      const owns = await lecturerOwnsCourse(auth.userId, existing.courseId);
      if (!owns) {
        res
          .status(403)
          .json({ error: "You are not assigned to this course" });
        return;
      }
    }
    const [updated] = await db
      .update(questionsTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(questionsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    const [full] = await loadQuestionsWithOptions(
      [eq(questionsTable.id, params.data.id)],
      { kind: "admin" },
    );
    res.json(ArchiveQuestionResponse.parse(full));
  },
);

export default router;
