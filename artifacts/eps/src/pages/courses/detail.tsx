import {
  useGetCourse,
  useListCourseTopics,
  useCreateTopic,
  useUpdateTopic,
  useDeleteTopic,
  useListCourseMembers,
  useAddCourseMember,
  useRemoveCourseMember,
  useListUsers,
  getListCourseTopicsQueryKey,
  getGetCourseQueryKey,
  getListCourseMembersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/auth";

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
  const isStudent = user?.role === "student";
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
      <div>
        <h1 className="text-3xl font-bold">
          {course.courseCode}: {course.courseName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {course.programCode && (
            <span data-testid="text-course-program">
              Program:{" "}
              <span className="font-medium text-foreground">
                {course.programCode}
                {course.programName ? ` — ${course.programName}` : ""}
              </span>
            </span>
          )}
          {course.lecturerName && (
            <span data-testid="text-course-lecturer">
              Lecturer:{" "}
              <span className="font-medium text-foreground">
                {course.lecturerName}
              </span>
            </span>
          )}
        </div>
      </div>

      <Card>
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
