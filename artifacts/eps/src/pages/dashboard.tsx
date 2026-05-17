import { getAuthUser } from "@/lib/auth";
import { useGetUserCourses, useGetUserExams, useListCourses, useListQuestions, useGetAdminOverview, useListDeletionRequests } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

function StudentDashboard({ userId }: { userId: number }) {
  const { data: courses } = useGetUserCourses(userId);
  const { data: exams } = useGetUserExams(userId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Student Dashboard</h2>
        <Link href="/exams/new" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2" data-testid="btn-start-exam">Start Mock Exam</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Enrolled Courses</CardTitle></CardHeader>
          <CardContent>
            {courses?.length ? (
              <ul className="space-y-2">
                {courses.map(c => <li key={c.id} className="border-b pb-2 last:border-0">{c.courseCode} - {c.courseName}</li>)}
              </ul>
            ) : <p className="text-muted-foreground">No courses enrolled.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent Exams</CardTitle></CardHeader>
          <CardContent>
            {exams?.length ? (
              <ul className="space-y-2">
                {exams.slice(0, 5).map(e => <li key={e.id} className="border-b pb-2 last:border-0">Exam {e.id} - Score: {e.score}</li>)}
              </ul>
            ) : <p className="text-muted-foreground">No recent exams.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LecturerDashboard() {
  const { data: courses } = useListCourses();
  const { data: questions } = useListQuestions();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Lecturer Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Your Courses</CardTitle></CardHeader>
          <CardContent>
            {courses?.length ? (
              <ul className="space-y-2">
                {courses.map(c => <li key={c.id}>{c.courseCode} - {c.courseName}</li>)}
              </ul>
            ) : <p className="text-muted-foreground">No courses found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Question Bank Status</CardTitle></CardHeader>
          <CardContent>
             <p>Total Questions: {questions?.length || 0}</p>
             <div className="mt-4">
               <Link href="/lecturer/questions/new" className="text-primary hover:underline">Add New Question</Link>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminDashboardView() {
  const { data, isLoading } = useGetAdminOverview();
  if (isLoading || !data) return <p>Loading...</p>;
  const t = data.totals;

  const stat = (label: string, value: number, key: string) => (
    <Card key={key}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold" data-testid={`stat-${key}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Overview</h2>
        <Link href="/admin/users">
          <Button variant="outline" data-testid="btn-manage-users">
            Manage Users
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stat("Users", t.users, "users")}
        {stat("Courses", t.courses, "courses")}
        {stat("Topics", t.topics, "topics")}
        {stat("Questions", t.questions, "questions")}
        {stat("Approved", t.approvedQuestions, "approved")}
        {stat("Archived", t.archivedQuestions, "archived")}
        {stat("Exams", t.exams, "exams")}
        {stat("Submitted", t.submittedExams, "submitted")}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users by role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Students</p>
              <p className="text-2xl font-bold mt-1">{t.students}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Lecturers</p>
              <p className="text-2xl font-bold mt-1">{t.lecturers}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold mt-1">{t.admins}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeletionRequestsCard />
    </div>
  );
}

function DeletionRequestsCard() {
  const { data, isLoading } = useListDeletionRequests();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account deletion requests</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Submitted by students who chose to delete their account.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="empty-deletion-requests">
            No deletion requests yet.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="list-deletion-requests">
            {data.slice(0, 10).map((r) => (
              <li
                key={r.id}
                className="border-b last:border-0 pb-3 last:pb-0 text-sm"
                data-testid={`deletion-request-${r.id}`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="font-semibold">{r.formerFullName}</span>{" "}
                    <span className="text-muted-foreground">&lt;{r.formerEmail}&gt;</span>{" "}
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      ({r.formerRole})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.deletedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                  {r.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const user = getAuthUser();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.fullName}</h1>
        <p className="text-muted-foreground mt-1">Here is your {user.role} overview.</p>
      </div>

      {user.role === "student" && <StudentDashboard userId={user.id} />}
      {user.role === "lecturer" && <LecturerDashboard />}
      {user.role === "admin" && <AdminDashboardView />}
    </div>
  );
}
