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
  const [newParent, setNewParent] = useState<number | "">("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editParent, setEditParent] = useState<number | "">("");
  const [topicSearch, setTopicSearch] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListCourseTopicsQueryKey(id) });

  const handleAdd = () => {
    if (!newTopic.trim()) return;
    createTopic.mutate(
      {
        id,
        data: {
          topicName: newTopic.trim(),
          parentTopicId: newParent === "" ? null : newParent,
        },
      },
      {
        onSuccess: () => {
          refresh();
          setNewTopic("");
          setNewParent("");
        },
      },
    );
  };

  const startEdit = (t: Topic) => {
    setEditingId(t.id);
    setEditName(t.topicName);
    setEditParent(t.parentTopicId ?? "");
  };

  const handleSaveEdit = () => {
    if (editingId == null || !editName.trim()) return;
    updateTopic.mutate(
      {
        id: editingId,
        data: {
          topicName: editName.trim(),
          parentTopicId: editParent === "" ? null : editParent,
        },
      },
      {
        onSuccess: () => {
          refresh();
          setEditingId(null);
        },
      },
    );
  };

  const handleDelete = (topicId: number) => {
    if (!confirm("Delete this topic? Any subtopics will be moved to top level.")) return;
    deleteTopic.mutate({ id: topicId }, { onSuccess: refresh });
  };

  if (loadingCourse || loadingTopics) return <p>Loading...</p>;
  if (!course) return <p>Course not found.</p>;

  const all = (topics ?? []) as Topic[];
  const childrenOf = (pid: number) => all.filter((t) => t.parentTopicId === pid);

  // Filter topics by search: a topic matches if its name contains the query OR
  // any descendant matches (so the parent chain stays visible).
  const q = topicSearch.trim().toLowerCase();
  const subtreeMatches = (t: Topic): boolean => {
    if (t.topicName.toLowerCase().includes(q)) return true;
    return childrenOf(t.id).some(subtreeMatches);
  };
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
  void subtreeMatches;

  const renderTopic = (t: Topic, depth: number) => (
    <li
      key={t.id}
      className="p-3 border rounded-md"
      style={{ marginLeft: depth * 20 }}
    >
      {editingId === t.id ? (
        <div className="space-y-2">
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          <select
            className="border rounded px-2 py-1 w-full"
            value={editParent}
            onChange={(e) =>
              setEditParent(e.target.value === "" ? "" : parseInt(e.target.value, 10))
            }
          >
            <option value="">No parent (top-level topic)</option>
            {all
              .filter((x) => x.id !== t.id && x.parentTopicId == null)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.topicName}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveEdit} disabled={updateTopic.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <span>{t.topicName}</span>
          {isPrivileged && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => startEdit(t)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(t.id)}
                disabled={deleteTopic.isPending}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      )}
      {visibleChildrenOf(t.id).length > 0 && (
        <ul className="space-y-2 mt-2">
          {visibleChildrenOf(t.id).map((c) => renderTopic(c, depth + 1))}
        </ul>
      )}
    </li>
  );

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
            {roots.map((t) => renderTopic(t, 0))}
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
              <select
                className="border rounded px-2 py-1 w-full"
                value={newParent}
                onChange={(e) =>
                  setNewParent(e.target.value === "" ? "" : parseInt(e.target.value, 10))
                }
              >
                <option value="">No parent (top-level topic)</option>
                {all
                  .filter((t) => t.parentTopicId == null)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.topicName} (add as subtopic)
                    </option>
                  ))}
              </select>
              <Button onClick={handleAdd} disabled={createTopic.isPending}>
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
