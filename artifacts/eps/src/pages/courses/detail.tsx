import { useGetCourse, useListCourseTopics, useCreateTopic, getListCourseTopicsQueryKey, getGetCourseQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/auth";

export default function CourseDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { data: course, isLoading: loadingCourse } = useGetCourse(id, { query: { enabled: !!id, queryKey: getGetCourseQueryKey(id) } });
  const { data: topics, isLoading: loadingTopics } = useListCourseTopics(id, { query: { enabled: !!id, queryKey: getListCourseTopicsQueryKey(id) } });
  const user = getAuthUser();
  const isPrivileged = user?.role === "lecturer" || user?.role === "admin";
  const createTopic = useCreateTopic();
  const queryClient = useQueryClient();
  const [topicName, setTopicName] = useState("");

  const handleAddTopic = () => {
    if (!topicName) return;
    createTopic.mutate({ id, data: { topicName } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCourseTopicsQueryKey(id) });
        setTopicName("");
      }
    });
  };

  if (loadingCourse || loadingTopics) return <p>Loading...</p>;
  if (!course) return <p>Course not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{course.courseCode}: {course.courseName}</h1>
        <p className="text-muted-foreground mt-2">Manage course details and topics.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Topics</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4 mb-6">
            {topics?.map(t => (
              <li key={t.id} className="p-4 border rounded-md">
                {t.topicName}
              </li>
            ))}
            {topics?.length === 0 && <p className="text-muted-foreground">No topics yet.</p>}
          </ul>

          {isPrivileged && (
            <div className="flex gap-2">
              <Input placeholder="New topic name" value={topicName} onChange={e => setTopicName(e.target.value)} />
              <Button onClick={handleAddTopic} disabled={createTopic.isPending}>Add Topic</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
