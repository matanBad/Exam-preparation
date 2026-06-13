import {
  useGetCourse,
  useListCourseTopics,
  useCreateTopic,
  useUpdateTopic,
  useDeleteTopic,
  useListCourseMembers,
  useListCourseStudents,
  useAddCourseMember,
  useRemoveCourseMember,
  useListUsers,
  useGetLecturerCourseAnalytics,
  useGetStudentDashboardAnalytics,
  useGetStudentProgressOverTime,
  useGetPracticeHistory,
  useGetUserExams,
  getListCourseTopicsQueryKey,
  getGetCourseQueryKey,
  getListCourseMembersQueryKey,
  getListCourseStudentsQueryKey,
  getGetLecturerCourseAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/auth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingDown,
  AlertTriangle,
  FileWarning,
  Users,
  ChevronRight,
} from "lucide-react";

function fmtScore(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function accuracyClass(pct: number): string {
  if (pct < 60) return "text-destructive";
  if (pct < 75) return "text-amber-600";
  return "text-emerald-600";
}

type Topic = {
  id: number;
  topicName: string;
  parentTopicId?: number | null;
};

const WEAKNESS_STYLES: Record<string, string> = {
  weak: "bg-destructive/10 text-destructive border-destructive/20",
  needs_practice: "bg-amber-100 text-amber-700 border-amber-200",
  strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const WEAKNESS_LABEL: Record<string, string> = {
  weak: "Weak",
  needs_practice: "Needs Practice",
  strong: "Strong",
};

const TOPIC_MIN_ATTEMPTS = 3;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Student-specific course detail view: shows course-scoped analytics,
// topics (read-only), topic performance, progress over time, and recent/unfinished activity.
function StudentCourseView({
  courseId,
  courseName,
  courseCode,
  topics,
}: {
  courseId: number;
  courseName: string;
  courseCode?: string | null;
  topics: Topic[];
}) {
  const user = getAuthUser();

  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [studentTopicSearch, setStudentTopicSearch] = useState("");
  const toggleTopic = useCallback((id: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const roots = useMemo(
    () => topics.filter((t) => t.parentTopicId == null),
    [topics],
  );
  const childrenOf = useCallback(
    (id: number) => topics.filter((t) => t.parentTopicId === id),
    [topics],
  );

  const { data: analytics } = useGetStudentDashboardAnalytics();
  const { data: progressData } = useGetStudentProgressOverTime();
  const { data: history } = useGetPracticeHistory();
  const { data: exams } = useGetUserExams(user?.id ?? 0);

  // Filter progress trend to this course only
  const courseTrend = (progressData ?? [])
    .filter((p) => p.courseId === courseId)
    .map((p, i) => ({
      i,
      name: fmtDate(p.date),
      score: Math.round(p.score),
      label: p.label,
    }));

  // Filter topic performance to this course
  const courseTopicPerf = (analytics?.topicPerformance ?? []).filter(
    (t) => t.courseId === courseId,
  );

  // Average scores: split practice vs exams using progressData
  const examPoints = (progressData ?? []).filter(
    (p) => p.courseId === courseId && p.type === "exam",
  );
  const practicePoints = (progressData ?? []).filter(
    (p) => p.courseId === courseId && p.type === "practice",
  );

  const avgExam =
    examPoints.length > 0
      ? Math.round(examPoints.reduce((s, p) => s + p.score, 0) / examPoints.length)
      : null;
  const avgPractice =
    practicePoints.length > 0
      ? Math.round(practicePoints.reduce((s, p) => s + p.score, 0) / practicePoints.length)
      : null;

  // Course-scoped exams and practice
  const courseExams = (exams ?? []).filter(
    (e) => e.courseId === courseId,
  );
  const completedExams = courseExams.filter((e) => e.status === "submitted");
  const unfinishedExams = courseExams.filter((e) => e.status !== "submitted");

  const activePractice = (history?.active ?? []).filter(
    (s) => s.courseId === courseId,
  );

  // Per-course readiness: calculated from course-specific data only
  const courseAttempts = [...examPoints, ...practicePoints];
  const hasEnoughCourseData = courseAttempts.length >= 2;
  let courseReadiness: number | null = null;
  let courseReadinessLabel = "";
  if (hasEnoughCourseData) {
    const avgScore = courseAttempts.reduce((s, p) => s + p.score, 0) / courseAttempts.length;
    const weakPenalty = courseTopicPerf.filter(
      (t) => t.weaknessLevel === "weak" && (t.attemptsCount ?? 0) >= TOPIC_MIN_ATTEMPTS
    ).length * 8;
    courseReadiness = Math.max(0, Math.min(100, Math.round(avgScore - weakPenalty)));
    if (courseReadiness >= 75) courseReadinessLabel = "Good — keep practicing";
    else if (courseReadiness >= 50) courseReadinessLabel = "Getting there";
    else courseReadinessLabel = "Needs more work";
  }

  return (
    <div className="space-y-6">
      {/* Course-scoped summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card data-testid="metric-avg-exams">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Average Score — Exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {avgExam != null ? `${avgExam}%` : "—"}
            </p>
            {examPoints.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Not enough data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="metric-avg-practice">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Average Score — Practice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {avgPractice != null ? `${avgPractice}%` : "—"}
            </p>
            {practicePoints.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Not enough data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="metric-course-readiness">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasEnoughCourseData && courseReadiness != null ? (
              <>
                <p className={`text-2xl font-bold ${
                  courseReadiness >= 75 ? "text-emerald-600" :
                  courseReadiness >= 50 ? "text-amber-600" :
                  "text-destructive"
                }`}>
                  {courseReadiness}/100
                </p>
                <p className="text-xs text-muted-foreground mt-1">{courseReadinessLabel}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      courseReadiness >= 75 ? "bg-emerald-500" :
                      courseReadiness >= 50 ? "bg-amber-500" :
                      "bg-destructive"
                    }`}
                    style={{ width: `${courseReadiness}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">—</p>
                <p className="text-xs text-muted-foreground mt-1">Not enough data yet</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Topics (course structure) and Topic Performance (student results) — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-student-topics">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Topics</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search topics or subtopics..."
              value={studentTopicSearch}
              onChange={(e) => setStudentTopicSearch(e.target.value)}
              className="mb-4"
              data-testid="input-search-topics-student"
            />
            {(() => {
              const q = studentTopicSearch.toLowerCase();
              const filteredRoots = roots.filter((root) => {
                if (!q) return true;
                if (root.topicName.toLowerCase().includes(q)) return true;
                return childrenOf(root.id).some((c) => c.topicName.toLowerCase().includes(q));
              });
              return filteredRoots.length ? (
                <ul className="space-y-2">
                  {filteredRoots.map((root) => {
                    const children = childrenOf(root.id);
                    const hasChildren = children.length > 0;
                    const isOpen = expandedTopics.has(root.id);
                    return (
                      <li key={root.id} className="border rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={() => hasChildren ? toggleTopic(root.id) : undefined}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-left ${hasChildren ? "hover:bg-accent cursor-pointer" : "cursor-default"}`}
                          aria-expanded={hasChildren ? isOpen : undefined}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {hasChildren ? (
                              <i
                                className={`ti ${isOpen ? "ti-chevron-down" : "ti-chevron-right"}`}
                                style={{ fontSize: 14, color: isOpen ? "#534AB7" : "var(--muted-foreground)" }}
                                aria-hidden="true"
                              />
                            ) : (
                              <i className="ti ti-minus" style={{ fontSize: 14, color: "var(--muted-foreground)" }} aria-hidden="true" />
                            )}
                            {root.topicName}
                            <span className="text-xs text-muted-foreground font-normal">({children.length})</span>
                          </span>
                        </button>
                        {isOpen && hasChildren && (
                          <div className="border-t px-3 pb-2 pt-1">
                            <ul className="space-y-1">
                              {children.map((sub) => (
                                <li key={sub.id} className="text-xs text-muted-foreground py-1 border-b last:border-0">
                                  {sub.topicName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {q ? `No topics match "${studentTopicSearch}".` : "No topics yet."}
                </p>
              );
            })()}
          </CardContent>
        </Card>

        <Card data-testid="card-student-topic-performance">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Topic Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {courseTopicPerf.length ? (
              <ul className="space-y-2">
                {courseTopicPerf.map((t) => {
                  const key = `${t.topicId}-${t.subtopicId}`;
                  const enoughData = (t.attemptsCount ?? 0) >= TOPIC_MIN_ATTEMPTS;
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                    >
                      <p className="truncate text-sm">
                        {t.subtopicName ?? t.topicName ?? "Topic"}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium">
                          {enoughData ? `${Math.round(t.accuracyRate)}%` : "—"}
                        </span>
                        {enoughData ? (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${
                              WEAKNESS_STYLES[t.weaknessLevel] ?? WEAKNESS_STYLES.strong
                            }`}
                          >
                            {WEAKNESS_LABEL[t.weaknessLevel] ?? t.weaknessLevel}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                            Not enough data
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Topic performance appears once you have enough graded answers.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress over time — scoped to this course */}
      <Card data-testid="card-student-progress-over-time">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Progress Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {courseTrend.length >= 2 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={courseTrend}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 100]} fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Score"]}
                    labelFormatter={(_, p) => p?.[0]?.payload?.label ?? ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Not enough progress data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bottom: Recent Exams | Unfinished Exams | Unfinished Practice — course scoped */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-student-recent-exams">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Exams</CardTitle>
            <Link href="/exams" className="text-xs text-primary hover:underline shrink-0">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {completedExams.length ? (
              <ul className="space-y-2">
                {completedExams.slice(0, 3).map((e) => (
                  <li key={e.id} className="border-b pb-2 last:border-0">
                    <Link
                      href={`/exams/${e.id}/review`}
                      className="text-sm hover:text-primary transition-colors"
                    >
                      {e.courseName ?? `Exam ${e.id}`}
                      {e.score != null && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          — {e.score}%
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No completed exams for this course.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-student-unfinished-exams">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unfinished Exams</CardTitle>
          </CardHeader>
          <CardContent>
            {unfinishedExams.length ? (
              <ul className="space-y-2">
                {unfinishedExams.slice(0, 3).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                  >
                    <p className="truncate text-sm font-medium">
                      {e.courseName ?? `Exam ${e.id}`}
                    </p>
                    <Link
                      href={`/exams/${e.id}/take`}
                      className="text-sm text-primary hover:underline shrink-0"
                    >
                      Continue
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No exams in progress.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-student-unfinished-practice">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unfinished Practice</CardTitle>
          </CardHeader>
          <CardContent>
            {activePractice.length ? (
              <ul className="space-y-3">
                {activePractice.slice(0, 3).map((s) => {
                  const pct =
                    s.totalQuestions > 0
                      ? Math.round((s.answeredCount / s.totalQuestions) * 100)
                      : 0;
                  return (
                    <li key={s.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium truncate">
                          {s.courseName ?? `Course ${s.courseId}`}
                        </span>
                        <Link
                          href={`/practice/${s.id}`}
                          className="text-sm text-primary hover:underline shrink-0"
                        >
                          Continue
                        </Link>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {s.answeredCount}/{s.totalQuestions}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No practice in progress.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CourseDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { data: course, isLoading: loadingCourse } = useGetCourse(id, {
    query: { enabled: !!id, queryKey: getGetCourseQueryKey(id) },
  });
  const { data: topics, isLoading: loadingTopics } = useListCourseTopics(id, {
    query: { enabled: !!id, queryKey: getListCourseTopicsQueryKey(id) },
  });
  const user = getAuthUser();
  const isPrivileged = user?.role === "lecturer" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const isLecturer = user?.role === "lecturer";
  const isStudent = user?.role === "student";
  const [, setLocation] = useLocation();

  // Prefer the browser's previous page; fall back to the courses list when
  // there is no safe history to go back to (e.g. opened via a direct link).
  const handleReturn = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/courses");
    }
  };

  // Course-specific analytics + enrolled students are lecturer-only views,
  // merged into this unified course details page. `retry: false` keeps a 403
  // (lecturer doesn't teach the course) from spamming requests.
  const { data: analytics } = useGetLecturerCourseAnalytics(id, {
    query: {
      enabled: !!id && isLecturer,
      queryKey: getGetLecturerCourseAnalyticsQueryKey(id),
      retry: false,
    },
  });
  const { data: courseStudents } = useListCourseStudents(id, {
    query: {
      enabled: !!id && isLecturer,
      queryKey: getListCourseStudentsQueryKey(id),
      retry: false,
    },
  });

  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const queryClient = useQueryClient();

  const { data: members } = useListCourseMembers(id, {
    query: {
      enabled: !!id && isAdmin,
      queryKey: getListCourseMembersQueryKey(id),
    },
  });
  const { data: allUsers } = useListUsers(
    {},
    { query: { enabled: isAdmin, queryKey: ["/api/admin/users"] as const } },
  );
  const addMember = useAddCourseMember();
  const removeMember = useRemoveCourseMember();
  const [memberToAdd, setMemberToAdd] = useState<number | "">("");

  const refreshMembers = () =>
    queryClient.invalidateQueries({
      queryKey: getListCourseMembersQueryKey(id),
    });

  const memberIds = new Set((members ?? []).map((m) => m.id));
  const assignable = (allUsers ?? []).filter(
    (u) =>
      (u.role === "student" || u.role === "lecturer") && !memberIds.has(u.id),
  );

  const handleAddMember = () => {
    if (memberToAdd === "") return;
    addMember.mutate(
      { id, data: { userId: memberToAdd } },
      {
        onSuccess: () => {
          refreshMembers();
          setMemberToAdd("");
        },
      },
    );
  };

  const handleRemoveMember = (userId: number) => {
    if (!confirm("Remove this user from the course?")) return;
    removeMember.mutate({ id, userId }, { onSuccess: refreshMembers });
  };

  const [newTopic, setNewTopic] = useState("");
  // editingRootId tracks which root topic is currently in edit mode (only one
  // at a time). In edit mode we auto-expand that root, allow rename, show
  // Delete next to subtopics, and expose an inline "Add subtopic" form.
  const [editingRootId, setEditingRootId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [newSubtopicName, setNewSubtopicName] = useState("");
  const [topicSearch, setTopicSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (tid: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListCourseTopicsQueryKey(id) });

  const handleAddRoot = () => {
    if (!newTopic.trim()) return;
    createTopic.mutate(
      {
        id,
        data: { topicName: newTopic.trim(), parentTopicId: null },
      },
      {
        onSuccess: () => {
          refresh();
          setNewTopic("");
        },
      },
    );
  };

  const startEdit = (t: Topic) => {
    setEditingRootId(t.id);
    setEditName(t.topicName);
    setNewSubtopicName("");
  };
  const cancelEdit = () => {
    setEditingRootId(null);
    setEditName("");
    setNewSubtopicName("");
  };

  const handleSaveEdit = () => {
    if (editingRootId == null || !editName.trim()) return;
    updateTopic.mutate(
      {
        id: editingRootId,
        data: { topicName: editName.trim() },
      },
      {
        onSuccess: () => {
          refresh();
          cancelEdit();
        },
      },
    );
  };

  const handleDeleteRoot = (topicId: number) => {
    if (
      !confirm(
        "Delete this topic and any of its subtopics? This cannot be undone.",
      )
    )
      return;
    deleteTopic.mutate(
      { id: topicId },
      {
        onSuccess: () => {
          refresh();
          cancelEdit();
        },
      },
    );
  };

  const handleDeleteSubtopic = (subtopicId: number) => {
    if (!confirm("Delete this subtopic? This cannot be undone.")) return;
    deleteTopic.mutate({ id: subtopicId }, { onSuccess: refresh });
  };

  const handleAddSubtopic = (parentId: number) => {
    if (!newSubtopicName.trim()) return;
    createTopic.mutate(
      {
        id,
        data: {
          topicName: newSubtopicName.trim(),
          parentTopicId: parentId,
        },
      },
      {
        onSuccess: () => {
          refresh();
          setNewSubtopicName("");
        },
      },
    );
  };

  if (loadingCourse || loadingTopics) return <p>Loading...</p>;
  if (!course) return <p>Course not found.</p>;

  const all = (topics ?? []) as Topic[];
  const childrenOf = (pid: number) => all.filter((t) => t.parentTopicId === pid);

  // Filter topics by search: a topic matches if its name contains the query OR
  // any descendant matches (so the parent chain stays visible).
  const q = topicSearch.trim().toLowerCase();
  const visibleIds = new Set<number>();
  if (q) {
    for (const t of all) {
      if (t.topicName.toLowerCase().includes(q)) {
        // walk up parents to keep the chain visible
        let cur: Topic | undefined = t;
        while (cur) {
          visibleIds.add(cur.id);
          cur = cur.parentTopicId
            ? all.find((x) => x.id === cur!.parentTopicId)
            : undefined;
        }
        // include descendants of a directly matching topic
        const stack = [t.id];
        while (stack.length) {
          const pid = stack.pop()!;
          for (const c of childrenOf(pid)) {
            visibleIds.add(c.id);
            stack.push(c.id);
          }
        }
      }
    }
  }
  const isVisible = (t: Topic) => !q || visibleIds.has(t.id);
  const roots = all.filter((t) => !t.parentTopicId).filter(isVisible);
  // Helper for filtered children
  const visibleChildrenOf = (pid: number) =>
    childrenOf(pid).filter(isVisible);

  // For students, when a search matches a subtopic, auto-expand its ancestor
  // chain so the matching child is reachable.
  const autoExpanded = new Set<number>(expanded);
  if (isStudent && q) {
    for (const t of all) {
      if (visibleIds.has(t.id) && t.parentTopicId) {
        let cur: Topic | undefined = t;
        while (cur?.parentTopicId) {
          autoExpanded.add(cur.parentTopicId);
          cur = all.find((x) => x.id === cur!.parentTopicId);
        }
      }
    }
  }

  // Student rendering: collapsible tree (unchanged behaviour).
  const renderStudentTopic = (t: Topic, depth: number) => {
    const children = visibleChildrenOf(t.id);
    const hasChildren = children.length > 0;
    const isOpen = autoExpanded.has(t.id);
    return (
      <li
        key={t.id}
        className="p-3 border rounded-md"
        style={{ marginLeft: depth * 20 }}
      >
        <div className="flex justify-between items-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(t.id)}
              className="flex items-center gap-2 text-left hover:text-primary focus:outline-none"
              data-testid={`btn-toggle-topic-${t.id}`}
            >
              <span
                className="inline-block w-3 text-xs text-muted-foreground transition-transform"
                aria-hidden
              >
                {isOpen ? "▾" : "▸"}
              </span>
              <span>{t.topicName}</span>
              <span className="text-xs text-muted-foreground">
                ({children.length})
              </span>
            </button>
          ) : (
            <span className="ml-5">{t.topicName}</span>
          )}
        </div>
        {hasChildren && isOpen && (
          <ul className="space-y-2 mt-2">
            {children.map((c) => renderStudentTopic(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  // Privileged rendering: roots only by default with a (n) subtopic count and
  // an Edit button. Clicking Edit puts that root into edit mode where the
  // subtopics are revealed with Delete actions, plus an inline "Add new
  // subtopic" form and Save/Cancel for the root rename.
  const renderPrivilegedRoot = (t: Topic) => {
    const children = childrenOf(t.id);
    const hasChildren = children.length > 0;
    const isEditing = editingRootId === t.id;
    // Outside edit mode, privileged users can expand/collapse a root to
    // preview its subtopics (read-only) — same behaviour as students.
    // Search auto-expands ancestors of matching subtopics.
    const isOpen = autoExpanded.has(t.id);
    const childrenToRender = isEditing ? children : visibleChildrenOf(t.id);
    return (
      <li key={t.id} className="p-3 border rounded-md">
        {isEditing ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="max-w-md"
                data-testid={`input-edit-topic-${t.id}`}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDeleteRoot(t.id)}
                disabled={deleteTopic.isPending}
                data-testid={`btn-delete-topic-${t.id}`}
              >
                Delete Topic
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(t.id)}
                className="flex items-center gap-2 text-left hover:text-primary focus:outline-none"
                data-testid={`btn-toggle-topic-${t.id}`}
                aria-expanded={isOpen}
              >
                <span
                  className="inline-block w-3 text-xs text-muted-foreground transition-transform"
                  aria-hidden
                >
                  {isOpen ? "▾" : "▸"}
                </span>
                <span>{t.topicName}</span>
                <span className="text-xs text-muted-foreground">
                  ({children.length})
                </span>
              </button>
            ) : (
              <div
                className="flex items-center gap-2 ml-5"
                data-testid={`row-topic-${t.id}`}
              >
                <span>{t.topicName}</span>
                <span className="text-xs text-muted-foreground">
                  ({children.length})
                </span>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => startEdit(t)}
              data-testid={`btn-edit-topic-${t.id}`}
            >
              Edit
            </Button>
          </div>
        )}

        {(isEditing || (isOpen && hasChildren)) && (
          <ul className="space-y-2 mt-3 ml-5">
            {childrenToRender.map((c) => (
              <li
                key={c.id}
                className="p-2 border rounded-md flex justify-between items-center"
              >
                <span>{c.topicName}</span>
                {isEditing && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteSubtopic(c.id)}
                    disabled={deleteTopic.isPending}
                    data-testid={`btn-delete-subtopic-${c.id}`}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
            {isEditing && (
            <li
                className="p-2 border rounded-md border-dashed"
                data-testid={`add-subtopic-${t.id}`}
              >
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="New subtopic name"
                    value={newSubtopicName}
                    onChange={(e) => setNewSubtopicName(e.target.value)}
                    className="max-w-md"
                    data-testid={`input-new-subtopic-${t.id}`}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAddSubtopic(t.id)}
                    disabled={createTopic.isPending || !newSubtopicName.trim()}
                    data-testid={`btn-add-subtopic-${t.id}`}
                  >
                    Add new subtopic
                  </Button>
                </div>
              </li>
            )}
          </ul>
        )}

        {isEditing && (
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={updateTopic.isPending || !editName.trim()}
              data-testid={`btn-save-topic-${t.id}`}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelEdit}
              data-testid={`btn-cancel-edit-topic-${t.id}`}
            >
              Cancel
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
        <h1 className="text-3xl font-bold">
          {course.courseCode}: {course.courseName}
        </h1>
        {!isStudent && course.lecturerName && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span data-testid="text-course-lecturer">
              Lecturer:{" "}
              <span className="font-medium text-foreground">
                {course.lecturerName}
              </span>
            </span>
          </div>
        )}
        </div>
        <Button
          type="button"
          onClick={handleReturn}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          data-testid="btn-return"
        >
          Return
        </Button>
      </div>

      {isStudent && (
        <StudentCourseView
          courseId={id}
          courseName={course.courseName}
          courseCode={course.courseCode}
          topics={all}
        />
      )}

      {isLecturer && (
        <>
          {/* Row 1: Students | Class average | Problematic questions */}
          <div className="grid grid-cols-3 gap-3">
            <Card data-testid="metric-course-students">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                  Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {analytics?.studentsCount ?? courseStudents?.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">enrolled in this course</p>
              </CardContent>
            </Card>

            <Card data-testid="metric-course-average">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                  Class average
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {fmtScore(analytics?.averageScore)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">across submitted exams</p>
              </CardContent>
            </Card>

            <Card data-testid="metric-course-problematic">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                  Problematic questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${(analytics?.problematicQuestions?.length ?? 0) > 0 ? "text-destructive" : ""}`}>
                  {analytics?.problematicQuestions?.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">high failure rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Topics | Topic performance | Most failed questions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Topics with add/edit for lecturers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Topics</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="Search topics or subtopics..."
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  className="mb-4"
                  data-testid="input-search-topics"
                />
                <ul className="space-y-2 mb-4">
                  {roots.map((t) => renderPrivilegedRoot(t))}
                  {all.length === 0 && (
                    <p className="text-muted-foreground text-sm">No topics yet.</p>
                  )}
                  {all.length > 0 && roots.length === 0 && (
                    <p className="text-muted-foreground text-sm">No topics match "{topicSearch}".</p>
                  )}
                </ul>
                <div className="space-y-2 border-t pt-4" data-testid="add-topic">
                  <h3 className="font-semibold text-sm">Add topic</h3>
                  <Input
                    placeholder="New topic name"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                  />
                  <Button onClick={handleAddRoot} disabled={createTopic.isPending}>
                    Add Topic
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-topic-performance">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingDown className="w-4 h-4 text-primary" />
                  Topic performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.topicPerformance?.length ? (
                  <div className="space-y-2">
                    {analytics.topicPerformance.map((t) => (
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
                            {t.attemptsCount} attempts · {t.weakStudentsCount}{" "}
                            student{t.weakStudentsCount === 1 ? "" : "s"} below threshold
                          </p>
                        </div>
                        <span className={`text-sm font-semibold shrink-0 ${accuracyClass(t.averageAccuracy)}`}>
                          {Math.round(t.averageAccuracy)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Topic performance appears once students have enough graded answers.
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
                {analytics?.mostFailedQuestions?.length ? (
                  <div className="space-y-3">
                    {analytics.mostFailedQuestions.map((q) => (
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
                          View
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
          </div>

          {/* Row 3: Students in this course | Content gaps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card data-testid="card-course-students">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4 text-primary" />
                  Students in this course
                </CardTitle>
              </CardHeader>
              <CardContent>
                {courseStudents && courseStudents.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Name</th>
                          <th className="py-2 pr-3 font-medium">Email</th>
                          <th className="py-2 pr-3 font-medium">Program</th>
                          <th className="py-2 pr-3 font-medium">Year</th>
                          <th className="py-2 font-medium">Semester</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseStudents.map((s) => (
                          <tr
                            key={s.id}
                            className="border-b last:border-0"
                            data-testid={`course-student-${s.id}`}
                          >
                            <td className="py-2 pr-3 font-medium">{s.fullName}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{s.email}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{s.programName ?? "—"}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{s.studyYear ?? "—"}</td>
                            <td className="py-2 text-muted-foreground">{s.semester ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No students enrolled in this course yet.
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
                {analytics?.contentGaps?.length ? (
                  <ul className="space-y-2">
                    {analytics.contentGaps.map((g, i) => (
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
        </>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {(members ?? []).map((m) => (
                <li
                  key={m.id}
                  className="flex justify-between items-center p-3 border rounded-md"
                >
                  <div>
                    <span className="font-medium">{m.fullName}</span>
                    <span className="text-muted-foreground ml-2 text-sm">
                      ({m.email}) — {m.role}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={removeMember.isPending}
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {(members ?? []).length === 0 && (
                <p className="text-muted-foreground">No members yet.</p>
              )}
            </ul>

            <div className="space-y-2 border-t pt-4">
              <h3 className="font-semibold">Add member</h3>
              <select
                className="border rounded px-2 py-1 w-full"
                value={memberToAdd}
                onChange={(e) =>
                  setMemberToAdd(
                    e.target.value === "" ? "" : parseInt(e.target.value, 10),
                  )
                }
              >
                <option value="">Select a student or lecturer...</option>
                {assignable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email}) — {u.role}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleAddMember}
                disabled={memberToAdd === "" || addMember.isPending}
              >
                Add to course
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
