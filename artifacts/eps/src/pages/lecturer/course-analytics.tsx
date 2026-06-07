import { Link, useLocation } from "wouter";
import {
  useGetLecturerCourseAnalytics,
  getGetLecturerCourseAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, AlertTriangle, TrendingDown, FileWarning } from "lucide-react";

function fmtScore(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function accuracyClass(pct: number): string {
  if (pct < 60) return "text-destructive";
  if (pct < 75) return "text-amber-600";
  return "text-emerald-600";
}

export default function LecturerCourseAnalytics({
  params,
}: {
  params: { courseId: string };
}) {
  const [, setLocation] = useLocation();
  const courseId = parseInt(params.courseId, 10);

  // Prefer the browser's previous page; fall back to the lecturer courses list
  // when there's no safe history to go back to (e.g. opened via direct link).
  const handleReturn = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/courses");
    }
  };
  const { data, isLoading, error } = useGetLecturerCourseAnalytics(courseId, {
    query: {
      queryKey: getGetLecturerCourseAnalyticsQueryKey(courseId),
      retry: false,
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (error || !data) {
    const status = (error as { status?: number } | null)?.status;
    return (
      <div className="max-w-2xl">
        <Card data-testid="card-course-analytics-error">
          <CardContent className="py-10 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-medium">
              {status === 403
                ? "You don't teach this course"
                : status === 404
                  ? "Course not found"
                  : "Unable to load course analytics"}
            </p>
            <p className="text-sm text-muted-foreground">
              {status === 403
                ? "Course analytics are only available for courses you teach."
                : "Please go back and try another course."}
            </p>
            <Link
              href="/"
              className="inline-block text-sm font-medium text-primary"
            >
              ← Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const topics = data.topicPerformance ?? [];
  const problematic = data.problematicQuestions ?? [];
  const mostFailed = data.mostFailedQuestions ?? [];
  const gaps = data.contentGaps ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight truncate">
              {data.courseName}
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReturn}
          className="inline-flex shrink-0 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent h-10 px-4 py-2"
          data-testid="btn-return"
        >
          Return
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card data-testid="metric-course-average">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Class average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtScore(data.averageScore)}</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-course-students">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.studentsCount}</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-course-problematic">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Problematic questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{problematic.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-topic-performance">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="w-4 h-4 text-primary" />
            Topic performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topics.length ? (
            <div className="space-y-2">
              {topics.map((t) => (
                <div
                  key={t.topicId}
                  className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                  data-testid={`course-topic-${t.topicId}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t.topicName ?? `Topic ${t.topicId}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.attemptsCount} attempts · {t.weakStudentsCount} student
                      {t.weakStudentsCount === 1 ? "" : "s"} below threshold
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold shrink-0 ${accuracyClass(
                      t.averageAccuracy,
                    )}`}
                  >
                    {Math.round(t.averageAccuracy)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Topic performance appears once students have enough graded
              answers.
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-problematic-questions">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Most failed questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mostFailed.length ? (
            <div className="space-y-3">
              {mostFailed.map((q) => (
                <div
                  key={q.questionId}
                  className="flex items-start justify-between gap-4 border-b pb-3 last:border-0"
                  data-testid={`problematic-question-${q.questionId}`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium line-clamp-2">
                      {q.questionPreview}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {q.topicName && <span>{q.topicName}</span>}
                      {q.difficultyLevel && <span>{q.difficultyLevel}</span>}
                      <span>{q.attemptsCount} attempts</span>
                      <span className="text-destructive font-medium">
                        {Math.round(q.incorrectRate)}% incorrect
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/lecturer/questions/${q.questionId}/edit`}
                    className="text-sm font-medium text-primary hover:underline shrink-0"
                    data-testid={`link-view-question-${q.questionId}`}
                  >
                    View Question
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No questions meet the failure threshold yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-content-gaps">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="w-4 h-4 text-amber-600" />
            Content gaps
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gaps.length ? (
            <ul className="space-y-2">
              {gaps.map((g, i) => (
                <li
                  key={`${g.topicId ?? "none"}-${i}`}
                  className="text-sm border-b pb-2 last:border-0"
                  data-testid={`content-gap-${i}`}
                >
                  {g.topicName && (
                    <span className="font-medium">{g.topicName}: </span>
                  )}
                  <span className="text-muted-foreground">{g.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No content gaps detected for this course.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
