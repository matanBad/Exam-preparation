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

export const programsTable = pgTable(
  "programs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: uniqueIndex("programs_code_idx").on(t.code),
  }),
);

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(), // student | lecturer | admin
    accountStatus: text("account_status").notNull().default("active"),
    profileImageUrl: text("profile_image_url"),
    // For students: the single program they study in. Null for admins/lecturers
    // (lecturers use lecturerProgramsTable for their many-to-many program links).
    programId: integer("program_id").references(() => programsTable.id, {
      onDelete: "set null",
    }),
    // Students only: current academic year (First/Second/Third/Fourth) and
    // semester (A/B). Drives the dashboard "current term" course filter.
    currentStudyYear: text("current_study_year"),
    currentSemester: text("current_semester"),
    // Lecturers created by an admin must change the initial password on
    // their first login. Cleared after a successful password change. Not
    // used for students or admins.
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

export const lecturerProgramsTable = pgTable(
  "lecturer_programs",
  {
    id: serial("id").primaryKey(),
    lecturerId: integer("lecturer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    programId: integer("program_id")
      .notNull()
      .references(() => programsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("lecturer_programs_uniq_idx").on(t.lecturerId, t.programId),
  }),
);

export const courseOfferingsTable = pgTable(
  "course_offerings",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    programId: integer("program_id")
      .notNull()
      .references(() => programsTable.id, { onDelete: "cascade" }),
    lecturerId: integer("lecturer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // The academic year level the offering belongs to within its program
    // (First/Second/Third/Fourth). Nullable for legacy rows but populated
    // by the seed CSV. Each offering carries its own context because the
    // same course can be offered in different programs at different years.
    studyYear: text("study_year"),
    semester: text("semester"),
    academicYear: text("academic_year"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    courseIdx: index("course_offerings_course_idx").on(t.courseId),
    programIdx: index("course_offerings_program_idx").on(t.programId),
    lecturerIdx: index("course_offerings_lecturer_idx").on(t.lecturerId),
    uniq: uniqueIndex("course_offerings_uniq_idx").on(
      t.courseId,
      t.programId,
      t.lecturerId,
    ),
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
    // JSON-encoded array of selected answer_option ids (supports multi-select).
    selectedOptionIds: text("selected_option_ids").notNull().default("[]"),
    isCorrect: boolean("is_correct"),
    // Snapshot of the max score for this question at exam generation time, derived
    // from the question's difficulty (Easy=5, Medium=10, Hard=15). Snapshotted so
    // changes to the question after the exam was generated don't affect grading.
    maxScore: doublePrecision("max_score").notNull().default(10),
    // Points earned after grading; null until exam is submitted.
    earnedScore: doublePrecision("earned_score"),
    responseTimeSeconds: integer("response_time_seconds"),
  },
  (t) => ({
    examIdx: index("mock_exam_questions_exam_idx").on(t.examId),
  }),
);

export const accountDeletionRequestsTable = pgTable(
  "account_deletion_requests",
  {
    id: serial("id").primaryKey(),
    formerUserId: integer("former_user_id").notNull(),
    formerEmail: text("former_email").notNull(),
    formerFullName: text("former_full_name").notNull(),
    formerRole: text("former_role").notNull(),
    reason: text("reason").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: integer("related_entity_id"),
    // Optional in-app navigation target (e.g. "/practice"). Nullable and
    // backward-compatible: existing rows have null and the UI falls back to
    // type-based navigation.
    actionUrl: text("action_url"),
    status: text("status").notNull().default("unread"), // unread | read
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
  }),
);

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("unread"), // unread | read
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    recipientIdx: index("messages_recipient_idx").on(t.recipientId),
  }),
);

// --- Sprint 3: Practice Mode / Targeted Learning ---
// A practice session is a self-directed, untimed learning run scoped to a
// course and optionally a topic/subtopic. Unlike mock exams, questions are
// answered one at a time with immediate feedback. We persist enough detail
// (per-question correctness, confidence, response time) to power future
// weak-area / recommendation engines without building them now.
export const practiceSessionsTable = pgTable(
  "practice_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    // Optional narrowing of the question pool. topicId is a top-level topic;
    // subtopicId is a child topic (topics.parentTopicId points at its parent).
    topicId: integer("topic_id").references(() => topicsTable.id, {
      onDelete: "set null",
    }),
    subtopicId: integer("subtopic_id").references(() => topicsTable.id, {
      onDelete: "set null",
    }),
    // How the pool was chosen: topic | subtopic | mixed | mistakes.
    sessionType: text("session_type").notNull().default("topic"),
    // active | completed | abandoned
    status: text("status").notNull().default("active"),
    totalQuestions: integer("total_questions").notNull().default(0),
    // Denormalized running totals so history/summary don't need to recompute.
    answeredCount: integer("answered_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    earnedScore: doublePrecision("earned_score").notNull().default(0),
    totalMaxScore: doublePrecision("total_max_score").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("practice_sessions_user_idx").on(t.userId),
    statusIdx: index("practice_sessions_status_idx").on(t.status),
  }),
);

export const practiceSessionQuestionsTable = pgTable(
  "practice_session_questions",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => practiceSessionsTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questionsTable.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull().default(0),
    // JSON-encoded array of answer_option ids in randomized display order.
    randomizedOptionOrder: text("randomized_option_order")
      .notNull()
      .default("[]"),
    selectedAnswerOptionId: integer("selected_answer_option_id").references(
      () => answerOptionsTable.id,
      { onDelete: "set null" },
    ),
    // JSON-encoded array of selected answer_option ids (supports multi-select).
    selectedOptionIds: text("selected_option_ids").notNull().default("[]"),
    isCorrect: boolean("is_correct"),
    // Self-reported confidence: low | medium | high. Persisted for future
    // weak-area analysis; null until the question is answered.
    confidenceLevel: text("confidence_level"),
    responseTimeSeconds: integer("response_time_seconds"),
    // Practice points are the raw difficulty weight (Easy=1, Medium=2, Hard=3),
    // snapshotted at generation time so later question edits don't change scores.
    maxScore: doublePrecision("max_score").notNull().default(1),
    earnedScore: doublePrecision("earned_score"),
    // not_answered | answered
    status: text("status").notNull().default("not_answered"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionIdx: index("practice_session_questions_session_idx").on(t.sessionId),
    questionIdx: index("practice_session_questions_question_idx").on(
      t.questionId,
    ),
  }),
);

// --- Sprint 3 Module 2: Weak Area Analysis & Recommendations ---
// Summarized, per-student performance aggregated from answered mock-exam and
// practice questions, grouped by course + topic (+ optional subtopic). This is
// a derived/cache table: the recalc service deletes and rebuilds a student's
// rows on each run, so it is always safe to recompute. Drives weak-area
// detection and recommendation generation.
export const performanceSummaryTable = pgTable(
  "performance_summary",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topicsTable.id, { onDelete: "cascade" }),
    // Null when the underlying questions are tagged at the top-level topic only.
    subtopicId: integer("subtopic_id").references(() => topicsTable.id, {
      onDelete: "cascade",
    }),
    attemptsCount: integer("attempts_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    totalEarnedScore: doublePrecision("total_earned_score").notNull().default(0),
    totalPossibleScore: doublePrecision("total_possible_score")
      .notNull()
      .default(0),
    // 0-100.
    accuracyRate: doublePrecision("accuracy_rate").notNull().default(0),
    // Average answered-question response time in seconds; null when no row had a
    // recorded time.
    averageResponseTime: doublePrecision("average_response_time"),
    lowConfidenceCount: integer("low_confidence_count").notNull().default(0),
    repeatedMistakeCount: integer("repeated_mistake_count").notNull().default(0),
    // 0-100 transparent weakness score; higher = weaker.
    weaknessScore: doublePrecision("weakness_score").notNull().default(0),
    // strong | needs_practice | weak
    weaknessLevel: text("weakness_level").notNull().default("strong"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("performance_summary_user_idx").on(t.userId),
    userCourseIdx: index("performance_summary_user_course_idx").on(
      t.userId,
      t.courseId,
    ),
  }),
);

// Personalized recommendations and revision-plan items derived from
// performance_summary. Unlike the summary table this carries user state
// (active/completed/dismissed) so it is upserted, never wholesale rebuilt.
export const recommendationsTable = pgTable(
  "recommendations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topicsTable.id, {
      onDelete: "cascade",
    }),
    subtopicId: integer("subtopic_id").references(() => topicsTable.id, {
      onDelete: "cascade",
    }),
    // practice_topic | retry_mistakes | review_subtopic | revision_plan_item
    recommendationType: text("recommendation_type").notNull(),
    recommendationText: text("recommendation_text").notNull(),
    // high | medium | low
    priority: text("priority").notNull().default("medium"),
    // active | completed | dismissed
    status: text("status").notNull().default("active"),
    // performance_summary | mock_exam | practice
    source: text("source").notNull().default("performance_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("recommendations_user_idx").on(t.userId),
    userStatusIdx: index("recommendations_user_status_idx").on(
      t.userId,
      t.status,
    ),
  }),
);

// --- Sprint 3 Module 4: Notifications & Engagement ---
// One row per student tracking their study streak. A "qualifying activity" is a
// completed practice session or a submitted mock exam. lastActivityDate stores
// the server calendar date (YYYY-MM-DD) of the most recent qualifying activity
// so increments happen at most once per calendar day.
export const learningStreaksTable = pgTable(
  "learning_streaks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    // Calendar date (no time component) of the last qualifying activity.
    lastActivityDate: text("last_activity_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userUniq: uniqueIndex("learning_streaks_user_idx").on(t.userId),
  }),
);

// Achieved milestones per student. The unique (userId, milestoneKey) index is
// the source of truth for milestone de-duplication: a milestone is created at
// most once per user. notificationId links to the milestone notification when
// one was created.
export const studentMilestonesTable = pgTable(
  "student_milestones",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Grouping label: practice | exam | streak | recommendation.
    milestoneType: text("milestone_type").notNull(),
    // Stable key, e.g. first_practice_completed. Unique per user.
    milestoneKey: text("milestone_key").notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notificationId: integer("notification_id").references(
      () => notificationsTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userKeyUniq: uniqueIndex("student_milestones_user_key_idx").on(
      t.userId,
      t.milestoneKey,
    ),
    userIdx: index("student_milestones_user_idx").on(t.userId),
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
export type PracticeSession = typeof practiceSessionsTable.$inferSelect;
export type PracticeSessionQuestion =
  typeof practiceSessionQuestionsTable.$inferSelect;
export type PerformanceSummary = typeof performanceSummaryTable.$inferSelect;
export type Recommendation = typeof recommendationsTable.$inferSelect;
export type LearningStreak = typeof learningStreaksTable.$inferSelect;
export type StudentMilestone = typeof studentMilestonesTable.$inferSelect;
