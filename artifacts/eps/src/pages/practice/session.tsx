import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPracticeSession,
  useSubmitPracticeAnswer,
  useFinishPracticeSession,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";

const DIFFICULTY_STYLES: Record<string, string> = {
  Easy: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200",
  Hard: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200",
};

const CONFIDENCE_OPTIONS = [
  { value: "low", label: "Not sure" },
  { value: "medium", label: "Fairly sure" },
  { value: "high", label: "Confident" },
] as const;

type Confidence = (typeof CONFIDENCE_OPTIONS)[number]["value"];

type Feedback = {
  isCorrect: boolean;
  earnedScore: number;
  maxScore: number;
  correctAnswerOptionIds: number[];
  selectedAnswerOptionIds: number[];
  explanationText: string | null;
};

export default function PracticeSession({
  params,
}: {
  params: { sessionId: string };
}) {
  const sessionId = parseInt(params.sessionId, 10);
  const [, setLocation] = useLocation();
  const { data: session, isLoading } = useGetPracticeSession(sessionId);
  const submitAnswer = useSubmitPracticeAnswer();
  const finish = useFinishPracticeSession();

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [feedback, setFeedback] = useState<Record<number, Feedback>>({});
  const questionShownAt = useRef<number>(Date.now());
  const seeded = useRef(false);

  const questions = useMemo(() => session?.questions ?? [], [session]);

  // If the route's sessionId changes while this component instance is reused,
  // drop all per-session local state so we don't show a stale session's
  // feedback/progress.
  useEffect(() => {
    seeded.current = false;
    setFeedback({});
    setCurrent(0);
    setSelected([]);
    setConfidence(null);
  }, [sessionId]);

  // Seed feedback + jump to first unanswered question once the session loads.
  useEffect(() => {
    if (!session || session.id !== sessionId || seeded.current) return;
    seeded.current = true;
    const initial: Record<number, Feedback> = {};
    for (const q of session.questions) {
      if (q.status === "answered") {
        initial[q.id] = {
          isCorrect: !!q.isCorrect,
          earnedScore: q.earnedScore ?? 0,
          maxScore: q.maxScore,
          correctAnswerOptionIds: q.correctAnswerOptionIds,
          selectedAnswerOptionIds: q.selectedAnswerOptionIds,
          explanationText: q.explanationText ?? null,
        };
      }
    }
    setFeedback(initial);
    const firstUnanswered = session.questions.findIndex(
      (q) => q.status !== "answered",
    );
    setCurrent(firstUnanswered === -1 ? 0 : firstUnanswered);
  }, [session]);

  const q = questions[current];
  const qFeedback = q ? feedback[q.id] : undefined;
  const answered = !!qFeedback;

  // If the session is already finished, route to its summary instead of the
  // live question view.
  useEffect(() => {
    if (session && session.id === sessionId && session.status !== "active") {
      setLocation(`/practice/${sessionId}/summary`);
    }
  }, [session, sessionId, setLocation]);

  // Reset the per-question input state whenever we move to a new question.
  useEffect(() => {
    if (!q) return;
    questionShownAt.current = Date.now();
    const existing = feedback[q.id];
    setSelected(existing ? existing.selectedAnswerOptionIds : []);
    setConfidence((q.confidenceLevel as Confidence | null) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, q?.id]);

  if (isLoading || !session) return <p>Loading practice...</p>;
  if (session.status !== "active") return <p>Loading results...</p>;
  if (!q) return <p>No questions in this practice session.</p>;

  const toggleOption = (optionId: number) => {
    if (answered) return;
    if (q.questionType === "multiple_choice") {
      setSelected((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId],
      );
    } else {
      setSelected([optionId]);
    }
  };

  const submit = () => {
    if (answered || selected.length === 0) return;
    const elapsed = Math.round((Date.now() - questionShownAt.current) / 1000);
    submitAnswer.mutate(
      {
        sessionId,
        data: {
          practiceQuestionId: q.id,
          selectedAnswerOptionIds: selected,
          confidenceLevel: confidence,
          responseTimeSeconds: elapsed,
        },
      },
      {
        onSuccess: (fb) => {
          setFeedback((prev) => ({
            ...prev,
            [q.id]: {
              isCorrect: fb.isCorrect,
              earnedScore: fb.earnedScore,
              maxScore: fb.maxScore,
              correctAnswerOptionIds: fb.correctAnswerOptionIds,
              selectedAnswerOptionIds: fb.selectedAnswerOptionIds,
              explanationText: fb.explanationText ?? null,
            },
          }));
        },
      },
    );
  };

  const goNext = () => {
    if (current < questions.length - 1) setCurrent((c) => c + 1);
  };

  const finishSession = () => {
    finish.mutate(
      { sessionId },
      {
        onSuccess: () => setLocation(`/practice/${sessionId}/summary`),
      },
    );
  };

  const answeredCount = Object.keys(feedback).length;
  const progress = questions.length
    ? (answeredCount / questions.length) * 100
    : 0;
  const isLast = current === questions.length - 1;

  const optionState = (optId: number) => {
    if (!qFeedback) return selected.includes(optId) ? "selected" : "idle";
    const isCorrect = qFeedback.correctAnswerOptionIds.includes(optId);
    const wasSelected = qFeedback.selectedAnswerOptionIds.includes(optId);
    if (isCorrect) return "correct";
    if (wasSelected) return "incorrect";
    return "idle";
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {session.courseName ?? "Practice"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Question {current + 1} of {questions.length} · {answeredCount}{" "}
            answered
            {session.topicName ? ` · ${session.topicName}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={finishSession}
          disabled={finish.isPending}
          data-testid="btn-end-practice"
        >
          {finish.isPending ? "Finishing..." : "End & see results"}
        </Button>
      </div>

      <Progress value={progress} />

      <Card data-testid={`card-practice-question-${q.id}`}>
        <CardHeader>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm font-semibold text-primary">
              Worth {q.maxScore} {q.maxScore === 1 ? "point" : "points"}
            </span>
            <Badge
              variant="outline"
              className={DIFFICULTY_STYLES[q.difficultyLevel] ?? ""}
            >
              {q.difficultyLevel}
            </Badge>
          </div>
          <CardTitle className="text-lg">{q.title}</CardTitle>
          {q.questionType === "multiple_choice" && (
            <p className="text-xs text-muted-foreground mt-1">
              Select every option you think is correct.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base whitespace-pre-wrap">{q.questionText}</p>
          <div className="space-y-2">
            {q.options.map((opt, idx) => {
              const state = optionState(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleOption(opt.id)}
                  disabled={answered}
                  className={cn(
                    "w-full text-left p-3 rounded-md border transition-colors flex items-start gap-3",
                    state === "selected" && "border-primary bg-primary/10",
                    state === "correct" &&
                      "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                    state === "incorrect" &&
                      "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                    state === "idle" && "border-border hover:bg-accent",
                    answered && "cursor-default",
                  )}
                  data-testid={`btn-practice-option-${q.id}-${opt.id}`}
                >
                  <span className="font-mono text-sm text-muted-foreground">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span className="flex-1">{opt.answerText}</span>
                  {state === "correct" && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  {state === "incorrect" && (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {!answered && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                How confident are you? (optional)
              </p>
              <div className="flex gap-2">
                {CONFIDENCE_OPTIONS.map((c) => (
                  <Button
                    key={c.value}
                    type="button"
                    size="sm"
                    variant={confidence === c.value ? "default" : "outline"}
                    onClick={() => setConfidence(c.value)}
                    data-testid={`btn-confidence-${c.value}`}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {qFeedback && (
            <div
              className={cn(
                "rounded-md border p-4 space-y-2",
                qFeedback.isCorrect
                  ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-rose-300 bg-rose-50 dark:bg-rose-950/30",
              )}
              data-testid={`practice-feedback-${q.id}`}
            >
              <p className="font-semibold flex items-center gap-2">
                {qFeedback.isCorrect ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Correct! +{qFeedback.earnedScore} pts
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-rose-600" />
                    {qFeedback.earnedScore > 0
                      ? `Partly correct · ${qFeedback.earnedScore}/${qFeedback.maxScore} pts`
                      : "Not quite"}
                  </>
                )}
              </p>
              {qFeedback.explanationText && (
                <p className="text-sm whitespace-pre-wrap">
                  {qFeedback.explanationText}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          data-testid="btn-practice-prev"
        >
          Previous
        </Button>
        {!answered ? (
          <Button
            onClick={submit}
            disabled={selected.length === 0 || submitAnswer.isPending}
            data-testid="btn-practice-submit"
          >
            {submitAnswer.isPending ? "Checking..." : "Check answer"}
          </Button>
        ) : isLast ? (
          <Button
            onClick={finishSession}
            disabled={finish.isPending}
            data-testid="btn-practice-finish"
          >
            {finish.isPending ? "Finishing..." : "Finish & see results"}
          </Button>
        ) : (
          <Button onClick={goNext} data-testid="btn-practice-next">
            Next question
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Question navigator
          </p>
          <div className="flex flex-wrap gap-2">
            {questions.map((qq, idx) => {
              const fb = feedback[qq.id];
              const isCurrent = idx === current;
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setCurrent(idx)}
                  className={cn(
                    "w-9 h-9 rounded-md text-sm font-medium border",
                    isCurrent && "ring-2 ring-primary",
                    fb
                      ? fb.isCorrect
                        ? "border-emerald-500 bg-emerald-100 dark:bg-emerald-950/40"
                        : "border-rose-500 bg-rose-100 dark:bg-rose-950/40"
                      : "border-border bg-background",
                  )}
                  data-testid={`btn-practice-nav-${idx}`}
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
