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
} from "@workspace/db";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && src[i + 1] === "\n") i++;
        cur.push(field);
        field = "";
        rows.push(cur);
        cur = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Drop fully blank trailing rows.
  while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();
  // Some CSVs may have a leading blank line before the header — skip blanks.
  let headerIdx = 0;
  while (
    headerIdx < rows.length &&
    rows[headerIdx].every((v) => v.trim() === "")
  ) {
    headerIdx++;
  }
  const header = rows[headerIdx];
  return rows.slice(headerIdx + 1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

function readCsv(name: string): Record<string, string>[] {
  return parseCsv(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

async function insertInChunks<T>(
  table: any,
  values: T[],
  paramsPerRow: number,
): Promise<void> {
  if (values.length === 0) return;
  const maxRows = Math.max(1, Math.floor(60000 / Math.max(1, paramsPerRow)));
  for (let i = 0; i < values.length; i += maxRows) {
    await db.insert(table).values(values.slice(i, i + maxRows));
  }
}

// Course-name translations (Hebrew → English) keyed by course_code. Applied
// when seeding `courses` so the UI stays English even when the source CSV
// uses Hebrew labels.
const COURSE_NAME_EN: Record<string, string> = {
  "SE-DIS1": "Logic and Discrete Topics I",
  "SE-ARCH1": "Computer Architecture I",
  "SE-DIS2": "Logic and Discrete Topics II",
  "SE-ARCH2": "Computer Architecture II",
  SE101: "Foundations of Software Engineering",
  "SE-AUTO": "Automata and Formal Languages",
  "SE-PL": "Principles of Programming Languages",
  "SE-NET1": "Introduction to Computer Networks",
  ALG1: "Algorithms I",
  ALG2: "Algorithms II",
  "SE-SAFE": "Software Safety",
  "SE-ADVOOP": "Advanced Object-Oriented Programming",
  "SE-COMPX": "Computability and Complexity",
  "SE-PM": "Software Project Management",
  "SE-FINAL": "Final Project",
  "SE-SEMINAR": "Seminar",
  "0200091": "Advanced English B",
  "GEN-GEN": "General Course",
  "CS-LOGIC": "Logic and Set Theory",
  "CS-ALG2": "Algebra 2",
  "CS-DISCRETE": "Discrete Mathematics",
  "CS-LINUX": "Introduction to Linux Workshop",
  "CS-SYSPROG": "Introduction to Systems Programming",
  "CS-ARCHASM": "Computer Architecture and Assembly",
  "CS-ADVALG": "Advanced Algorithms",
  "CS-SEMINAR-PAR": "Advanced Seminar in Parallel Computing",
  "CS-SEMINAR-DL": "Advanced Seminar in Deep Learning",
  "CS-SEMINAR-CYBER": "Advanced Seminar in Cybersecurity",
  "1003001": "Architectural Design",
  "1000881": "Surveying 1",
  "1044441": "Computer Applications in Civil Engineering",
  "0200011": "Advanced English 2",
  "1000591": "Introduction to Engineering Geology",
  "1000571": "Strength of Materials 2",
  "1002660": "Building Materials 1",
  "1000951": "Surveying 2",
  "1007101": "Fluid Mechanics 1",
  "1000171": "Engineering Economics for Construction",
  "1001461": "Introduction to Stability",
  "1000651": "Building Materials 2",
  "1001446": "Engineering Graphics 2",
  "1002681": "Concrete Structures 2",
  "1002741": "Structural Statics 2",
  "1001571": "Steel Structures 1",
  "1001070": "Soil Mechanics 2",
  "1007041": "Construction Methods",
  "1001060": "Foundation Design",
  "1002321": "Principles of Structural Design",
  "1002941": "Structural Dynamics",
  "1002131": "The Engineer's Build",
  "1000261": "Earthquake-Resistant Structural Design",
  "1003111": "Introduction to Finite Elements",
  "1001050": "Final Project Stage A",
  "1001221": "Prestressed Concrete",
  "1001048": "Final Project Workshop A",
  "5001751": "Systems Analysis",
  "1002020": "Final Project Stage B",
  "1090309": "Foundations of Transportation Engineering",
  "1001049": "Final Project Workshop B",
  "6060190": "Materials Science 1",
  "0400051": "Introduction to Physics 1",
  "0400271": "Introduction to Rigid Body Mechanics",
  "6060192": "Materials Science 2",
  "6000426": "Computer Graphics",
  "0400011": "Introduction to Physics 2",
  "0400201": "Physics 2A",
  "6000852": "Introduction to Engineering Design 1",
  "6050128": "Foundations of Creative Design",
  "6090022": "Applied Mathematics for Engineering",
  "6000561": "Theory of Machines",
  "6050131": "Introduction to Linear Systems",
  "6000581": "Manufacturing Technologies",
  "6090003": "Programming with MATLAB",
  "6000541": "Introduction to Electrical and Electronics Engineering",
  "6000882": "Introduction to Engineering Design 2",
  "6090139": "History and Philosophy of Design",
  "6090001": "Thermodynamics 2",
  "6000781": "Heat Transfer",
  "6000621": "Machine Design 1",
  "6000603": "Electronics",
  "6001151": "Microcomputers",
  "6001032": "Product Design and Development 1",
  "6010062": "Design Project",
  "6001061": "Machine Design 2",
  "6050125": "Computerized Manufacturing Systems",
  "6020010": "Fluid Mechanics 2",
  "6090005": "Linear Control",
  "6000911": "Introduction to Microcomputers",
  "6060210": "Embedded Systems",
  "3000181": "Analytical Chemistry 1",
  "3000696": "Information Retrieval and Presentation",
  "3000701": "General Chemistry 2",
  "3000231": "Analytical Chemistry 2",
  "3000761": "Introduction to Chemical Engineering 2",
  "3001888": "MATLAB Programming for Chemical Engineering",
  "3000791": "Introduction to Chemical Engineering 3",
  "3000211": "Organic Chemistry 1",
  "3000821": "Introduction to Cell Biology",
  "3000041": "Introduction to Biotechnology",
  "3000361": "Organic Chemistry 2",
  "3000851": "Biochemistry",
  "3000301": "Principles of Chemical Engineering 2",
  "3000331": "Physical Chemistry",
  "3000971": "Polymers and Biopolymers",
  "3000421": "Principles of Chemical Engineering 3",
  "3000091": "Safety in Chemical and Biotech Industry",
  "3000521": "Design and Analysis of Experiments",
  "3000481": "Plant Design 1",
  "3001151": "Plant Design 2",
  "3010151": "Introduction to Environmental Life Characterization",
  "3020041": "Microbiology",
  "3020101": "Foundations of Genetics",
  "3020131": "Molecular Biology and Genetic Engineering",
  "6500000": "Computer Applications",
  "5001111": "Statistical Inference",
  "5000761": "Foundations of Accounting",
  "5000237": "Introduction to Databases",
  "5000421": "Microeconomics",
  "5000811": "Managerial Economics",
  "5000701": "Organizational Behavior",
  "5000841": "Foundations of Finance",
  "5001001": "Human Resources Management",
  "5000481": "Applied Statistics",
  "5000891": "Marketing Management",
  "5010271": "Operations Research 1",
  "5000021": "Production Planning and Control 1",
  "5000571": "Design of Experiments",
  "5000971": "Total Quality Management",
  "5011042": "Foundations of Materials Engineering",
  "5010102": "Statistical Quality Control",
  "5000751": "Engineering Reliability",
  "5001052": "Human Factors Engineering",
  "5020422": "Advanced Programming",
  "5000491": "File Organization and Processing",
  "5090001": "Project Feasibility Analysis",
  "5001042": "Project Preparation",
  "5050669": "Engineering Design Management",
  "5010321": "Operations Research 2",
  "5010211": "Maintenance Management",
  "5020361": "Databases",
  "5020462": "Foundations of Data Structures",
  "5000521": "Information Systems Analysis and Design 1",
  "0500002": "Business Entrepreneurship",
  "5010241": "Decision Making",
  "5060666": "Game Theory",
  "5000542": "Simulation Methods",
  "5000041": "Production Planning and Control 2",
  "5010132": "Machine Elements",
  "5050114": "Computer-Integrated Manufacturing (CIM)",
  "5010331": "Safety Engineering",
  "5010163": "Material Handling and Layout Systems",
  "5000072": "Information Systems in Industry",
  "5020231": "Human-Computer Interaction",
  "5000522": "Information Systems Analysis and Design 2",
  "5020271": "Information Retrieval and Filtering",
  "5054369": "Business Intelligence",
  "5090002": "Software Project Management",
  "5090003": "Industrial Project Management",
  "5000512": "Robotics and Automation",
  "5020161": "Data Mining",
  "5020432": "Computer Networks",
  "1001041": "Introduction to Computers in Construction Management",
  "5090006": "Project Management Software",
  "EE-SWTOOLS": "Software Tools",
  "EE-MATHA": "Engineering Mathematics A",
  EE203: "Introduction to Electrical Engineering 2",
  "EE-VECTOR": "Vector Analysis",
  "EE-SEMI": "Semiconductor Devices",
  "EE-COMPLEX": "Complex Functions",
  "EE-ELECIRC": "Electronic Circuits",
  "EE-RANDSIG": "Introduction to Random Signals",
  "EE-WAVES": "Waves and Transmission Lines",
  "EE-ADVEC": "Advanced Electronic Circuits",
  "EE-DIGEC": "Digital Electronic Circuits",
  "EE-ENERGY": "Energy Conversion",
  "EE-POWER1": "Power Systems 1",
  "EE-IND-ELEC": "Industrial Electronics",
  "EE-MICROWAVE": "Introduction to Microwaves and Antennas",
  "EE-POWER2": "Power Systems 2",
  "EE-HVLV": "High and Low Voltage Technologies",
  "EE-PROJ-A": "Project",
  "EE-DRIVES": "Electric Drives",
  "EE-SAFETYLAW": "Electrical Safety and Regulations",
};

// Tiny deterministic PRNG so seed runs are reproducible.
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

const nullable = (v: string) => (v === "" ? null : v);
const intOrNull = (v: string) => (v === "" ? null : Number(v));
const floatOrNull = (v: string) => (v === "" ? null : Number(v));
const boolVal = (v: string) => v.toLowerCase() === "true" || v === "1";

async function main() {
  console.log("Clearing existing data...");
  await db.execute(sql`TRUNCATE TABLE
    notifications, messages, mock_exam_questions, mock_exams, answer_options,
    questions, topics, enrollments, course_offerings, lecturer_programs,
    courses, users, programs RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash("123456", 10);

  // ---- programs (must be inserted before users so users.program_id can reference) ----
  const programRows = readCsv("programs.csv");
  console.log(`Seeding ${programRows.length} programs...`);
  await db.insert(programsTable).values(
    programRows.map((p) => ({
      id: Number(p.id),
      name: p.name,
      code: p.code,
      status: p.status || "active",
    })),
  );
  const seProgramId = Number(
    programRows.find((p) => p.code === "SE")?.id ?? 1,
  );

  // ---- users ----
  // password_hash, account_status, and program_id all come straight from the
  // CSV (the hashes are already bcrypt-hashed for "123456"). Fall back to a
  // freshly hashed default password if a row ever omits it.
  const userRows = readCsv("users.csv");
  console.log(`Seeding ${userRows.length} users...`);
  await insertInChunks(
    usersTable,
    userRows.map((u) => ({
      id: Number(u.id),
      fullName: u.full_name,
      email: u.email,
      passwordHash: u.password_hash || passwordHash,
      role: u.role,
      accountStatus: u.account_status || "active",
      profileImageUrl: nullable(u.profile_image_url ?? ""),
      programId: intOrNull(u.program_id ?? ""),
      currentStudyYear: nullable(u.current_study_year ?? ""),
      currentSemester: nullable(u.current_semester ?? ""),
      mustChangePassword: boolVal(u.must_change_password ?? ""),
    })),
    11,
  );

  // ---- courses ----
  const courseRows = readCsv("courses.csv");
  console.log(`Seeding ${courseRows.length} courses...`);
  await db.insert(coursesTable).values(
    courseRows.map((c) => ({
      id: Number(c.id),
      courseCode: c.course_code,
      courseName: COURSE_NAME_EN[c.course_code] ?? c.course_name,
      semester: nullable(c.semester),
      academicYear: nullable(c.academic_year),
      status: c.status || "active",
    })),
  );
  const validCourseIds = new Set(courseRows.map((c) => Number(c.id)));
  const validUserIds = new Set(userRows.map((u) => Number(u.id)));

  // ---- enrollments ----
  const enrollmentRows = readCsv("enrollments.csv");
  const enrollmentRowsValid = enrollmentRows.filter(
    (e) =>
      validUserIds.has(Number(e.user_id)) &&
      validCourseIds.has(Number(e.course_id)),
  );
  const enrollmentSkipped = enrollmentRows.length - enrollmentRowsValid.length;
  if (enrollmentSkipped > 0)
    console.warn(`Skipping ${enrollmentSkipped} enrollment rows with missing FK.`);
  console.log(`Seeding ${enrollmentRowsValid.length} enrollments...`);
  await insertInChunks(
    enrollmentsTable,
    enrollmentRowsValid.map((e) => ({
      id: Number(e.id),
      userId: Number(e.user_id),
      courseId: Number(e.course_id),
      enrollmentStatus: e.enrollment_status || "active",
    })),
    4,
  );

  // ---- topics ----
  const topicRows = readCsv("topics.csv");
  const topicRowsValid = topicRows.filter((t) =>
    validCourseIds.has(Number(t.course_id)),
  );
  const validTopicIds = new Set(topicRowsValid.map((t) => Number(t.id)));
  // Null out parent_topic_id pointers that no longer resolve to a kept topic.
  for (const t of topicRowsValid) {
    const pid = intOrNull(t.parent_topic_id);
    if (pid !== null && !validTopicIds.has(pid)) t.parent_topic_id = "";
  }
  const topicsSkipped = topicRows.length - topicRowsValid.length;
  if (topicsSkipped > 0)
    console.warn(`Skipping ${topicsSkipped} topic rows with missing course FK.`);
  console.log(`Seeding ${topicRowsValid.length} topics...`);
  await insertInChunks(
    topicsTable,
    topicRowsValid.map((t) => ({
      id: Number(t.id),
      courseId: Number(t.course_id),
      topicName: t.topic_name,
      parentTopicId: intOrNull(t.parent_topic_id),
      weight: floatOrNull(t.weight),
      status: t.status || "active",
    })),
    6,
  );

  // ---- questions ----
  // Pre-read course_offerings so we can attribute each question to a
  // lecturer who actually teaches that course. The Question Bank page
  // filters lecturer-visible questions by `createdBy = lecturerId`, so
  // without this every lecturer sees 0 questions.
  const offeringPreview = readCsv("course_offerings.csv");
  const lecturerByCourse = new Map<number, number>();
  for (const o of offeringPreview) {
    const cid = Number(o.course_id);
    const lid = Number(o.lecturer_id);
    if (!validCourseIds.has(cid) || !validUserIds.has(lid)) continue;
    if (!lecturerByCourse.has(cid)) lecturerByCourse.set(cid, lid);
  }

  const questionRows = readCsv("questions.csv");
  const questionRowsValid = questionRows.filter((q) => {
    if (!validCourseIds.has(Number(q.course_id))) return false;
    const tid = intOrNull(q.topic_id);
    if (tid !== null && !validTopicIds.has(tid)) return false;
    const sid = intOrNull(q.subtopic_id);
    if (sid !== null && !validTopicIds.has(sid)) return false;
    return true;
  });
  const validQuestionIds = new Set(questionRowsValid.map((q) => Number(q.id)));
  const questionsSkipped = questionRows.length - questionRowsValid.length;
  if (questionsSkipped > 0)
    console.warn(`Skipping ${questionsSkipped} question rows with missing FK.`);

  // Distribute statuses across the question bank for a realistic demo:
  //   100 → pending (waiting for approval)
  //   100 → draft
  //    72 → archived
  //  rest → approved
  // Order is a deterministic shuffle of question ids so re-seeds are stable.
  const rng = mulberry32(20260524);
  const shuffleIdx = questionRowsValid
    .map((_, i) => i)
    .sort((a, b) => rng() - 0.5);
  const statusOverride = new Map<number, "pending" | "draft" | "archived">();
  const PENDING_N = Math.min(100, shuffleIdx.length);
  const DRAFT_N = Math.min(100, Math.max(0, shuffleIdx.length - PENDING_N));
  const ARCHIVED_N = Math.min(
    72,
    Math.max(0, shuffleIdx.length - PENDING_N - DRAFT_N),
  );
  for (let k = 0; k < PENDING_N; k++)
    statusOverride.set(shuffleIdx[k], "pending");
  for (let k = PENDING_N; k < PENDING_N + DRAFT_N; k++)
    statusOverride.set(shuffleIdx[k], "draft");
  for (let k = PENDING_N + DRAFT_N; k < PENDING_N + DRAFT_N + ARCHIVED_N; k++)
    statusOverride.set(shuffleIdx[k], "archived");

  console.log(
    `Seeding ${questionRowsValid.length} questions ` +
      `(${PENDING_N} pending, ${DRAFT_N} draft, ${ARCHIVED_N} archived, ` +
      `${questionRowsValid.length - PENDING_N - DRAFT_N - ARCHIVED_N} approved)...`,
  );
  await insertInChunks(
    questionsTable,
    questionRowsValid.map((q, i) => {
      // Re-attribute every question to its course's lecturer so the
      // Question Bank's lecturer-scoped view is populated. Fall back to
      // the numeric CSV value if no offering exists for the course.
      const courseId = Number(q.course_id);
      const cbRaw = q.created_by;
      const cbNum = cbRaw && /^\d+$/.test(cbRaw) ? Number(cbRaw) : null;
      const fallback =
        cbNum !== null && validUserIds.has(cbNum) ? cbNum : null;
      const createdBy = lecturerByCourse.get(courseId) ?? fallback;
      return {
        id: Number(q.id),
        courseId,
        topicId: intOrNull(q.topic_id),
        subtopicId: intOrNull(q.subtopic_id),
        title: q.title,
        questionText: q.question_text,
        questionType: q.question_type || "single_choice",
        difficultyLevel: q.difficulty_level || "Medium",
        explanationText: nullable(q.explanation_text),
        sourceReference: nullable(q.source_reference),
        status: statusOverride.get(i) ?? (q.status || "approved"),
        createdBy,
      };
    }),
    12,
  );

  // ---- answer options ----
  const optionRows = readCsv("answer_options.csv");
  const optionRowsValid = optionRows.filter((o) =>
    validQuestionIds.has(Number(o.question_id)),
  );
  const optionsSkipped = optionRows.length - optionRowsValid.length;
  if (optionsSkipped > 0)
    console.warn(`Skipping ${optionsSkipped} answer_option rows with missing question FK.`);
  console.log(`Seeding ${optionRowsValid.length} answer options...`);
  await insertInChunks(
    answerOptionsTable,
    optionRowsValid.map((o) => ({
      id: Number(o.id),
      questionId: Number(o.question_id),
      answerText: o.answer_text,
      isCorrect: boolVal(o.is_correct),
      displayOrder: Number(o.display_order),
    })),
    5,
  );

  // ---- course_offerings ----
  // Read directly from CSV — this is now the source of truth for which
  // lecturer teaches which course in which program. Strategy A: questions
  // and topics stay on the parent course; offerings only carry the
  // lecturer ↔ course ↔ program link.
  const offeringRowsRaw = readCsv("course_offerings.csv");
  const validProgramIds = new Set(programRows.map((p) => Number(p.id)));
  const seenOfferingKeys = new Set<string>();
  const offeringRows = offeringRowsRaw.filter((o) => {
    if (
      !validCourseIds.has(Number(o.course_id)) ||
      !validProgramIds.has(Number(o.program_id)) ||
      !validUserIds.has(Number(o.lecturer_id))
    )
      return false;
    const key = `${o.course_id}:${o.program_id}:${o.lecturer_id}`;
    if (seenOfferingKeys.has(key)) return false;
    seenOfferingKeys.add(key);
    return true;
  });
  const offeringsSkipped = offeringRowsRaw.length - offeringRows.length;
  if (offeringsSkipped > 0)
    console.warn(`Skipping ${offeringsSkipped} course_offering rows with missing FK.`);
  console.log(`Seeding ${offeringRows.length} course_offerings...`);
  await insertInChunks(
    courseOfferingsTable,
    offeringRows.map((o) => ({
      id: Number(o.id),
      courseId: Number(o.course_id),
      programId: Number(o.program_id),
      lecturerId: Number(o.lecturer_id),
      studyYear: nullable(o.study_year ?? ""),
      semester: nullable(o.semester),
      academicYear: nullable(o.academic_year),
      status: o.status || "active",
    })),
    8,
  );

  // ---- lecturer_programs ----
  // Derived from the offerings: every (lecturer_id, program_id) pair a
  // lecturer actually teaches in becomes a row. Keeps this link table in
  // sync with the offerings CSV without requiring a separate file.
  const lpPairs = new Map<string, { lecturerId: number; programId: number }>();
  for (const o of offeringRows) {
    const lecturerId = Number(o.lecturer_id);
    const programId = Number(o.program_id);
    const key = `${lecturerId}:${programId}`;
    if (!lpPairs.has(key)) lpPairs.set(key, { lecturerId, programId });
  }
  console.log(`Seeding ${lpPairs.size} lecturer_programs...`);
  await db.insert(lecturerProgramsTable).values([...lpPairs.values()]);

  // Bump serial sequences past the largest explicit id we inserted, so future
  // inserts (registration, lecturer-created questions, etc.) don't collide.
  console.log("Resyncing sequences...");
  for (const table of [
    "users",
    "courses",
    "enrollments",
    "topics",
    "questions",
    "answer_options",
    "programs",
    "lecturer_programs",
    "course_offerings",
  ]) {
    await db.execute(
      sql.raw(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`,
      ),
    );
  }

  // Find the canonical demo accounts so the notifications/messages below
  // attach to the right users even if the CSV order ever changes.
  const studentRow =
    userRows.find((u) => u.email === "student@eps.com") ??
    userRows.find((u) => u.role === "student")!;
  const lecturerRow =
    userRows.find((u) => u.email === "lecturer@eps.com") ??
    userRows.find((u) => u.role === "lecturer")!;
  const adminRow =
    userRows.find((u) => u.email === "admin@eps.com") ??
    userRows.find((u) => u.role === "admin")!;
  const lecturerName = lecturerRow.full_name;
  const cs101 = courseRows.find((c) => c.course_code === "CS101");
  const db201 = courseRows.find((c) => c.course_code === "DB201");

  console.log("Seeding notifications...");
  await db.insert(notificationsTable).values([
    {
      userId: Number(studentRow.id),
      type: "exam_submitted",
      title: "Your CS101 mock exam was submitted",
      message: "Score: 80%. Review your answers from the My Exams page.",
      relatedEntityType: "exam",
      status: "read",
      readAt: new Date(),
    },
    {
      userId: Number(studentRow.id),
      type: "course_update",
      title: "New questions in DB201",
      message: "Your lecturer added 5 new questions to your enrolled course.",
      relatedEntityType: "course",
      relatedEntityId: db201 ? Number(db201.id) : null,
    },
    {
      userId: Number(studentRow.id),
      type: "reminder",
      title: "Practice reminder",
      message: "You haven't taken a mock exam in 7 days.",
    },
    {
      userId: Number(lecturerRow.id),
      type: "question_created",
      title: "Question added to your bank",
      message:
        'Your question "What is normalization?" is now in the DB201 bank.',
      relatedEntityType: "question",
      status: "read",
      readAt: new Date(),
    },
    {
      userId: Number(lecturerRow.id),
      type: "course_update",
      title: "Course question bank updated",
      message:
        "10 questions in DB201 are now approved and available to students.",
      relatedEntityType: "course",
      relatedEntityId: db201 ? Number(db201.id) : null,
    },
    {
      userId: Number(adminRow.id),
      type: "system",
      title: "Weekly system activity",
      message: "Daily active users up 12% this week.",
    },
    {
      userId: Number(adminRow.id),
      type: "account_deleted",
      title: "Account deletion processed",
      message: "1 account deletion request was processed in the last 24h.",
    },
    {
      userId: Number(adminRow.id),
      type: "course_update",
      title: "Course structure changed",
      message: "Topics for CS101 were reorganized by a lecturer.",
      relatedEntityType: "course",
      relatedEntityId: cs101 ? Number(cs101.id) : null,
    },
  ]);

  console.log("Seeding messages...");
  await db.insert(messagesTable).values([
    {
      senderId: Number(lecturerRow.id),
      recipientId: Number(studentRow.id),
      subject: "Practice before your next exam",
      body:
        `Hi ${studentRow.full_name.split(" ")[0]},\n\n` +
        "A reminder to take at least one mock exam before our midterm next week. " +
        `Focus on the indexing and normalization topics.\n\n— ${lecturerName}`,
    },
    {
      senderId: Number(adminRow.id),
      recipientId: Number(studentRow.id),
      subject: "Welcome to EPS",
      body: "Welcome! You're enrolled in CS101 and DB201. Generate a mock exam any time from the New Exam page.",
      status: "read",
      readAt: new Date(),
    },
    {
      senderId: Number(adminRow.id),
      recipientId: Number(lecturerRow.id),
      subject: "Please review your course questions",
      body:
        `Hi ${lecturerName.split(" ").slice(-1)[0]},\n\n` +
        "When you have a moment, please review the pending questions in DB201 and mark them approved or archived.\n\n" +
        `Thanks,\n${adminRow.full_name}`,
    },
    {
      senderId: null,
      recipientId: Number(adminRow.id),
      subject: "System overview report is ready",
      body: "The weekly system overview report has been generated and is ready to review in the admin dashboard.",
    },
  ]);

  console.log(
    `Seeded: users=${userRows.length}, courses=${courseRows.length}, ` +
      `enrollments=${enrollmentRows.length}, topics=${topicRows.length}, ` +
      `questions=${questionRows.length}, answer_options=${optionRows.length}`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
