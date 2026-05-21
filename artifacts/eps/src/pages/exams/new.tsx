import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useGetUserCourses,
  useListCourseTopics,
  useGenerateExam,
  getGetUserCoursesQueryKey,
  getListCourseTopicsQueryKey,
} from "@workspace/api-client-react";
import { getAuthUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ExamNew() {
  const user = getAuthUser();
  const [, setLocation] = useLocation();
  const { data: courses } = useGetUserCourses(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserCoursesQueryKey(user?.id ?? 0) },
  });
  const [courseId, setCourseId] = useState<number | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<number[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState<"any" | "Easy" | "Medium" | "Hard">(
    "any",
  );
  const [duration, setDuration] = useState<number | null>(30);
  const [error, setError] = useState<string | null>(null);
  const MIN_QUESTIONS = 5;

  const { data: topics } = useListCourseTopics(courseId ?? 0, {
    query: { enabled: !!courseId, queryKey: getListCourseTopicsQueryKey(courseId ?? 0) },
  });

  const generate = useGenerateExam();
  const courseLabel = useMemo(
    () => courses?.find((c) => c.id === courseId),
    [courses, courseId],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!courseId) {
      setError("Please choose a course");
      return;
    }
    if (totalQuestions < MIN_QUESTIONS) {
      setError(`A mock exam must have at least ${MIN_QUESTIONS} questions.`);
      return;
    }
    generate.mutate(
      {
        data: {
          courseId,
          topicIds: selectedTopics,
          totalQuestions,
          difficultyLevel: difficulty === "any" ? null : difficulty,
          durationMinutes: duration,
        },
      },
      {
        onSuccess: (exam) => {
          setLocation(`/exams/${exam.id}/take`);
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } };
          setError(e?.data?.error ?? "Failed to generate exam");
        },
      },
    );
  };

  const toggleTopic = (id: number) => {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Generate Mock Exam</h1>
      </div>
      <form onSubmit={submit} className="space-y-6" data-testid="form-generate-exam">
        <Card>
          <CardHeader>
            <CardTitle>Course</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={courseId?.toString() ?? ""}
              onValueChange={(v) => {
                setCourseId(parseInt(v, 10));
                setSelectedTopics([]);
              }}
            >
              <SelectTrigger data-testid="select-course">
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
            {courseLabel && (
              <p className="text-xs text-muted-foreground mt-2">
                {courseLabel.semester ?? ""} {courseLabel.academicYear ?? ""}
              </p>
            )}
          </CardContent>
        </Card>

        {courseId && (
          <Card>
            <CardHeader>
              <CardTitle>Topics (optional)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Leave empty to draw from all approved questions
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {topics?.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 p-2 rounded-md border hover:bg-accent cursor-pointer"
                    data-testid={`label-topic-${t.id}`}
                  >
                    <Checkbox
                      checked={selectedTopics.includes(t.id)}
                      onCheckedChange={() => toggleTopic(t.id)}
                      data-testid={`checkbox-topic-${t.id}`}
                    />
                    <span className="text-sm">{t.topicName}</span>
                  </label>
                ))}
                {topics?.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2">
                    No topics defined for this course
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Exam Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="total">Number of questions</Label>
              <Input
                id="total"
                type="number"
                min={MIN_QUESTIONS}
                max={100}
                value={totalQuestions}
                onChange={(e) =>
                  setTotalQuestions(
                    parseInt(e.target.value, 10) || MIN_QUESTIONS,
                  )
                }
                data-testid="input-total-questions"
              />
              <p className="text-xs text-muted-foreground">
                Minimum {MIN_QUESTIONS} questions per exam.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Questions Difficulty</Label>
              <Select
                value={difficulty}
                onValueChange={(v) =>
                  setDifficulty(v as "any" | "Easy" | "Medium" | "Hard")
                }
              >
                <SelectTrigger data-testid="select-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any difficulty (mixed)</SelectItem>
                  <SelectItem value="Easy">Easy only · 5 pts each</SelectItem>
                  <SelectItem value="Medium">Medium only · 10 pts each</SelectItem>
                  <SelectItem value="Hard">Hard only · 15 pts each</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes, blank for untimed)</Label>
              <Input
                id="duration"
                type="number"
                min={0}
                value={duration ?? ""}
                onChange={(e) =>
                  setDuration(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                data-testid="input-duration"
              />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setLocation("/exams")}
            data-testid="btn-cancel-exam"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={generate.isPending}
            data-testid="btn-generate-exam"
          >
            {generate.isPending ? "Generating..." : "Generate Exam"}
          </Button>
        </div>
      </form>
    </div>
  );
}
