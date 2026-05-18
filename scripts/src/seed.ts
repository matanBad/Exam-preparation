import bcrypt from "bcryptjs";
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

async function main() {
  console.log("Clearing existing data...");
  await db.execute(sql`TRUNCATE TABLE
    notifications, messages, mock_exam_questions, mock_exams, answer_options,
    questions, topics, enrollments, courses, users RESTART IDENTITY CASCADE`);

  const hash = await bcrypt.hash("123456", 10);

  console.log("Seeding users...");
  const [student, lecturer, admin] = await db
    .insert(usersTable)
    .values([
      {
        fullName: "Sam Student",
        email: "student@eps.com",
        passwordHash: hash,
        role: "student",
      },
      {
        fullName: "Dr. Lena Lecturer",
        email: "lecturer@eps.com",
        passwordHash: hash,
        role: "lecturer",
      },
      {
        fullName: "Alex Admin",
        email: "admin@eps.com",
        passwordHash: hash,
        role: "admin",
      },
    ])
    .returning();

  console.log("Seeding courses...");
  const [cs101, db201] = await db
    .insert(coursesTable)
    .values([
      {
        courseCode: "CS101",
        courseName: "Introduction to Computer Science",
        semester: "Fall",
        academicYear: "2025-2026",
      },
      {
        courseCode: "DB201",
        courseName: "Database Systems",
        semester: "Spring",
        academicYear: "2025-2026",
      },
    ])
    .returning();

  console.log("Enrolling student and lecturer...");
  await db.insert(enrollmentsTable).values([
    { userId: student.id, courseId: cs101.id },
    { userId: student.id, courseId: db201.id },
    { userId: lecturer.id, courseId: cs101.id },
    { userId: lecturer.id, courseId: db201.id },
  ]);

  console.log("Seeding topics...");
  const cs101Topics = await db
    .insert(topicsTable)
    .values([
      { courseId: cs101.id, topicName: "Variables & Data Types" },
      { courseId: cs101.id, topicName: "Control Flow" },
      { courseId: cs101.id, topicName: "Functions" },
      { courseId: cs101.id, topicName: "Algorithms" },
    ])
    .returning();

  const db201Topics = await db
    .insert(topicsTable)
    .values([
      { courseId: db201.id, topicName: "Relational Model" },
      { courseId: db201.id, topicName: "SQL Basics" },
      { courseId: db201.id, topicName: "Normalization" },
      { courseId: db201.id, topicName: "Indexing & Performance" },
    ])
    .returning();

  type Q = {
    courseId: number;
    topicId: number;
    title: string;
    text: string;
    difficulty: "Easy" | "Medium" | "Hard";
    explanation: string;
    options: { text: string; correct: boolean }[];
  };

  const T = (idx: number, course: "cs" | "db") =>
    course === "cs" ? cs101Topics[idx].id : db201Topics[idx].id;

  const C = (course: "cs" | "db") => (course === "cs" ? cs101.id : db201.id);

  const questions: Q[] = [
    {
      courseId: C("cs"), topicId: T(0, "cs"),
      title: "Primitive vs reference types",
      text: "Which of the following is a primitive type in most languages?",
      difficulty: "Easy",
      explanation: "Integers are primitive value types in nearly all languages.",
      options: [
        { text: "Integer", correct: true },
        { text: "Array", correct: false },
        { text: "Object", correct: false },
        { text: "Map", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(0, "cs"),
      title: "Type of a boolean",
      text: "What value can a boolean variable hold?",
      difficulty: "Easy",
      explanation: "Booleans are limited to true and false.",
      options: [
        { text: "true or false", correct: true },
        { text: "0 or 1 only", correct: false },
        { text: "Any number", correct: false },
        { text: "Any string", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(1, "cs"),
      title: "Loop choice",
      text: "Which loop is best when you know the iteration count in advance?",
      difficulty: "Easy",
      explanation: "for loops are designed for known iteration counts.",
      options: [
        { text: "for", correct: true },
        { text: "while", correct: false },
        { text: "do-while", correct: false },
        { text: "recursion", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(1, "cs"),
      title: "Switch fallthrough",
      text: "What keyword prevents fallthrough in a typical switch statement?",
      difficulty: "Medium",
      explanation: "break exits the switch and prevents the next case running.",
      options: [
        { text: "break", correct: true },
        { text: "continue", correct: false },
        { text: "return", correct: false },
        { text: "stop", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(2, "cs"),
      title: "Pure functions",
      text: "A pure function must:",
      difficulty: "Medium",
      explanation: "Pure functions have no side effects and same output for same input.",
      options: [
        { text: "Have no side effects and be deterministic", correct: true },
        { text: "Always return void", correct: false },
        { text: "Use global state", correct: false },
        { text: "Throw exceptions", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(2, "cs"),
      title: "Recursion base case",
      text: "Why do recursive functions need a base case?",
      difficulty: "Easy",
      explanation: "Without it, recursion never stops and the stack overflows.",
      options: [
        { text: "To stop infinite recursion", correct: true },
        { text: "To improve performance", correct: false },
        { text: "Required by syntax", correct: false },
        { text: "To allocate memory", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(3, "cs"),
      title: "Big-O of binary search",
      text: "What is the worst-case time complexity of binary search on a sorted array?",
      difficulty: "Medium",
      explanation: "Binary search halves the input each step: O(log n).",
      options: [
        { text: "O(log n)", correct: true },
        { text: "O(n)", correct: false },
        { text: "O(n log n)", correct: false },
        { text: "O(1)", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(3, "cs"),
      title: "Sorting stability",
      text: "Which sort is NOT stable in its standard form?",
      difficulty: "Hard",
      explanation: "Quicksort is not stable in its standard partition.",
      options: [
        { text: "Quicksort", correct: true },
        { text: "Merge sort", correct: false },
        { text: "Insertion sort", correct: false },
        { text: "Bubble sort", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(3, "cs"),
      title: "Hash table average lookup",
      text: "What is the expected average-case lookup time in a hash table?",
      difficulty: "Easy",
      explanation: "With a good hash, lookups are O(1) average.",
      options: [
        { text: "O(1)", correct: true },
        { text: "O(log n)", correct: false },
        { text: "O(n)", correct: false },
        { text: "O(n^2)", correct: false },
      ],
    },
    {
      courseId: C("cs"), topicId: T(0, "cs"),
      title: "Constants",
      text: "Which keyword commonly declares a constant in modern languages?",
      difficulty: "Easy",
      explanation: "const is the typical keyword in JS, TS, C++, etc.",
      options: [
        { text: "const", correct: true },
        { text: "var", correct: false },
        { text: "let", correct: false },
        { text: "fixed", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(0, "db"),
      title: "Primary key",
      text: "What does a primary key uniquely identify?",
      difficulty: "Easy",
      explanation: "A primary key uniquely identifies each row in a table.",
      options: [
        { text: "A row in a table", correct: true },
        { text: "A column", correct: false },
        { text: "A schema", correct: false },
        { text: "A query", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(0, "db"),
      title: "Foreign key purpose",
      text: "A foreign key enforces:",
      difficulty: "Easy",
      explanation: "Foreign keys enforce referential integrity between tables.",
      options: [
        { text: "Referential integrity", correct: true },
        { text: "Sort order", correct: false },
        { text: "Encryption", correct: false },
        { text: "Indexing", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(1, "db"),
      title: "SELECT clause role",
      text: "Which SQL clause is used to choose specific columns?",
      difficulty: "Easy",
      explanation: "SELECT chooses the columns to project.",
      options: [
        { text: "SELECT", correct: true },
        { text: "WHERE", correct: false },
        { text: "FROM", correct: false },
        { text: "GROUP BY", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(1, "db"),
      title: "JOIN type",
      text: "Which JOIN returns only rows that match in both tables?",
      difficulty: "Medium",
      explanation: "INNER JOIN returns matching rows from both sides.",
      options: [
        { text: "INNER JOIN", correct: true },
        { text: "LEFT JOIN", correct: false },
        { text: "RIGHT JOIN", correct: false },
        { text: "FULL OUTER JOIN", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(1, "db"),
      title: "Aggregation",
      text: "Which clause is required when using non-aggregated columns alongside aggregates?",
      difficulty: "Medium",
      explanation: "Non-aggregated SELECT columns must appear in GROUP BY.",
      options: [
        { text: "GROUP BY", correct: true },
        { text: "ORDER BY", correct: false },
        { text: "HAVING", correct: false },
        { text: "LIMIT", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(2, "db"),
      title: "1NF",
      text: "First normal form requires that:",
      difficulty: "Medium",
      explanation: "1NF requires atomic, indivisible column values.",
      options: [
        { text: "All column values are atomic", correct: true },
        { text: "Every table has a foreign key", correct: false },
        { text: "All joins are denormalized", correct: false },
        { text: "Indexes exist on every column", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(2, "db"),
      title: "3NF goal",
      text: "Third normal form removes:",
      difficulty: "Hard",
      explanation: "3NF removes transitive dependencies on non-key attributes.",
      options: [
        { text: "Transitive dependencies", correct: true },
        { text: "Foreign keys", correct: false },
        { text: "All joins", correct: false },
        { text: "Indexes", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(3, "db"),
      title: "Index trade-off",
      text: "What is the main downside of adding an index to a table?",
      difficulty: "Medium",
      explanation: "Indexes speed up reads but slow down writes and use space.",
      options: [
        { text: "Slower writes and extra storage", correct: true },
        { text: "Slower reads", correct: false },
        { text: "Loss of data integrity", correct: false },
        { text: "Schema corruption", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(3, "db"),
      title: "B-tree typical use",
      text: "B-tree indexes are most efficient for:",
      difficulty: "Hard",
      explanation: "B-trees excel at range and equality lookups on ordered data.",
      options: [
        { text: "Range and equality lookups", correct: true },
        { text: "Full text search", correct: false },
        { text: "Geospatial queries", correct: false },
        { text: "Vector similarity", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(0, "db"),
      title: "ACID 'I'",
      text: "What does the 'I' in ACID stand for?",
      difficulty: "Easy",
      explanation: "Isolation: concurrent transactions appear sequential.",
      options: [
        { text: "Isolation", correct: true },
        { text: "Independence", correct: false },
        { text: "Indexing", correct: false },
        { text: "Integration", correct: false },
      ],
    },
    {
      courseId: C("db"), topicId: T(1, "db"),
      title: "DELETE without WHERE",
      text: "What happens with DELETE FROM users; (no WHERE)?",
      difficulty: "Easy",
      explanation: "Without WHERE, DELETE removes every row in the table.",
      options: [
        { text: "All rows are removed", correct: true },
        { text: "Syntax error", correct: false },
        { text: "Only the first row is removed", correct: false },
        { text: "The table is dropped", correct: false },
      ],
    },
  ];

  console.log(`Seeding ${questions.length} questions...`);
  for (const q of questions) {
    const [inserted] = await db
      .insert(questionsTable)
      .values({
        courseId: q.courseId,
        topicId: q.topicId,
        title: q.title,
        questionText: q.text,
        questionType: "single_choice",
        difficultyLevel: q.difficulty,
        explanationText: q.explanation,
        status: "approved",
        createdBy: lecturer.id,
      })
      .returning();
    await db.insert(answerOptionsTable).values(
      q.options.map((o, idx) => ({
        questionId: inserted.id,
        answerText: o.text,
        isCorrect: o.correct,
        displayOrder: idx,
      })),
    );
  }

  console.log("Seeding notifications...");
  await db.insert(notificationsTable).values([
    {
      userId: student.id,
      type: "exam_submitted",
      title: "Your CS101 mock exam was submitted",
      message: "Score: 80%. Review your answers from the My Exams page.",
      relatedEntityType: "exam",
      status: "read",
      readAt: new Date(),
    },
    {
      userId: student.id,
      type: "course_update",
      title: "New questions in DB201",
      message: "Your lecturer added 5 new questions to your enrolled course.",
      relatedEntityType: "course",
      relatedEntityId: db201.id,
    },
    {
      userId: student.id,
      type: "reminder",
      title: "Practice reminder",
      message: "You haven't taken a mock exam in 7 days.",
    },
    {
      userId: lecturer.id,
      type: "question_created",
      title: "Question added to your bank",
      message: "Your question \"What is normalization?\" is now in the DB201 bank.",
      relatedEntityType: "question",
      status: "read",
      readAt: new Date(),
    },
    {
      userId: lecturer.id,
      type: "course_update",
      title: "Course question bank updated",
      message: "10 questions in DB201 are now approved and available to students.",
      relatedEntityType: "course",
      relatedEntityId: db201.id,
    },
    {
      userId: admin.id,
      type: "system",
      title: "Weekly system activity",
      message: "Daily active users up 12% this week.",
    },
    {
      userId: admin.id,
      type: "account_deleted",
      title: "Account deletion processed",
      message: "1 account deletion request was processed in the last 24h.",
    },
    {
      userId: admin.id,
      type: "course_update",
      title: "Course structure changed",
      message: "Topics for CS101 were reorganized by a lecturer.",
      relatedEntityType: "course",
      relatedEntityId: cs101.id,
    },
  ]);

  console.log("Seeding messages...");
  await db.insert(messagesTable).values([
    {
      senderId: lecturer.id,
      recipientId: student.id,
      subject: "Practice before your next exam",
      body:
        "Hi Sam,\n\nA reminder to take at least one mock exam before our midterm next week. " +
        "Focus on the indexing and normalization topics.\n\n— Dr. Lena",
    },
    {
      senderId: admin.id,
      recipientId: student.id,
      subject: "Welcome to EPS",
      body:
        "Welcome! You're enrolled in CS101 and DB201. Generate a mock exam any time from the New Exam page.",
      status: "read",
      readAt: new Date(),
    },
    {
      senderId: admin.id,
      recipientId: lecturer.id,
      subject: "Please review your course questions",
      body:
        "Hi Lena,\n\nWhen you have a moment, please review the pending questions in DB201 and mark them approved or archived.\n\nThanks,\nAlex",
    },
    {
      senderId: null,
      recipientId: admin.id,
      subject: "System overview report is ready",
      body:
        "The weekly system overview report has been generated and is ready to review in the admin dashboard.",
    },
  ]);

  console.log(
    `Seeded: users=${[student, lecturer, admin].length}, courses=2, ` +
      `topics=${cs101Topics.length + db201Topics.length}, questions=${questions.length}`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
