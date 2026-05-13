import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(), // student | lecturer | admin
    accountStatus: text("account_status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

export const coursesTable = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    courseCode: text("course_code").notNull(),
    courseName: text("course_name").notNull(),
    semester: text("semester"),
    academicYear: text("academic_year"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: uniqueIndex("courses_code_idx").on(t.courseCode),
  }),
);

export const enrollmentsTable = pgTable(
  "enrollments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    enrollmentStatus: text("enrollment_status").notNull().default("active"),
  },
  (t) => ({
    uniq: uniqueIndex("enrollments_user_course_idx").on(t.userId, t.courseId),
  }),
);

export const topicsTable = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    topicName: text("topic_name").notNull(),
    parentTopicId: integer("parent_topic_id").references(
      (): AnyPgColumn => topicsTable.id,
      { onDelete: "set null" },
    ),
    weight: doublePrecision("weight"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    courseIdx: index("topics_course_idx").on(t.courseId),
  }),
);

export const questionsTable = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topicsTable.id, {
      onDelete: "set null",
    }),
    subtopicId: integer("subtopic_id").references(() => topicsTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    questionText: text("question_text").notNull(),
    questionType: text("question_type").notNull().default("single_choice"),
    difficultyLevel: text("difficulty_level").notNull().default("Medium"),
    explanationText: text("explanation_text"),
    sourceReference: text("source_reference"),
    status: text("status").notNull().default("approved"),
    createdBy: integer("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    courseIdx: index("questions_course_idx").on(t.courseId),
    topicIdx: index("questions_topic_idx").on(t.topicId),
    statusIdx: index("questions_status_idx").on(t.status),
  }),
);

export const answerOptionsTable = pgTable(
  "answer_options",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questionsTable.id, { onDelete: "cascade" }),
    answerText: text("answer_text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => ({
    qIdx: index("answer_options_question_idx").on(t.questionId),
  }),
);

export const mockExamsTable = pgTable(
  "mock_exams",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    generatedByRule: text("generated_by_rule"),
    examMode: text("exam_mode").notNull().default("mock"),
    totalQuestions: integer("total_questions").notNull(),
    durationMinutes: integer("duration_minutes"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: doublePrecision("score"),
    status: text("status").notNull().default("generated"), // generated|in_progress|submitted
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("mock_exams_user_idx").on(t.userId),
  }),
);

export const mockExamQuestionsTable = pgTable(
  "mock_exam_questions",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => mockExamsTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questionsTable.id, { onDelete: "cascade" }),
    randomizedOrder: integer("randomized_order").notNull().default(0),
    // JSON-encoded array of answer_option ids in randomized display order
    randomizedOptionOrder: text("randomized_option_order").notNull().default("[]"),
    selectedAnswerOptionId: integer("selected_answer_option_id").references(
      () => answerOptionsTable.id,
      { onDelete: "set null" },
    ),
    isCorrect: boolean("is_correct"),
    responseTimeSeconds: integer("response_time_seconds"),
  },
  (t) => ({
    examIdx: index("mock_exam_questions_exam_idx").on(t.examId),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type Course = typeof coursesTable.$inferSelect;
export type Topic = typeof topicsTable.$inferSelect;
export type Question = typeof questionsTable.$inferSelect;
export type AnswerOption = typeof answerOptionsTable.$inferSelect;
export type Enrollment = typeof enrollmentsTable.$inferSelect;
export type MockExam = typeof mockExamsTable.$inferSelect;
export type MockExamQuestion = typeof mockExamQuestionsTable.$inferSelect;
