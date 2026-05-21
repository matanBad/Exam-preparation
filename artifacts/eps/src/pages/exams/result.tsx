import { Link } from "wouter";
import { useGetExam } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Trophy } from "lucide-react";

function scoreTone(pct: number) {
  if (pct >= 80) {
    return {
      bar: "[&>div]:bg-green-600",
      text: "text-green-700 dark:text-green-400",
      label: "Great work!",
    };
  }
  if (pct >= 60) {
    return {
      bar: "[&>div]:bg-amber-500",
      text: "text-amber-700 dark:text-amber-400",
      label: "Almost there",
    };
  }
  return {
    bar: "[&>div]:bg-red-600",
    text: "text-red-700 dark:text-red-400",
    label: "Keep practicing",
  };
}

export default function ExamResult({ params }: { params: { id: string } }) {
  const examId = parseInt(params.id, 10);
  const { data: exam, isLoading } = useGetExam(examId);

  if (isLoading || !exam) return <p>Loading...</p>;

  const pct = exam.score ?? 0;
  const tone = scoreTone(pct);
  const earned = exam.totalEarnedScore ?? 0;
  const max = exam.totalMaxScore ?? 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <div>
              <CardTitle className="text-2xl">Exam submitted</CardTitle>
              <p className="text-sm text-muted-foreground">
                {exam.courseName ?? `Course ${exam.courseId}`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Trophy className="w-4 h-4" />
                <span>Final grade</span>
              </div>
              <span className={`text-sm font-medium ${tone.text}`}>
                {tone.label}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span
                className={`text-5xl font-bold tabular-nums ${tone.text}`}
                data-testid="text-score"
              >
                {pct}%
              </span>
              <span className="text-sm text-muted-foreground">
                ({earned} / {max} points)
              </span>
            </div>
            <Progress
              value={pct}
              className={`h-3 ${tone.bar}`}
              data-testid="bar-final-grade"
            />
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Earned</p>
              <p className="text-2xl font-bold mt-1" data-testid="text-earned">
                {earned}
              </p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Total</p>
              <p className="text-2xl font-bold mt-1" data-testid="text-total">
                {max}
              </p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Questions</p>
              <p className="text-2xl font-bold mt-1" data-testid="text-questions">
                {exam.totalQuestions}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Link href="/exams">
              <Button variant="outline" data-testid="btn-back-to-exams">
                Back to my exams
              </Button>
            </Link>
            <Link href={`/exams/${exam.id}/review`}>
              <Button data-testid="btn-review-exam">Review answers</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
