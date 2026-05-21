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
  usersTable,
  courseOfferingsTable,
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
import { createNotification, notifyUsersByRole } from "../lib/notifications";

const router: IRouter = Router();

// Difficulty → max-score table. Single source of truth for how many points a
// question is worth based on its difficulty level.
const DIFFICULTY_SCORE: Record<"Easy" | "Medium" | "Hard", number> = {
  Easy: 5,
  Medium: 10,
  Hard: 15,
};
function scoreForDifficulty(d: string | null | undefined): number {
  if (d === "Easy" || d === "Medium" || d === "Hard") return DIFFICULTY_SCORE[d];
  return DIFFICULTY_SCORE.Medium;
}

function parseOptionIds(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

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
      const selectedIds = parseOptionIds(row.meq.selectedOptionIds);
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
        selectedAnswerOptionIds: selectedIds,
        maxScore: row.meq.maxScore,
      };
    })
    .sort((a, b) => a.randomizedOrder - b.randomizedOrder);

  const totalMaxScore = examQs.reduce((s, r) => s + (r.meq.maxScore ?? 0), 0);
  const hasEarned = examQs.some((r) => r.meq.earnedScore != null);
  const totalEarnedScore = hasEarned
    ? examQs.reduce((s, r) => s + (r.meq.earnedScore ?? 0), 0)
    : null;

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
    totalMaxScore,
    totalEarnedScore,
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
    // Strategy A: students access courses through course_offerings in their program.
    const [me] = await db
      .select({ programId: usersTable.programId })
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId));
    if (!me?.programId) {
      res.status(403).json({ error: "Student is not assigned to a program" });
      return;
    }
    const [off] = await db
      .select({ id: courseOfferingsTable.id })
      .from(courseOfferingsTable)
      .where(
        and(
          eq(courseOfferingsTable.courseId, courseId),
          eq(courseOfferingsTable.programId, me.programId),
        ),
      );
    if (!off) {
      res
        .status(403)
        .json({ error: "This course is not offered in your program" });
      return;
    }
    // Must also be enrolled in this specific course offering.
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
    if (!enr) {
      res
        .status(403)
        .json({ error: "You are not enrolled in this course" });
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
        maxScore: scoreForDifficulty(q.difficultyLevel),
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

    // Fetch every answer option for the questions in this exam so we can
    // identify correct options and grade multi-select questions.
    const questionIds = Array.from(new Set(examQs.map((eq_) => eq_.questionId)));
    const allOpts = questionIds.length
      ? await db
          .select()
          .from(answerOptionsTable)
          .where(inArray(answerOptionsTable.questionId, questionIds))
      : [];
    const optsByQuestion = new Map<number, typeof allOpts>();
    for (const o of allOpts) {
      const arr = optsByQuestion.get(o.questionId) ?? [];
      arr.push(o);
      optsByQuestion.set(o.questionId, arr);
    }

    let correctCount = 0;
    let totalEarnedScore = 0;
    let totalMaxScore = 0;
    for (const eq_ of examQs) {
      const ans = parsed.data.answers.find((a) => a.examQuestionId === eq_.id);
      // Accept new multi-select field, fall back to legacy single id.
      const submittedIds = ans?.selectedAnswerOptionIds?.length
        ? ans.selectedAnswerOptionIds
        : ans?.selectedAnswerOptionId != null
        ? [ans.selectedAnswerOptionId]
        : [];

      const qOpts = optsByQuestion.get(eq_.questionId) ?? [];
      const correctIds = new Set(qOpts.filter((o) => o.isCorrect).map((o) => o.id));
      // Validate + dedupe: ignore any submitted id that isn't an option for
      // this question, and collapse duplicates so a tampered payload can't
      // inflate `correctSelected` past `totalCorrect`.
      const validSubmitted = Array.from(
        new Set(submittedIds.filter((id) => qOpts.some((o) => o.id === id))),
      );
      const correctSelected = validSubmitted.filter((id) => correctIds.has(id)).length;
      const incorrectSelected = validSubmitted.length - correctSelected;
      const totalCorrect = correctIds.size;

      const maxScore = eq_.maxScore;
      // Partial scoring: each correct selection earns a fraction of maxScore,
      // each wrong selection cancels one correct. Floor at 0 (no negative scores).
      const earnedScore =
        totalCorrect > 0
          ? Math.min(
              maxScore,
              Math.max(
                0,
                Math.round(
                  ((correctSelected - incorrectSelected) / totalCorrect) *
                    maxScore *
                    100,
                ) / 100,
              ),
            )
          : 0;
      const fullyCorrect = earnedScore === maxScore && validSubmitted.length > 0;
      if (fullyCorrect) correctCount += 1;
      totalEarnedScore += earnedScore;
      totalMaxScore += maxScore;

      await db
        .update(mockExamQuestionsTable)
        .set({
          // Keep legacy single-id column populated for back-compat (first selected id).
          selectedAnswerOptionId: validSubmitted[0] ?? null,
          selectedOptionIds: JSON.stringify(validSubmitted),
          isCorrect: fullyCorrect,
          earnedScore,
        })
        .where(eq(mockExamQuestionsTable.id, eq_.id));
    }

    const score =
      totalMaxScore > 0
        ? Math.round((totalEarnedScore / totalMaxScore) * 10000) / 100
        : 0;
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

    const [courseRow] = await db
      .select({ courseName: coursesTable.courseName, courseCode: coursesTable.courseCode })
      .from(coursesTable)
      .where(eq(coursesTable.id, exam.courseId));
    const courseLabel = courseRow
      ? `${courseRow.courseCode} ${courseRow.courseName}`
      : `Course ${exam.courseId}`;
    try {
      await createNotification({
        userId: exam.userId,
        type: "exam_submitted",
        title: "Your exam was submitted",
        message: `Your ${courseLabel} mock exam was submitted. Score: ${score}%.`,
        relatedEntityType: "exam",
        relatedEntityId: exam.id,
      });
      await notifyUsersByRole("admin", {
        type: "exam_submitted",
        title: "A new exam was submitted",
        message: `A student submitted a ${courseLabel} mock exam (score ${score}%).`,
        relatedEntityType: "exam",
        relatedEntityId: exam.id,
      });
    } catch (err) {
      req.log?.warn({ err }, "Failed to create exam-submit notifications");
    }

    res.json(
      SubmitExamResponse.parse({
        examId: exam.id,
        score,
        correctCount,
        totalQuestions: examQs.length,
        totalMaxScore: Math.round(totalMaxScore * 100) / 100,
        totalEarnedScore: Math.round(totalEarnedScore * 100) / 100,
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
        const correctOpts = qOpts.filter((o) => o.isCorrect);
        const correctIds = correctOpts.map((o) => o.id);
        const selectedIds = parseOptionIds(row.meq.selectedOptionIds);
        // Fallback to legacy column if the multi-id column hasn't been
        // populated for this exam (e.g. exams submitted before the migration).
        const effectiveSelected =
          selectedIds.length > 0
            ? selectedIds
            : row.meq.selectedAnswerOptionId != null
            ? [row.meq.selectedAnswerOptionId]
            : [];
        const correctSelectedCount = effectiveSelected.filter((id) =>
          correctIds.includes(id),
        ).length;
        const incorrectSelectedCount =
          effectiveSelected.length - correctSelectedCount;
        const maxScore = row.meq.maxScore;
        // Backward-compat: exams submitted before per-question scoring was
        // added have earnedScore=null but still have a graded `isCorrect` flag.
        // Derive earned from that so the review screen never shows
        // "Pending Review" for an already-submitted exam.
        const examSubmitted = examRow.exam.status === "submitted";
        const earnedScore =
          row.meq.earnedScore != null
            ? row.meq.earnedScore
            : examSubmitted
            ? row.meq.isCorrect
              ? maxScore
              : 0
            : null;
        const isCorrect =
          earnedScore != null && earnedScore === maxScore && effectiveSelected.length > 0;
        return {
          examQuestionId: row.meq.id,
          questionId: row.q.id,
          title: row.q.title,
          questionText: row.q.questionText,
          questionType: row.q.questionType as "single_choice" | "multiple_choice",
          difficultyLevel: row.q.difficultyLevel as "Easy" | "Medium" | "Hard",
          topicName: row.topicName,
          explanationText: row.q.explanationText,
          isCorrect,
          maxScore,
          earnedScore,
          totalCorrectCount: correctOpts.length,
          correctSelectedCount,
          incorrectSelectedCount,
          selectedAnswerOptionId: row.meq.selectedAnswerOptionId,
          selectedAnswerOptionIds: effectiveSelected,
          correctAnswerOptionId: correctOpts[0]?.id ?? null,
          correctAnswerOptionIds: correctIds,
          options: qOpts,
        };
      })
      .sort((a, b) => a.examQuestionId - b.examQuestionId);

    const totalMaxScore = items.reduce((s, it) => s + it.maxScore, 0);
    const hasEarned = items.some((it) => it.earnedScore != null);
    const totalEarnedScore = hasEarned
      ? items.reduce((s, it) => s + (it.earnedScore ?? 0), 0)
      : null;

    res.json(
      GetExamReviewResponse.parse({
        exam: {
          ...examRow.exam,
          courseName: examRow.courseName,
          totalMaxScore,
          totalEarnedScore,
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

    // Aggregate per-exam totals so the response satisfies the Exam contract
    // (which now requires totalMaxScore and optionally totalEarnedScore).
    const examIds = rows.map((r) => r.exam.id);
    const totalsByExam = new Map<number, { max: number; earned: number; hasEarned: boolean }>();
    if (examIds.length > 0) {
      const meqRows = await db
        .select({
          examId: mockExamQuestionsTable.examId,
          maxScore: mockExamQuestionsTable.maxScore,
          earnedScore: mockExamQuestionsTable.earnedScore,
        })
        .from(mockExamQuestionsTable)
        .where(inArray(mockExamQuestionsTable.examId, examIds));
      for (const m of meqRows) {
        const t = totalsByExam.get(m.examId) ?? { max: 0, earned: 0, hasEarned: false };
        t.max += m.maxScore ?? 0;
        if (m.earnedScore != null) {
          t.earned += m.earnedScore;
          t.hasEarned = true;
        }
        totalsByExam.set(m.examId, t);
      }
    }

    res.json(
      rows.map((r) => {
        const t = totalsByExam.get(r.exam.id);
        return {
          ...r.exam,
          courseName: r.courseName,
          totalMaxScore: t?.max ?? 0,
          totalEarnedScore: t?.hasEarned ? t.earned : null,
        };
      }),
    );
  },
);

export { sql };
export default router;
