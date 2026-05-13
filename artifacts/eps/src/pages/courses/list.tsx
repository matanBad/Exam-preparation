import { useListCourses, useCreateCourse, getListCoursesQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth";
import { Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CoursesList() {
  const { data: courses, isLoading } = useListCourses();
  const user = getAuthUser();
  const isPrivileged = user?.role === "lecturer" || user?.role === "admin";
  const [showNew, setShowNew] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const createCourse = useCreateCourse();
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    if (!code || !name) return;
    createCourse.mutate({ data: { courseCode: code, courseName: name } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
        setShowNew(false);
        setCode("");
        setName("");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Courses</h1>
        {isPrivileged && (
          <Button onClick={() => setShowNew(!showNew)}>
            {showNew ? "Cancel" : "Create Course"}
          </Button>
        )}
      </div>

      {showNew && (
        <Card>
          <CardHeader><CardTitle>New Course</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Course Code (e.g. CS101)" value={code} onChange={e => setCode(e.target.value)} />
            <Input placeholder="Course Name" value={name} onChange={e => setName(e.target.value)} />
            <Button onClick={handleCreate} disabled={createCourse.isPending}>Save Course</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses?.map(c => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle>{c.courseCode}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">{c.courseName}</p>
                <Link href={`/courses/${c.id}`} className="text-primary hover:underline">View Details</Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
