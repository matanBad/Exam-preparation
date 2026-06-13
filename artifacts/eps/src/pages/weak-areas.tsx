import { useLocation } from "wouter";
import {
  useGetWeakAreas,
  useGeneratePractice,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lightbulb } from "lucide-react";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton-card";
import { Link } from "wouter";

const LEVEL_STYLES: Record<string, string> = {
  weak: "bg-destructive/10 text-destructive border-destructive/20",
  needs_practice: "bg-amber-100 text-amber-700 border-amber-200",
};

const LEVEL_LABEL: Record<string, string> = {
  weak: "Weak",
  needs_practice: "Needs Practice",
};

export default function WeakAreas() {
  const [, setLocation] = useLocation();
  const { data: weakAreas, isLoading } = useGetWeakAreas();
  const generate = useGeneratePractice();
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");

  const courseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const area of weakAreas ?? []) {
      const name = area.courseName ?? `Course ${area.courseId}`;
      seen.set(String(area.courseId), name);
    }
    return [...seen.entries()];
  }, [weakAreas]);

  const filtered = useMemo(() => {
    return (weakAreas ?? []).filter((area) => {
      if (courseFilter !== "all" && String(area.courseId) !== courseFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = [
          area.topicName,
          area.subtopicName,
          area.courseName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [weakAreas, courseFilter, search]);

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
      <h1 className="text-3xl font-bold tracking-tight">Weak Areas</h1>

      {/* Filter row: Search | Course */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search weak areas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
          data-testid="input-search-weak-areas"
        />
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="sm:max-w-[200px]" data-testid="select-weak-areas-course">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courseOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <Card key={i}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !weakAreas || weakAreas.length === 0 ? (
        <Card data-testid="card-weak-areas-empty">
          <CardContent className="py-12 text-center space-y-3">
            <Lightbulb className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-medium">No weak areas identified yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Complete at least 3 practice sessions so we can identify where you need the most work.
            </p>
            <Link href="/practice" className="inline-block text-sm font-medium text-primary hover:underline">
              Start your first practice session →
            </Link>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No weak areas match your filters.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((area) => {
            const key = `${area.courseId}-${area.topicId}-${area.subtopicId}`;
            const levelStyle =
              LEVEL_STYLES[area.weaknessLevel] ?? LEVEL_STYLES.needs_practice;
            const levelLabel =
              LEVEL_LABEL[area.weaknessLevel] ?? area.weaknessLevel;
            return (
              <Card key={key} data-testid={`weak-area-${key}`}>
                <CardContent className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {area.subtopicName ?? area.topicName ?? "Topic"}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${levelStyle}`}
                      >
                        {levelLabel}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {area.courseName ?? `Course ${area.courseId}`}
                      {area.subtopicName && area.topicName
                        ? ` · ${area.topicName}`
                        : ""}
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
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
