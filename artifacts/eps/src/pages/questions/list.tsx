import { useState } from "react";
import { Link, useSearchParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuestions,
  useListCourses,
  useArchiveQuestion,
  getListQuestionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "_all";
const STATUSES = ["draft", "approved", "archived"] as const;
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const PENDING_STATUSES = ["draft", "pending"] as const;

export default function QuestionsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = searchParams.get("courseId") ?? ALL;
  const difficulty = (() => {
    const v = searchParams.get("difficulty");
    return v && (DIFFICULTIES as readonly string[]).includes(v) ? v : ALL;
  })();
  const status = (() => {
    const v = searchParams.get("status");
    return v && (STATUSES as readonly string[]).includes(v) ? v : ALL;
  })();

  const setParam = (key: string, value: string) => {
    setSearchParams(
      (sp) => {
        const out = new URLSearchParams(sp);
        if (!value || value === ALL) out.delete(key);
        else out.set(key, value);
        return out;
      },
      { replace: true },
    );
  };
  const setCourseId = (v: string) => setParam("courseId", v);
  const setDifficulty = (v: string) => setParam("difficulty", v);
  const setStatus = (v: string) => setParam("status", v);

  const [q, setQ] = useState("");
  const me = getAuthUser();
  const isPrivileged = me?.role === "lecturer" || me?.role === "admin";
  const isLecturer = me?.role === "lecturer";
  const isAdmin = me?.role === "admin";

  const params = {
    ...(courseId !== ALL ? { courseId: parseInt(courseId, 10) } : {}),
    ...(difficulty !== ALL
      ? { difficulty: difficulty as "Easy" | "Medium" | "Hard" }
      : {}),
    ...(status !== ALL
      ? { status: status as "draft" | "approved" | "archived" }
      : {}),
    // Server `q` matches title/text only. For privileged users we expand the
    // search to course/program/lecturer fields on the client below, so skip
    // server-side `q` filtering in that case to avoid losing those matches.
    ...(q && !(me?.role === "lecturer" || me?.role === "admin")
      ? { q }
      : {}),
  };

  const { data: courses } = useListCourses();
  const { data: serverQuestions, isLoading } = useListQuestions(params);
  // Unfiltered set, used to populate the course-overview index for lecturer/admin.
  const { data: allQuestions } = useListQuestions();

  // Build a lookup of course → { programName, lecturerName, courseCode,
  // courseName } so we can search question rows by their parent course's
  // program/lecturer (admins/lecturers).
  const courseMeta = new Map<
    number,
    {
      courseCode: string;
      courseName: string;
      programName?: string | null;
      lecturerName?: string | null;
    }
  >();
  for (const c of courses ?? []) {
    courseMeta.set(c.id, {
      courseCode: c.courseCode,
      courseName: c.courseName,
      programName: c.programName ?? null,
      lecturerName: c.lecturerName ?? null,
    });
  }

  const isPrivilegedSearch =
    (me?.role === "lecturer" || me?.role === "admin") && q.trim().length > 0;
  const questions = isPrivilegedSearch
    ? (allQuestions ?? []).filter((qu) => {
        if (
          courseId !== ALL &&
          qu.courseId !== parseInt(courseId, 10)
        )
          return false;
        if (difficulty !== ALL && qu.difficultyLevel !== difficulty) return false;
        if (status !== ALL && qu.status !== status) return false;
        const needle = q.trim().toLowerCase();
        const meta = courseMeta.get(qu.courseId);
        const hay = [
          qu.title,
          qu.questionText,
          qu.topicName ?? "",
          qu.courseName ?? meta?.courseName ?? "",
          meta?.courseCode ?? "",
          meta?.programName ?? "",
          meta?.lecturerName ?? "",
        ]
          .join(" \u0000 ")
          .toLowerCase();
        return hay.includes(needle);
      })
    : serverQuestions;
  const archive = useArchiveQuestion();
  const queryClient = useQueryClient();

  // When no course is selected and no other filters are active, show the
  // course-cards overview + pending approval shortcut for lecturers/admins.
  // Any active filter (status/difficulty/search) leaves overview so users can
  // see the resulting filtered list (e.g. pending-approval shortcut).
  const showOverview =
    isPrivileged &&
    courseId === ALL &&
    status === ALL &&
    difficulty === ALL &&
    !q;

  // Per-course question counts derived from the unfiltered query.
  const countsByCourse = new Map<number, number>();
  for (const q of allQuestions ?? []) {
    countsByCourse.set(q.courseId, (countsByCourse.get(q.courseId) ?? 0) + 1);
  }
  const pendingCount = (allQuestions ?? []).filter((q) =>
    (PENDING_STATUSES as readonly string[]).includes(q.status),
  ).length;

  const handleArchive = (id: number) => {
    archive.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListQuestionsQueryKey(params),
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Question Bank</h1>
          {(status !== ALL || difficulty !== ALL || courseId !== ALL) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status !== ALL && (
                <FilterChip
                  label="Status"
                  value={status}
                  onClear={() => setStatus(ALL)}
                />
              )}
              {difficulty !== ALL && (
                <FilterChip
                  label="Difficulty"
                  value={difficulty}
                  onClear={() => setDifficulty(ALL)}
                />
              )}
              {courseId !== ALL && (
                <FilterChip
                  label="Course"
                  value={courseId}
                  onClear={() => setCourseId(ALL)}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setStatus(ALL);
                  setDifficulty(ALL);
                  setCourseId(ALL);
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
                data-testid="btn-clear-filters"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPrivileged && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatus("draft")}
              className="relative"
              data-testid="btn-pending-approval"
            >
              Questions for approval
              {pendingCount > 0 && (
                <span
                  className="absolute -top-2 -right-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none"
                  data-testid="badge-pending-count"
                >
                  {pendingCount}
                </span>
              )}
            </Button>
          )}
          {!isAdmin && (
            <Link href="/lecturer/questions/new">
              <Button data-testid="btn-new-question">New Question</Button>
            </Link>
          )}
        </div>
      </div>

      {showOverview && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses?.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCourseId(c.id.toString())}
                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                data-testid={`card-course-questions-${c.id}`}
              >
                <Card className="cursor-pointer transition hover:shadow-md hover:border-primary/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span>{c.courseCode}</span>
                      <Badge variant="outline">
                        {countsByCourse.get(c.id) ?? 0}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {c.courseName}
                    </p>
                    {/* Lecturer view: show Program only.
                        Admin view: show Lecturer + Program. */}
                    {!isLecturer && c.lecturerName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Lecturer: {c.lecturerName}
                      </p>
                    )}
                    {c.programName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Program: {c.programName}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </button>
            ))}
            {courses?.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No courses available.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!showOverview && courseId !== ALL && (
        <button
          type="button"
          onClick={() => setCourseId(ALL)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          data-testid="btn-back-to-courses"
        >
          <ChevronLeft className="w-4 h-4" /> Back to courses
        </button>
      )}

      {!showOverview && (
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            placeholder="Search title or text..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-search-questions"
          />
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger data-testid="select-filter-course">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All courses</SelectItem>
              {courses?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.courseCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger data-testid="select-filter-difficulty">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All difficulties</SelectItem>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      )}

      {!showOverview && isLoading && <p>Loading...</p>}

      {!showOverview && (
      <div className="space-y-3">
        {questions?.map((q) => (
          <Card key={q.id} data-testid={`card-question-${q.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{q.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {q.courseName ?? `Course ${q.courseId}`}
                    {q.topicName ? ` · ${q.topicName}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Badge variant="outline">{q.difficultyLevel}</Badge>
                  <Badge
                    variant={
                      q.status === "approved"
                        ? "default"
                        : q.status === "archived"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {q.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {q.questionText}
              </p>
              <div className="flex gap-2">
                <Link href={`/lecturer/questions/${q.id}/edit`}>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`btn-edit-${q.id}`}
                  >
                    Edit
                  </Button>
                </Link>
                {q.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchive(q.id)}
                    disabled={archive.isPending}
                    data-testid={`btn-archive-${q.id}`}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && questions?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No questions match these filters.
            </CardContent>
          </Card>
        )}
      </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1 hover:bg-primary/20 transition-colors"
      data-testid={`chip-${label.toLowerCase()}`}
    >
      {label}: <span className="capitalize font-medium">{value}</span>
      <X className="w-3 h-3" />
    </button>
  );
}
