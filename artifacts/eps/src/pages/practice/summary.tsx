import { Link } from "wouter";
import { useFinishPracticeSession } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Target, CheckCircle2 } from "lucide-react";

type Summary = Awaited<
  ReturnType<ReturnType<typeof useFinishPracticeSession>["mutateAsync"]>
>;

function tone(pct: number) {
  if (pct >= 80)
    return { text: "text-green-700 dark:text-green-400", label: "Great work!" };
  if (pct >= 60)
    return { text: "text-amber-700 dark:text-amber-400", label: "Good progress" };
  return { text: "text-red-700 dark:text-red-400", label: "Keep practicing" };
}

export default function PracticeSummary({
  params,
}: {
  params: { sessionId: string };
}) {
  const sessionId = parseInt(params.sessionId, 10);
  const finish = useFinishPracticeSession();
  const [summary, setSummary] = useState<Summary | null>(null);

  // Finishing is idempotent server-side: it completes the session if active and
  // always returns the up-to-date summary, so it's safe to call on mount.
  useEffect(() => {
    let cancelled = false;
    finish.mutate(
      { sessionId },
      {
        onSuccess: (data) => {
          if (!cancelled) setSummary(data);
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!summary) return <p>Loading results...</p>;

  const pct = summary.accuracyPercentage;
  const t = tone(pct);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <div>
              <CardTitle className="text-2xl">Practice complete</CardTitle>
              <p className="text-sm text-muted-foreground">
                Nice effort — here's how you did.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="w-4 h-4" />
                <span>Accuracy</span>
              </div>
              <span className={`text-sm font-medium ${t.text}`}>{t.label}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span
                className={`text-5xl font-bold tabular-nums ${t.text}`}
                data-testid="text-practice-accuracy"
              >
                {pct}%
              </span>
              <span className="text-sm text-muted-foreground">
                {summary.correctCount} of {summary.answeredCount} correct
              </span>
            </div>
            <Progress value={pct} className="h-3" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Answered</p>
              <p className="text-2xl font-bold mt-1">{summary.answeredCount}</p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Correct</p>
              <p className="text-2xl font-bold mt-1">{summary.correctCount}</p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Incorrect</p>
              <p className="text-2xl font-bold mt-1">{summary.incorrectCount}</p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Points</p>
              <p className="text-2xl font-bold mt-1">
                {summary.earnedScore}/{summary.totalMaxScore}
              </p>
            </div>
          </div>

          {summary.lowConfidenceCount > 0 && (
            <p className="text-sm text-muted-foreground">
              You marked {summary.lowConfidenceCount}{" "}
              {summary.lowConfidenceCount === 1 ? "question" : "questions"} as
              unsure — good areas to revisit.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Link href="/practice/history">
              <Button variant="outline" data-testid="btn-practice-history">
                View history
              </Button>
            </Link>
            <Link href="/practice">
              <Button data-testid="btn-practice-again">Practice again</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
