import {
  useListCourses,
  useCreateCourse,
  useListPrograms,
  getListCoursesQueryKey,
  getListProgramsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth";
import { Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CoursesList() {
  const { data: courses, isLoading } = useListCourses();
  const user = getAuthUser();
  const isPrivileged = user?.role === "lecturer" || user?.role === "admin";
  const [showNew, setShowNew] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const createCourse = useCreateCourse();
  const queryClient = useQueryClient();
  const { data: programs } = useListPrograms({
    query: {
      queryKey: getListProgramsQueryKey(),
      enabled: isPrivileged,
    },
  });

  const handleCreate = async () => {
    setError(null);
    if (!code || !name) {
      setError("Course code and name are required.");
      return;
    }
    if (!programId) {
      setError("Please select a program for this offering.");
      return;
    }
    createCourse.mutate(
      {
        data: {
          courseCode: code,
          courseName: name,
          programId: Number(programId),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
          setShowNew(false);
          setCode("");
          setName("");
          setProgramId("");
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } } };
          setError(e?.response?.data?.error ?? "Failed to create course");
        },
      },
    );
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
          <CardHeader>
            <CardTitle>New Course</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Course Code (e.g. CS101)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Input
              placeholder="Course Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger
                className="w-64"
                data-testid="select-course-program"
              >
                <SelectValue placeholder="Select program" />
              </SelectTrigger>
              <SelectContent>
                {programs?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleCreate} disabled={createCourse.isPending}>
              Save Course
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses?.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{c.courseCode}</span>
                  {c.programCode && (
                    <span
                      className="text-xs font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5"
                      data-testid={`badge-program-${c.id}`}
                    >
                      {c.programCode}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-1">{c.courseName}</p>
                {c.lecturerName && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Lecturer: {c.lecturerName}
                  </p>
                )}
                <Link
                  href={`/courses/${c.id}`}
                  className="text-primary hover:underline"
                >
                  View Details
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
