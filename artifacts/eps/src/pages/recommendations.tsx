import { useLocation } from "wouter";
import {
  useGetRecommendations,
  useGetRevisionPlan,
  useDismissRecommendation,
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
import { Lightbulb, ListChecks } from "lucide-react";
import { useState } from "react";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-muted text-muted-foreground border-border",
};

// Build the practice-start URL with the topic context pre-filled. The practice
// page reads these params and only asks the student for the question count, so
// "Practice now" sends them straight into a scoped session.
function practiceUrl(p: {
  courseId: number;
  topicId?: number | null;
  subtopicId?: number | null;
  count?: number;
}): string {
  const q = new URLSearchParams();
  q.set("courseId", String(p.courseId));
  if (p.topicId != null) q.set("topicId", String(p.topicId));
  if (p.subtopicId != null) q.set("subtopicId", String(p.subtopicId));
  if (p.count != null) q.set("count", String(p.count));
  return `/practice?${q.toString()}`;
}

function RecommendationsTab() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: recs, isLoading } = useGetRecommendations();
  const dismiss = useDismissRecommendation();
  const [busyId, setBusyId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRecommendationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRevisionPlanQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWeakAreasQueryKey() });
  };

  const onDismiss = (id: number) => {
    setBusyId(id);
    dismiss.mutate(
      { id },
      { onSuccess: invalidate, onSettled: () => setBusyId(null) },
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
                onClick={() =>
                  setLocation(
                    practiceUrl({
                      courseId: rec.courseId,
                      topicId: rec.topicId,
                      subtopicId: rec.subtopicId,
                    }),
                  )
                }
                data-testid={`btn-rec-practice-${rec.id}`}
              >
                Practice now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDismiss(rec.id)}
                disabled={busyId === rec.id}
                data-testid={`btn-rec-dismiss-${rec.id}`}
                title="Dismiss this recommendation"
              >
                {busyId === rec.id ? "Dismissing..." : "Dismiss"}
              </Button>
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
              onClick={() =>
                setLocation(
                  practiceUrl({
                    courseId: item.courseId,
                    topicId: item.topicId,
                    subtopicId: item.subtopicId,
                    count: item.suggestedQuestionCount,
                  }),
                )
              }
              data-testid={`btn-revision-practice-${item.order}`}
            >
              Practice now
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
