import { Link } from "wouter";
import { useGetExam } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function ExamResult({ params }: { params: { id: string } }) {
  const examId = parseInt(params.id, 10);
  const { data: exam, isLoading } = useGetExam(examId);

  if (isLoading || !exam) return <p>Loading...</p>;

  const correct = Math.round(((exam.score ?? 0) / 100) * exam.totalQuestions);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Score</p>
              <p className="text-3xl font-bold mt-1" data-testid="text-score">
                {exam.score ?? 0}%
              </p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Correct</p>
              <p className="text-3xl font-bold mt-1" data-testid="text-correct">
                {correct} / {exam.totalQuestions}
              </p>
            </div>
            <div className="p-4 rounded-md border">
              <p className="text-xs uppercase text-muted-foreground">Status</p>
              <p className="text-base font-medium mt-1 capitalize">{exam.status}</p>
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
