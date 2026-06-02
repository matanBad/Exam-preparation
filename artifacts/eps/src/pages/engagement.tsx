import {
  useGetEngagementSummary,
  useGetEngagementMilestones,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Trophy, Award } from "lucide-react";

const MILESTONE_ICON_STYLES: Record<string, string> = {
  practice: "bg-blue-100 text-blue-700",
  exam: "bg-emerald-100 text-emerald-700",
  streak: "bg-orange-100 text-orange-700",
  recommendation: "bg-purple-100 text-purple-700",
};

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Engagement() {
  const { data: summary, isLoading: summaryLoading } =
    useGetEngagementSummary();
  const { data: milestones, isLoading: milestonesLoading } =
    useGetEngagementMilestones();

  const currentStreak = summary?.currentStreak ?? 0;
  const longestStreak = summary?.longestStreak ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Flame className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Engagement & Achievements
          </h1>
          <p className="text-sm text-muted-foreground">
            Keep your learning streak alive and track the milestones you earn as
            you practice and take exams.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-current-streak">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Flame className="w-3.5 h-3.5" />
              Current Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold leading-tight">
              {currentStreak} day{currentStreak === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentStreak > 0
                ? "Keep it going — practice today to extend it."
                : "Complete a practice session or exam to start a streak."}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-longest-streak">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Award className="w-3.5 h-3.5" />
              Longest Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold leading-tight">
              {longestStreak} day{longestStreak === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your best run so far.
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-milestones-count">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Trophy className="w-3.5 h-3.5" />
              Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold leading-tight">
              {summary?.milestonesCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Achievements earned.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-milestones-list">
        <CardHeader>
          <CardTitle>Your milestones</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading || milestonesLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : !milestones || milestones.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Trophy className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="font-medium">No milestones yet</p>
              <p className="text-sm text-muted-foreground">
                Complete practice sessions and mock exams to start earning
                achievements.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {milestones.map((m) => (
                <li
                  key={m.milestoneKey}
                  className="flex items-center gap-3 border-b pb-3 last:border-0"
                  data-testid={`milestone-${m.milestoneKey}`}
                >
                  <div
                    className={`rounded-full p-2 shrink-0 ${
                      MILESTONE_ICON_STYLES[m.milestoneType] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {m.milestoneType}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {fmtDate(m.achievedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
