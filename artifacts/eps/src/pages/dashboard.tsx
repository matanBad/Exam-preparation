import { useAuthUser, type EpsUser } from "@/lib/auth";
import {
  useGetUserExams,
  useListCourses,
  useListQuestions,
  useGetAdminOverview,
  useGetPracticeHistory,
  useGetStudentDashboardAnalytics,
  useGetLecturerDashboardAnalytics,
  useGetEngagementSummary,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import {
  TrendingDown,
  Lightbulb,
  AlertTriangle,
  Users,
  Flame,
  Trophy,
  BookOpen,
  ChevronRight,
} from "lucide-react";

const WEAKNESS_STYLES: Record<string, string> = {
  weak: "bg-destructive/10 text-destructive border-destructive/20",
  needs_practice: "bg-amber-100 text-amber-700 border-amber-200",
  strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const WEAKNESS_LABEL: Record<string, string> = {
  weak: "Weak",
  needs_practice: "Needs practice",
  strong: "Strong",
};

// A topic needs at least this many graded attempts before we trust its
// weakness classification. Below this we show "Not enough data" instead of
// labelling the topic "Weak", so students aren't misled by a tiny sample.
const TOPIC_MIN_ATTEMPTS = 3;

// Student dashboard: account-wide overview only. Per-course analytics
// (average score, readiness, progress trend, most-failed questions) live on the
// course detail page; this view focuses on what to do next across all courses.
function StudentDashboard({ user }: { user: EpsUser }) {
  // Use the enriched courses list so we have offering studyYear/semester,
  // then filter to the student's current term only.
  const { data: allCourses } = useListCourses();
  const { data: exams } = useGetUserExams(user.id);
  const { data: practice } = useGetPracticeHistory();
  const { data: analytics } = useGetStudentDashboardAnalytics();
  const { data: engagement } = useGetEngagementSummary();

  const activePractice = practice?.active ?? [];
  const completedPractice = practice?.completed ?? [];
  const unfinishedExams = (exams ?? []).filter((e) => e.status !== "submitted");
  const completedExams = (exams ?? []).filter((e) => e.status === "submitted");
  const courses = (allCourses ?? []).filter((c) => {
    if (!user.currentStudyYear || !user.currentSemester) return true;
    if (c.studyYear == null || c.offeringSemester == null) return false;
    return (
      c.studyYear === user.currentStudyYear &&
      c.offeringSemester === user.currentSemester
    );
  });

  const streakDays = engagement?.currentStreak ?? 0;
  const longestStreak = engagement?.longestStreak ?? 0;
  const streakValue = engagement
    ? `${streakDays} day${streakDays === 1 ? "" : "s"}`
    : "—";
  const streakSub = !engagement
    ? undefined
    : streakDays > 0
      ? `Longest: ${longestStreak} day${longestStreak === 1 ? "" : "s"}`
      : "Practice today to start";

  const topTopics = (analytics?.topicPerformance ?? []).slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Header: welcome + quick actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome, {user.fullName}
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/practice"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent h-10 px-4 py-2"
            data-testid="btn-start-practice"
          >
            Practice Mode
          </Link>
          <Link
            href="/exams/new"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-green-700 text-white hover:bg-green-800 h-10 px-4 py-2"
            data-testid="btn-start-exam"
          >
            Start Mock Exam
          </Link>
        </div>
      </div>

      {/* Row 1: Weak Areas · Recommendations · Milestones · Learning streak */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          label="Weak Areas"
          value={analytics ? String(analytics.weakAreasCount) : "—"}
          sub="View details →"
          href="/weak-areas"
          testid="metric-weak-areas"
        />
        <MetricTile
          icon={<Lightbulb className="w-3.5 h-3.5" />}
          label="Recommendations"
          value={analytics ? String(analytics.activeRecommendationsCount) : "—"}
          sub="View details →"
          href="/recommendations"
          testid="metric-recommendations"
        />
        <MetricTile
          icon={<Trophy className="w-3.5 h-3.5" />}
          label="Milestones"
          value={engagement ? String(engagement.milestonesCount) : "—"}
          sub="View achievements →"
          href="/engagement"
          testid="metric-milestones"
        />
        <MetricTile
          icon={<Flame className="w-3.5 h-3.5" />}
          label="Learning Streak"
          value={streakValue}
          sub={streakSub}
          href="/engagement"
          testid="metric-streak"
        />
      </div>

      {/* Row 2: Current courses · Topic performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-current-courses">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              Current courses
              {user.currentStudyYear && user.currentSemester && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {user.currentStudyYear} year · Semester {user.currentSemester}
                </span>
              )}
            </CardTitle>
            <Link
              href="/courses"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {courses.length ? (
              <ul className="space-y-2">
                {courses.slice(0, 6).map((c) => (
                  <li key={c.id} className="border-b pb-2 last:border-0">
                    <Link
                      href={`/courses/${c.id}`}
                      className="text-sm hover:text-primary transition-colors"
                    >
                      {c.courseCode} - {c.courseName}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No courses enrolled.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-topic-performance">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Topic performance</CardTitle>
            <Link
              href="/weak-areas"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {topTopics.length ? (
              <ul className="space-y-2">
                {topTopics.map((t) => {
                  const key = `${t.courseId}-${t.topicId}-${t.subtopicId}`;
                  const enoughData =
                    (t.attemptsCount ?? 0) >= TOPIC_MIN_ATTEMPTS;
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                      data-testid={`topic-perf-${key}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {t.subtopicName ?? t.topicName ?? "Topic"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.courseName ?? `Course ${t.courseId}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium">
                          {enoughData ? `${Math.round(t.accuracyRate)}%` : "—"}
                        </span>
                        {enoughData ? (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${
                              WEAKNESS_STYLES[t.weaknessLevel] ??
                              WEAKNESS_STYLES.strong
                            }`}
                          >
                            {WEAKNESS_LABEL[t.weaknessLevel] ?? t.weaknessLevel}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                            Not enough data
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Topic performance appears once you have enough graded answers.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent exams · Unfinished exams · Recent practice · Unfinished practice */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card data-testid="card-recent-exams">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent exams</CardTitle>
            <Link
              href="/exams"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {completedExams.length ? (
              <ul className="space-y-2">
                {completedExams.slice(0, 5).map((e) => (
                  <li key={e.id} className="border-b pb-2 last:border-0">
                    <Link
                      href={`/exams/${e.id}/review`}
                      className="text-sm hover:text-primary transition-colors"
                    >
                      {e.courseName ?? `Exam ${e.id}`} — Score: {e.score ?? "-"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No completed exams yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-unfinished-exams">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unfinished exams</CardTitle>
          </CardHeader>
          <CardContent>
            {unfinishedExams.length ? (
              <ul className="space-y-2">
                {unfinishedExams.slice(0, 5).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {e.courseName ?? `Exam ${e.id}`}
                      </p>
                      <p className="text-xs uppercase text-muted-foreground">
                        {e.status === "in_progress"
                          ? "in progress"
                          : "not started"}
                      </p>
                    </div>
                    <Link
                      href={`/exams/${e.id}/take`}
                      className="shrink-0 text-sm text-primary hover:underline"
                      data-testid={`link-resume-exam-${e.id}`}
                    >
                      Continue
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No exams in progress.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-practice">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent practice</CardTitle>
            <Link
              href="/practice/history"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {completedPractice.length ? (
              <ul className="space-y-2">
                {completedPractice.slice(0, 5).map((s) => (
                  <li key={s.id} className="border-b pb-2 last:border-0">
                    <Link
                      href={`/practice/${s.id}/summary`}
                      className="flex items-center justify-between gap-3 text-sm hover:text-primary transition-colors"
                      data-testid={`link-practice-summary-${s.id}`}
                    >
                      <span className="min-w-0 truncate">
                        {s.courseName ?? `Course ${s.courseId}`}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.correctCount}/{s.totalQuestions}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No completed practice yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-unfinished-practice">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unfinished practice</CardTitle>
          </CardHeader>
          <CardContent>
            {activePractice.length ? (
              <ul className="space-y-3">
                {activePractice.slice(0, 5).map((s) => {
                  const pct =
                    s.totalQuestions > 0
                      ? Math.round((s.answeredCount / s.totalQuestions) * 100)
                      : 0;
                  return (
                    <li key={s.id} data-testid={`practice-row-${s.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {s.courseName ?? `Course ${s.courseId}`}
                        </span>
                        <Link
                          href={`/practice/${s.id}`}
                          className="shrink-0 text-sm text-primary hover:underline"
                          data-testid={`link-resume-practice-${s.id}`}
                        >
                          Continue
                        </Link>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div
                          className="h-1.5 flex-1 rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${s.answeredCount} of ${s.totalQuestions} questions answered`}
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {s.answeredCount}/{s.totalQuestions}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No practice in progress.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Compact stat tile used across the student and lecturer summary rows. When
// `href` is set the whole tile becomes a link.
function MetricTile({
  icon,
  label,
  value,
  sub,
  href,
  testid,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  href?: string;
  testid?: string;
}) {
  const body = (
    <Card
      className={
        href
          ? "h-full cursor-pointer transition hover:shadow-md hover:border-primary/40"
          : "h-full"
      }
      data-testid={testid}
    >
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function LecturerDashboard({ user }: { user: EpsUser }) {
  const { data: courses } = useListCourses();
  const { data: questions } = useListQuestions();
  const { data: analytics, isLoading } = useGetLecturerDashboardAnalytics();

  // Visible courses are already restricted server-side to this lecturer's
  // course_offerings, so intersecting question.courseId with this set
  // satisfies "course taught by this lecturer".
  const myCourseIds = new Set((courses ?? []).map((c) => c.id));
  const waitingApproval = (questions ?? []).filter(
    (q) =>
      q.createdBy === user.id &&
      myCourseIds.has(q.courseId) &&
      q.status === "draft",
  ).length;

  const activeCourses = analytics?.activeCourses ?? [];
  const visibleCourses = activeCourses.slice(0, 5);
  const hasMoreCourses = activeCourses.length > visibleCourses.length;
  const topFailedTopics = (analytics?.mostFailedTopics ?? []).slice(0, 5);

  return (
    <div className="space-y-4 mt-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          icon={<Users className="w-3.5 h-3.5" />}
          label="Active Courses"
          value={String(analytics?.coursesCount ?? 0)}
          sub={`${analytics?.studentsCount ?? 0} students`}
          href="/courses"
          testid="metric-active-courses"
        />
        <MetricTile
          icon={<BookOpen className="w-3.5 h-3.5" />}
          label="Question Bank"
          value={String(questions?.length ?? 0)}
          sub={
            waitingApproval > 0
              ? `${waitingApproval} waiting for approval`
              : "All caught up"
          }
          href="/lecturer/questions"
          testid="metric-question-bank"
        />
        <MetricTile
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Problematic Questions"
          value={String(analytics?.problematicQuestionsCount ?? 0)}
          sub="High failure rate"
          testid="metric-problematic-questions"
        />
        <MetricTile
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          label="Most Failed Topics"
          value={String((analytics?.mostFailedTopics ?? []).length)}
          sub="Across your classes"
          testid="metric-failed-topics"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-lecturer-courses">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Your courses</CardTitle>
            <span className="text-xs text-muted-foreground">
              {activeCourses.length} total
            </span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : visibleCourses.length ? (
              <ul className="space-y-2">
                {visibleCourses.map((c) => (
                  <li key={c.courseId} className="border-b last:border-0">
                    <Link
                      href={`/courses/${c.courseId}`}
                      className="flex items-center justify-between gap-3 group -mx-2 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-accent"
                      data-testid={`link-course-${c.courseId}`}
                    >
                      <p className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                        {c.courseCode ? `${c.courseCode} - ` : ""}
                        {c.courseName}
                      </p>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No courses found.
              </p>
            )}
            {hasMoreCourses && (
              <Link
                href="/courses"
                className="mt-3 inline-block text-xs font-medium text-primary"
              >
                View all courses →
              </Link>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-lecturer-failed-topics">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most failed topics</CardTitle>
          </CardHeader>
          <CardContent>
            {topFailedTopics.length ? (
              <ul className="space-y-2">
                {topFailedTopics.map((t) => (
                  <li
                    key={`${t.courseId}-${t.topicId}`}
                    className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                    data-testid={`failed-topic-${t.courseId}-${t.topicId}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {t.topicName ?? `Topic ${t.topicId}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.courseName ?? `Course ${t.courseId}`} ·{" "}
                        {t.attemptsCount} attempts
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0">
                      {Math.round(t.averageAccuracy)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No problem topics yet — appears once classes have enough graded
                answers.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type StatCard = {
  label: string;
  value: number;
  key: string;
  href: string;
};

function StatTile({ stat }: { stat: StatCard }) {
  return (
    <Link
      href={stat.href}
      aria-label={`${stat.label}: ${stat.value} - view details`}
      data-testid={`link-stat-${stat.key}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" data-testid={`stat-${stat.key}`}>
            {stat.value}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function AdminDashboardView() {
  const { data, isLoading } = useGetAdminOverview();
  if (isLoading || !data) return <p>Loading...</p>;
  const t = data.totals;

  const stats: StatCard[] = [
    { label: "Users", value: t.users, key: "users", href: "/admin/users" },
    { label: "Courses", value: t.courses, key: "courses", href: "/courses" },
    { label: "Topics", value: t.topics, key: "topics", href: "/courses" },
    {
      label: "Questions",
      value: t.questions,
      key: "questions",
      href: "/lecturer/questions",
    },
    {
      label: "Approved",
      value: t.approvedQuestions,
      key: "approved",
      href: "/lecturer/questions?status=approved",
    },
    {
      label: "Archived",
      value: t.archivedQuestions,
      key: "archived",
      href: "/lecturer/questions?status=archived",
    },
  ];

  const roleCounts = [
    { label: "Students", value: t.students, key: "students", role: "student" },
    { label: "Lecturers", value: t.lecturers, key: "lecturers", role: "lecturer" },
    { label: "Admins", value: t.admins, key: "admins", role: "admin" },
  ];

  return (
    <div className="space-y-6 mt-10">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <StatTile key={s.key} stat={s} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users by role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            {roleCounts.map((r) => (
              <Link
                key={r.key}
                href={`/admin/users?role=${r.role}`}
                aria-label={`${r.label}: ${r.value} - view`}
                data-testid={`link-role-${r.key}`}
                className="rounded-md p-3 transition-all hover:bg-accent hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-xs uppercase text-muted-foreground">{r.label}</p>
                <p className="text-2xl font-bold mt-1">{r.value}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

export default function Dashboard() {
  const user = useAuthUser();
  if (!user) return null;

  // The student view renders its own header (welcome + actions); lecturer and
  // admin keep the shared title above their content.
  return (
    <div className="space-y-4">
      {user.role !== "student" && (
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {user.fullName}
        </h1>
      )}

      {user.role === "student" && <StudentDashboard user={user} />}
      {user.role === "lecturer" && <LecturerDashboard user={user} />}
      {user.role === "admin" && <AdminDashboardView />}
    </div>
  );
}
