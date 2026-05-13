import { Link } from "wouter";
import { useGetAdminOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
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
        <div>
          <h1 className="text-3xl font-bold">Admin Overview</h1>
          <p className="text-muted-foreground mt-1">System-wide totals and activity</p>
        </div>
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
    </div>
  );
}
