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

const nullable = (v: string) => (v === "" ? null : v);
const intOrNull = (v: string) => (v === "" ? null : Number(v));
const floatOrNull = (v: string) => (v === "" ? null : Number(v));
const boolVal = (v: string) => v.toLowerCase() === "true" || v === "1";

async function main() {
  console.log("Clearing existing data...");
  await db.execute(sql`TRUNCATE TABLE
    notifications, messages, mock_exam_questions, mock_exams, answer_options,
    questions, topics, enrollments, courses, users RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash("123456", 10);

  // ---- users ----
  const userRows = readCsv("users.csv");
  console.log(`Seeding ${userRows.length} users...`);
  await db.insert(usersTable).values(
    userRows.map((u) => ({
      id: Number(u.id),
      fullName: u.full_name,
      email: u.email,
      passwordHash,
      role: u.role,
      accountStatus: u.account_status || "active",
      profileImageUrl: nullable(u.profile_image_url ?? ""),
    })),
  );

  // ---- courses ----
  const courseRows = readCsv("courses.csv");
  console.log(`Seeding ${courseRows.length} courses...`);
  await db.insert(coursesTable).values(
    courseRows.map((c) => ({
      id: Number(c.id),
      courseCode: c.course_code,
      courseName: c.course_name,
      semester: nullable(c.semester),
      academicYear: nullable(c.academic_year),
      status: c.status || "active",
    })),
  );

  // ---- enrollments ----
  const enrollmentRows = readCsv("enrollments.csv");
  console.log(`Seeding ${enrollmentRows.length} enrollments...`);
  await db.insert(enrollmentsTable).values(
    enrollmentRows.map((e) => ({
      id: Number(e.id),
      userId: Number(e.user_id),
      courseId: Number(e.course_id),
      enrollmentStatus: e.enrollment_status || "active",
    })),
  );

  // ---- topics ----
  const topicRows = readCsv("topics.csv");
  console.log(`Seeding ${topicRows.length} topics...`);
  await db.insert(topicsTable).values(
    topicRows.map((t) => ({
      id: Number(t.id),
      courseId: Number(t.course_id),
      topicName: t.topic_name,
      parentTopicId: intOrNull(t.parent_topic_id),
      weight: floatOrNull(t.weight),
      status: t.status || "active",
    })),
  );

  // ---- questions ----
  const questionRows = readCsv("questions.csv");
  console.log(`Seeding ${questionRows.length} questions...`);
  await db.insert(questionsTable).values(
    questionRows.map((q) => ({
      id: Number(q.id),
      courseId: Number(q.course_id),
      topicId: intOrNull(q.topic_id),
      subtopicId: intOrNull(q.subtopic_id),
      title: q.title,
      questionText: q.question_text,
      questionType: q.question_type || "single_choice",
      difficultyLevel: q.difficulty_level || "Medium",
      explanationText: nullable(q.explanation_text),
      sourceReference: nullable(q.source_reference),
      status: q.status || "approved",
      createdBy: intOrNull(q.created_by),
    })),
  );

  // ---- answer options ----
  const optionRows = readCsv("answer_options.csv");
  console.log(`Seeding ${optionRows.length} answer options...`);
  await db.insert(answerOptionsTable).values(
    optionRows.map((o) => ({
      id: Number(o.id),
      questionId: Number(o.question_id),
      answerText: o.answer_text,
      isCorrect: boolVal(o.is_correct),
      displayOrder: Number(o.display_order),
    })),
  );

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
  const studentRow = userRows.find((u) => u.email === "student@eps.com")!;
  const lecturerRow = userRows.find((u) => u.email === "lecturer@eps.com")!;
  const adminRow = userRows.find((u) => u.email === "admin@eps.com")!;
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
