import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [role, setRole] = useState<string>(ALL);
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
  const [createError, setCreateError] = useState<string | null>(null);

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
    createUser.mutate(
      { data: { ...form, fullName: form.fullName.trim(), email: form.email.trim() } },
      {
        onSuccess: () => {
          refresh();
          setForm({ fullName: "", email: "", password: "", role: "student" });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground mt-1">All accounts in the system</p>
        </div>
        <div className="flex items-center gap-2">
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
