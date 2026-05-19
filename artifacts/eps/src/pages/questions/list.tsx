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
// Statuses selectable in regular (non-approval) mode — draft/pending live in
// the dedicated approval flow.
const REGULAR_STATUSES = ["approved", "archived"] as const;
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const PENDING_STATUSES = ["draft", "pending"] as const;

export default function QuestionsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = searchParams.get("courseId") ?? ALL;
  const difficulty = (() => {
    const v = searchParams.get("difficulty");
    return v && (DIFFICULTIES as readonly string[]).includes(v) ? v : ALL;
  })();
  // Approval mode is a UI flag carried in the URL (?approval=1). It does not
  // change any server scope: server still enforces role-based access. We
  // additionally filter to pending/draft questions client-side and (for
  // lecturers) restrict to createdBy === me.id.
  const approval = searchParams.get("approval") === "1";
  // In approval mode the status filter is locked (pending/draft) and not
  // user-controllable; in regular mode the UI only exposes Approved/Archived.
  const status = (() => {
    if (approval) return ALL;
    const v = searchParams.get("status");
    // Outside approval mode only Approved/Archived are addressable via URL;
    // pending/draft are reachable only through the approval flow.
    return v && (REGULAR_STATUSES as readonly string[]).includes(v) ? v : ALL;
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
  const enterApproval = () => {
    setSearchParams(
      (sp) => {
        const out = new URLSearchParams(sp);
        out.set("approval", "1");
        out.delete("courseId");
        out.delete("status");
        out.delete("difficulty");
        return out;
      },
      { replace: true },
    );
  };
  const exitApproval = () => {
    setSearchParams(
      (sp) => {
        const out = new URLSearchParams(sp);
        out.delete("approval");
        out.delete("courseId");
        return out;
      },
      { replace: true },
    );
  };
  // Selected-course "Return" goes back to the course-cards overview within
  // the current mode (regular or approval), preserving approval=1 if set.
  const returnToOverview = () => {
    setSearchParams(
      (sp) => {
        const out = new URLSearchParams(sp);
        out.delete("courseId");
        return out;
      },
      { replace: true },
    );
  };

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
  // Pending/draft questions in scope for the current viewer. Lecturers only
  // see their own pending items; admins see everything pending. This is the
  // source for both the course-card pending counts in approval mode and the
  // approval-mode selected-course question list.
  const pendingScoped = (allQuestions ?? []).filter((qu) => {
    if (!(PENDING_STATUSES as readonly string[]).includes(qu.status))
      return false;
    if (isLecturer && me && qu.createdBy !== me.id) return false;
    return true;
  });
  // In approval mode the question list is always derived from the
  // pending-scoped client set (so lecturer scoping by createdBy is applied
  // consistently). Selected-course view further narrows to that course.
  const baseList = approval
    ? pendingScoped.filter((qu) =>
        courseId !== ALL ? qu.courseId === parseInt(courseId, 10) : true,
      )
    : isPrivilegedSearch
      ? (allQuestions ?? [])
      : (serverQuestions ?? []);
  const questions = (
    approval || isPrivilegedSearch
      ? baseList.filter((qu) => {
          if (
            courseId !== ALL &&
            qu.courseId !== parseInt(courseId, 10)
          )
            return false;
          if (difficulty !== ALL && qu.difficultyLevel !== difficulty)
            return false;
          if (!approval && status !== ALL && qu.status !== status) return false;
          if (!q.trim()) return true;
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
      : baseList
  ).filter((qu) => {
    // Outside approval mode, the Question Bank (overview + selected-course
    // view) hides draft/pending items for privileged users — drafts are only
    // reachable through the "Questions for approval" flow. Students go through
    // their own queries (server already filters to approved), so this is a
    // no-op for them.
    if (approval) return true;
    if (isPrivileged && (PENDING_STATUSES as readonly string[]).includes(qu.status))
      return false;
    return true;
  });
  const archive = useArchiveQuestion();
  const queryClient = useQueryClient();

  // Course-cards overview is shown when no course is selected. In regular
  // mode we also gate it on the other filters being empty so an explicit
  // status/difficulty filter drops the user into the flat list. In approval
  // mode the overview is always shown when no course is selected.
  const showOverview =
    isPrivileged &&
    courseId === ALL &&
    (approval || (status === ALL && difficulty === ALL && !q));

  // Per-course pending counts (used in approval-mode overview).
  const pendingByCourse = new Map<number, number>();
  for (const qu of pendingScoped) {
    pendingByCourse.set(
      qu.courseId,
      (pendingByCourse.get(qu.courseId) ?? 0) + 1,
    );
  }
  // Per-course total counts (used in regular-mode overview).
  const countsByCourse = new Map<number, number>();
  for (const qu of allQuestions ?? []) {
    countsByCourse.set(qu.courseId, (countsByCourse.get(qu.courseId) ?? 0) + 1);
  }
  const pendingCount = pendingScoped.length;
  // Courses to show in the approval-mode overview: only those with pending.
  const approvalCourses = (courses ?? []).filter(
    (c) => (pendingByCourse.get(c.id) ?? 0) > 0,
  );
  // The selected course (when a card has been opened) — used for the title
  // in the selected-course view.
  const selectedCourse =
    courseId !== ALL
      ? (courses ?? []).find((c) => c.id === parseInt(courseId, 10))
      : undefined;

  const handleArchive = (id: number) => {
    archive.mutate(
      { id },
      {
        onSuccess: () => {
          // Invalidate every variant of the questions list (filtered list,
          // unfiltered allQuestions used for overview counts / approval scope)
          // so pending badges and approval-mode views update immediately.
          queryClient.invalidateQueries({
            queryKey: getListQuestionsQueryKey().slice(0, 1),
          });
        },
      },
    );
  };

  // Header title varies per mode/view.
  const pageTitle = approval
    ? selectedCourse
      ? `${selectedCourse.courseCode} - ${selectedCourse.courseName}`
      : "Questions for approval"
    : selectedCourse
      ? `${selectedCourse.courseCode} - ${selectedCourse.courseName}`
      : "Question Bank";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <div className="flex items-center gap-2">
          {/* Action area: differs by mode/view. */}
          {selectedCourse ? (
            // Selected-course view (regular or approval): only Return.
            <Button
              type="button"
              onClick={returnToOverview}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="btn-return"
            >
              Return
            </Button>
          ) : approval ? (
            // Approval overview: only Return (back to regular Question Bank).
            <Button
              type="button"
              onClick={exitApproval}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="btn-return"
            >
              Return
            </Button>
          ) : (
            // Regular overview: Questions for approval + (lecturer) New Question.
            <>
              {isPrivileged && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={enterApproval}
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
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="btn-new-question"
                  >
                    Create Question
                  </Button>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {showOverview && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(approval ? approvalCourses : (courses ?? [])).map((c) => {
              const count = approval
                ? (pendingByCourse.get(c.id) ?? 0)
                : (countsByCourse.get(c.id) ?? 0);
              return (
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
                        <Badge
                          variant={approval && count > 0 ? "destructive" : "outline"}
                        >
                          {count}
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
              );
            })}
            {!approval && courses?.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No courses available.
                </CardContent>
              </Card>
            )}
            {approval && approvalCourses.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No questions are waiting for approval.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!showOverview && (
      <Card>
        <CardContent
          className={`pt-6 grid grid-cols-1 gap-3 ${
            approval ? "md:grid-cols-2" : "md:grid-cols-3"
          }`}
        >
          <Input
            placeholder="Search title or text..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-search-questions"
          />
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
          {/* Regular selected-course view only exposes Approved/Archived;
              Draft/Pending live in the Questions-for-approval flow. */}
          {!approval && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          )}
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

