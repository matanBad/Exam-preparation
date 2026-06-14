/**
 * generate-activity.mjs — Deterministic seed-data generator for EPS.
 *
 * Produces realistic student activity + derived analytics so the system has
 * enough data to actually "analyze and recommend":
 *   - tops up students to TARGET_STUDENTS
 *   - enrolls >= MIN_PER_OFFERING students in every active course offering
 *   - 5+ mock exams and 4+ practice sessions per student (graded)
 *   - performance_summary, recommendations, learning_streaks,
 *     student_milestones and notifications derived with the SAME formulas
 *     the live engine uses (artifacts/api-server/src/lib/{analytics,engagement}.ts).
 *
 * It REPLACES these CSVs in scripts/data/: enrollments, mock_exams,
 * mock_exam_questions, practice_sessions, practice_session_questions,
 * performance_summary, recommendations, learning_streaks, student_milestones,
 * notifications — and APPENDS new rows to users.csv.
 *
 * Run with plain node (no DB needed):  node scripts/src/generate-activity.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "../data");

// ---- knobs -----------------------------------------------------------------
const TARGET_STUDENTS = 240; // total students after top-up
const MIN_PER_OFFERING = 12; // >= 12 students enrolled in every active offering
const TARGET_PER_COURSE = 14; // aim a bit above the floor
const EXAMS_PER_STUDENT = [5, 7]; // inclusive range (>= 5)
const PRACTICE_PER_STUDENT = [4, 6]; // inclusive range (>= 4)
const PASSWORD_HASH =
  "$2b$10$1EbZYKGJ50RJqXaDIhXSHeeU.avGvRXajL/a0YFOl8.bYMBMtgLSC"; // "123456"
const DAYS_BACK = 45; // activity spread window

// difficulty weights (snapshotted exactly like the app)
const EXAM_W = { Easy: 5, Medium: 10, Hard: 15 };
const PRACTICE_W = { Easy: 1, Medium: 2, Hard: 3 };
const MIN_ATTEMPTS = 3; // engine constant

// ---- deterministic RNG (mulberry32) ---------------------------------------
let _s = 987654321;
function rng() {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)); // inclusive
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// ---- tiny CSV (RFC-4180-ish) -----------------------------------------------
function parseCsv(file) {
  const txt = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cur = "",
    q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"') {
        if (txt[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      // skip
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const header = rows.shift();
  return rows
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(file, header, rows) {
  const lines = [header.join(",")];
  for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(","));
  fs.writeFileSync(file, lines.join("\r\n") + "\r\n");
}

// ---- load inputs -----------------------------------------------------------
const users = parseCsv(path.join(DATA, "users.csv"));
const programs = parseCsv(path.join(DATA, "programs.csv"));
const courses = parseCsv(path.join(DATA, "courses.csv"));
const topics = parseCsv(path.join(DATA, "topics.csv"));
const questions = parseCsv(path.join(DATA, "questions.csv"));
const options = parseCsv(path.join(DATA, "answer_options.csv"));
const offerings = parseCsv(path.join(DATA, "course_offerings.csv"));

const topicById = new Map(topics.map((t) => [t.id, t]));

// question_id -> {courseId, topicId, subtopicId, difficulty, options:[{id,correct}], correctIds:Set}
const qmeta = new Map();
for (const q of questions) {
  if (q.status !== "approved") continue;
  if (!q.topic_id || !q.topic_id.trim()) continue;
  qmeta.set(q.id, {
    id: q.id,
    courseId: q.course_id,
    topicId: q.topic_id,
    subtopicId: q.subtopic_id && q.subtopic_id.trim() ? q.subtopic_id : null,
    type: q.question_type, // single_choice | multiple_choice
    difficulty: EXAM_W[q.difficulty_level] ? q.difficulty_level : "Medium",
    options: [],
    correctIds: new Set(),
  });
}
for (const o of options) {
  const m = qmeta.get(o.question_id);
  if (!m) continue;
  const correct = o.is_correct === "true" || o.is_correct === "1";
  m.options.push({ id: o.id, correct });
  if (correct) m.correctIds.add(o.id);
}
// keep only well-formed questions (>=2 options, >=1 correct)
for (const [id, m] of qmeta)
  if (m.options.length < 2 || m.correctIds.size < 1) qmeta.delete(id);

// course -> approved question ids
const courseQs = new Map();
for (const m of qmeta.values()) {
  if (!courseQs.has(m.courseId)) courseQs.set(m.courseId, []);
  courseQs.get(m.courseId).push(m.id);
}
const usableCourses = new Set(
  [...courseQs.entries()].filter(([, qs]) => qs.length >= 8).map(([c]) => c),
);

// ---- students: keep existing, add new --------------------------------------
const existingStudents = users.filter((u) => u.role === "student");
let maxUserId = Math.max(...users.map((u) => Number(u.id)));
const progIds = programs.map((p) => p.id);
const FIRST = ["Noa","Itai","Maya","Omer","Yael","Eden","Adi","Roni","Tal","Lior","Shir","Amit","Gal","Ido","Noam","Daniel","Mika","Yarden","Avishag","Ori","Hila","Tomer","Shani","Bar","Ron","Ela","Nadav","Tamar","Yonatan","Carmel"];
const LAST = ["Cohen","Levi","Mizrahi","Peretz","Biton","Dahan","Avraham","Friedman","Katz","Azoulay","Gabay","Shapira","Vaknin","Malka","Ben-David","Naveh","Sharon","Bar-On","Aviv","Tzur"];
const newStudents = [];
let nidx = 0;
while (existingStudents.length + newStudents.length < TARGET_STUDENTS) {
  const id = ++maxUserId;
  const fn = pick(FIRST);
  const ln = pick(LAST);
  newStudents.push({
    id: String(id),
    full_name: `${fn} ${ln}`,
    email: `student${id}@eps.test`,
    password_hash: PASSWORD_HASH,
    role: "student",
    account_status: "active",
    created_at: '"2026-05-24T21:17:43.738Z"',
    updated_at: '"2026-05-24T21:17:43.738Z"',
    profile_image_url: "",
    program_id: pick(progIds),
    current_study_year: pick(["First", "Second", "Third"]),
    current_semester: pick(["A", "B"]),
    must_change_password: "false",
  });
  nidx++;
}
const allStudents = [...existingStudents, ...newStudents];
const studentIds = allStudents.map((s) => s.id);

// ---- enrollments: every active offering's course gets >= MIN_PER_OFFERING ----
const activeOfferings = offerings.filter((o) => o.status === "active");
const offeringCourseIds = [...new Set(activeOfferings.map((o) => o.course_id))];
const enrollSet = new Set(); // "user:course"
const courseEnrolled = new Map(); // course -> [userIds]
function enroll(uid, cid) {
  const k = `${uid}:${cid}`;
  if (enrollSet.has(k)) return false;
  enrollSet.add(k);
  if (!courseEnrolled.has(cid)) courseEnrolled.set(cid, []);
  courseEnrolled.get(cid).push(uid);
  return true;
}
// 1) give each student a "home" set: 1 primary usable course + a few others
const usableList = [...usableCourses];
const studentCourses = new Map(); // uid -> {primary, all:[]}
for (const uid of studentIds) {
  const primary = pick(usableList);
  const extra = shuffle(offeringCourseIds).slice(0, ri(3, 6));
  const all = [...new Set([primary, ...extra])];
  for (const c of all) enroll(uid, c);
  studentCourses.set(uid, { primary, all });
}
// 2) top up each offering course to the floor
for (const cid of offeringCourseIds) {
  const cur = courseEnrolled.get(cid) || [];
  let need = TARGET_PER_COURSE - cur.length;
  if (need <= 0) continue;
  const pool = shuffle(studentIds);
  for (const uid of pool) {
    if (need <= 0) break;
    if (enroll(uid, cid)) {
      studentCourses.get(uid).all.push(cid);
      need--;
    }
  }
}

// ---- activity generation ---------------------------------------------------
const now = new Date("2026-06-12T12:00:00Z");
function dateBack(daysAgo, hour) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour ?? ri(8, 21), ri(0, 59), ri(0, 59), 0);
  return d;
}
const iso = (d) => `"${d.toISOString()}"`;
const dstr = (d) => d.toISOString().slice(0, 10);

// per-student latent ability + weak topics
function abilityFor(uid) {
  return 0.5 + rng() * 0.4; // 0.5..0.9 base correctness
}
function pCorrect(base, topicMod, difficulty) {
  const dAdj = difficulty === "Easy" ? 0.12 : difficulty === "Hard" ? -0.16 : 0;
  return Math.max(0.05, Math.min(0.97, base + topicMod + dAdj));
}

const mockExams = [];
const meq = [];
const practiceSessions = [];
const psq = [];
let examId = 0,
  meqId = 0,
  psId = 0,
  psqId = 0;
// attempts collected per student for analytics: {courseId,topicId,subtopicId,correct,earned,max,rt,lowConf,at}
const attemptsByUser = new Map();
function addAttempt(uid, a) {
  if (!attemptsByUser.has(uid)) attemptsByUser.set(uid, []);
  attemptsByUser.get(uid).push(a);
}
const activeDaysByUser = new Map(); // uid -> Set(dateStr)

function chooseCourses(uid) {
  const sc = studentCourses.get(uid);
  const usable = sc.all.filter((c) => usableCourses.has(c));
  const primary = usableCourses.has(sc.primary) ? sc.primary : usable[0] || pick(usableList);
  return { primary, usable: usable.length ? usable : [primary] };
}

for (const uid of studentIds) {
  const base = abilityFor(uid);
  const { primary, usable } = chooseCourses(uid);
  // per-(course,topic) modifier so some topics are genuinely weak for this student
  const topicMod = new Map();
  const modFor = (cid, tid) => {
    const k = `${cid}:${tid}`;
    if (!topicMod.has(k)) {
      const r = rng();
      // ~30% weak (-0.30..-0.50), ~15% strong (+0.15), rest mild noise
      const m = r < 0.3 ? -(0.30 + rng() * 0.20) : r < 0.45 ? 0.15 : (rng() - 0.5) * 0.1;
      topicMod.set(k, m);
    }
    return topicMod.get(k);
  };

  // schedule activity days (cluster some consecutive for streaks)
  const nExam = ri(EXAMS_PER_STUDENT[0], EXAMS_PER_STUDENT[1]);
  const nPrac = ri(PRACTICE_PER_STUDENT[0], PRACTICE_PER_STUDENT[1]);
  const sessionsTotal = nExam + nPrac;
  // build a run of consecutive days for ~half the students (streak >=3, some >=7)
  const days = [];
  let cursor = ri(1, DAYS_BACK - 10);
  const runLen = rng() < 0.4 ? ri(7, 10) : rng() < 0.7 ? ri(3, 5) : 1;
  for (let i = 0; i < sessionsTotal; i++) {
    if (i < runLen) days.push(cursor - i);
    else days.push(ri(0, DAYS_BACK));
  }
  const daySet = activeDaysByUser.get(uid) || new Set();
  activeDaysByUser.set(uid, daySet);

  // ---- exams ----
  for (let e = 0; e < nExam; e++) {
    const cid = e < Math.ceil(nExam * 0.6) ? primary : pick(usable);
    const pool = courseQs.get(cid) || [];
    const n = Math.min(ri(10, 14), pool.length);
    const qs = shuffle(pool).slice(0, n);
    const submittedAt = dateBack(days[e], null);
    daySet.add(dstr(submittedAt));
    const startedAt = new Date(submittedAt.getTime() - ri(12, 40) * 60000);
    examId++;
    let totEarn = 0,
      totMax = 0;
    qs.forEach((qid, order) => {
      const m = qmeta.get(qid);
      const w = EXAM_W[m.difficulty];
      const p = pCorrect(base, modFor(cid, m.topicId), m.difficulty);
      const correct = rng() < p;
      const order_ids = shuffle(m.options.map((o) => o.id));
      let selIds = [];
      if (correct) selIds = [...m.correctIds];
      else {
        const wrong = m.options.filter((o) => !o.correct).map((o) => o.id);
        selIds = wrong.length ? [pick(wrong)] : [pick(order_ids)];
      }
      const earned = correct ? w : 0;
      totEarn += earned;
      totMax += w;
      const rt = ri(15, 120);
      meqId++;
      meq.push({
        id: meqId,
        exam_id: examId,
        question_id: qid,
        randomized_order: order,
        randomized_option_order: JSON.stringify(order_ids),
        selected_answer_option_id: selIds[0] ?? "",
        is_correct: correct,
        response_time_seconds: rt,
        selected_option_ids: JSON.stringify(selIds),
        max_score: w,
        earned_score: earned,
      });
      addAttempt(uid, {
        courseId: cid,
        topicId: m.topicId,
        subtopicId: m.subtopicId,
        correct,
        earned,
        max: w,
        rt,
        lowConf: false,
        at: submittedAt,
      });
    });
    const score = totMax > 0 ? Math.round((totEarn / totMax) * 10000) / 100 : 0;
    mockExams.push({
      id: examId,
      user_id: uid,
      course_id: cid,
      generated_by_rule: "balanced",
      exam_mode: "mock",
      total_questions: qs.length,
      duration_minutes: 30,
      started_at: iso(startedAt),
      submitted_at: iso(submittedAt),
      score,
      status: "submitted",
      created_at: iso(startedAt),
      updated_at: iso(submittedAt),
    });
  }

  // ---- practice ----
  const sessTypes = ["topic", "mixed", "weak_area", "mistakes"];
  for (let pr = 0; pr < nPrac; pr++) {
    const cid = pr === 0 ? primary : pick(usable);
    const pool = courseQs.get(cid) || [];
    const n = Math.min(ri(6, 10), pool.length);
    const qs = shuffle(pool).slice(0, n);
    const completedAt = dateBack(days[nExam + pr], null);
    daySet.add(dstr(completedAt));
    const startedAt = new Date(completedAt.getTime() - ri(8, 25) * 60000);
    psId++;
    const firstM = qmeta.get(qs[0]);
    const sType = pick(sessTypes);
    let answered = 0,
      correctC = 0,
      earnedT = 0,
      maxT = 0;
    qs.forEach((qid, order) => {
      const m = qmeta.get(qid);
      const w = PRACTICE_W[m.difficulty];
      const p = pCorrect(base, modFor(cid, m.topicId), m.difficulty);
      const correct = rng() < p;
      const order_ids = shuffle(m.options.map((o) => o.id));
      let selIds = [];
      if (correct) selIds = [...m.correctIds];
      else {
        const wrong = m.options.filter((o) => !o.correct).map((o) => o.id);
        selIds = wrong.length ? [pick(wrong)] : [pick(order_ids)];
      }
      // confidence correlated with correctness
      const conf = correct
        ? rng() < 0.7
          ? "high"
          : "medium"
        : rng() < 0.55
          ? "low"
          : "medium";
      const earned = correct ? w : 0;
      const rt = ri(10, 90);
      answered++;
      if (correct) correctC++;
      earnedT += earned;
      maxT += w;
      psqId++;
      psq.push({
        id: psqId,
        session_id: psId,
        question_id: qid,
        question_order: order,
        randomized_option_order: JSON.stringify(order_ids),
        selected_answer_option_id: selIds[0] ?? "",
        selected_option_ids: JSON.stringify(selIds),
        is_correct: correct,
        confidence_level: conf,
        response_time_seconds: rt,
        max_score: w,
        earned_score: earned,
        status: "answered",
        answered_at: iso(completedAt),
        created_at: iso(startedAt),
        updated_at: iso(completedAt),
      });
      addAttempt(uid, {
        courseId: cid,
        topicId: m.topicId,
        subtopicId: m.subtopicId,
        correct,
        earned,
        max: w,
        rt,
        lowConf: conf === "low",
        at: completedAt,
      });
    });
    practiceSessions.push({
      id: psId,
      user_id: uid,
      course_id: cid,
      topic_id: firstM ? firstM.topicId : "",
      subtopic_id: "",
      session_type: sType,
      status: "completed",
      total_questions: qs.length,
      answered_count: answered,
      correct_count: correctC,
      earned_score: earnedT,
      total_max_score: maxT,
      started_at: iso(startedAt),
      completed_at: iso(completedAt),
      created_at: iso(startedAt),
      updated_at: iso(completedAt),
    });
  }
}

// ---- derived analytics (engine-exact) --------------------------------------
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function levelForScore(s) {
  if (s >= 70) return "weak";
  if (s >= 40) return "needs_practice";
  return "strong";
}
const perfRows = [];
const recRows = [];
const streakRows = [];
const milestoneRows = [];
const notifRows = [];
let perfId = 0,
  recId = 0,
  streakId = 0,
  msId = 0,
  notifId = 0;

for (const uid of studentIds) {
  const attempts = attemptsByUser.get(uid) || [];
  // group by course:topic:subtopic
  const groups = new Map();
  for (const a of attempts) {
    if (a.topicId == null) continue;
    const key = `${a.courseId}:${a.topicId}:${a.subtopicId ?? "null"}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        courseId: a.courseId,
        topicId: a.topicId,
        subtopicId: a.subtopicId,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        earned: 0,
        possible: 0,
        rts: [],
        lowConf: 0,
        lastAt: null,
      };
      groups.set(key, g);
    }
    g.attempts++;
    if (a.correct) g.correct++;
    else g.incorrect++;
    g.earned += a.earned;
    g.possible += a.max;
    if (a.rt != null) g.rts.push(a.rt);
    if (a.lowConf) g.lowConf++;
    if (!g.lastAt || a.at > g.lastAt) g.lastAt = a.at;
  }

  const topicName = (tid) => (topicById.get(tid) || {}).topic_name || "this topic";
  for (const g of groups.values()) {
    const incorrectRate = g.attempts ? g.incorrect / g.attempts : 0;
    const repeated = Math.max(0, g.incorrect - 1);
    const repeatedFactor = g.attempts ? Math.min(1, repeated / g.attempts) : 0;
    const lowConfFactor = g.attempts ? g.lowConf / g.attempts : 0;
    const weaknessScore = round2(
      clamp(incorrectRate * 60 + repeatedFactor * 20 + lowConfFactor * 10, 0, 100),
    );
    let level = levelForScore(weaknessScore);
    if (g.attempts < MIN_ATTEMPTS && level === "weak") level = "needs_practice";
    const accuracy = g.attempts ? round2((g.correct / g.attempts) * 100) : 0;
    const avgRt = g.rts.length
      ? round2(g.rts.reduce((s, t) => s + t, 0) / g.rts.length)
      : "";
    perfId++;
    perfRows.push({
      id: perfId,
      user_id: uid,
      course_id: g.courseId,
      topic_id: g.topicId,
      subtopic_id: g.subtopicId ?? "",
      attempts_count: g.attempts,
      correct_count: g.correct,
      incorrect_count: g.incorrect,
      total_earned_score: round2(g.earned),
      total_possible_score: round2(g.possible),
      accuracy_rate: accuracy,
      average_response_time: avgRt,
      low_confidence_count: g.lowConf,
      repeated_mistake_count: repeated,
      weakness_score: weaknessScore,
      weakness_level: level,
      last_activity_at: g.lastAt ? iso(g.lastAt) : "",
      created_at: g.lastAt ? iso(g.lastAt) : iso(now),
      updated_at: g.lastAt ? iso(g.lastAt) : iso(now),
    });

    // recommendations (engine logic): eligible = attempts >= MIN_ATTEMPTS
    if (g.attempts >= MIN_ATTEMPTS) {
      const label =
        (g.subtopicId != null ? topicName(g.subtopicId) : null) ||
        topicName(g.topicId);
      if (level === "weak" || level === "needs_practice") {
        const type = g.subtopicId != null ? "review_subtopic" : "practice_topic";
        const priority = level === "weak" ? "high" : "medium";
        const text =
          level === "weak"
            ? `Practice ${label} because your accuracy is ${Math.round(accuracy)}%.`
            : `Review ${label} because this topic needs more practice (accuracy ${Math.round(accuracy)}%).`;
        recId++;
        recRows.push({
          id: recId,
          user_id: uid,
          course_id: g.courseId,
          topic_id: g.topicId,
          subtopic_id: g.subtopicId ?? "",
          recommendation_type: type,
          recommendation_text: text,
          priority,
          status: "active",
          source: "performance_summary",
          created_at: g.lastAt ? iso(g.lastAt) : iso(now),
          updated_at: g.lastAt ? iso(g.lastAt) : iso(now),
        });
        if (level === "weak") {
          notifId++;
          notifRows.push({
            id: notifId,
            user_id: uid,
            type: "weak_area_alert",
            title: "Weak area detected",
            message: `Your accuracy in ${label} is ${Math.round(accuracy)}%. Consider focused practice.`,
            related_entity_type: "topic",
            related_entity_id: g.topicId,
            status: "unread",
            created_at: g.lastAt ? iso(g.lastAt) : iso(now),
            read_at: "",
            action_url: "/weak-areas",
          });
        }
      }
      if (repeated > 0) {
        const label2 =
          (g.subtopicId != null ? topicName(g.subtopicId) : null) ||
          topicName(g.topicId);
        recId++;
        recRows.push({
          id: recId,
          user_id: uid,
          course_id: g.courseId,
          topic_id: g.topicId,
          subtopic_id: g.subtopicId ?? "",
          recommendation_type: "retry_mistakes",
          recommendation_text: `Retry previous mistakes in ${label2} to reduce repeated errors.`,
          priority: level === "weak" ? "high" : "medium",
          status: "active",
          source: "performance_summary",
          created_at: g.lastAt ? iso(g.lastAt) : iso(now),
          updated_at: g.lastAt ? iso(g.lastAt) : iso(now),
        });
      }
    }
  }

  // ---- streaks (engine consecutive-day logic) ----
  const dayNums = [...activeDaysByUser.get(uid)]
    .map((s) => Math.floor(new Date(s + "T00:00:00Z").getTime() / 86400000))
    .sort((a, b) => a - b);
  let cur = 0,
    longest = 0;
  for (let i = 0; i < dayNums.length; i++) {
    if (i === 0 || dayNums[i] - dayNums[i - 1] === 1) cur++;
    else if (dayNums[i] - dayNums[i - 1] === 0) {
      /* same day */
    } else cur = 1;
    longest = Math.max(longest, cur);
  }
  const lastDay = dayNums.length
    ? new Date(dayNums[dayNums.length - 1] * 86400000).toISOString().slice(0, 10)
    : null;
  streakId++;
  streakRows.push({
    id: streakId,
    user_id: uid,
    current_streak: cur,
    longest_streak: longest,
    last_activity_date: lastDay ?? "",
    created_at: iso(now),
    updated_at: iso(now),
  });

  // ---- milestones (engine thresholds) ----
  const myExams = mockExams.filter((e) => e.user_id === uid);
  const myPractice = practiceSessions.filter((s) => s.user_id === uid);
  const earned = [];
  if (myPractice.length >= 1) earned.push(["practice", "first_practice_completed"]);
  if (myPractice.length >= 5) earned.push(["practice", "five_practice_sessions"]);
  if (myPractice.length >= 10) earned.push(["practice", "ten_practice_sessions"]);
  if (myExams.length >= 1) earned.push(["exam", "first_mock_exam_completed"]);
  if (myExams.some((e) => Number(e.score) >= 80)) earned.push(["exam", "first_exam_above_80"]);
  if (longest >= 3) earned.push(["streak", "three_day_streak"]);
  if (longest >= 7) earned.push(["streak", "seven_day_streak"]);
  for (const [mtype, key] of earned) {
    msId++;
    const achievedAt = lastDay ? `"${lastDay}T18:00:00.000Z"` : iso(now);
    milestoneRows.push({
      id: msId,
      user_id: uid,
      milestone_type: mtype,
      milestone_key: key,
      achieved_at: achievedAt,
      notification_id: "",
      created_at: achievedAt,
    });
    notifId++;
    notifRows.push({
      id: notifId,
      user_id: uid,
      type: mtype === "streak" ? "streak_update" : "milestone",
      title: "Milestone achieved",
      message: `You reached the "${key.replace(/_/g, " ")}" milestone.`,
      related_entity_type: "milestone",
      related_entity_id: "",
      status: "unread",
      created_at: achievedAt,
      read_at: "",
      action_url: "/engagement",
    });
  }
}

// ---- write outputs ---------------------------------------------------------
// users.csv (existing + new) — preserve original header order
const userHeader = Object.keys(users[0]);
writeCsv(path.join(DATA, "users.csv"), userHeader, [...users, ...newStudents]);

const enrollRows = [];
let enId = 0;
for (const [cid, uids] of courseEnrolled)
  for (const uid of uids)
    enrollRows.push({ id: ++enId, user_id: uid, course_id: cid, enrollment_status: "active" });
writeCsv(path.join(DATA, "enrollments.csv"), ["id", "user_id", "course_id", "enrollment_status"], enrollRows);

writeCsv(path.join(DATA, "mock_exams.csv"),
  ["id","user_id","course_id","generated_by_rule","exam_mode","total_questions","duration_minutes","started_at","submitted_at","score","status","created_at","updated_at"], mockExams);
writeCsv(path.join(DATA, "mock_exam_questions.csv"),
  ["id","exam_id","question_id","randomized_order","randomized_option_order","selected_answer_option_id","is_correct","response_time_seconds","selected_option_ids","max_score","earned_score"], meq);
writeCsv(path.join(DATA, "practice_sessions.csv"),
  ["id","user_id","course_id","topic_id","subtopic_id","session_type","status","total_questions","answered_count","correct_count","earned_score","total_max_score","started_at","completed_at","created_at","updated_at"], practiceSessions);
writeCsv(path.join(DATA, "practice_session_questions.csv"),
  ["id","session_id","question_id","question_order","randomized_option_order","selected_answer_option_id","selected_option_ids","is_correct","confidence_level","response_time_seconds","max_score","earned_score","status","answered_at","created_at","updated_at"], psq);
writeCsv(path.join(DATA, "performance_summary.csv"),
  ["id","user_id","course_id","topic_id","subtopic_id","attempts_count","correct_count","incorrect_count","total_earned_score","total_possible_score","accuracy_rate","average_response_time","low_confidence_count","repeated_mistake_count","weakness_score","weakness_level","last_activity_at","created_at","updated_at"], perfRows);
writeCsv(path.join(DATA, "recommendations.csv"),
  ["id","user_id","course_id","topic_id","subtopic_id","recommendation_type","recommendation_text","priority","status","source","created_at","updated_at"], recRows);
writeCsv(path.join(DATA, "learning_streaks.csv"),
  ["id","user_id","current_streak","longest_streak","last_activity_date","created_at","updated_at"], streakRows);
writeCsv(path.join(DATA, "student_milestones.csv"),
  ["id","user_id","milestone_type","milestone_key","achieved_at","notification_id","created_at"], milestoneRows);
writeCsv(path.join(DATA, "notifications.csv"),
  ["id","user_id","type","title","message","related_entity_type","related_entity_id","status","created_at","read_at","action_url"], notifRows);

console.log(JSON.stringify({
  students_total: allStudents.length,
  students_added: newStudents.length,
  enrollments: enrollRows.length,
  mock_exams: mockExams.length,
  mock_exam_questions: meq.length,
  practice_sessions: practiceSessions.length,
  practice_session_questions: psq.length,
  performance_summary: perfRows.length,
  recommendations: recRows.length,
  learning_streaks: streakRows.length,
  student_milestones: milestoneRows.length,
  notifications: notifRows.length,
}, null, 2));
