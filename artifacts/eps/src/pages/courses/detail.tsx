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
  useGetStudentCourseAnalytics,
  useGetUserExams,
  useGetPracticeHistory,
  getListCourseTopicsQueryKey,
  getGetCourseQueryKey,
  getListCourseMembersQueryKey,
  getListCourseStudentsQueryKey,
  getGetLecturerCourseAnalyticsQueryKey,
  getGetStudentCourseAnalyticsQueryKey,
  getGetUserExamsQueryKey,
  getGetPracticeHistoryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/auth";
import {
  TrendingDown,
  AlertTriangle,
  FileWarning,
  Users,
  Target,
  Gauge,
  Trophy,
  BookOpen,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function fmtScore(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function accuracyClass(pct: number): string {
  if (pct < 60) return "text-destructive";
  if (pct < 75) return "text-amber-600";
  return "text-emerald-600";
}

const WEAKNESS_STYLES: Record<string, string> = {
  weak: "bg-destructive/10 text-destructive border-destructive/20",
  needs_practice: "bg-amber-100 text-amber-700 border-amber-200",
  strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
};
const WEAKNESS_LABEL: Record<string, string> = {
  weak: "Weak",
  needs_practice: "Needs practice",
  strong: "Strong",
};

// Compact metric tile for the course analytics rows.
function Stat({
  icon,
  label,
  value,
  sub,
  testid,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  testid?: string;
}) {
  return (
    <Card className="h-full" data-testid={testid}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

type Topic = {
  id: number;
  topicName: string;
  parentTopicId?: number | null;
};

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

  // Student-only per-course analytics and the student's own exam / practice
  // history (filtered to this course below).
  const { data: studentAnalytics } = useGetStudentCourseAnalytics(id, {
    query: {
      enabled: !!id && isStudent,
      queryKey: getGetStudentCourseAnalyticsQueryKey(id),
      retry: false,
    },
  });
  const { data: myExams } = useGetUserExams(user?.id ?? 0, {
    query: {
      enabled: !!id && isStudent && !!user?.id,
      queryKey: getGetUserExamsQueryKey(user?.id ?? 0),
    },
  });
  const { data: practiceHistory } = useGetPracticeHistory({
    query: {
      enabled: !!id && isStudent,
      queryKey: getGetPracticeHistoryQueryKey(),
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

  // --- Shared / per-role cards, arranged into the requested row layouts below.

  const topicsCard = (
    <Card data-testid="card-topics">
      <CardHeader>
        <CardTitle>Topics</CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          placeholder="Search topics or subtopics..."
          value={topicSearch}
          onChange={(e) => setTopicSearch(e.target.value)}
          className="max-w-md mb-4"
          data-testid="input-search-topics"
        />
        <ul className="space-y-2 mb-6">
          {roots.map((t) =>
            isStudent ? renderStudentTopic(t, 0) : renderPrivilegedRoot(t),
          )}
          {all.length === 0 && (
            <p className="text-muted-foreground">No topics yet.</p>
          )}
          {all.length > 0 && roots.length === 0 && (
            <p className="text-muted-foreground">
              No topics match "{topicSearch}".
            </p>
          )}
        </ul>

        {isPrivileged && (
          <div className="space-y-2 border-t pt-4" data-testid="add-topic">
            <h3 className="font-semibold">Add topic</h3>
            <Input
              placeholder="New topic name"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
            />
            <Button onClick={handleAddRoot} disabled={createTopic.isPending}>
              Add Topic
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const lecturerTopicPerfCard = (
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
            Topic performance appears once students have enough graded answers.
          </p>
        )}
      </CardContent>
    </Card>
  );

  const lecturerMostFailedCard = (
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
            {analytics.mostFailedQuestions.map((qq) => (
              <div
                key={qq.questionId}
                className="flex items-start justify-between gap-4 border-b pb-3 last:border-0"
                data-testid={`problematic-question-${qq.questionId}`}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium line-clamp-2">
                    {qq.questionPreview}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {qq.topicName && <span>{qq.topicName}</span>}
                    {qq.difficultyLevel && <span>{qq.difficultyLevel}</span>}
                    <span>{qq.attemptsCount} attempts</span>
                    <span className="text-destructive font-medium">
                      {Math.round(qq.incorrectRate)}% incorrect
                    </span>
                  </div>
                </div>
                <Link
                  href={`/lecturer/questions/${qq.questionId}/edit`}
                  className="text-sm font-medium text-primary hover:underline shrink-0"
                  data-testid={`link-view-question-${qq.questionId}`}
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
  );

  const studentsInCourseCard = (
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
                    <td className="py-2 pr-3 text-muted-foreground">
                      {s.email}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {s.programName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {s.studyYear ?? "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {s.semester ?? "—"}
                    </td>
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
  );

  const contentGapsCard = (
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
  );

  // --- Student per-course cards ---

  const studentTopicPerfCard = (
    <Card data-testid="card-student-topic-performance">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="w-4 h-4 text-primary" />
          Topic performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {studentAnalytics?.topicPerformance?.length ? (
          <ul className="space-y-2">
            {studentAnalytics.topicPerformance.map((t) => {
              const key = `${t.topicId}-${t.subtopicId}`;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                  data-testid={`student-topic-${key}`}
                >
                  <p className="min-w-0 truncate text-sm font-medium">
                    {t.subtopicName ?? t.topicName ?? "Topic"}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium">
                      {Math.round(t.accuracyRate)}%
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        WEAKNESS_STYLES[t.weaknessLevel] ??
                        WEAKNESS_STYLES.strong
                      }`}
                    >
                      {WEAKNESS_LABEL[t.weaknessLevel] ?? t.weaknessLevel}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Topic performance appears once you have enough graded answers.
          </p>
        )}
      </CardContent>
    </Card>
  );

  const trend = (studentAnalytics?.progressTrend ?? []).map((p, i) => ({
    i,
    name: fmtDate(p.date),
    score: Math.round(p.score),
    label: p.label,
  }));

  const studentProgressCard = (
    <Card data-testid="card-progress-over-time">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Progress over time</CardTitle>
      </CardHeader>
      <CardContent>
        {trend.length >= 2 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trend}
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
          <p className="py-10 text-center text-sm text-muted-foreground">
            Complete at least two exams or practice sessions in this course to
            see your progress trend.
          </p>
        )}
      </CardContent>
    </Card>
  );

  const studentMostFailedCard = (
    <Card data-testid="card-student-most-failed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Most failed questions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {studentAnalytics?.mostFailedQuestions?.length ? (
          <div className="space-y-3">
            {studentAnalytics.mostFailedQuestions.map((qq) => (
              <div
                key={qq.questionId}
                className="border-b pb-3 last:border-0 space-y-1"
                data-testid={`student-failed-question-${qq.questionId}`}
              >
                <p className="text-sm font-medium line-clamp-2">
                  {qq.questionPreview}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {qq.topicName && <span>{qq.topicName}</span>}
                  {qq.difficultyLevel && <span>{qq.difficultyLevel}</span>}
                  <span className="text-destructive font-medium">
                    {Math.round(qq.incorrectRate)}% incorrect
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Questions you've struggled with in this course will appear here.
          </p>
        )}
      </CardContent>
    </Card>
  );

  // Student exam / practice lists, scoped to this course.
  const courseExams = (myExams ?? []).filter((e) => e.courseId === id);
  const recentExams = courseExams.filter((e) => e.status === "submitted");
  const unfinishedExams = courseExams.filter((e) => e.status !== "submitted");
  const recentPractice = (practiceHistory?.completed ?? []).filter(
    (s) => s.courseId === id,
  );
  const unfinishedPractice = (practiceHistory?.active ?? []).filter(
    (s) => s.courseId === id,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">
            {course.courseCode}: {course.courseName}
          </h1>
          {!isLecturer && course.lecturerName && (
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

      {isLecturer && (
        <>
          {/* Row 1: Students | Class average | Questions bank | Problematic questions */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              icon={<Users className="w-3.5 h-3.5" />}
              label="Students"
              value={String(
                courseStudents?.length ?? analytics?.studentsCount ?? 0,
              )}
              testid="metric-course-students"
            />
            <Stat
              icon={<Target className="w-3.5 h-3.5" />}
              label="Class average"
              value={fmtScore(analytics?.averageScore)}
              testid="metric-course-average"
            />
            <Stat
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label="Questions bank"
              value={String(analytics?.questionBankCount ?? 0)}
              testid="metric-course-question-bank"
            />
            <Stat
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              label="Problematic questions"
              value={String(analytics?.problematicQuestions?.length ?? 0)}
              testid="metric-course-problematic"
            />
          </div>

          {/* Row 2: Topics | Topic performance | Most failed questions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 auto-rows-fr">
            {topicsCard}
            {lecturerTopicPerfCard}
            {lecturerMostFailedCard}
          </div>

          {/* Row 3: Students in this course | Content gaps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-fr">
            {studentsInCourseCard}
            {contentGapsCard}
          </div>
        </>
      )}

      {isStudent && (
        <>
          {/* Row 1: Avg Score Exam | Avg Score Practice | Readiness | Milestones */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              icon={<Target className="w-3.5 h-3.5" />}
              label="Avg Score (Exams)"
              value={fmtScore(studentAnalytics?.averageScoreExam)}
              testid="metric-student-avg-exam"
            />
            <Stat
              icon={<Target className="w-3.5 h-3.5" />}
              label="Avg Score (Practice)"
              value={fmtScore(studentAnalytics?.averageScorePractice)}
              testid="metric-student-avg-practice"
            />
            <Stat
              icon={<Gauge className="w-3.5 h-3.5" />}
              label="Readiness"
              value={
                studentAnalytics?.readinessScore == null
                  ? "—"
                  : `${Math.round(studentAnalytics.readinessScore)}/100`
              }
              sub={studentAnalytics?.readinessLabel}
              testid="metric-student-readiness"
            />
            <Stat
              icon={<Trophy className="w-3.5 h-3.5" />}
              label="Milestones"
              value={String(studentAnalytics?.milestonesCount ?? 0)}
              testid="metric-student-milestones"
            />
          </div>

          {/* Row 2: Topics | Topic performance | Progress over time | Most failed questions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-fr">
            {topicsCard}
            {studentTopicPerfCard}
            {studentProgressCard}
            {studentMostFailedCard}
          </div>

          {/* Row 3: Recent exams | Unfinished exams | Recent practice | Unfinished practice */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-fr">
            <Card data-testid="card-course-recent-exams">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent exams</CardTitle>
              </CardHeader>
              <CardContent>
                {recentExams.length ? (
                  <ul className="space-y-2">
                    {recentExams.slice(0, 5).map((e) => (
                      <li key={e.id} className="border-b pb-2 last:border-0">
                        <Link
                          href={`/exams/${e.id}/review`}
                          className="text-sm hover:text-primary transition-colors"
                        >
                          Score: {e.score ?? "-"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No completed exams yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-course-unfinished-exams">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Unfinished exams</CardTitle>
              </CardHeader>
              <CardContent>
                {unfinishedExams.length ? (
                  <ul className="space-y-2">
                    {unfinishedExams.slice(0, 5).map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                      >
                        <span className="text-xs uppercase text-muted-foreground">
                          {e.status === "in_progress"
                            ? "in progress"
                            : "not started"}
                        </span>
                        <Link
                          href={`/exams/${e.id}/take`}
                          className="shrink-0 text-sm text-primary hover:underline"
                          data-testid={`link-resume-exam-${e.id}`}
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

            <Card data-testid="card-course-recent-practice">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent practice</CardTitle>
              </CardHeader>
              <CardContent>
                {recentPractice.length ? (
                  <ul className="space-y-2">
                    {recentPractice.slice(0, 5).map((s) => (
                      <li key={s.id} className="border-b pb-2 last:border-0">
                        <Link
                          href={`/practice/${s.id}/summary`}
                          className="flex items-center justify-between gap-3 text-sm hover:text-primary transition-colors"
                          data-testid={`link-practice-summary-${s.id}`}
                        >
                          <span className="text-muted-foreground">Session</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {s.correctCount}/{s.totalQuestions}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No completed practice yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-course-unfinished-practice">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Unfinished practice</CardTitle>
              </CardHeader>
              <CardContent>
                {unfinishedPractice.length ? (
                  <ul className="space-y-2">
                    {unfinishedPractice.slice(0, 5).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                      >
                        <span className="text-xs text-muted-foreground">
                          {s.answeredCount}/{s.totalQuestions}
                        </span>
                        <Link
                          href={`/practice/${s.id}`}
                          className="shrink-0 text-sm text-primary hover:underline"
                          data-testid={`link-resume-practice-${s.id}`}
                        >
                          Continue
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No practice in progress.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {isAdmin && (
        <>
          {topicsCard}
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
        </>
      )}
    </div>
  );
}
