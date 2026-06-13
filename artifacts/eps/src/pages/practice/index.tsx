import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetUserCourses,
  useListCourseTopics,
  useGeneratePractice,
  useGetPracticeHistory,
  getGetUserCoursesQueryKey,
  getListCourseTopicsQueryKey,
} from "@workspace/api-client-react";
import { getAuthUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, History, TrendingDown } from "lucide-react";

export default function PracticeIndex() {
  const user = getAuthUser();
  const [, setLocation] = useLocation();

  const { data: courses } = useGetUserCourses(user?.id ?? 0, {
    query: {
      enabled: !!user?.id,
      queryKey: getGetUserCoursesQueryKey(user?.id ?? 0),
    },
  });

  const [courseId, setCourseId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [subtopicId, setSubtopicId] = useState<number | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const { data: topics } = useListCourseTopics(courseId ?? 0, {
    query: {
      enabled: !!courseId,
      queryKey: getListCourseTopicsQueryKey(courseId ?? 0),
    },
  });

  const topLevelTopics = useMemo(
    () => (topics ?? []).filter((t) => t.parentTopicId == null),
    [topics],
  );
  const subtopics = useMemo(
    () => (topics ?? []).filter((t) => topicId != null && t.parentTopicId === topicId),
    [topics, topicId],
  );

  const { data: history } = useGetPracticeHistory();
  const generate = useGeneratePractice();

  const start = () => {
    setError(null);
    if (!courseId) {
      setError("Please choose a course to practice.");
      return;
    }
    generate.mutate(
      {
        data: {
          courseId,
          topicId,
          subtopicId,
          questionCount,
        },
      },
      {
        onSuccess: (session) => {
          setLocation(`/practice/${session.id}`);
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } };
          setError(e?.data?.error ?? "Could not start practice. Try different criteria.");
        },
      },
    );
  };

  const activeSessions = (history?.active ?? []).slice(0, 4);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">Practice Mode</h1>

      {/* Row 1: New practice session | Resume practice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              New practice session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a course and optionally focus on a topic or subtopic.
            </p>

            <div className="space-y-2">
              <Label>Course</Label>
              <Select
                value={courseId?.toString() ?? ""}
                onValueChange={(v) => {
                  setCourseId(parseInt(v, 10));
                  setTopicId(null);
                  setSubtopicId(null);
                }}
              >
                <SelectTrigger data-testid="select-practice-course">
                  <SelectValue placeholder="Choose a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.courseCode} — {c.courseName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Topic</Label>
              <Select
                value={topicId?.toString() ?? "all"}
                onValueChange={(v) => {
                  setTopicId(v === "all" ? null : parseInt(v, 10));
                  setSubtopicId(null);
                }}
                disabled={!courseId}
              >
                <SelectTrigger data-testid="select-practice-topic">
                  <SelectValue placeholder="All topics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All topics</SelectItem>
                  {topLevelTopics.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.topicName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {courseId && topicId != null && subtopics.length > 0 && (
              <div className="space-y-2">
                <Label>Subtopic</Label>
                <Select
                  value={subtopicId?.toString() ?? "all"}
                  onValueChange={(v) =>
                    setSubtopicId(v === "all" ? null : parseInt(v, 10))
                  }
                >
                  <SelectTrigger data-testid="select-practice-subtopic">
                    <SelectValue placeholder="All subtopics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subtopics</SelectItem>
                    {subtopics.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.topicName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="count">Number of questions</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={50}
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(
                    Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  )
                }
                className="max-w-[120px]"
                data-testid="input-practice-count"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="text-practice-error">
                {error}
              </p>
            )}

            <Button
              onClick={start}
              disabled={generate.isPending}
              data-testid="btn-start-practice"
            >
              {generate.isPending ? "Starting..." : "Start practicing"}
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-resume-practice">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resume practice</CardTitle>
          </CardHeader>
          <CardContent>
            {activeSessions.length > 0 ? (
              <ul className="space-y-3">
                {activeSessions.map((s) => {
                  const pct =
                    s.totalQuestions > 0
                      ? Math.round((s.answeredCount / s.totalQuestions) * 100)
                      : 0;
                  return (
                    <li key={s.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-medium truncate block">
                            {s.courseName ?? `Course ${s.courseId}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {s.answeredCount}/{s.totalQuestions} answered
                          </span>
                        </div>
                        <Link
                          href={`/practice/${s.id}`}
                          className="text-primary hover:underline text-sm shrink-0"
                          data-testid={`link-resume-practice-${s.id}`}
                        >
                          Resume
                        </Link>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No practice sessions in progress.
                </p>
                <p className="text-xs text-muted-foreground">
                  Start a new session on the left to begin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: In progress | Completed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-practice-in-progress">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4 text-primary" />
              Practice in progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeSessions.length > 0 ? (
              <ul className="space-y-3">
                {activeSessions.map((s) => {
                  const pct = s.totalQuestions > 0
                    ? Math.round((s.answeredCount / s.totalQuestions) * 100)
                    : 0;
                  return (
                    <li key={s.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-medium truncate block">
                            {s.courseName ?? `Course ${s.courseId}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {s.answeredCount}/{s.totalQuestions} answered
                          </span>
                        </div>
                        <Link href={`/practice/${s.id}`} className="text-primary hover:underline text-sm shrink-0"
                          data-testid={`link-resume-${s.id}`}>
                          Resume
                        </Link>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No sessions in progress.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-practice-completed">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="w-4 h-4 text-primary" />
              Completed practice
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(history?.completed ?? []).length > 0 ? (
              <ul className="space-y-2">
                {(history?.completed ?? []).slice(0, 4).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.courseName ?? `Course ${s.courseId}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.correctCount}/{s.totalQuestions} correct
                        {s.earnedScore != null && ` · ${Math.round(s.earnedScore)}%`}
                      </p>
                    </div>
                    <Link href={`/practice/${s.id}/review`}
                      className="text-primary hover:underline text-sm shrink-0">
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No completed sessions yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
