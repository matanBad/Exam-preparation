import { useLocation } from "wouter";
import {
  useGetRecommendations,
  useGetRevisionPlan,
  useCompleteRecommendation,
  useDismissRecommendation,
  useGeneratePractice,
  getGetRecommendationsQueryKey,
  getGetRevisionPlanQueryKey,
  getGetWeakAreasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Lightbulb, ListChecks, Check, X } from "lucide-react";
import { useState } from "react";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-muted text-muted-foreground border-border",
};

function RecommendationsTab() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: recs, isLoading } = useGetRecommendations();
  const complete = useCompleteRecommendation();
  const dismiss = useDismissRecommendation();
  const generate = useGeneratePractice();
  const [busyId, setBusyId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRecommendationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRevisionPlanQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWeakAreasQueryKey() });
  };

  const onComplete = (id: number) => {
    setBusyId(id);
    complete.mutate(
      { id },
      { onSuccess: invalidate, onSettled: () => setBusyId(null) },
    );
  };

  const onDismiss = (id: number) => {
    setBusyId(id);
    dismiss.mutate(
      { id },
      { onSuccess: invalidate, onSettled: () => setBusyId(null) },
    );
  };

  const practiceNow = (rec: {
    id: number;
    courseId: number;
    topicId?: number | null;
    subtopicId?: number | null;
  }) => {
    setBusyId(rec.id);
    generate.mutate(
      {
        data: {
          courseId: rec.courseId,
          topicId: rec.topicId,
          subtopicId: rec.subtopicId,
          questionCount: 10,
          sessionType: "weak_area",
        },
      },
      {
        onSuccess: (session) => setLocation(`/practice/${session.id}`),
        onError: () => setBusyId(null),
      },
    );
  };

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  if (!recs || recs.length === 0) {
    return (
      <Card data-testid="card-recommendations-empty">
        <CardContent className="py-10 text-center space-y-2">
          <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No recommendations yet</p>
          <p className="text-sm text-muted-foreground">
            Complete more mock exams and practice sessions to get personalized
            recommendations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {recs.map((rec) => (
        <Card key={rec.id} data-testid={`recommendation-${rec.id}`}>
          <CardContent className="py-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">
                  {rec.subtopicName ?? rec.topicName ?? "Topic"}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.low
                  }`}
                >
                  {rec.priority} priority
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {rec.recommendationText}
              </p>
              <p className="text-xs text-muted-foreground">
                {rec.courseName ?? `Course ${rec.courseId}`}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => practiceNow(rec)}
                disabled={busyId === rec.id}
                data-testid={`btn-rec-practice-${rec.id}`}
              >
                Practice now
              </Button>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onComplete(rec.id)}
                  disabled={busyId === rec.id}
                  data-testid={`btn-rec-complete-${rec.id}`}
                  title="Mark as done"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDismiss(rec.id)}
                  disabled={busyId === rec.id}
                  data-testid={`btn-rec-dismiss-${rec.id}`}
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RevisionPlanTab() {
  const [, setLocation] = useLocation();
  const { data: plan, isLoading } = useGetRevisionPlan();
  const generate = useGeneratePractice();
  const [busyOrder, setBusyOrder] = useState<number | null>(null);

  const practiceNow = (item: {
    order: number;
    courseId: number;
    topicId?: number | null;
    subtopicId?: number | null;
    suggestedQuestionCount: number;
  }) => {
    setBusyOrder(item.order);
    generate.mutate(
      {
        data: {
          courseId: item.courseId,
          topicId: item.topicId,
          subtopicId: item.subtopicId,
          questionCount: item.suggestedQuestionCount,
          sessionType: "weak_area",
        },
      },
      {
        onSuccess: (session) => setLocation(`/practice/${session.id}`),
        onError: () => setBusyOrder(null),
      },
    );
  };

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  if (!plan || !plan.hasEnoughData || plan.items.length === 0) {
    return (
      <Card data-testid="card-revision-plan-empty">
        <CardContent className="py-10 text-center space-y-2">
          <ListChecks className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No revision plan yet</p>
          <p className="text-sm text-muted-foreground">
            {plan?.message ??
              "Complete more mock exams and practice sessions to generate a personalized revision plan."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {plan.items.map((item) => (
        <Card key={item.order} data-testid={`revision-item-${item.order}`}>
          <CardContent className="py-4 flex items-start gap-4">
            <div className="rounded-full bg-primary/10 text-primary w-8 h-8 flex items-center justify-center font-semibold shrink-0">
              {item.order}
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{item.title}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low
                  }`}
                >
                  {item.priority} priority
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{item.reason}</p>
              <p className="text-xs text-muted-foreground">
                {item.courseName ?? `Course ${item.courseId}`} ·{" "}
                {item.suggestedQuestionCount} suggested questions
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => practiceNow(item)}
              disabled={busyOrder === item.order}
              data-testid={`btn-revision-practice-${item.order}`}
            >
              {busyOrder === item.order ? "Starting..." : "Practice now"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Recommendations() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recommendations</h1>
        </div>
      </div>

      <Tabs defaultValue="recommendations">
        <TabsList>
          <TabsTrigger value="recommendations" data-testid="tab-recommendations">
            Recommendations
          </TabsTrigger>
          <TabsTrigger value="revision-plan" data-testid="tab-revision-plan">
            Revision Plan
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recommendations" className="mt-4">
          <RecommendationsTab />
        </TabsContent>
        <TabsContent value="revision-plan" className="mt-4">
          <RevisionPlanTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
