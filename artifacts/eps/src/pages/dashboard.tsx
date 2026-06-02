import { useAuthUser, type EpsUser } from "@/lib/auth";
import {
  useGetUserExams,
  useListCourses,
  useListQuestions,
  useGetAdminOverview,
  useGetPracticeHistory,
  useGetStudentDashboardAnalytics,
  useGetLecturerDashboardAnalytics,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import {
  TrendingDown,
  Lightbulb,
  Gauge,
  Target,
  Dumbbell,
  AlertTriangle,
  Users,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

function fmtScore(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Student dashboard uses a tighter vertical rhythm than the others so the
// welcome title sits closer to the action row and the cards below it.
function StudentDashboard({ user }: { user: EpsUser }) {
  // Use the enriched courses list so we have offering studyYear/semester,
  // then filter to the student's current term only.
  const { data: allCourses } = useListCourses();
  const { data: exams } = useGetUserExams(user.id);
  const { data: practice } = useGetPracticeHistory();
  const activePractice = practice?.active ?? [];
  const completedPractice = practice?.completed ?? [];
  const courses = (allCourses ?? []).filter((c) => {
    if (!user.currentStudyYear || !user.currentSemester) return true;
    if (c.studyYear == null || c.offeringSemester == null) return false;
    return (
      c.studyYear === user.currentStudyYear &&
      c.offeringSemester === user.currentSemester
    );
  });

  return (
    <div className="space-y-3 -mt-2">
      <div className="flex justify-end">
        <Link
          href="/practice"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent h-10 px-4 py-2 mr-2"
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

      <StudentAnalytics />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              Current courses
              {user.currentStudyYear && user.currentSemester && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {user.currentStudyYear} year · Semester{" "}
                  {user.currentSemester}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courses?.length ? (
              <ul className="space-y-2">
                {courses.map((c) => (
                  <li key={c.id} className="border-b pb-2 last:border-0">
                    <Link
                      href={`/courses/${c.id}`}
                      className="hover:text-primary transition-colors"
                    >
                      {c.courseCode} - {c.courseName}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No courses enrolled.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent Exams</CardTitle>
          </CardHeader>
          <CardContent>
            {exams?.filter((e) => e.status === "submitted").length ? (
              <ul className="space-y-2">
                {exams
                  .filter((e) => e.status === "submitted")
                  .slice(0, 5)
                  .map((e) => (
                    <li key={e.id} className="border-b pb-2 last:border-0">
                      <Link
                        href={`/exams/${e.id}/review`}
                        className="hover:text-primary transition-colors"
                      >
                        Exam {e.id} - Score: {e.score ?? "-"}
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No completed exams.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-unfinished-exams">
        <CardHeader>
          <CardTitle>Unfinished exams</CardTitle>
        </CardHeader>
        <CardContent>
          {exams?.filter((e) => e.status !== "submitted").length ? (
            <ul className="space-y-2">
              {exams
                .filter((e) => e.status !== "submitted")
                .map((e) => (
                  <li
                    key={e.id}
                    className="flex justify-between items-center border-b pb-2 last:border-0"
                  >
                    <span className="text-sm">
                      Exam {e.id}
                      <span className="ml-2 text-xs uppercase text-muted-foreground">
                        {e.status === "in_progress" ? "in progress" : "not started"}
                      </span>
                    </span>
                    <Link
                      href={`/exams/${e.id}/take`}
                      className="text-primary hover:underline text-sm"
                      data-testid={`link-resume-exam-${e.id}`}
                    >
                      Resume
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No exams in progress.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-unfinished-practice">
        <CardHeader>
          <CardTitle>Unfinished practice</CardTitle>
        </CardHeader>
        <CardContent>
          {activePractice.length ? (
            <ul className="space-y-2">
              {activePractice.map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between items-center border-b pb-2 last:border-0"
                >
                  <span className="text-sm">
                    {s.courseName ?? `Course ${s.courseId}`}
                    <span className="ml-2 text-xs uppercase text-muted-foreground">
                      {s.answeredCount}/{s.totalQuestions} answered
                    </span>
                  </span>
                  <Link
                    href={`/practice/${s.id}`}
                    className="text-primary hover:underline text-sm"
                    data-testid={`link-resume-practice-${s.id}`}
                  >
                    Resume
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No practice sessions in progress.{" "}
              <Link href="/practice" className="text-primary hover:underline">
                Start one
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Compact stat tile used across the student analytics row. When `href` is set
// the whole tile becomes a link.
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

// Student-only analytics overview: headline metrics, a progress-over-time
// chart and a weakest-topics list. Everything is the requesting student's own
// data; empty states show until enough activity exists.
function StudentAnalytics() {
  const { data, isLoading } = useGetStudentDashboardAnalytics();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading your analytics…
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const readinessValue =
    data.readinessScore == null ? "—" : `${Math.round(data.readinessScore)}/100`;
  const trend = (data.progressTrend ?? []).map((p, i) => ({
    i,
    name: fmtDate(p.date),
    score: Math.round(p.score),
    label: p.label,
  }));
  const topTopics = (data.topicPerformance ?? []).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricTile
          icon={<Target className="w-3.5 h-3.5" />}
          label="Average Score"
          value={fmtScore(data.averageScore)}
          sub="Exams & practice"
          testid="metric-average-score"
        />
        <MetricTile
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="Readiness"
          value={readinessValue}
          sub={data.readinessLabel}
          testid="metric-readiness"
        />
        <MetricTile
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          label="Weak Areas"
          value={String(data.weakAreasCount)}
          sub="View details →"
          href="/weak-areas"
          testid="metric-weak-areas"
        />
        <MetricTile
          icon={<Lightbulb className="w-3.5 h-3.5" />}
          label="Recommendations"
          value={String(data.activeRecommendationsCount)}
          sub="View details →"
          href="/recommendations"
          testid="metric-recommendations"
        />
        <MetricTile
          icon={<Dumbbell className="w-3.5 h-3.5" />}
          label="Practice"
          value={String(data.practiceSessionsCount)}
          sub={
            data.recentPracticeAccuracy == null
              ? "No sessions yet"
              : `Last: ${Math.round(data.recentPracticeAccuracy)}%`
          }
          href="/practice"
          testid="metric-practice"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-progress-over-time">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progress over time</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length >= 2 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trend}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} fontSize={11} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, "Score"]}
                      labelFormatter={(_, p) =>
                        p?.[0]?.payload?.label ?? ""
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Complete at least two exams or practice sessions to see your
                progress trend.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-topic-performance">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Topic performance</CardTitle>
          </CardHeader>
          <CardContent>
            {topTopics.length ? (
              <ul className="space-y-2">
                {topTopics.map((t) => {
                  const key = `${t.courseId}-${t.topicId}-${t.subtopicId}`;
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
                          {Math.round(t.accuracyRate)}%
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            WEAKNESS_STYLES[t.weaknessLevel] ??
                            WEAKNESS_STYLES.strong
                          }`}
                        >
                          {WEAKNESS_LABEL[t.weaknessLevel] ?? t.weaknessLevel}
                        </span>
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
    </div>
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
          icon={<Target className="w-3.5 h-3.5" />}
          label="Class Average"
          value={fmtScore(analytics?.averageClassScore)}
          sub="Across your courses"
          testid="metric-class-average"
        />
        <MetricTile
          icon={<Users className="w-3.5 h-3.5" />}
          label="Active Courses"
          value={String(analytics?.coursesCount ?? 0)}
          sub={`${analytics?.studentsCount ?? 0} students`}
          href="/courses"
          testid="metric-active-courses"
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
                  <li key={c.courseId} className="border-b pb-2 last:border-0">
                    <Link
                      href={`/lecturer/courses/${c.courseId}/analytics`}
                      className="flex items-center justify-between gap-3 group"
                      data-testid={`link-course-analytics-${c.courseId}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                          {c.courseCode ? `${c.courseCode} - ` : ""}
                          {c.courseName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.studentsCount} students · {c.weakTopicsCount} weak
                          topic{c.weakTopicsCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="text-sm font-medium shrink-0">
                        {fmtScore(c.averageScore)}
                      </span>
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

      <Link
        href="/lecturer/questions"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        data-testid="card-lecturer-question-bank"
      >
        <Card className="cursor-pointer transition hover:shadow-md hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Question Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Total Questions:{" "}
              <span className="font-semibold">{questions?.length ?? 0}</span>
            </p>
            <p className="mt-2 text-sm" data-testid="text-waiting-approval">
              Waiting for approval:{" "}
              <span
                className={
                  waitingApproval > 0
                    ? "font-semibold text-destructive"
                    : "font-semibold"
                }
              >
                {waitingApproval}
              </span>
            </p>
          </CardContent>
        </Card>
      </Link>
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

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome, {user.fullName}
      </h1>

      {user.role === "student" && <StudentDashboard user={user} />}
      {user.role === "lecturer" && <LecturerDashboard user={user} />}
      {user.role === "admin" && <AdminDashboardView />}
    </div>
  );
}
