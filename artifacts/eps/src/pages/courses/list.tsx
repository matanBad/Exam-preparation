import {
  useListCourses,
  useCreateCourse,
  useListPrograms,
  useListUsers,
  getListCoursesQueryKey,
  getListProgramsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth";
import { Link } from "wouter";
import { useMemo, useState } from "react";
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

const STUDY_YEARS = ["First", "Second", "Third", "Fourth"] as const;
const SEMESTERS = ["A", "B"] as const;
const ALL = "_all";

export default function CoursesList() {
  const { data: courses, isLoading } = useListCourses();
  const user = getAuthUser();
  const isPrivileged = user?.role === "lecturer" || user?.role === "admin";
  // For admins and lecturers, shuffle the course list once per page load so
  // the cards appear in a random order. Students keep the server's order.
  // useMemo keyed on the course IDs keeps the order stable across re-renders
  // (filter/search input changes) and only reshuffles when the underlying
  // list changes.
  const orderedCourses = useMemo(() => {
    if (!courses) return courses;
    if (!isPrivileged) return courses;
    const arr = [...courses];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses?.map((c) => c.id).join(","), isPrivileged]);
  const isAdmin = user?.role === "admin";
  const isLecturer = user?.role === "lecturer";
  const isStudent = user?.role === "student";
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState<string>(ALL);
  const [filterYear, setFilterYear] = useState<string>(ALL);
  const [filterSemester, setFilterSemester] = useState<string>(ALL);
  const [filterLecturer, setFilterLecturer] = useState<string>(ALL);
  const [showNew, setShowNew] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [lecturerId, setLecturerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const createCourse = useCreateCourse();
  const queryClient = useQueryClient();
  const { data: programs } = useListPrograms({
    query: {
      queryKey: getListProgramsQueryKey(),
    },
  });
  const { data: lecturers } = useListUsers(
    { role: "lecturer" },
    {
      query: {
        queryKey: getListUsersQueryKey({ role: "lecturer" }),
        enabled: isAdmin && showNew,
      },
    },
  );

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
    if (!lecturerId) {
      setError("Please select a lecturer to teach this offering.");
      return;
    }
    createCourse.mutate(
      {
        data: {
          courseCode: code,
          courseName: name,
          programId: Number(programId),
          lecturerId: Number(lecturerId),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
          setShowNew(false);
          setCode("");
          setName("");
          setProgramId("");
          setLecturerId("");
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by course code, name, or lecturer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] max-w-sm"
          data-testid="input-search-courses"
        />
        {!isStudent && (
          <Select value={filterProgram} onValueChange={setFilterProgram}>
            <SelectTrigger
              className="w-48"
              data-testid="filter-program"
            >
              <SelectValue placeholder="Program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All programs</SelectItem>
              {isLecturer
                ? // For lecturers, only show programs that appear in their
                  // visible (server-scoped) course offerings, so the filter
                  // never exposes programs of other lecturers' courses.
                  Array.from(
                    new Map(
                      (courses ?? [])
                        .filter((c) => c.programId && c.programName)
                        .map((c) => [c.programId!, c.programName!]),
                    ).entries(),
                  ).map(([id, nm]) => (
                    <SelectItem key={id} value={String(id)}>
                      {nm}
                    </SelectItem>
                  ))
                : programs?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        )}
        {!isAdmin && (
          <>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-36" data-testid="filter-year">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {STUDY_YEARS.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-36" data-testid="filter-semester">
                <SelectValue placeholder="Semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All semesters</SelectItem>
                {SEMESTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    Semester {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        {isAdmin && (
          <Select value={filterLecturer} onValueChange={setFilterLecturer}>
            <SelectTrigger className="w-48" data-testid="filter-lecturer">
              <SelectValue placeholder="Lecturer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All lecturers</SelectItem>
              {Array.from(
                new Map(
                  (courses ?? [])
                    .filter((c) => c.lecturerId && c.lecturerName)
                    .map((c) => [c.lecturerId!, c.lecturerName!]),
                ).entries(),
              ).map(([id, nm]) => (
                <SelectItem key={id} value={String(id)}>
                  {nm}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isAdmin && (
          <Button
            onClick={() => setShowNew(!showNew)}
            className={
              showNew
                ? "ml-auto"
                : "ml-auto bg-green-700 hover:bg-green-800 text-white"
            }
            data-testid="btn-create-course"
          >
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
            <Select value={lecturerId} onValueChange={setLecturerId}>
              <SelectTrigger
                className="w-64"
                data-testid="select-course-lecturer"
              >
                <SelectValue placeholder="Select lecturer" />
              </SelectTrigger>
              <SelectContent>
                {lecturers?.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.fullName}
                  </SelectItem>
                ))}
                {lecturers?.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No lecturers available.
                  </div>
                )}
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
          {orderedCourses
            ?.filter((c) => {
              if (search.trim()) {
                const q = search.trim().toLowerCase();
                if (
                  !c.courseCode.toLowerCase().includes(q) &&
                  !c.courseName.toLowerCase().includes(q) &&
                  !(c.lecturerName ?? "").toLowerCase().includes(q)
                ) {
                  return false;
                }
              }
              if (
                filterProgram !== ALL &&
                String(c.programId ?? "") !== filterProgram
              ) {
                return false;
              }
              // Admin page intentionally omits year/semester filters; the
              // state values stay at ALL by default but we also guard
              // defensively here so a stale URL/state can't filter them out.
              if (!isAdmin && filterYear !== ALL && c.studyYear !== filterYear) {
                return false;
              }
              if (
                !isAdmin &&
                filterSemester !== ALL &&
                c.offeringSemester !== filterSemester
              ) {
                return false;
              }
              if (
                filterLecturer !== ALL &&
                String(c.lecturerId ?? "") !== filterLecturer
              ) {
                return false;
              }
              return true;
            })
            .map((c) => (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                data-testid={`card-course-${c.id}`}
                className="block transition hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              >
                <Card className="h-full cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span>{c.courseCode}</span>
                      {c.studyYear && c.offeringSemester && (
                        <span className="text-xs font-medium rounded-full bg-secondary text-secondary-foreground px-2 py-0.5">
                          {c.studyYear} · Sem {c.offeringSemester}
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium mb-2">{c.courseName}</p>
                    {isLecturer ? (
                      c.programName && (
                        <p className="text-xs text-muted-foreground">
                          Program: {c.programName}
                        </p>
                      )
                    ) : (
                      <>
                        {c.programName && (
                          <p className="text-xs text-muted-foreground">
                            Program: {c.programName}
                          </p>
                        )}
                        {(isStudent || isAdmin) && c.lecturerName && (
                          <p className="text-xs text-muted-foreground">
                            Lecturer: {c.lecturerName}
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
