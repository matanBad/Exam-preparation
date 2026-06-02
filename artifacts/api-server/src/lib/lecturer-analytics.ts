import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  coursesTable,
  topicsTable,
  questionsTable,
  usersTable,
  enrollmentsTable,
  courseOfferingsTable,
  programsTable,
  mockExamsTable,
  mockExamQuestionsTable,
  practiceSessionsTable,
  practiceSessionQuestionsTable,
} from "@workspace/db";

const round2 = (n: number) => Math.round(n * 100) / 100;

// A topic/question needs at least this many class attempts before we draw any
// conclusion about it — otherwise one or two students skew the picture.
const CLASS_MIN_ATTEMPTS = 5;
// Class-average accuracy below this marks a topic as weak.
const WEAK_TOPIC_ACCURACY = 60;
// Per-student accuracy below this counts the student as struggling on a topic
// (reported only as an aggregate count, never by name).
const WEAK_STUDENT_ACCURACY = 60;
// A question is "problematic" when many students attempt it and most get it wrong.
const PROBLEM_ATTEMPTS = 5;
const PROBLEM_INCORRECT_RATE = 70;

function attemptCorrect(
  isCorrect: boolean | null,
  earned: number | null,
  max: number | null,
): boolean {
  if (earned != null && max != null && max > 0) return earned >= max;
  return isCorrect === true;
}

interface ClassAttempt {
  courseId: number;
  topicId: number | null;
  questionId: number;
  userId: number;
  correct: boolean;
}

interface CourseMeta {
  courseName: string;
  courseCode: string | null;
  programName: string | null;
  programIds: Set<number>;
}

interface ClassData {
  courseIds: number[];
  courseMeta: Map<number, CourseMeta>;
  enrolledByCourse: Map<number, Set<number>>;
  attempts: ClassAttempt[];
  examScoresByCourse: Map<number, number[]>;
  practiceScoresByCourse: Map<number, number[]>;
}

// Set of course ids the lecturer teaches (from course_offerings.lecturer_id).
export async function getLecturerCourseIds(
  lecturerId: number,
): Promise<Set<number>> {
  const rows = await db
    .select({ courseId: courseOfferingsTable.courseId })
    .from(courseOfferingsTable)
    .where(eq(courseOfferingsTable.lecturerId, lecturerId));
  return new Set(rows.map((r) => r.courseId));
}

export async function courseExists(courseId: number): Promise<boolean> {
  const rows = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  return rows.length > 0;
}

// Gathers every aggregate input the lecturer dashboards need, scoped to the
// courses the lecturer teaches and the students enrolled in those courses via
// the lecturer's program(s). Individual identities are used only to bucket
// attempts; they never leave this module.
async function gatherClassData(lecturerId: number): Promise<ClassData> {
  const offerings = await db
    .select({
      courseId: courseOfferingsTable.courseId,
      programId: courseOfferingsTable.programId,
      programName: programsTable.name,
    })
    .from(courseOfferingsTable)
    .leftJoin(programsTable, eq(programsTable.id, courseOfferingsTable.programId))
    .where(eq(courseOfferingsTable.lecturerId, lecturerId));

  const courseMeta = new Map<number, CourseMeta>();
  for (const o of offerings) {
    let m = courseMeta.get(o.courseId);
    if (!m) {
      m = {
        courseName: "",
        courseCode: null,
        programName: o.programName ?? null,
        programIds: new Set(),
      };
      courseMeta.set(o.courseId, m);
    }
    m.programIds.add(o.programId);
    if (!m.programName && o.programName) m.programName = o.programName;
  }

  const courseIds = [...courseMeta.keys()];
  const empty: ClassData = {
    courseIds,
    courseMeta,
    enrolledByCourse: new Map(),
    attempts: [],
    examScoresByCourse: new Map(),
    practiceScoresByCourse: new Map(),
  };
  if (courseIds.length === 0) return empty;

  const courses = await db
    .select({
      id: coursesTable.id,
      courseName: coursesTable.courseName,
      courseCode: coursesTable.courseCode,
    })
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));
  for (const c of courses) {
    const m = courseMeta.get(c.id);
    if (m) {
      m.courseName = c.courseName;
      m.courseCode = c.courseCode;
    }
  }

  // Enrolled students, restricted to those in one of the lecturer's programs
  // for the given course.
  const enrollRows = await db
    .select({
      courseId: enrollmentsTable.courseId,
      userId: enrollmentsTable.userId,
      programId: usersTable.programId,
    })
    .from(enrollmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, enrollmentsTable.userId))
    .where(
      and(
        inArray(enrollmentsTable.courseId, courseIds),
        eq(enrollmentsTable.enrollmentStatus, "active"),
      ),
    );

  const enrolledByCourse = new Map<number, Set<number>>();
  for (const e of enrollRows) {
    const m = courseMeta.get(e.courseId);
    if (!m) continue;
    if (e.programId != null && m.programIds.has(e.programId)) {
      let set = enrolledByCourse.get(e.courseId);
      if (!set) {
        set = new Set();
        enrolledByCourse.set(e.courseId, set);
      }
      set.add(e.userId);
    }
  }

  const enrolledArr = [
    ...new Set(
      [...enrolledByCourse.values()].flatMap((s) => [...s]),
    ),
  ];

  const attempts: ClassAttempt[] = [];
  const examScoresByCourse = new Map<number, number[]>();
  const practiceScoresByCourse = new Map<number, number[]>();

  if (enrolledArr.length === 0) {
    return {
      courseIds,
      courseMeta,
      enrolledByCourse,
      attempts,
      examScoresByCourse,
      practiceScoresByCourse,
    };
  }

  const inThisCourse = (courseId: number, userId: number) =>
    enrolledByCourse.get(courseId)?.has(userId) ?? false;

  // Per-question attempts from submitted mock exams.
  const examRows = await db
    .select({
      courseId: questionsTable.courseId,
      topicId: questionsTable.topicId,
      questionId: mockExamQuestionsTable.questionId,
      userId: mockExamsTable.userId,
      isCorrect: mockExamQuestionsTable.isCorrect,
      earnedScore: mockExamQuestionsTable.earnedScore,
      maxScore: mockExamQuestionsTable.maxScore,
    })
    .from(mockExamQuestionsTable)
    .innerJoin(mockExamsTable, eq(mockExamsTable.id, mockExamQuestionsTable.examId))
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, mockExamQuestionsTable.questionId),
    )
    .where(
      and(
        eq(mockExamsTable.status, "submitted"),
        inArray(questionsTable.courseId, courseIds),
        inArray(mockExamsTable.userId, enrolledArr),
      ),
    );
  for (const r of examRows) {
    if (!inThisCourse(r.courseId, r.userId)) continue;
    attempts.push({
      courseId: r.courseId,
      topicId: r.topicId,
      questionId: r.questionId,
      userId: r.userId,
      correct: attemptCorrect(r.isCorrect, r.earnedScore, r.maxScore),
    });
  }

  // Per-question attempts from answered practice questions.
  const practiceRows = await db
    .select({
      courseId: questionsTable.courseId,
      topicId: questionsTable.topicId,
      questionId: practiceSessionQuestionsTable.questionId,
      userId: practiceSessionsTable.userId,
      isCorrect: practiceSessionQuestionsTable.isCorrect,
      earnedScore: practiceSessionQuestionsTable.earnedScore,
      maxScore: practiceSessionQuestionsTable.maxScore,
    })
    .from(practiceSessionQuestionsTable)
    .innerJoin(
      practiceSessionsTable,
      eq(practiceSessionsTable.id, practiceSessionQuestionsTable.sessionId),
    )
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, practiceSessionQuestionsTable.questionId),
    )
    .where(
      and(
        eq(practiceSessionQuestionsTable.status, "answered"),
        inArray(questionsTable.courseId, courseIds),
        inArray(practiceSessionsTable.userId, enrolledArr),
      ),
    );
  for (const r of practiceRows) {
    if (!inThisCourse(r.courseId, r.userId)) continue;
    attempts.push({
      courseId: r.courseId,
      topicId: r.topicId,
      questionId: r.questionId,
      userId: r.userId,
      correct: attemptCorrect(r.isCorrect, r.earnedScore, r.maxScore),
    });
  }

  // Course-level scores for class averages.
  const examScoreRows = await db
    .select({
      courseId: mockExamsTable.courseId,
      score: mockExamsTable.score,
      userId: mockExamsTable.userId,
    })
    .from(mockExamsTable)
    .where(
      and(
        eq(mockExamsTable.status, "submitted"),
        inArray(mockExamsTable.courseId, courseIds),
        inArray(mockExamsTable.userId, enrolledArr),
      ),
    );
  for (const r of examScoreRows) {
    if (r.score == null || !inThisCourse(r.courseId, r.userId)) continue;
    const arr = examScoresByCourse.get(r.courseId) ?? [];
    arr.push(r.score);
    examScoresByCourse.set(r.courseId, arr);
  }

  const practiceScoreRows = await db
    .select({
      courseId: practiceSessionsTable.courseId,
      earnedScore: practiceSessionsTable.earnedScore,
      totalMaxScore: practiceSessionsTable.totalMaxScore,
      userId: practiceSessionsTable.userId,
    })
    .from(practiceSessionsTable)
    .where(
      and(
        eq(practiceSessionsTable.status, "completed"),
        inArray(practiceSessionsTable.courseId, courseIds),
        inArray(practiceSessionsTable.userId, enrolledArr),
      ),
    );
  for (const r of practiceScoreRows) {
    if (r.totalMaxScore <= 0 || !inThisCourse(r.courseId, r.userId)) continue;
    const arr = practiceScoresByCourse.get(r.courseId) ?? [];
    arr.push((r.earnedScore / r.totalMaxScore) * 100);
    practiceScoresByCourse.set(r.courseId, arr);
  }

  return {
    courseIds,
    courseMeta,
    enrolledByCourse,
    attempts,
    examScoresByCourse,
    practiceScoresByCourse,
  };
}

const mean = (xs: number[]) =>
  xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

function courseAverage(data: ClassData, courseId: number): number | null {
  const xs = [
    ...(data.examScoresByCourse.get(courseId) ?? []),
    ...(data.practiceScoresByCourse.get(courseId) ?? []),
  ];
  return mean(xs);
}

interface TopicAgg {
  attempts: number;
  correct: number;
  perUser: Map<number, { attempts: number; correct: number }>;
}

// Aggregate attempts by topic for a single course.
function topicAggForCourse(
  data: ClassData,
  courseId: number,
): Map<number, TopicAgg> {
  const byTopic = new Map<number, TopicAgg>();
  for (const a of data.attempts) {
    if (a.courseId !== courseId || a.topicId == null) continue;
    let t = byTopic.get(a.topicId);
    if (!t) {
      t = { attempts: 0, correct: 0, perUser: new Map() };
      byTopic.set(a.topicId, t);
    }
    t.attempts += 1;
    if (a.correct) t.correct += 1;
    let u = t.perUser.get(a.userId);
    if (!u) {
      u = { attempts: 0, correct: 0 };
      t.perUser.set(a.userId, u);
    }
    u.attempts += 1;
    if (a.correct) u.correct += 1;
  }
  return byTopic;
}

interface QuestionAgg {
  courseId: number;
  topicId: number | null;
  attempts: number;
  incorrect: number;
}

function questionAgg(
  data: ClassData,
  restrictCourseId?: number,
): Map<number, QuestionAgg> {
  const byQ = new Map<number, QuestionAgg>();
  for (const a of data.attempts) {
    if (restrictCourseId != null && a.courseId !== restrictCourseId) continue;
    let q = byQ.get(a.questionId);
    if (!q) {
      q = {
        courseId: a.courseId,
        topicId: a.topicId,
        attempts: 0,
        incorrect: 0,
      };
      byQ.set(a.questionId, q);
    }
    q.attempts += 1;
    if (!a.correct) q.incorrect += 1;
  }
  return byQ;
}

interface ProblematicQuestion {
  questionId: number;
  questionPreview: string;
  courseId: number;
  courseName: string | null;
  topicId: number | null;
  topicName: string | null;
  subtopicId: number | null;
  subtopicName: string | null;
  difficultyLevel: string;
  attemptsCount: number;
  incorrectRate: number;
  status: string;
}

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

// Resolve problematic questions to display rows, dropping archived ones.
async function buildProblematicQuestions(
  data: ClassData,
  restrictCourseId?: number,
): Promise<ProblematicQuestion[]> {
  const agg = questionAgg(data, restrictCourseId);
  const candidates = [...agg.entries()].filter(
    ([, q]) =>
      q.attempts >= PROBLEM_ATTEMPTS &&
      (q.incorrect / q.attempts) * 100 >= PROBLEM_INCORRECT_RATE,
  );
  if (candidates.length === 0) return [];

  const ids = candidates.map(([id]) => id);
  const rows = await db
    .select({
      id: questionsTable.id,
      questionText: questionsTable.questionText,
      courseId: questionsTable.courseId,
      topicId: questionsTable.topicId,
      subtopicId: questionsTable.subtopicId,
      difficultyLevel: questionsTable.difficultyLevel,
      status: questionsTable.status,
    })
    .from(questionsTable)
    .where(inArray(questionsTable.id, ids));
  const detail = new Map(rows.map((r) => [r.id, r]));

  const topicIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.topicId, r.subtopicId].filter((x): x is number => x != null),
      ),
    ),
  ];
  const topicNames = new Map<number, string>();
  if (topicIds.length) {
    const trows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, topicIds));
    for (const t of trows) topicNames.set(t.id, t.topicName);
  }

  const out: ProblematicQuestion[] = [];
  for (const [id, q] of candidates) {
    const d = detail.get(id);
    if (!d || d.status === "archived") continue;
    out.push({
      questionId: id,
      questionPreview: preview(d.questionText),
      courseId: q.courseId,
      courseName: data.courseMeta.get(q.courseId)?.courseName ?? null,
      topicId: d.topicId,
      topicName: d.topicId != null ? (topicNames.get(d.topicId) ?? null) : null,
      subtopicId: d.subtopicId,
      subtopicName:
        d.subtopicId != null ? (topicNames.get(d.subtopicId) ?? null) : null,
      difficultyLevel: d.difficultyLevel,
      attemptsCount: q.attempts,
      incorrectRate: round2((q.incorrect / q.attempts) * 100),
      status: d.status,
    });
  }
  out.sort(
    (a, b) => b.incorrectRate - a.incorrectRate || b.attemptsCount - a.attemptsCount,
  );
  return out;
}

interface FailedTopic {
  courseId: number;
  courseName: string | null;
  topicId: number;
  topicName: string | null;
  averageAccuracy: number;
  attemptsCount: number;
}

export async function getLecturerDashboard(lecturerId: number) {
  const data = await gatherClassData(lecturerId);

  const studentsCount = new Set(
    [...data.enrolledByCourse.values()].flatMap((s) => [...s]),
  ).size;

  const allScores = [
    ...[...data.examScoresByCourse.values()].flat(),
    ...[...data.practiceScoresByCourse.values()].flat(),
  ];
  const averageClassScore = mean(allScores);

  const problematic = await buildProblematicQuestions(data);

  // Most-failed topics across all taught courses (with enough attempts).
  const failedTopics: FailedTopic[] = [];
  const allTopicIds = new Set<number>();
  for (const courseId of data.courseIds) {
    const agg = topicAggForCourse(data, courseId);
    for (const [topicId, t] of agg) {
      if (t.attempts < CLASS_MIN_ATTEMPTS) continue;
      allTopicIds.add(topicId);
      failedTopics.push({
        courseId,
        courseName: data.courseMeta.get(courseId)?.courseName ?? null,
        topicId,
        topicName: null,
        averageAccuracy: round2((t.correct / t.attempts) * 100),
        attemptsCount: t.attempts,
      });
    }
  }
  if (allTopicIds.size) {
    const trows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, [...allTopicIds]));
    const names = new Map(trows.map((t) => [t.id, t.topicName]));
    for (const ft of failedTopics) ft.topicName = names.get(ft.topicId) ?? null;
  }
  failedTopics.sort((a, b) => a.averageAccuracy - b.averageAccuracy);

  const activeCourses = data.courseIds
    .map((courseId) => {
      const meta = data.courseMeta.get(courseId);
      const agg = topicAggForCourse(data, courseId);
      let weakTopicsCount = 0;
      for (const t of agg.values()) {
        if (
          t.attempts >= CLASS_MIN_ATTEMPTS &&
          (t.correct / t.attempts) * 100 < WEAK_TOPIC_ACCURACY
        ) {
          weakTopicsCount += 1;
        }
      }
      const courseProblematic = problematic.filter(
        (p) => p.courseId === courseId,
      ).length;
      return {
        courseId,
        courseCode: meta?.courseCode ?? null,
        courseName: meta?.courseName ?? "",
        programName: meta?.programName ?? null,
        studentsCount: data.enrolledByCourse.get(courseId)?.size ?? 0,
        averageScore: courseAverage(data, courseId),
        weakTopicsCount,
        problematicQuestionsCount: courseProblematic,
      };
    })
    .sort((a, b) => b.studentsCount - a.studentsCount);

  return {
    coursesCount: data.courseIds.length,
    studentsCount,
    averageClassScore,
    problematicQuestionsCount: problematic.length,
    activeCourses,
    mostFailedTopics: failedTopics.slice(0, 5),
    mostFailedQuestions: problematic.slice(0, 5),
  };
}

interface ClassTopicPerformance {
  topicId: number;
  topicName: string | null;
  averageAccuracy: number;
  attemptsCount: number;
  weakStudentsCount: number;
}

interface ContentGap {
  topicId: number | null;
  topicName: string | null;
  description: string;
}

// Per-course analytics. Ownership is verified by the caller (route) before this
// is invoked.
export async function getLecturerCourseAnalytics(
  lecturerId: number,
  courseId: number,
) {
  const data = await gatherClassData(lecturerId);
  const meta = data.courseMeta.get(courseId);

  const agg = topicAggForCourse(data, courseId);
  const topicIds = [...agg.keys()];
  const topicNames = new Map<number, string>();
  if (topicIds.length) {
    const trows = await db
      .select({ id: topicsTable.id, topicName: topicsTable.topicName })
      .from(topicsTable)
      .where(inArray(topicsTable.id, topicIds));
    for (const t of trows) topicNames.set(t.id, t.topicName);
  }

  const topicPerformance: ClassTopicPerformance[] = [...agg.entries()]
    .map(([topicId, t]) => {
      let weakStudentsCount = 0;
      for (const u of t.perUser.values()) {
        if ((u.correct / u.attempts) * 100 < WEAK_STUDENT_ACCURACY) {
          weakStudentsCount += 1;
        }
      }
      return {
        topicId,
        topicName: topicNames.get(topicId) ?? null,
        averageAccuracy: round2((t.correct / t.attempts) * 100),
        attemptsCount: t.attempts,
        weakStudentsCount,
      };
    })
    .sort((a, b) => a.averageAccuracy - b.averageAccuracy);

  const problematicQuestions = await buildProblematicQuestions(data, courseId);

  // Content gaps: active topics in the course with no approved questions.
  const courseTopics = await db
    .select({ id: topicsTable.id, topicName: topicsTable.topicName })
    .from(topicsTable)
    .where(
      and(eq(topicsTable.courseId, courseId), eq(topicsTable.status, "active")),
    );
  const approvedTopicRows = await db
    .select({ topicId: questionsTable.topicId })
    .from(questionsTable)
    .where(
      and(
        eq(questionsTable.courseId, courseId),
        eq(questionsTable.status, "approved"),
      ),
    );
  const topicsWithApproved = new Set(
    approvedTopicRows
      .map((r) => r.topicId)
      .filter((x): x is number => x != null),
  );
  const contentGaps: ContentGap[] = courseTopics
    .filter((t) => !topicsWithApproved.has(t.id))
    .map((t) => ({
      topicId: t.id,
      topicName: t.topicName,
      description: `No approved questions for "${t.topicName}".`,
    }));

  return {
    courseId,
    courseName: meta?.courseName ?? "",
    averageScore: courseAverage(data, courseId),
    studentsCount: data.enrolledByCourse.get(courseId)?.size ?? 0,
    topicPerformance,
    mostFailedQuestions: problematicQuestions.slice(0, 5),
    problematicQuestions,
    contentGaps,
  };
}

// Problematic questions for the standalone endpoint. When courseId is given the
// route has already verified ownership; otherwise spans all taught courses.
export async function getLecturerProblematicQuestions(
  lecturerId: number,
  courseId?: number,
): Promise<ProblematicQuestion[]> {
  const data = await gatherClassData(lecturerId);
  return buildProblematicQuestions(data, courseId);
}
