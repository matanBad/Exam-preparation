import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useStartExam, useSubmitExam } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type ExamData = Awaited<ReturnType<ReturnType<typeof useStartExam>["mutateAsync"]>>;

export default function ExamTake({ params }: { params: { id: string } }) {
  const examId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const startExam = useStartExam();
  const submitExam = useSubmitExam();
  const [exam, setExam] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startExam.mutate(
      { id: examId },
      {
        onSuccess: (data) => {
          if (cancelled) return;
          setExam(data);
          if (data.durationMinutes) {
            setSecondsLeft(data.durationMinutes * 60);
          }
          const initial: Record<number, number | null> = {};
          for (const q of data.questions) {
            initial[q.id] = q.selectedAnswerOptionId ?? null;
          }
          setAnswers(initial);
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const handleSelect = (examQuestionId: number, optionId: number) => {
    setAnswers((prev) => ({ ...prev, [examQuestionId]: optionId }));
  };

  const handleSubmit = () => {
    if (!exam || submitting) return;
    setSubmitting(true);
    submitExam.mutate(
      {
        id: examId,
        data: {
          answers: exam.questions.map((q) => ({
            examQuestionId: q.id,
            selectedAnswerOptionId: answers[q.id] ?? null,
          })),
        },
      },
      {
        onSuccess: () => {
          setLocation(`/exams/${examId}/result`);
        },
        onError: () => setSubmitting(false),
      },
    );
  };

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v != null).length,
    [answers],
  );

  if (!exam) {
    return <p>Loading exam...</p>;
  }

  const q = exam.questions[current];
  const progress = exam.questions.length
    ? ((current + 1) / exam.questions.length) * 100
    : 0;

  const fmt = (s: number) => {
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{exam.courseName ?? "Exam"}</h1>
          <p className="text-sm text-muted-foreground">
            Question {current + 1} of {exam.questions.length} · {answeredCount} answered
          </p>
        </div>
        {secondsLeft != null && (
          <Badge
            variant={secondsLeft < 60 ? "destructive" : "secondary"}
            className="text-base font-mono"
            data-testid="text-timer"
          >
            {fmt(secondsLeft)}
          </Badge>
        )}
      </div>

      <Progress value={progress} />

      {q && (
        <Card data-testid={`card-question-${q.id}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{q.title}</CardTitle>
              <Badge variant="outline">{q.difficultyLevel}</Badge>
            </div>
            {q.topicName && (
              <p className="text-xs text-muted-foreground">{q.topicName}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base whitespace-pre-wrap">{q.questionText}</p>
            <div className="space-y-2">
              {q.options.map((opt, idx) => {
                const selected = answers[q.id] === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelect(q.id, opt.id)}
                    className={`w-full text-left p-3 rounded-md border transition-colors ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    }`}
                    data-testid={`btn-option-${q.id}-${opt.id}`}
                  >
                    <span className="font-mono text-sm text-muted-foreground mr-3">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    {opt.answerText}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          data-testid="btn-prev-question"
        >
          Previous
        </Button>
        {current < exam.questions.length - 1 ? (
          <Button
            onClick={() => setCurrent((c) => c + 1)}
            data-testid="btn-next-question"
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || submitExam.isPending}
            data-testid="btn-submit-exam"
          >
            {submitting || submitExam.isPending ? "Submitting..." : "Submit Exam"}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Question navigator
          </p>
          <div className="flex flex-wrap gap-2">
            {exam.questions.map((qq, idx) => {
              const isAnswered = answers[qq.id] != null;
              const isCurrent = idx === current;
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setCurrent(idx)}
                  className={`w-9 h-9 rounded-md text-sm font-medium border ${
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : isAnswered
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background"
                  }`}
                  data-testid={`btn-nav-${idx}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
