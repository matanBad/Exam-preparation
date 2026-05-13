import { getAuthUser } from "@/lib/auth";
import { useGetUserCourses, useGetUserExams, useListCourses, useListQuestions, useGetAdminOverview, useListUsers } from "@workspace/api-client-react";
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
  const { data: overview } = useGetAdminOverview();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Admin Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Users</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{overview?.totals.users}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Courses</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{overview?.totals.courses}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Questions</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{overview?.totals.questions}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Exams</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{overview?.totals.exams}</CardContent></Card>
      </div>
    </div>
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
