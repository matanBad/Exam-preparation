// Procedural demo-data generator (Strategy A friendly).
//
// Wipes the DB and rebuilds a COHERENT presentable dataset:
//  - Reference data (programs, lecturers/admins, courses, offerings, topics,
//    questions, options) comes from the CSVs in ../data.
//  - Students, enrollments, mock exams, practice sessions, performance summaries
//    and streaks are GENERATED so that:
//      * every course has >= 10 students (rule 5),
//      * a course's students are all from one program (rule 2.1) and one
//        year/semester (rule 2.2) — driven by each course_offering's cohort,
//      * every student does >= 5 mock exams and >= 5 practice sessions per
//        course (rule 6),
//      * generated student emails end with @ac.sce.ac.il (rule 3); lecturer
//        emails (@sce.ac.il, rule 4) come from the CSV and are left intact,
//      * courses with no questions get a generated bank (rule 7),
//      * the one course with no offering gets one so it joins a cohort.
//
// Deterministic PRNG → reproducible runs. Run with: pnpm --filter
// @workspace/scripts run seed

import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  db,
  pool,
  usersTable,
  coursesTable,
  enrollmentsTable,
  topicsTable,
  questionsTable,
  answerOptionsTable,
  notificationsTable,
  messagesTable,
  programsTable,
  lecturerProgramsTable,
  courseOfferingsTable,
  mockExamsTable,
  mockExamQuestionsTable,
  practiceSessionsTable,
  practiceSessionQuestionsTable,
  performanceSummaryTable,
  learningStreaksTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      cur.push(field); field = ""; rows.push(cur); cur = [];
    } else field += c;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();
  let h = 0;
  while (h < rows.length && rows[h].every((v) => v.trim() === "")) h++;
  const header = rows[h];
  return rows.slice(h + 1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((k, idx) => (obj[k.trim()] = (r[idx] ?? "").trim()));
    return obj;
  });
}
const readCsv = (name: string) =>
  parseCsv(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
const nullable = (v: string | undefined) => (v == null || v === "" ? null : v);
const intOrNull = (v: string | undefined) =>
  v == null || v === "" ? null : Number(v);
const floatOrNull = intOrNull;
const boolVal = (v: string | undefined) =>
  (v ?? "").toLowerCase() === "true" || v === "1";

async function insertInChunks<T>(table: any, values: T[], paramsPerRow: number) {
  if (values.length === 0) return;
  const maxRows = Math.max(1, Math.floor(60000 / Math.max(1, paramsPerRow)));
  for (let i = 0; i < values.length; i += maxRows)
    await db.insert(table).values(values.slice(i, i + maxRows));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260615);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const shuffle = <T,>(arr: T[]) => {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
const maxId = (rows: Record<string, string>[]) =>
  rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);

const EXAM_MAX: Record<string, number> = { Easy: 5, Medium: 10, Hard: 15 };
const PRAC_MAX: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };
const DAY = 86_400_000;
const NOW = Date.now();
const pastDate = (maxDaysAgo: number) =>
  new Date(NOW - Math.floor(rng() * maxDaysAgo) * DAY - Math.floor(rng() * DAY));

const FIRST = ["Noa", "Yael", "Tamar", "Shira", "Maya", "Avigail", "Adi", "Roni", "Daniel", "Itai", "Omer", "Yonatan", "Eitan", "Guy", "Lior", "Amit", "Nadav", "Tal", "Ori", "Gal", "Hila", "Bar", "Dana", "Eden", "Noam"];
const LAST = ["Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Avraham", "Friedman", "Shapira", "Katz", "Bar-On", "Sharon", "Azoulay", "Gabay", "Maman", "Dahan", "Ben-David", "Sela", "Harel", "Vaknin", "Naor"];

async function main() {
  console.log("Clearing existing data...");
  await db.execute(sql`TRUNCATE TABLE
    account_deletion_requests, student_milestones, learning_streaks, recommendations,
    performance_summary, practice_session_questions, practice_sessions, notifications,
    messages, mock_exam_questions, mock_exams, answer_options,
    questions, topics, enrollments, course_offerings,
    lecturer_programs, courses, users, programs
    RESTART IDENTITY CASCADE`);

  const fallbackHash = await bcrypt.hash("123456", 10);

  // ---- programs ----
  const programRows = readCsv("programs.csv");
  await db.insert(programsTable).values(
    programRows.map((p) => ({
      id: Number(p.id), name: p.name, code: p.code, status: p.status || "active",
    })),
  );

  // ---- users: keep lecturers, admins, and the demo students only ----
  const userRows = readCsv("users.csv");
  const DEMO_STUDENT_EMAILS = new Set([
    "shai.fisher@ac.sce.ac.il",
    "student@eps.com",
  ]);
  const keptUsers = userRows.filter(
    (u) =>
      u.role === "lecturer" ||
      u.role === "admin" ||
      DEMO_STUDENT_EMAILS.has(u.email),
  );
  await insertInChunks(
    usersTable,
    keptUsers.map((u) => ({
      id: Number(u.id),
      fullName: u.full_name,
      email: u.email,
      passwordHash: u.password_hash || fallbackHash,
      role: u.role,
      accountStatus: u.account_status || "active",
      profileImageUrl: nullable(u.profile_image_url),
      programId: intOrNull(u.program_id),
      currentStudyYear: nullable(u.current_study_year),
      currentSemester: nullable(u.current_semester),
      mustChangePassword: boolVal(u.must_change_password),
    })),
    11,
  );
  const lecturerIds = keptUsers.filter((u) => u.role === "lecturer").map((u) => Number(u.id));
  const lecturersByProgram = new Map<number, number[]>();

  // ---- courses ----
  const courseRows = readCsv("courses.csv");
  await db.insert(coursesTable).values(
    courseRows.map((c) => ({
      id: Number(c.id), courseCode: c.course_code, courseName: c.course_name,
      semester: nullable(c.semester), academicYear: nullable(c.academic_year),
      status: c.status || "active",
    })),
  );
  const courseName = new Map(courseRows.map((c) => [Number(c.id), c.course_name]));

  // ---- topics ----
  const topicRows = readCsv("topics.csv");
  const validCourseIds = new Set(courseRows.map((c) => Number(c.id)));
  const topicRowsValid = topicRows.filter((t) => validCourseIds.has(Number(t.course_id)));
  const validTopicIds = new Set(topicRowsValid.map((t) => Number(t.id)));
  for (const t of topicRowsValid) {
    const pid = intOrNull(t.parent_topic_id);
    if (pid !== null && !validTopicIds.has(pid)) t.parent_topic_id = "";
  }
  let topicSeq = maxId(topicRowsValid) + 1;
  const genTopics: any[] = [];
  const topicsByCourse = new Map<number, number[]>();
  for (const t of topicRowsValid) {
    const cid = Number(t.course_id);
    if (!topicsByCourse.has(cid)) topicsByCourse.set(cid, []);
    topicsByCourse.get(cid)!.push(Number(t.id));
  }

  // ---- questions + options ----
  const questionRows = readCsv("questions.csv").filter((q) => {
    if (!validCourseIds.has(Number(q.course_id))) return false;
    const tid = intOrNull(q.topic_id);
    if (tid !== null && !validTopicIds.has(tid)) return false;
    const sid = intOrNull(q.subtopic_id);
    if (sid !== null && !validTopicIds.has(sid)) return false;
    return true;
  });
  const validQuestionIds = new Set(questionRows.map((q) => Number(q.id)));
  const optionRows = readCsv("answer_options.csv").filter((o) =>
    validQuestionIds.has(Number(o.question_id)),
  );
  const optionsByQuestion = new Map<number, { id: number; correct: boolean }[]>();
  for (const o of optionRows) {
    const qid = Number(o.question_id);
    if (!optionsByQuestion.has(qid)) optionsByQuestion.set(qid, []);
    optionsByQuestion.get(qid)!.push({ id: Number(o.id), correct: boolVal(o.is_correct) });
  }

  // Generated questions for courses with no bank (rule 7) + ensure a topic.
  let qSeq = maxId(questionRows) + 1;
  let oSeq = maxId(optionRows) + 1;
  const genQuestions: any[] = [];
  const genOptions: any[] = [];
  const coursesNeedingQuestions = courseRows
    .map((c) => Number(c.id))
    .filter((cid) => !questionRows.some((q) => Number(q.course_id) === cid));
  for (const cid of coursesNeedingQuestions) {
    let topicId = (topicsByCourse.get(cid) ?? [])[0];
    if (topicId == null) {
      topicId = topicSeq++;
      genTopics.push({ id: topicId, courseId: cid, topicName: "General", parentTopicId: null, weight: 1, status: "active" });
      topicsByCourse.set(cid, [topicId]);
      validTopicIds.add(topicId);
    }
    const diffs = ["Easy", "Medium", "Hard"];
    for (let i = 0; i < 16; i++) {
      const qid = qSeq++;
      const diff = diffs[i % 3];
      genQuestions.push({
        id: qid, courseId: cid, topicId, subtopicId: null,
        title: `${courseName.get(cid) ?? "Course"} — practice question ${i + 1}`,
        questionText: `Sample ${diff} question ${i + 1} for ${courseName.get(cid) ?? "this course"}. Choose the correct answer.`,
        questionType: "single_choice", difficultyLevel: diff,
        explanationText: "The correct option follows directly from the course material.",
        sourceReference: null, status: "approved", createdBy: null,
      });
      const correctIdx = Math.floor(rng() * 4);
      const optIds: { id: number; correct: boolean }[] = [];
      for (let k = 0; k < 4; k++) {
        const oid = oSeq++;
        genOptions.push({ id: oid, questionId: qid, answerText: `Option ${String.fromCharCode(65 + k)}`, isCorrect: k === correctIdx, displayOrder: k });
        optIds.push({ id: oid, correct: k === correctIdx });
      }
      optionsByQuestion.set(qid, optIds);
      validQuestionIds.add(qid);
    }
  }

  // Insert topics (CSV + generated).
  await insertInChunks(topicsTable, [
    ...topicRowsValid.map((t) => ({
      id: Number(t.id), courseId: Number(t.course_id), topicName: t.topic_name,
      parentTopicId: intOrNull(t.parent_topic_id), weight: floatOrNull(t.weight),
      status: t.status || "active",
    })),
    ...genTopics,
  ], 6);

  // Insert questions (CSV + generated). Keep a realistic status spread on the
  // CSV bank (some pending/draft/archived) but never touch generated approved ones.
  const nonArchived: number[] = [];
  questionRows.forEach((q, i) => { if (q.status !== "archived") nonArchived.push(i); });
  const shuffledIdx = shuffle(nonArchived);
  const statusOverride = new Map<number, string>();
  let cur = 0;
  for (let k = 0; k < Math.min(100, shuffledIdx.length); k++) statusOverride.set(shuffledIdx[cur++], "pending");
  for (let k = 0; k < Math.min(100, shuffledIdx.length - cur); k++) statusOverride.set(shuffledIdx[cur++], "draft");
  await insertInChunks(questionsTable, [
    ...questionRows.map((q, i) => ({
      id: Number(q.id), courseId: Number(q.course_id),
      topicId: intOrNull(q.topic_id), subtopicId: intOrNull(q.subtopic_id),
      title: q.title, questionText: q.question_text,
      questionType: q.question_type || "single_choice",
      difficultyLevel: q.difficulty_level || "Medium",
      explanationText: nullable(q.explanation_text), sourceReference: nullable(q.source_reference),
      status: statusOverride.get(i) ?? (q.status || "approved"),
      createdBy: intOrNull(q.created_by),
    })),
    ...genQuestions,
  ], 12);
  // Build approved-question pool per course (for exam/practice snapshots).
  const approvedStatus = (i: number, csvStatus: string) =>
    (statusOverride.get(i) ?? (csvStatus || "approved")) === "approved";
  const poolByCourse = new Map<number, { qid: number; diff: string; topicId: number | null; subtopicId: number | null }[]>();
  const addPool = (cid: number, qid: number, diff: string, topicId: number | null, subtopicId: number | null) => {
    if (!poolByCourse.has(cid)) poolByCourse.set(cid, []);
    poolByCourse.get(cid)!.push({ qid, diff, topicId, subtopicId });
  };
  questionRows.forEach((q, i) => {
    if (!approvedStatus(i, q.status)) return;
    addPool(Number(q.course_id), Number(q.id), q.difficulty_level || "Medium", intOrNull(q.topic_id), intOrNull(q.subtopic_id));
  });
  for (const gq of genQuestions) addPool(gq.courseId, gq.id, gq.difficultyLevel, gq.topicId, null);

  await insertInChunks(answerOptionsTable, [
    ...optionRows.map((o) => ({
      id: Number(o.id), questionId: Number(o.question_id), answerText: o.answer_text,
      isCorrect: boolVal(o.is_correct), displayOrder: Number(o.display_order),
    })),
    ...genOptions,
  ], 5);

  // ---- course_offerings (CSV + generated for the orphan course) ----
  const validProgramIds = new Set(programRows.map((p) => Number(p.id)));
  const validUserIds = new Set(keptUsers.map((u) => Number(u.id)));
  const seenOff = new Set<string>();
  const offeringRows = readCsv("course_offerings.csv").filter((o) => {
    if (!validCourseIds.has(Number(o.course_id)) || !validProgramIds.has(Number(o.program_id)) || !validUserIds.has(Number(o.lecturer_id))) return false;
    const key = `${o.course_id}:${o.program_id}:${o.lecturer_id}`;
    if (seenOff.has(key)) return false;
    seenOff.add(key);
    return true;
  });
  for (const o of offeringRows) {
    const lid = Number(o.lecturer_id), pid = Number(o.program_id);
    if (!lecturersByProgram.has(pid)) lecturersByProgram.set(pid, []);
    if (!lecturersByProgram.get(pid)!.includes(lid)) lecturersByProgram.get(pid)!.push(lid);
  }
  let offSeq = maxId(offeringRows) + 1;
  const coursesWithOffering = new Set(offeringRows.map((o) => Number(o.course_id)));
  const genOfferings: any[] = [];
  for (const cid of courseRows.map((c) => Number(c.id))) {
    if (coursesWithOffering.has(cid)) continue;
    const pid = 4; // Chemical Engineering for "Introduction to Chemistry"
    const lid = (lecturersByProgram.get(pid) ?? lecturerIds)[0] ?? lecturerIds[0];
    genOfferings.push({ id: offSeq++, course_id: String(cid), program_id: String(pid), lecturer_id: String(lid), study_year: "First", semester: "A", academic_year: "2025", status: "active" });
    if (!lecturersByProgram.has(pid)) lecturersByProgram.set(pid, []);
    if (!lecturersByProgram.get(pid)!.includes(lid)) lecturersByProgram.get(pid)!.push(lid);
  }
  const allOfferings = [...offeringRows, ...genOfferings];
  await insertInChunks(courseOfferingsTable, allOfferings.map((o) => ({
    id: Number(o.id), courseId: Number(o.course_id), programId: Number(o.program_id),
    lecturerId: Number(o.lecturer_id), studyYear: nullable(o.study_year),
    semester: nullable(o.semester), academicYear: nullable(o.academic_year),
    status: o.status || "active",
  })), 8);

  // ---- lecturer_programs (derived) ----
  const lpPairs = new Map<string, { lecturerId: number; programId: number }>();
  for (const o of allOfferings) {
    const key = `${o.lecturer_id}:${o.program_id}`;
    if (!lpPairs.has(key)) lpPairs.set(key, { lecturerId: Number(o.lecturer_id), programId: Number(o.program_id) });
  }
  await db.insert(lecturerProgramsTable).values([...lpPairs.values()]);

  // ---- cohorts: (program, year, sem) → courses + students (rules 2.1/2.2/5) ----
  const cohortKey = (p: number, y: string, s: string) => `${p}|${y}|${s}`;
  const cohortCourses = new Map<string, Set<number>>();
  for (const o of allOfferings) {
    const y = o.study_year || "First", s = o.semester || "A";
    const k = cohortKey(Number(o.program_id), y, s);
    if (!cohortCourses.has(k)) cohortCourses.set(k, new Set());
    cohortCourses.get(k)!.add(Number(o.course_id));
  }

  const STUDENTS_PER_COHORT = 12;
  let userSeq = maxId(userRows) + 1;
  const genStudents: any[] = [];
  const enrollments: { id: number; userId: number; courseId: number }[] = [];
  let enrollSeq = 1;
  // student -> { id, courseIds[] }
  const studentCourses: { id: number; courseIds: number[] }[] = [];

  // Seat the demo student (shai.fisher) into his matching cohort if present.
  const demoStudent = keptUsers.find((u) => DEMO_STUDENT_EMAILS.has(u.email));
  const usedEmail = new Set(keptUsers.map((u) => u.email.toLowerCase()));

  for (const [k, courseSet] of cohortCourses) {
    const [pStr, year, sem] = k.split("|");
    const programId = Number(pStr);
    const courseIds = [...courseSet];
    const members: number[] = [];
    // include the demo student in his cohort
    if (
      demoStudent &&
      Number(demoStudent.program_id) === programId &&
      (demoStudent.current_study_year || "First") === year &&
      (demoStudent.current_semester || "A") === sem
    ) {
      members.push(Number(demoStudent.id));
      studentCourses.push({ id: Number(demoStudent.id), courseIds });
    }
    while (members.length < STUDENTS_PER_COHORT) {
      const id = userSeq++;
      const first = pick(FIRST), last = pick(LAST);
      let email = `${first}.${last}${id}@ac.sce.ac.il`.toLowerCase();
      while (usedEmail.has(email)) email = `${first}.${last}${id}${Math.floor(rng() * 99)}@ac.sce.ac.il`.toLowerCase();
      usedEmail.add(email);
      genStudents.push({
        id, fullName: `${first} ${last}`, email, passwordHash: fallbackHash,
        role: "student", accountStatus: "active", profileImageUrl: null,
        programId, currentStudyYear: year, currentSemester: sem, mustChangePassword: false,
      });
      members.push(id);
      studentCourses.push({ id, courseIds });
    }
    for (const sid of members)
      for (const cid of courseIds) enrollments.push({ id: enrollSeq++, userId: sid, courseId: cid });
  }

  console.log(`Seeding ${genStudents.length} students, ${enrollments.length} enrollments...`);
  await insertInChunks(usersTable, genStudents, 11);
  await insertInChunks(enrollmentsTable, enrollments.map((e) => ({ id: e.id, userId: e.userId, courseId: e.courseId, enrollmentStatus: "active" })), 4);

  // ---- generate exams + practices per (student, course); rule 6: >=5 each ----
  const EXAMS = 5, PRACTICES = 5, EXAM_Q = 8, PRAC_Q = 6;
  let examSeq = 1, examQSeq = 1, pracSeq = 1, pracQSeq = 1;
  // perf aggregate: key student|course|topic -> {attempts,correct,earned,possible}
  const perf = new Map<string, { userId: number; courseId: number; topicId: number; subtopicId: number | null; attempts: number; correct: number; earned: number; possible: number }>();
  const bumpPerf = (userId: number, courseId: number, topicId: number | null, subtopicId: number | null, correct: boolean, earned: number, max: number) => {
    if (topicId == null) return;
    const key = `${userId}|${courseId}|${topicId}`;
    let a = perf.get(key);
    if (!a) { a = { userId, courseId, topicId, subtopicId, attempts: 0, correct: 0, earned: 0, possible: 0 }; perf.set(key, a); }
    a.attempts++; if (correct) a.correct++; a.earned += earned; a.possible += max;
  };

  const skillOf = new Map<number, number>();
  for (const sc of studentCourses) if (!skillOf.has(sc.id)) skillOf.set(sc.id, 0.45 + rng() * 0.5);

  let totalExams = 0, totalPractices = 0;
  // Flush buffers periodically to bound memory.
  let examBuf: any[] = [], examQBuf: any[] = [], pracBuf: any[] = [], pracQBuf: any[] = [];
  const flush = async () => {
    await insertInChunks(mockExamsTable, examBuf, 13);
    await insertInChunks(mockExamQuestionsTable, examQBuf, 11);
    await insertInChunks(practiceSessionsTable, pracBuf, 16);
    await insertInChunks(practiceSessionQuestionsTable, pracQBuf, 16);
    examBuf = []; examQBuf = []; pracBuf = []; pracQBuf = [];
  };

  for (const sc of studentCourses) {
    const baseSkill = skillOf.get(sc.id)!;
    for (const cid of sc.courseIds) {
      const pool = poolByCourse.get(cid) ?? [];
      if (pool.length === 0) continue;
      const skill = clamp(baseSkill + (rng() - 0.5) * 0.2, 0.2, 0.97);

      for (let e = 0; e < EXAMS; e++) {
        const examId = examSeq++;
        const qs = shuffle(pool).slice(0, Math.min(EXAM_Q, pool.length));
        let earnedSum = 0, maxSum = 0;
        const when = pastDate(120);
        qs.forEach((q, idx) => {
          const opts = optionsByQuestion.get(q.qid) ?? [];
          const correctOpt = opts.find((o) => o.correct);
          const max = EXAM_MAX[q.diff] ?? 10;
          const correct = rng() < skill && !!correctOpt;
          const earned = correct ? max : 0;
          earnedSum += earned; maxSum += max;
          const chosen = correct ? correctOpt!.id : (opts.find((o) => !o.correct)?.id ?? (opts[0]?.id ?? null));
          examQBuf.push({
            id: examQSeq++, examId, questionId: q.qid, randomizedOrder: idx,
            randomizedOptionOrder: JSON.stringify(shuffle(opts.map((o) => o.id))),
            selectedAnswerOptionId: chosen, selectedOptionIds: JSON.stringify(chosen != null ? [chosen] : []),
            isCorrect: correct, maxScore: max, earnedScore: earned, responseTimeSeconds: 20 + Math.floor(rng() * 100),
          });
          bumpPerf(sc.id, cid, q.topicId, q.subtopicId, correct, correct ? (PRAC_MAX[q.diff] ?? 2) : 0, PRAC_MAX[q.diff] ?? 2);
        });
        examBuf.push({
          id: examId, userId: sc.id, courseId: cid, generatedByRule: "balanced",
          examMode: "mock", totalQuestions: qs.length, durationMinutes: 60,
          startedAt: when, submittedAt: new Date(when.getTime() + 30 * 60000),
          score: maxSum > 0 ? round2((earnedSum / maxSum) * 100) : 0, status: "submitted",
          createdAt: when, updatedAt: when,
        });
        totalExams++;
      }

      for (let p = 0; p < PRACTICES; p++) {
        const sessionId = pracSeq++;
        const qs = shuffle(pool).slice(0, Math.min(PRAC_Q, pool.length));
        let earnedSum = 0, maxSum = 0, correctCount = 0;
        const topicId = qs[0]?.topicId ?? null;
        const when = pastDate(120);
        qs.forEach((q, idx) => {
          const opts = optionsByQuestion.get(q.qid) ?? [];
          const correctOpt = opts.find((o) => o.correct);
          const max = PRAC_MAX[q.diff] ?? 2;
          const correct = rng() < skill && !!correctOpt;
          const earned = correct ? max : 0;
          earnedSum += earned; maxSum += max; if (correct) correctCount++;
          const chosen = correct ? correctOpt!.id : (opts.find((o) => !o.correct)?.id ?? (opts[0]?.id ?? null));
          pracQBuf.push({
            id: pracQSeq++, sessionId, questionId: q.qid, questionOrder: idx,
            randomizedOptionOrder: JSON.stringify(shuffle(opts.map((o) => o.id))),
            selectedAnswerOptionId: chosen, selectedOptionIds: JSON.stringify(chosen != null ? [chosen] : []),
            isCorrect: correct, confidenceLevel: pick(["low", "medium", "high"]),
            responseTimeSeconds: 15 + Math.floor(rng() * 90), maxScore: max,
            earnedScore: earned, status: "answered", answeredAt: when,
            createdAt: when, updatedAt: when,
          });
          bumpPerf(sc.id, cid, q.topicId, q.subtopicId, correct, earned, max);
        });
        pracBuf.push({
          id: sessionId, userId: sc.id, courseId: cid, topicId, subtopicId: null,
          sessionType: "topic", status: "completed", totalQuestions: qs.length,
          answeredCount: qs.length, correctCount, earnedScore: earnedSum, totalMaxScore: maxSum,
          startedAt: when, completedAt: new Date(when.getTime() + 12 * 60000), createdAt: when, updatedAt: when,
        });
        totalPractices++;
      }
    }
    if (examBuf.length > 4000 || examQBuf.length > 30000) await flush();
  }
  await flush();
  console.log(`Seeded ${totalExams} mock exams, ${totalPractices} practice sessions.`);

  // ---- performance_summary (drives weak areas / recommendations) ----
  const MIN = 3;
  const perfRows: any[] = [];
  let perfSeq = 1;
  for (const a of perf.values()) {
    if (a.attempts < MIN) continue;
    const accuracy = round2((a.correct / a.attempts) * 100);
    const incorrect = a.attempts - a.correct;
    const weaknessScore = round2(clamp(100 - accuracy, 0, 100));
    const weaknessLevel = accuracy >= 75 ? "strong" : accuracy >= 60 ? "needs_practice" : "weak";
    perfRows.push({
      id: perfSeq++, userId: a.userId, courseId: a.courseId, topicId: a.topicId, subtopicId: a.subtopicId,
      attemptsCount: a.attempts, correctCount: a.correct, incorrectCount: incorrect,
      totalEarnedScore: round2(a.earned), totalPossibleScore: round2(a.possible),
      accuracyRate: accuracy, averageResponseTime: 40, lowConfidenceCount: 0,
      repeatedMistakeCount: incorrect > 2 ? Math.floor(incorrect / 2) : 0,
      weaknessScore, weaknessLevel, lastActivityAt: new Date(NOW - DAY),
      createdAt: new Date(NOW - DAY), updatedAt: new Date(NOW - DAY),
    });
  }
  console.log(`Seeding ${perfRows.length} performance_summary rows...`);
  await insertInChunks(performanceSummaryTable, perfRows, 19);

  // ---- learning_streaks ----
  const streakRows = studentCourses.map((sc, i) => ({
    id: i + 1, userId: sc.id, currentStreak: Math.floor(rng() * 6), longestStreak: 2 + Math.floor(rng() * 10),
    lastActivityDate: new Date(NOW - Math.floor(rng() * 3) * DAY).toISOString().slice(0, 10),
    createdAt: new Date(NOW - 30 * DAY), updatedAt: new Date(),
  }));
  await insertInChunks(learningStreaksTable, streakRows, 7);

  // ---- resync sequences ----
  console.log("Resyncing sequences...");
  for (const table of [
    "programs", "users", "courses", "enrollments", "topics", "questions",
    "answer_options", "course_offerings", "lecturer_programs", "mock_exams",
    "mock_exam_questions", "practice_sessions", "practice_session_questions",
    "performance_summary", "learning_streaks", "notifications", "messages",
  ]) {
    await db.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`));
  }

  console.log("Demo seed complete.");
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
