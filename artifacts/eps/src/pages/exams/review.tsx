import { useGetExamReview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

export default function ExamReview({ params }: { params: { id: string } }) {
  const examId = parseInt(params.id, 10);
  const { data, isLoading } = useGetExamReview(examId);

  if (isLoading || !data) return <p>Loading review...</p>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Exam Review</h1>
        <p className="text-muted-foreground">
          {data.exam.courseName ?? `Course ${data.exam.courseId}`} — Score {data.exam.score ?? 0}%
        </p>
      </div>

      {data.items.map((item, idx) => (
        <Card key={item.examQuestionId} data-testid={`card-review-${item.examQuestionId}`}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="text-base">
                {idx + 1}. {item.title}
              </CardTitle>
              <Badge
                variant={item.isCorrect ? "default" : "destructive"}
                className="shrink-0"
              >
                {item.isCorrect ? "Correct" : "Incorrect"}
              </Badge>
            </div>
            {item.topicName && (
              <p className="text-xs text-muted-foreground">{item.topicName}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{item.questionText}</p>
            <div className="space-y-2">
              {item.options.map((opt) => {
                const isCorrect = opt.id === item.correctAnswerOptionId;
                const isSelected = opt.id === item.selectedAnswerOptionId;
                return (
                  <div
                    key={opt.id}
                    className={`flex items-start gap-3 p-3 rounded-md border ${
                      isCorrect
                        ? "border-green-600 bg-green-50 dark:bg-green-950/30"
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
                    <span className="text-sm">{opt.answerText}</span>
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
