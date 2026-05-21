import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useStartExam, useSubmitExam } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type ExamData = Awaited<ReturnType<ReturnType<typeof useStartExam>["mutateAsync"]>>;

const DIFFICULTY_STYLES: Record<string, string> = {
  Easy: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200",
  Hard: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200",
};

export default function ExamTake({ params }: { params: { id: string } }) {
  const examId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const startExam = useStartExam();
  const submitExam = useSubmitExam();
  const [exam, setExam] = useState<ExamData | null>(null);
  // Map of examQuestionId → array of selected option ids (supports multi-select).
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
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
          const initial: Record<number, number[]> = {};
          for (const q of data.questions) {
            initial[q.id] =
              q.selectedAnswerOptionIds && q.selectedAnswerOptionIds.length > 0
                ? [...q.selectedAnswerOptionIds]
                : q.selectedAnswerOptionId != null
                ? [q.selectedAnswerOptionId]
                : [];
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

  const toggleSingle = (examQuestionId: number, optionId: number) => {
    setAnswers((prev) => ({ ...prev, [examQuestionId]: [optionId] }));
  };
  const toggleMulti = (examQuestionId: number, optionId: number) => {
    setAnswers((prev) => {
      const current = prev[examQuestionId] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [examQuestionId]: next };
    });
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
            selectedAnswerOptionIds: answers[q.id] ?? [],
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
    () => Object.values(answers).filter((v) => v && v.length > 0).length,
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
            {exam.totalMaxScore ? ` · ${exam.totalMaxScore} total points` : ""}
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
            <div
              className="mb-3 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
              data-testid={`banner-score-${q.id}`}
            >
              <span className="text-sm font-semibold text-primary">
                Question Score: {q.maxScore}{" "}
                {q.maxScore === 1 ? "Point" : "Points"}
              </span>
              <Badge
                variant="outline"
                className={DIFFICULTY_STYLES[q.difficultyLevel] ?? ""}
                data-testid={`badge-difficulty-${q.id}`}
              >
                {q.difficultyLevel}
              </Badge>
            </div>
            <CardTitle className="text-lg">{q.title}</CardTitle>
            {q.topicName && (
              <p className="text-xs text-muted-foreground">{q.topicName}</p>
            )}
            {q.questionType === "multiple_choice" && (
              <div
                className="mt-3 rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
                data-testid={`info-partial-credit-${q.id}`}
              >
                <span className="font-semibold">
                  This question has more than one correct answer.
                </span>{" "}
                Select every option you think is correct. You'll get partial
                points for each correct answer you mark, and lose points for any
                incorrect ones you select (your score for this question can't go
                below zero).
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base whitespace-pre-wrap">{q.questionText}</p>
            <div className="space-y-2">
              {q.options.map((opt, idx) => {
                const selected = (answers[q.id] ?? []).includes(opt.id);
                const isMulti = q.questionType === "multiple_choice";
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      isMulti
                        ? toggleMulti(q.id, opt.id)
                        : toggleSingle(q.id, opt.id)
                    }
                    className={`w-full text-left p-3 rounded-md border transition-colors flex items-start gap-3 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    }`}
                    data-testid={`btn-option-${q.id}-${opt.id}`}
                    aria-pressed={selected}
                  >
                    <span
                      className={`mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 border-2 ${
                        isMulti ? "rounded" : "rounded-full"
                      } ${
                        selected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {selected ? (
                        <span className="text-xs leading-none">✓</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span className="flex-1">{opt.answerText}</span>
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
              const isAnswered = (answers[qq.id] ?? []).length > 0;
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
