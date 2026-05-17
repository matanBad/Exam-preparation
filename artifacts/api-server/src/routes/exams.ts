import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  questionsTable,
  answerOptionsTable,
  mockExamsTable,
  mockExamQuestionsTable,
  coursesTable,
  topicsTable,
  enrollmentsTable,
} from "@workspace/db";
import {
  GenerateExamBody,
  GetExamParams,
  GetExamResponse,
  StartExamParams,
  StartExamResponse,
  SubmitExamParams,
  SubmitExamBody,
  SubmitExamResponse,
  GetExamReviewParams,
  GetExamReviewResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function loadExamWithQuestions(examId: number) {
  const [exam] = await db
    .select({
      exam: mockExamsTable,
      courseName: coursesTable.courseName,
    })
    .from(mockExamsTable)
    .leftJoin(coursesTable, eq(coursesTable.id, mockExamsTable.courseId))
    .where(eq(mockExamsTable.id, examId));
  if (!exam) return null;

  const examQs = await db
    .select({
      meq: mockExamQuestionsTable,
      q: questionsTable,
      topicName: topicsTable.topicName,
    })
    .from(mockExamQuestionsTable)
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, mockExamQuestionsTable.questionId),
    )
    .leftJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
    .where(eq(mockExamQuestionsTable.examId, examId));

  const qIds = examQs.map((eq_) => eq_.q.id);
  const opts = qIds.length
    ? await db
        .select()
        .from(answerOptionsTable)
        .where(inArray(answerOptionsTable.questionId, qIds))
    : [];

  const questions = examQs
    .map((row) => {
      const order: number[] = JSON.parse(row.meq.randomizedOptionOrder);
      const optMap = new Map(
        opts
          .filter((o) => o.questionId === row.q.id)
          .map((o) => [o.id, o]),
      );
      const orderedOpts = order
        .map((id) => optMap.get(id))
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => ({ id: o.id, answerText: o.answerText }));
      return {
        id: row.meq.id,
        questionId: row.q.id,
        title: row.q.title,
        questionText: row.q.questionText,
        questionType: row.q.questionType as "single_choice" | "multiple_choice",
        difficultyLevel: row.q.difficultyLevel as "Easy" | "Medium" | "Hard",
        topicName: row.topicName,
        randomizedOrder: row.meq.randomizedOrder,
        options: orderedOpts,
        selectedAnswerOptionId: row.meq.selectedAnswerOptionId,
      };
    })
    .sort((a, b) => a.randomizedOrder - b.randomizedOrder);

  return {
    id: exam.exam.id,
    userId: exam.exam.userId,
    courseId: exam.exam.courseId,
    courseName: exam.courseName,
    examMode: exam.exam.examMode,
    totalQuestions: exam.exam.totalQuestions,
    durationMinutes: exam.exam.durationMinutes,
    startedAt: exam.exam.startedAt,
    submittedAt: exam.exam.submittedAt,
    score: exam.exam.score,
    status: exam.exam.status as "generated" | "in_progress" | "submitted",
    createdAt: exam.exam.createdAt,
    questions,
  };
}

router.post(
  "/exams/generate",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = GenerateExamBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { courseId, topicIds, totalQuestions, durationMinutes } = parsed.data;
    const auth = req.auth!;

    if (auth.role !== "student") {
      res.status(403).json({ error: "Only students can generate exams" });
      return;
    }
    const [enr] = await db
      .select({ id: enrollmentsTable.id })
      .from(enrollmentsTable)
      .where(
        and(
          eq(enrollmentsTable.userId, auth.userId),
          eq(enrollmentsTable.courseId, courseId),
        ),
      );
    if (!enr) {
      res.status(403).json({ error: "Not enrolled in this course" });
      return;
    }

    const filters = [
      eq(questionsTable.courseId, courseId),
      eq(questionsTable.status, "approved"),
    ];
    if (topicIds && topicIds.length > 0) {
      filters.push(inArray(questionsTable.topicId, topicIds));
    }
    const pool = await db
      .select()
      .from(questionsTable)
      .where(and(...filters));
    if (pool.length === 0) {
      res
        .status(400)
        .json({ error: "No approved questions match the criteria" });
      return;
    }
    const selected = shuffle(pool).slice(0, totalQuestions);

    const optsForSelected = await db
      .select()
      .from(answerOptionsTable)
      .where(
        inArray(
          answerOptionsTable.questionId,
          selected.map((q) => q.id),
        ),
      );

    const [exam] = await db
      .insert(mockExamsTable)
      .values({
        userId: auth.userId,
        courseId,
        totalQuestions: selected.length,
        durationMinutes: durationMinutes ?? null,
        examMode: "mock",
        status: "generated",
      })
      .returning();

    const examQuestionRows = selected.map((q, idx) => {
      const qOpts = optsForSelected
        .filter((o) => o.questionId === q.id)
        .map((o) => o.id);
      const order = shuffle(qOpts);
      return {
        examId: exam.id,
        questionId: q.id,
        randomizedOrder: idx,
        randomizedOptionOrder: JSON.stringify(order),
      };
    });
    if (examQuestionRows.length > 0) {
      await db.insert(mockExamQuestionsTable).values(examQuestionRows);
    }

    const full = await loadExamWithQuestions(exam.id);
    res.status(201).json(GetExamResponse.parse(full));
  },
);

router.get(
  "/exams/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetExamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const full = await loadExamWithQuestions(params.data.id);
    if (!full) {
      res.status(404).json({ error: "Exam not found" });
      return;
    }
    const auth = req.auth!;
    if (auth.role === "student" && full.userId !== auth.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(GetExamResponse.parse(full));
  },
);

router.post(
  "/exams/:id/start",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = StartExamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [exam] = await db
      .select()
      .from(mockExamsTable)
      .where(eq(mockExamsTable.id, params.data.id));
    if (!exam) {
      res.status(404).json({ error: "Exam not found" });
      return;
    }
    if (exam.userId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (exam.status === "generated") {
      await db
        .update(mockExamsTable)
        .set({
          status: "in_progress",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mockExamsTable.id, exam.id));
    }
    const full = await loadExamWithQuestions(exam.id);
    res.json(StartExamResponse.parse(full));
  },
);

router.post(
  "/exams/:id/submit",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitExamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SubmitExamBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [exam] = await db
      .select()
      .from(mockExamsTable)
      .where(eq(mockExamsTable.id, params.data.id));
    if (!exam) {
      res.status(404).json({ error: "Exam not found" });
      return;
    }
    if (exam.userId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const examQs = await db
      .select()
      .from(mockExamQuestionsTable)
      .where(eq(mockExamQuestionsTable.examId, exam.id));
    const optIds = parsed.data.answers
      .map((a) => a.selectedAnswerOptionId)
      .filter((x): x is number => typeof x === "number");
    const opts = optIds.length
      ? await db
          .select()
          .from(answerOptionsTable)
          .where(inArray(answerOptionsTable.id, optIds))
      : [];
    const optMap = new Map(opts.map((o) => [o.id, o]));

    let correctCount = 0;
    for (const eq_ of examQs) {
      const ans = parsed.data.answers.find((a) => a.examQuestionId === eq_.id);
      const selectedId = ans?.selectedAnswerOptionId ?? null;
      const isCorrect =
        selectedId != null && (optMap.get(selectedId)?.isCorrect ?? false);
      if (isCorrect) correctCount += 1;
      await db
        .update(mockExamQuestionsTable)
        .set({
          selectedAnswerOptionId: selectedId,
          isCorrect,
        })
        .where(eq(mockExamQuestionsTable.id, eq_.id));
    }

    const score =
      examQs.length > 0 ? Math.round((correctCount / examQs.length) * 10000) / 100 : 0;
    const submittedAt = new Date();
    await db
      .update(mockExamsTable)
      .set({
        status: "submitted",
        submittedAt,
        score,
        updatedAt: submittedAt,
      })
      .where(eq(mockExamsTable.id, exam.id));

    res.json(
      SubmitExamResponse.parse({
        examId: exam.id,
        score,
        correctCount,
        totalQuestions: examQs.length,
        status: "submitted",
        submittedAt,
      }),
    );
  },
);

router.get(
  "/exams/:id/review",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetExamReviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [examRow] = await db
      .select({
        exam: mockExamsTable,
        courseName: coursesTable.courseName,
      })
      .from(mockExamsTable)
      .leftJoin(coursesTable, eq(coursesTable.id, mockExamsTable.courseId))
      .where(eq(mockExamsTable.id, params.data.id));
    if (!examRow) {
      res.status(404).json({ error: "Exam not found" });
      return;
    }
    if (
      req.auth!.role === "student" &&
      examRow.exam.userId !== req.auth!.userId
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const examQs = await db
      .select({
        meq: mockExamQuestionsTable,
        q: questionsTable,
        topicName: topicsTable.topicName,
      })
      .from(mockExamQuestionsTable)
      .innerJoin(
        questionsTable,
        eq(questionsTable.id, mockExamQuestionsTable.questionId),
      )
      .leftJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
      .where(eq(mockExamQuestionsTable.examId, params.data.id));

    const qIds = examQs.map((r) => r.q.id);
    const opts = qIds.length
      ? await db
          .select()
          .from(answerOptionsTable)
          .where(inArray(answerOptionsTable.questionId, qIds))
      : [];

    const items = examQs
      .map((row) => {
        const qOpts = opts
          .filter((o) => o.questionId === row.q.id)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        const correct = qOpts.find((o) => o.isCorrect);
        const selectedId = row.meq.selectedAnswerOptionId;
        const isCorrect =
          selectedId != null
            ? (qOpts.find((o) => o.id === selectedId)?.isCorrect ?? false)
            : false;
        return {
          examQuestionId: row.meq.id,
          questionId: row.q.id,
          title: row.q.title,
          questionText: row.q.questionText,
          difficultyLevel: row.q.difficultyLevel as "Easy" | "Medium" | "Hard",
          topicName: row.topicName,
          explanationText: row.q.explanationText,
          isCorrect,
          selectedAnswerOptionId: selectedId,
          correctAnswerOptionId: correct?.id ?? null,
          options: qOpts,
        };
      })
      .sort((a, b) => a.examQuestionId - b.examQuestionId);

    res.json(
      GetExamReviewResponse.parse({
        exam: {
          ...examRow.exam,
          courseName: examRow.courseName,
        },
        items,
      }),
    );
  },
);

router.get(
  "/users/:id/exams",
  requireAuth,
  async (req, res): Promise<void> => {
    const idRaw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idRaw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (req.auth!.role === "student" && req.auth!.userId !== id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select({
        exam: mockExamsTable,
        courseName: coursesTable.courseName,
      })
      .from(mockExamsTable)
      .leftJoin(coursesTable, eq(coursesTable.id, mockExamsTable.courseId))
      .where(eq(mockExamsTable.userId, id))
      .orderBy(desc(mockExamsTable.createdAt));
    res.json(
      rows.map((r) => ({
        ...r.exam,
        courseName: r.courseName,
      })),
    );
  },
);

export { sql };
export default router;
