import { useLocation } from "wouter";
import {
  useGetWeakAreas,
  useGeneratePractice,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, TrendingDown } from "lucide-react";
import { useState } from "react";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-muted text-muted-foreground border-border",
};

const LEVEL_LABEL: Record<string, string> = {
  weak: "Weak",
  needs_practice: "Needs practice",
};

export default function WeakAreas() {
  const [, setLocation] = useLocation();
  const { data: weakAreas, isLoading } = useGetWeakAreas();
  const generate = useGeneratePractice();
  const [startingKey, setStartingKey] = useState<string | null>(null);

  const practiceNow = (area: {
    courseId: number;
    topicId?: number | null;
    subtopicId?: number | null;
  }) => {
    const key = `${area.courseId}-${area.topicId}-${area.subtopicId}`;
    setStartingKey(key);
    generate.mutate(
      {
        data: {
          courseId: area.courseId,
          topicId: area.topicId,
          subtopicId: area.subtopicId,
          questionCount: 10,
          sessionType: "weak_area",
        },
      },
      {
        onSuccess: (session) => setLocation(`/practice/${session.id}`),
        onError: () => setStartingKey(null),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <TrendingDown className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weak Areas</h1>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : !weakAreas || weakAreas.length === 0 ? (
        <Card data-testid="card-weak-areas-empty">
          <CardContent className="py-10 text-center space-y-2">
            <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No weak areas identified yet</p>
            <p className="text-sm text-muted-foreground">
              Complete more mock exams and practice sessions so we can analyze
              where you need the most work.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {weakAreas.map((area) => {
            const key = `${area.courseId}-${area.topicId}-${area.subtopicId}`;
            return (
              <Card key={key} data-testid={`weak-area-${key}`}>
                <CardContent className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {area.subtopicName ?? area.topicName ?? "Topic"}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          PRIORITY_STYLES[area.priority] ?? PRIORITY_STYLES.low
                        }`}
                      >
                        {LEVEL_LABEL[area.weaknessLevel] ?? area.weaknessLevel}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {area.courseName ?? `Course ${area.courseId}`}
                      {area.subtopicName && area.topicName
                        ? ` · ${area.topicName}`
                        : ""}
                    </p>
                    <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                      <span>
                        Accuracy:{" "}
                        <span className="font-medium text-foreground">
                          {Math.round(area.accuracyRate)}%
                        </span>
                      </span>
                      <span>
                        {area.correctCount}/{area.attemptsCount} correct
                      </span>
                      {area.repeatedMistakeCount > 0 && (
                        <span>
                          {area.repeatedMistakeCount} repeated mistake
                          {area.repeatedMistakeCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => practiceNow(area)}
                    disabled={generate.isPending && startingKey === key}
                    data-testid={`btn-practice-${key}`}
                  >
                    {generate.isPending && startingKey === key
                      ? "Starting..."
                      : "Practice now"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
