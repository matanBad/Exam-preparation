import { useGetExamReview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, X, Clock } from "lucide-react";

const DIFFICULTY_STYLES: Record<string, string> = {
  Easy: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200",
  Hard: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200",
};

function scoreTone(pct: number) {
  if (pct >= 80) return "[&>div]:bg-green-600 text-green-700 dark:text-green-400";
  if (pct >= 60) return "[&>div]:bg-amber-500 text-amber-700 dark:text-amber-400";
  return "[&>div]:bg-red-600 text-red-700 dark:text-red-400";
}

export default function ExamReview({ params }: { params: { id: string } }) {
  const examId = parseInt(params.id, 10);
  const { data, isLoading } = useGetExamReview(examId);

  if (isLoading || !data) return <p>Loading review...</p>;

  const pct = data.exam.score ?? 0;
  const tone = scoreTone(pct);
  const earned = data.exam.totalEarnedScore ?? 0;
  const max = data.exam.totalMaxScore ?? 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Exam Review</h1>
        <p className="text-muted-foreground">
          {data.exam.courseName ?? `Course ${data.exam.courseId}`}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3">
              <span
                className={`text-4xl font-bold tabular-nums ${tone.split(" ").slice(1).join(" ")}`}
                data-testid="text-overall-score"
              >
                {pct}%
              </span>
              <span className="text-sm text-muted-foreground">
                ({earned} / {max} points)
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {data.items.length} questions
            </span>
          </div>
          <Progress value={pct} className={`h-3 ${tone}`} />
        </CardContent>
      </Card>

      {data.items.map((item, idx) => {
        const graded = item.earnedScore != null;
        const earnedQ = item.earnedScore ?? 0;
        const allCorrect = graded && item.isCorrect;
        const partial = graded && earnedQ > 0 && !item.isCorrect;
        const wrong = graded && earnedQ === 0;
        return (
          <Card
            key={item.examQuestionId}
            data-testid={`card-review-${item.examQuestionId}`}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <CardHeader>
              <div
                className={`mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                  !graded
                    ? "border-muted-foreground/30 bg-muted"
                    : allCorrect
                    ? "border-green-600/40 bg-green-50 dark:bg-green-950/30"
                    : partial
                    ? "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30"
                    : "border-red-600/40 bg-red-50 dark:bg-red-950/30"
                }`}
                data-testid={`banner-score-${item.examQuestionId}`}
              >
                <span
                  className={`text-sm font-semibold ${
                    !graded
                      ? "text-muted-foreground"
                      : allCorrect
                      ? "text-green-700 dark:text-green-400"
                      : partial
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {!graded ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Review
                    </span>
                  ) : (
                    <>
                      You received {earnedQ} out of {item.maxScore} points
                    </>
                  )}
                </span>
                <Badge
                  variant="outline"
                  className={DIFFICULTY_STYLES[item.difficultyLevel] ?? ""}
                >
                  {item.difficultyLevel}
                </Badge>
              </div>
              <CardTitle className="text-base">
                {idx + 1}. {item.title}
              </CardTitle>
              {item.topicName && (
                <p className="text-xs text-muted-foreground">{item.topicName}</p>
              )}
              {item.questionType === "multiple_choice" && graded && (
                <p className="text-xs text-muted-foreground">
                  You selected {item.correctSelectedCount} of{" "}
                  {item.totalCorrectCount} correct answers
                  {item.incorrectSelectedCount > 0
                    ? ` and ${item.incorrectSelectedCount} incorrect`
                    : ""}
                  .
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm whitespace-pre-wrap">{item.questionText}</p>
              <div className="space-y-2">
                {item.options.map((opt) => {
                  const isCorrect = item.correctAnswerOptionIds.includes(opt.id);
                  const isSelected = item.selectedAnswerOptionIds.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      className={`flex items-start gap-3 p-3 rounded-md border ${
                        isCorrect && isSelected
                          ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                          : isCorrect
                          ? "border-green-600 bg-green-50/60 dark:bg-green-950/20"
                          : isSelected
                          ? "border-destructive bg-destructive/10"
                          : "border-border"
                      }`}
                    >
                      {isCorrect ? (
                        <Check className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
                      ) : isSelected ? (
                        <X className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 shrink-0" />
                      )}
                      <span className="text-sm flex-1">{opt.answerText}</span>
                      {isSelected && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          your answer
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {item.explanationText && (
                <div className="mt-2 p-3 rounded-md bg-muted text-sm">
                  <p className="font-medium mb-1">Explanation</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {item.explanationText}
                  </p>
                </div>
              )}
              {wrong && (
                <p className="sr-only">Question scored zero points.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
