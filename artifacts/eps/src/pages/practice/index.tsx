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
import { Sparkles, Target, History, Lightbulb } from "lucide-react";

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

  const activeSessions = history?.active ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Target className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Practice Mode</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            New practice session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {courseId && (
            <div className="space-y-2">
              <Label>Topic (optional)</Label>
              <Select
                value={topicId?.toString() ?? "all"}
                onValueChange={(v) => {
                  setTopicId(v === "all" ? null : parseInt(v, 10));
                  setSubtopicId(null);
                }}
              >
                <SelectTrigger data-testid="select-practice-topic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All topics (mixed)</SelectItem>
                  {topLevelTopics.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.topicName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {courseId && topicId != null && subtopics.length > 0 && (
            <div className="space-y-2">
              <Label>Subtopic (optional)</Label>
              <Select
                value={subtopicId?.toString() ?? "all"}
                onValueChange={(v) =>
                  setSubtopicId(v === "all" ? null : parseInt(v, 10))
                }
              >
                <SelectTrigger data-testid="select-practice-subtopic">
                  <SelectValue />
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
              data-testid="input-practice-count"
            />
            <p className="text-xs text-muted-foreground">
              Up to 50 questions, drawn from approved questions for your selection.
            </p>
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

      {activeSessions.length > 0 && (
        <Card data-testid="card-unfinished-practice">
          <CardHeader>
            <CardTitle>Resume practice</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {activeSessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span className="text-sm">
                    {s.courseName ?? `Course ${s.courseId}`}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.answeredCount}/{s.totalQuestions} answered
                    </span>
                  </span>
                  <Link
                    href={`/practice/${s.id}`}
                    className="text-primary hover:underline text-sm"
                    data-testid={`link-resume-practice-${s.id}`}
                  >
                    Resume
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/practice/history" className="block">
          <Card className="h-full cursor-pointer transition hover:shadow-md hover:border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="w-4 h-4" />
                Practice history
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Review your past sessions and accuracy.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full opacity-70" data-testid="card-weak-areas">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="w-4 h-4" />
              Weak areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Available after more practice data is collected.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
