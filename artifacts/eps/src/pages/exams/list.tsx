import { Link } from "wouter";
import { useGetUserExams, getGetUserExamsQueryKey } from "@workspace/api-client-react";
import { getAuthUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ExamsList() {
  const user = getAuthUser();
  const { data: exams, isLoading } = useGetUserExams(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserExamsQueryKey(user?.id ?? 0) },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">My Exams</h1>
          <p className="text-muted-foreground mt-1">All practice and mock exams</p>
        </div>
        <Link href="/exams/new">
          <Button data-testid="btn-new-exam">New Exam</Button>
        </Link>
      </div>

      {isLoading && <p>Loading...</p>}

      {!isLoading && (!exams || exams.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No exams yet. Generate your first mock exam to get started.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exams?.map((e) => (
          <Card key={e.id} data-testid={`card-exam-${e.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {e.courseName ?? `Course ${e.courseId}`}
                </CardTitle>
                <Badge variant={e.status === "submitted" ? "default" : "secondary"}>
                  {e.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Questions</span>
                <span data-testid={`text-exam-total-${e.id}`}>{e.totalQuestions}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Score</span>
                <span data-testid={`text-exam-score-${e.id}`}>
                  {e.score != null ? `${e.score}%` : "-"}
                </span>
              </div>
              <div className="flex gap-2 pt-2">
                {e.status === "submitted" ? (
                  <Link href={`/exams/${e.id}/review`} className="flex-1">
                    <Button variant="outline" className="w-full" data-testid={`btn-review-${e.id}`}>
                      Review
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/exams/${e.id}/take`} className="flex-1">
                    <Button className="w-full" data-testid={`btn-resume-${e.id}`}>
                      {e.status === "in_progress" ? "Resume" : "Start"}
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
