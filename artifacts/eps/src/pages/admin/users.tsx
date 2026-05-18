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
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

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
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "student" as Role,
  });
  const [programId, setProgramId] = useState<string>("");
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
    const payload: Record<string, unknown> = {
      ...form,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
    };
    if (form.role === "student" && programId) {
      payload.programId = Number(programId);
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
        <div>
          <h1 className="text-3xl font-bold">Users Accounts</h1>
          {role !== ALL && (
            <button
              type="button"
              onClick={() => setRole(ALL)}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1 hover:bg-primary/20 transition-colors"
              data-testid="chip-active-filter"
            >
              Role: <span className="capitalize font-medium">{role}</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/deletion-requests">
            <Button variant="outline" data-testid="btn-deletion-requests">
              <UserX className="w-4 h-4 mr-2" />
              Account deletion requests
            </Button>
          </Link>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-48" data-testid="select-role-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="lecturer">Lecturers</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "New user"}
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
            )}
            {form.role === "lecturer" && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Programs taught</p>
                <div className="flex flex-wrap gap-3">
                  {programs?.map((p) => {
                    const checked = lecturerProgramIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setLecturerProgramIds((prev) =>
                              e.target.checked
                                ? [...prev, p.id]
                                : prev.filter((x) => x !== p.id),
                            );
                          }}
                          data-testid={`checkbox-program-${p.code}`}
                        />
                        {p.code}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            <Button onClick={handleCreate} disabled={createUser.isPending}>
              {createUser.isPending ? "Creating..." : "Create user"}
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u) => {
                const isSelf = me?.id === u.id;
                return (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
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
    </div>
  );
}
