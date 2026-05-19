import { useAuthUser, type EpsUser } from "@/lib/auth";
import {
  useGetUserExams,
  useListCourses,
  useListQuestions,
  useGetAdminOverview,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

function StudentDashboard({ user }: { user: EpsUser }) {
  // Use the enriched courses list so we have offering studyYear/semester,
  // then filter to the student's current term only.
  const { data: allCourses } = useListCourses();
  const { data: exams } = useGetUserExams(user.id);
  const courses = (allCourses ?? []).filter((c) => {
    if (!user.currentStudyYear || !user.currentSemester) return true;
    if (c.studyYear == null || c.offeringSemester == null) return false;
    return (
      c.studyYear === user.currentStudyYear &&
      c.offeringSemester === user.currentSemester
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/exams/new"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          data-testid="btn-start-exam"
        >
          Start Mock Exam
        </Link>
      </div>
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
    </div>
  );
}

function LecturerDashboard({ user }: { user: EpsUser }) {
  const { data: courses } = useListCourses();
  const { data: questions } = useListQuestions();

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

  const visibleCourses = (courses ?? []).slice(0, 3);
  const hasMoreCourses = (courses ?? []).length > visibleCourses.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/courses"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          data-testid="card-lecturer-your-courses"
        >
          <Card className="h-full cursor-pointer transition hover:shadow-md hover:border-primary/40">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Your Courses</CardTitle>
              <span className="text-xs text-muted-foreground">
                {(courses ?? []).length} total
              </span>
            </CardHeader>
            <CardContent>
              {visibleCourses.length ? (
                <ul className="space-y-1 text-sm">
                  {visibleCourses.map((c) => (
                    <li key={c.id} className="truncate">
                      {c.courseCode} - {c.courseName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No courses found.
                </p>
              )}
              {hasMoreCourses && (
                <p className="mt-3 text-xs font-medium text-primary">
                  View all courses →
                </p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link
          href="/lecturer/questions"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          data-testid="card-lecturer-question-bank"
        >
          <Card className="h-full cursor-pointer transition hover:shadow-md hover:border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Question Bank</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Total Questions:{" "}
                <span className="font-semibold">{questions?.length ?? 0}</span>
              </p>
              <p
                className="mt-2 text-sm"
                data-testid="text-waiting-approval"
              >
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
    <div className="space-y-6">
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
