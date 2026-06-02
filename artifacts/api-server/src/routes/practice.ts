import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  questionsTable,
  answerOptionsTable,
  coursesTable,
  topicsTable,
  practiceSessionsTable,
  practiceSessionQuestionsTable,
} from "@workspace/db";
import {
  GeneratePracticeBody,
  GetPracticeSessionParams,
  GetPracticeSessionResponse,
  SubmitPracticeAnswerParams,
  SubmitPracticeAnswerBody,
  SubmitPracticeAnswerResponse,
  FinishPracticeSessionParams,
  FinishPracticeSessionResponse,
  GetPracticeHistoryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  gradeAnswer,
  parseOptionIds,
  pointsForDifficulty,
  shuffle,
} from "../lib/grading";
import { checkStudentCourseAccess } from "../lib/student-access";
import { recalculateForUser } from "../lib/analytics";

const router: IRouter = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

type SessionType = "topic" | "subtopic" | "mixed" | "mistakes" | "weak_area";

// Build the API shape for a session plus its questions. Correct answers and
// explanations are only revealed for questions the student has already answered
// so the client can't peek before responding.
async function loadPracticeSession(sessionId: number) {
  const [session] = await db
    .select({
      ps: practiceSessionsTable,
      courseName: coursesTable.courseName,
    })
    .from(practiceSessionsTable)
    .leftJoin(coursesTable, eq(coursesTable.id, practiceSessionsTable.courseId))
    .where(eq(practiceSessionsTable.id, sessionId));
  if (!session) return null;

  let topicName: string | null = null;
  let subtopicName: string | null = null;
  const topicIds = [session.ps.topicId, session.ps.subtopicId].filter(
    (x): x is number => x != null,
  );
  if (topicIds.length) {
    const topicRows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, topicIds));
    topicName =
      topicRows.find((t) => t.id === session.ps.topicId)?.topicName ?? null;
    subtopicName =
      topicRows.find((t) => t.id === session.ps.subtopicId)?.topicName ?? null;
  }

  const rows = await db
    .select({
      psq: practiceSessionQuestionsTable,
      q: questionsTable,
      topicName: topicsTable.topicName,
    })
    .from(practiceSessionQuestionsTable)
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, practiceSessionQuestionsTable.questionId),
    )
    .leftJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
    .where(eq(practiceSessionQuestionsTable.sessionId, sessionId));

  const qIds = rows.map((r) => r.q.id);
  const opts = qIds.length
    ? await db
        .select()
        .from(answerOptionsTable)
        .where(inArray(answerOptionsTable.questionId, qIds))
    : [];

  const questions = rows
    .map((row) => {
      const order = parseOptionIds(row.psq.randomizedOptionOrder);
      const qOpts = opts.filter((o) => o.questionId === row.q.id);
      const optMap = new Map(qOpts.map((o) => [o.id, o]));
      const orderedOpts = order
        .map((id) => optMap.get(id))
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => ({ id: o.id, answerText: o.answerText }));
      const answered = row.psq.status === "answered";
      return {
        id: row.psq.id,
        questionId: row.q.id,
        title: row.q.title,
        questionText: row.q.questionText,
        questionType: row.q.questionType as
          | "single_choice"
          | "multiple_choice",
        difficultyLevel: row.q.difficultyLevel as "Easy" | "Medium" | "Hard",
        topicName: row.topicName,
        questionOrder: row.psq.questionOrder,
        maxScore: row.psq.maxScore,
        options: orderedOpts,
        status: row.psq.status as "not_answered" | "answered",
        selectedAnswerOptionId: row.psq.selectedAnswerOptionId,
        selectedAnswerOptionIds: parseOptionIds(row.psq.selectedOptionIds),
        confidenceLevel: row.psq.confidenceLevel as
          | "low"
          | "medium"
          | "high"
          | null,
        isCorrect: row.psq.isCorrect,
        earnedScore: row.psq.earnedScore,
        responseTimeSeconds: row.psq.responseTimeSeconds,
        explanationText: answered ? row.q.explanationText : null,
        correctAnswerOptionIds: answered
          ? qOpts.filter((o) => o.isCorrect).map((o) => o.id)
          : [],
      };
    })
    .sort((a, b) => a.questionOrder - b.questionOrder);

  return {
    id: session.ps.id,
    userId: session.ps.userId,
    courseId: session.ps.courseId,
    courseName: session.courseName,
    topicId: session.ps.topicId,
    topicName,
    subtopicId: session.ps.subtopicId,
    subtopicName,
    sessionType: session.ps.sessionType as SessionType,
    status: session.ps.status as "active" | "completed" | "abandoned",
    totalQuestions: session.ps.totalQuestions,
    answeredCount: session.ps.answeredCount,
    correctCount: session.ps.correctCount,
    earnedScore: round2(session.ps.earnedScore),
    totalMaxScore: round2(session.ps.totalMaxScore),
    startedAt: session.ps.startedAt,
    completedAt: session.ps.completedAt,
    createdAt: session.ps.createdAt,
    questions,
  };
}

// Recompute denormalized running totals from the question rows so they stay
// correct even when a question is re-answered.
async function recomputeSessionTotals(sessionId: number) {
  const rows = await db
    .select({
      status: practiceSessionQuestionsTable.status,
      isCorrect: practiceSessionQuestionsTable.isCorrect,
      earnedScore: practiceSessionQuestionsTable.earnedScore,
    })
    .from(practiceSessionQuestionsTable)
    .where(eq(practiceSessionQuestionsTable.sessionId, sessionId));
  const answeredCount = rows.filter((r) => r.status === "answered").length;
  const correctCount = rows.filter((r) => r.isCorrect === true).length;
  const earnedScore = round2(
    rows.reduce((s, r) => s + (r.earnedScore ?? 0), 0),
  );
  await db
    .update(practiceSessionsTable)
    .set({ answeredCount, correctCount, earnedScore, updatedAt: new Date() })
    .where(eq(practiceSessionsTable.id, sessionId));
  return { answeredCount, correctCount, earnedScore };
}

router.post(
  "/practice/generate",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = GeneratePracticeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const auth = req.auth!;
    if (auth.role !== "student") {
      res.status(403).json({ error: "Only students can practice" });
      return;
    }
    const { courseId, topicId, subtopicId, questionCount, sessionType } =
      parsed.data;
    const count = Math.min(Math.max(questionCount ?? 10, 1), 50);

    const access = await checkStudentCourseAccess(auth.userId, courseId);
    if (access) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    // Validate topic / subtopic belong to the course (and to each other).
    if (topicId != null) {
      const [topic] = await db
        .select({ id: topicsTable.id })
        .from(topicsTable)
        .where(
          and(eq(topicsTable.id, topicId), eq(topicsTable.courseId, courseId)),
        );
      if (!topic) {
        res
          .status(400)
          .json({ error: "Selected topic does not belong to this course" });
        return;
      }
    }
    if (subtopicId != null) {
      const [sub] = await db
        .select({ id: topicsTable.id, parentTopicId: topicsTable.parentTopicId })
        .from(topicsTable)
        .where(
          and(
            eq(topicsTable.id, subtopicId),
            eq(topicsTable.courseId, courseId),
          ),
        );
      if (!sub) {
        res
          .status(400)
          .json({ error: "Selected subtopic does not belong to this course" });
        return;
      }
      if (topicId != null && sub.parentTopicId !== topicId) {
        res
          .status(400)
          .json({ error: "Selected subtopic is not part of the chosen topic" });
        return;
      }
    }

    const filters = [
      eq(questionsTable.courseId, courseId),
      eq(questionsTable.status, "approved"),
    ];
    if (subtopicId != null) {
      filters.push(eq(questionsTable.subtopicId, subtopicId));
    } else if (topicId != null) {
      filters.push(eq(questionsTable.topicId, topicId));
    }

    const pool = await db
      .select()
      .from(questionsTable)
      .where(and(...filters));
    if (pool.length === 0) {
      res.status(400).json({
        error: "No approved questions match the selected practice criteria",
      });
      return;
    }

    const selected = shuffle(pool).slice(0, count);
    const optsForSelected = await db
      .select()
      .from(answerOptionsTable)
      .where(
        inArray(
          answerOptionsTable.questionId,
          selected.map((q) => q.id),
        ),
      );

    const resolvedType: SessionType =
      sessionType ??
      (subtopicId != null ? "subtopic" : topicId != null ? "topic" : "mixed");
    const perQuestionScores = selected.map((q) =>
      pointsForDifficulty(q.difficultyLevel),
    );
    const totalMaxScore = round2(
      perQuestionScores.reduce((s, p) => s + p, 0),
    );

    const [session] = await db
      .insert(practiceSessionsTable)
      .values({
        userId: auth.userId,
        courseId,
        topicId: topicId ?? null,
        subtopicId: subtopicId ?? null,
        sessionType: resolvedType,
        status: "active",
        totalQuestions: selected.length,
        totalMaxScore,
      })
      .returning();

    const questionRows = selected.map((q, idx) => {
      const qOpts = optsForSelected
        .filter((o) => o.questionId === q.id)
        .map((o) => o.id);
      return {
        sessionId: session.id,
        questionId: q.id,
        questionOrder: idx,
        randomizedOptionOrder: JSON.stringify(shuffle(qOpts)),
        maxScore: perQuestionScores[idx],
        status: "not_answered",
      };
    });
    if (questionRows.length > 0) {
      await db.insert(practiceSessionQuestionsTable).values(questionRows);
    }

    const full = await loadPracticeSession(session.id);
    res.status(201).json(GetPracticeSessionResponse.parse(full));
  },
);

router.get(
  "/practice/history",
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req.auth!;
    if (auth.role !== "student") {
      res.status(403).json({ error: "Only students have practice history" });
      return;
    }
    const rows = await db
      .select({
        ps: practiceSessionsTable,
        courseName: coursesTable.courseName,
      })
      .from(practiceSessionsTable)
      .leftJoin(
        coursesTable,
        eq(coursesTable.id, practiceSessionsTable.courseId),
      )
      .where(eq(practiceSessionsTable.userId, auth.userId))
      .orderBy(desc(practiceSessionsTable.createdAt));

    const toApi = (r: (typeof rows)[number]) => ({
      id: r.ps.id,
      userId: r.ps.userId,
      courseId: r.ps.courseId,
      courseName: r.courseName,
      topicId: r.ps.topicId,
      topicName: null,
      subtopicId: r.ps.subtopicId,
      subtopicName: null,
      sessionType: r.ps.sessionType as SessionType,
      status: r.ps.status as "active" | "completed" | "abandoned",
      totalQuestions: r.ps.totalQuestions,
      answeredCount: r.ps.answeredCount,
      correctCount: r.ps.correctCount,
      earnedScore: round2(r.ps.earnedScore),
      totalMaxScore: round2(r.ps.totalMaxScore),
      startedAt: r.ps.startedAt,
      completedAt: r.ps.completedAt,
      createdAt: r.ps.createdAt,
    });

    res.json(
      GetPracticeHistoryResponse.parse({
        active: rows.filter((r) => r.ps.status === "active").map(toApi),
        completed: rows.filter((r) => r.ps.status !== "active").map(toApi),
      }),
    );
  },
);

router.get(
  "/practice/:sessionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetPracticeSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const full = await loadPracticeSession(params.data.sessionId);
    if (!full) {
      res.status(404).json({ error: "Practice session not found" });
      return;
    }
    if (full.userId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(GetPracticeSessionResponse.parse(full));
  },
);

router.post(
  "/practice/:sessionId/answer",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitPracticeAnswerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SubmitPracticeAnswerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(practiceSessionsTable)
      .where(eq(practiceSessionsTable.id, params.data.sessionId));
    if (!session) {
      res.status(404).json({ error: "Practice session not found" });
      return;
    }
    if (session.userId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (session.status !== "active") {
      res
        .status(400)
        .json({ error: "This practice session is no longer active" });
      return;
    }

    const [psq] = await db
      .select()
      .from(practiceSessionQuestionsTable)
      .where(
        and(
          eq(practiceSessionQuestionsTable.id, parsed.data.practiceQuestionId),
          eq(practiceSessionQuestionsTable.sessionId, session.id),
        ),
      );
    if (!psq) {
      res
        .status(404)
        .json({ error: "Question not found in this practice session" });
      return;
    }

    const qOpts = await db
      .select()
      .from(answerOptionsTable)
      .where(eq(answerOptionsTable.questionId, psq.questionId));
    const correctIds = qOpts.filter((o) => o.isCorrect).map((o) => o.id);

    const submittedIds = parsed.data.selectedAnswerOptionIds?.length
      ? parsed.data.selectedAnswerOptionIds
      : parsed.data.selectedAnswerOptionId != null
      ? [parsed.data.selectedAnswerOptionId]
      : [];

    // Require an actual selection. An empty submission must not mark the
    // question answered (which would leak the correct answers/explanation and
    // pollute persisted analytics with a phantom answered=incorrect row).
    if (submittedIds.length === 0) {
      res.status(400).json({ error: "Select at least one option to answer" });
      return;
    }

    const grade = gradeAnswer({
      optionIds: qOpts.map((o) => o.id),
      correctIds,
      submittedIds,
      maxScore: psq.maxScore,
    });

    await db
      .update(practiceSessionQuestionsTable)
      .set({
        selectedAnswerOptionId: grade.validSubmitted[0] ?? null,
        selectedOptionIds: JSON.stringify(grade.validSubmitted),
        isCorrect: grade.fullyCorrect,
        earnedScore: grade.earnedScore,
        confidenceLevel: parsed.data.confidenceLevel ?? null,
        responseTimeSeconds: parsed.data.responseTimeSeconds ?? null,
        status: "answered",
        answeredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(practiceSessionQuestionsTable.id, psq.id));

    const totals = await recomputeSessionTotals(session.id);

    const [questionRow] = await db
      .select({ explanationText: questionsTable.explanationText })
      .from(questionsTable)
      .where(eq(questionsTable.id, psq.questionId));

    res.json(
      SubmitPracticeAnswerResponse.parse({
        practiceQuestionId: psq.id,
        questionId: psq.questionId,
        isCorrect: grade.fullyCorrect,
        maxScore: psq.maxScore,
        earnedScore: grade.earnedScore,
        correctAnswerOptionIds: correctIds,
        selectedAnswerOptionIds: grade.validSubmitted,
        explanationText: questionRow?.explanationText ?? null,
        answeredCount: totals.answeredCount,
        correctCount: totals.correctCount,
      }),
    );
  },
);

router.post(
  "/practice/:sessionId/finish",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = FinishPracticeSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(practiceSessionsTable)
      .where(eq(practiceSessionsTable.id, params.data.sessionId));
    if (!session) {
      res.status(404).json({ error: "Practice session not found" });
      return;
    }
    if (session.userId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const totals = await recomputeSessionTotals(session.id);
    if (session.status === "active") {
      await db
        .update(practiceSessionsTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(practiceSessionsTable.id, session.id));
    }

    const lowConfidenceRows = await db
      .select({ confidenceLevel: practiceSessionQuestionsTable.confidenceLevel })
      .from(practiceSessionQuestionsTable)
      .where(
        and(
          eq(practiceSessionQuestionsTable.sessionId, session.id),
          eq(practiceSessionQuestionsTable.status, "answered"),
        ),
      );
    const lowConfidenceCount = lowConfidenceRows.filter(
      (r) => r.confidenceLevel === "low",
    ).length;

    const incorrectCount = totals.answeredCount - totals.correctCount;
    const accuracyPercentage =
      totals.answeredCount > 0
        ? round2((totals.correctCount / totals.answeredCount) * 100)
        : 0;

    // Refresh weak-area analytics + recommendations from the new practice data.
    // Best-effort: a failure here must not fail finishing the session.
    try {
      await recalculateForUser(session.userId);
    } catch (err) {
      req.log?.warn(
        { err },
        "Failed to recalculate analytics after practice finish",
      );
    }

    res.json(
      FinishPracticeSessionResponse.parse({
        sessionId: session.id,
        status: session.status === "active" ? "completed" : session.status,
        totalQuestions: session.totalQuestions,
        answeredCount: totals.answeredCount,
        correctCount: totals.correctCount,
        incorrectCount,
        earnedScore: totals.earnedScore,
        totalMaxScore: round2(session.totalMaxScore),
        accuracyPercentage,
        lowConfidenceCount,
      }),
    );
  },
);

export default router;
