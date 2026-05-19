import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "wouter";
import { UserX } from "lucide-react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListPrograms,
  useGetUserCourses,
  getListUsersQueryKey,
  getGetUserCoursesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronDown, X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuthUser } from "@/lib/auth";

const ALL = "_all";
type Role = "student" | "lecturer" | "admin";
const ROLES: Role[] = ["student", "lecturer", "admin"];
type StudyYear = "First" | "Second" | "Third" | "Fourth";
type Semester = "A" | "B";
const STUDY_YEARS: StudyYear[] = ["First", "Second", "Third", "Fourth"];
const SEMESTERS: Semester[] = ["A", "B"];

export default function AdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const role: string =
    roleParam && (ROLES as string[]).includes(roleParam) ? roleParam : ALL;

  const setRole = (next: string) => {
    setSearchParams(
      (sp) => {
        const out = new URLSearchParams(sp);
        if (next === ALL) out.delete("role");
        else out.set("role", next);
        return out;
      },
      { replace: true },
    );
  };

  const filter = role === ALL ? {} : { role: role as Role };
  const { data: users, isLoading } = useListUsers(filter, {
    query: { queryKey: getListUsersQueryKey(filter) },
  });
  const me = getAuthUser();
  const queryClient = useQueryClient();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const selectedUser =
    selectedUserId != null
      ? (users ?? []).find((u) => u.id === selectedUserId) ?? null
      : null;
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "student" as Role,
  });
  const [programId, setProgramId] = useState<string>("");
  const [studyYear, setStudyYear] = useState<string>("");
  const [semester, setSemester] = useState<string>("");
  const [lecturerProgramIds, setLecturerProgramIds] = useState<number[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const { data: programs } = useListPrograms();

  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        q.queryKey[0].startsWith("/api/admin/users"),
    });

  const handleCreate = () => {
    setCreateError(null);
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 6) {
      setCreateError("Full name, email, and a 6+ char password are required.");
      return;
    }
    if (form.role === "student" && !programId) {
      setCreateError("Please select a program for the student.");
      return;
    }
    if (form.role === "student" && (!studyYear || !semester)) {
      setCreateError("Please select year and semester for the student.");
      return;
    }
    const payload: Record<string, unknown> = {
      ...form,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
    };
    if (form.role === "student" && programId) {
      payload.programId = Number(programId);
      payload.currentStudyYear = studyYear;
      payload.currentSemester = semester;
    }
    if (form.role === "lecturer" && lecturerProgramIds.length > 0) {
      payload.programIds = lecturerProgramIds;
    }
    createUser.mutate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { data: payload as any },
      {
        onSuccess: () => {
          refresh();
          setForm({ fullName: "", email: "", password: "", role: "student" });
          setProgramId("");
          setStudyYear("");
          setSemester("");
          setLecturerProgramIds([]);
          setShowCreate(false);
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          setCreateError(e?.response?.data?.error ?? e?.message ?? "Failed to create user");
        },
      },
    );
  };

  const handleRoleChange = (id: number, newRole: Role) => {
    updateUser.mutate(
      { id, data: { role: newRole } },
      { onSuccess: refresh },
    );
  };

  const handleStatusToggle = (id: number, current: string) => {
    updateUser.mutate(
      { id, data: { accountStatus: current === "active" ? "disabled" : "active" } },
      { onSuccess: refresh },
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (
      !confirm(
        `Delete user "${name}"? This permanently removes their account and all related data (enrollments, exams).`,
      )
    )
      return;
    deleteUser.mutate({ id }, { onSuccess: refresh });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">Users Accounts</h1>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-40" data-testid="select-role-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="lecturer">Lecturers</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/deletion-requests">
            <Button variant="outline" data-testid="btn-deletion-requests">
              <UserX className="w-4 h-4 mr-2" />
              deletion requests
            </Button>
          </Link>
          <Button
            onClick={() => setShowCreate((v) => !v)}
            className={
              showCreate ? undefined : "bg-green-700 hover:bg-green-800 text-white"
            }
          >
            {showCreate ? "Cancel" : "Create User"}
          </Button>
        </div>
      </div>
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create user</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
            <Input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Password (min 6 chars)"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as Role })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.role === "student" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Program</p>
                  <Select value={programId} onValueChange={setProgramId}>
                    <SelectTrigger
                      className="w-64"
                      data-testid="select-create-program"
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
                </div>
                <div className="flex gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Year of study</p>
                    <Select value={studyYear} onValueChange={setStudyYear}>
                      <SelectTrigger
                        className="w-40"
                        data-testid="select-create-study-year"
                      >
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDY_YEARS.map((y) => (
                          <SelectItem key={y} value={y}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Semester</p>
                    <Select value={semester} onValueChange={setSemester}>
                      <SelectTrigger
                        className="w-40"
                        data-testid="select-create-semester"
                      >
                        <SelectValue placeholder="Semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEMESTERS.map((s) => (
                          <SelectItem key={s} value={s}>
                            Semester {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {form.role === "lecturer" && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Programs taught</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-64 justify-between font-normal"
                      data-testid="select-lecturer-programs"
                    >
                      <span
                        className={
                          lecturerProgramIds.length === 0
                            ? "text-muted-foreground"
                            : ""
                        }
                      >
                        {lecturerProgramIds.length === 0
                          ? "Select programs"
                          : `${lecturerProgramIds.length} program${lecturerProgramIds.length === 1 ? "" : "s"} selected`}
                      </span>
                      <ChevronDown className="w-4 h-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {programs?.map((p) => {
                        const checked = lecturerProgramIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 text-sm cursor-pointer rounded-sm px-2 py-1.5 hover:bg-accent"
                            data-testid={`option-program-${p.code}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setLecturerProgramIds((prev) =>
                                  v
                                    ? [...prev, p.id]
                                    : prev.filter((x) => x !== p.id),
                                );
                              }}
                            />
                            <span>
                              {p.code}
                              <span className="text-muted-foreground ml-2">
                                {p.name}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                      {programs?.length === 0 && (
                        <p className="text-sm text-muted-foreground px-2 py-1">
                          No programs available.
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {lecturerProgramIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {lecturerProgramIds.map((pid) => {
                      const p = programs?.find((x) => x.id === pid);
                      if (!p) return null;
                      return (
                        <Badge
                          key={p.id}
                          variant="secondary"
                          className="gap-1"
                          data-testid={`pill-program-${p.code}`}
                        >
                          {p.code}
                          <button
                            type="button"
                            onClick={() =>
                              setLecturerProgramIds((prev) =>
                                prev.filter((x) => x !== p.id),
                              )
                            }
                            className="ml-0.5 hover:text-foreground"
                            aria-label={`Remove ${p.code}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            <Button
              onClick={handleCreate}
              disabled={createUser.isPending}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{users?.length ?? 0} users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p>Loading...</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Program </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u) => {
                const isSelf = me?.id === u.id;
                return (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className="text-left hover:text-primary hover:underline focus:outline-none focus-visible:underline"
                        data-testid={`btn-view-user-${u.id}`}
                      >
                        {u.fullName}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                        disabled={isSelf || updateUser.isPending}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.role === "student" ? (
                        u.programName ??
                        (u.programId
                          ? programs?.find((p) => p.id === u.programId)?.name
                          : null) ??
                        "—"
                      ) : u.role === "lecturer" ? (
                        (() => {
                          const ids = u.programIds ?? [];
                          if (ids.length === 0) return "—";
                          const names = ids
                            .map((pid) => programs?.find((p) => p.id === pid)?.name)
                            .filter(Boolean) as string[];
                          if (names.length <= 2) return names.join(", ");
                          return (
                            <span title={names.join(", ")}>
                              {names.length} programs
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.accountStatus === "active" ? "default" : "secondary"}
                      >
                        {u.accountStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSelf || updateUser.isPending}
                          onClick={() => handleStatusToggle(u.id, u.accountStatus)}
                        >
                          {u.accountStatus === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isSelf || deleteUser.isPending}
                          onClick={() => handleDelete(u.id, u.fullName)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <UserDetailsDialog
        user={selectedUser}
        programs={programs ?? []}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

type UserRow = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  accountStatus: string;
  programId?: number | null;
  programName?: string | null;
  programCode?: string | null;
  programIds?: number[] | null;
  createdAt?: string | null;
};

function UserDetailsDialog({
  user,
  programs,
  onClose,
}: {
  user: UserRow | null;
  programs: { id: number; code: string; name: string }[];
  onClose: () => void;
}) {
  const open = !!user;
  const targetId = user?.id ?? 0;
  const { data: courses } = useGetUserCourses(targetId, {
    query: { enabled: !!user, queryKey: getGetUserCoursesQueryKey(targetId) },
  });
  const programLookup = (id: number) =>
    programs.find((p) => p.id === id);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-user-details">
        {user && (
          <>
            <DialogHeader>
              <DialogTitle>{user.fullName}</DialogTitle>
              <DialogDescription>{user.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Role</span>
                <span className="col-span-2 capitalize font-medium">
                  {user.role}
                </span>
                <span className="text-muted-foreground">Status</span>
                <span className="col-span-2">
                  <Badge
                    variant={
                      user.accountStatus === "active" ? "default" : "secondary"
                    }
                  >
                    {user.accountStatus}
                  </Badge>
                </span>
                {user.role === "student" && (
                  <>
                    <span className="text-muted-foreground">Program</span>
                    <span className="col-span-2">
                      {(() => {
                        const p = user.programId
                          ? programLookup(user.programId)
                          : null;
                        const name = user.programName ?? p?.name;
                        const code = user.programCode ?? p?.code;
                        if (!name && !code) return "—";
                        return name && code
                          ? `${name} (${code})`
                          : (name ?? code);
                      })()}
                    </span>
                  </>
                )}
                {user.role === "lecturer" && (
                  <>
                    <span className="text-muted-foreground">Programs</span>
                    <span className="col-span-2 flex flex-wrap gap-1">
                      {(user.programIds ?? []).length === 0 && "—"}
                      {(user.programIds ?? []).map((pid) => {
                        const p = programLookup(pid);
                        return (
                          <Badge key={pid} variant="outline">
                            {p?.name ?? pid}
                          </Badge>
                        );
                      })}
                    </span>
                  </>
                )}
                {user.createdAt && (
                  <>
                    <span className="text-muted-foreground">Joined</span>
                    <span className="col-span-2">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
              <div>
                <p className="font-medium mb-2">
                  Courses{" "}
                  <span className="text-muted-foreground font-normal">
                    ({courses?.length ?? 0})
                  </span>
                </p>
                {courses && courses.length > 0 ? (
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {courses.map((c) => (
                      <li
                        key={c.id}
                        className="flex justify-between items-center border-b py-1 last:border-0"
                      >
                        <span className="font-medium">{c.courseCode}</span>
                        <span className="text-muted-foreground text-xs truncate ml-2">
                          {c.courseName}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No courses.</p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
