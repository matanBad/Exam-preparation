import { Link } from "wouter";
import { useGetPracticeHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function accuracy(correct: number, answered: number) {
  return answered > 0 ? Math.round((correct / answered) * 100) : 0;
}

export default function PracticeHistory() {
  const { data, isLoading } = useGetPracticeHistory();

  if (isLoading || !data) return <p>Loading history...</p>;

  const { active, completed } = data;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Practice history</h1>
        <Link href="/practice">
          <Button data-testid="btn-new-practice">New practice</Button>
        </Link>
      </div>

      {active.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>In progress</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {active.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {s.courseName ?? `Course ${s.courseId}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.answeredCount}/{s.totalQuestions} answered
                    </p>
                  </div>
                  <Link
                    href={`/practice/${s.id}`}
                    className="text-primary hover:underline text-sm"
                    data-testid={`link-resume-${s.id}`}
                  >
                    Resume
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Completed sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {completed.length ? (
            <ul className="space-y-2">
              {completed.map((s) => {
                const pct = accuracy(s.correctCount, s.answeredCount);
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                    data-testid={`practice-history-${s.id}`}
                  >
                    <div className="text-sm">
                      <p className="font-medium">
                        {s.courseName ?? `Course ${s.courseId}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.correctCount}/{s.answeredCount} correct ·{" "}
                        {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        pct >= 80
                          ? "border-emerald-400 text-emerald-700 dark:text-emerald-300"
                          : pct >= 60
                          ? "border-amber-400 text-amber-700 dark:text-amber-300"
                          : "border-rose-400 text-rose-700 dark:text-rose-300"
                      }
                    >
                      {pct}%
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No completed practice sessions yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
