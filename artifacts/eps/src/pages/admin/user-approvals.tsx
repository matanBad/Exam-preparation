import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminUserApprovals() {
  const queryClient = useQueryClient();
  const { data: users, isLoading, isError } = useListUsers(
    {},
    { query: { queryKey: getListUsersQueryKey({}) } },
  );
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [busyId, setBusyId] = useState<number | null>(null);

  const pending = useMemo(
    () => (users ?? []).filter((u) => u.accountStatus === "pending"),
    [users],
  );

  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        q.queryKey[0].startsWith("/api/admin/users"),
    });

  const approve = (id: number) => {
    setBusyId(id);
    updateUser.mutate(
      { id, data: { accountStatus: "active" } },
      { onSuccess: () => { refresh(); setBusyId(null); }, onError: () => setBusyId(null) },
    );
  };

  const reject = (id: number, name: string) => {
    if (!confirm(`Reject and delete the account request from "${name}"?`)) return;
    setBusyId(id);
    deleteUser.mutate(
      { id },
      { onSuccess: () => { refresh(); setBusyId(null); }, onError: () => setBusyId(null) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">User approval</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Self-registered accounts waiting for an admin to approve them.
          </p>
        </div>
        <Link href="/admin/users">
          <Button variant="outline" data-testid="btn-back-to-users">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Users
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Pending accounts {users ? `(${pending.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load users.</p>
          ) : pending.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="empty-user-approvals"
            >
              No accounts waiting for approval.
            </p>
          ) : (
            <ul className="space-y-4" data-testid="list-user-approvals">
              {pending.map((u) => (
                <li
                  key={u.id}
                  className="border-b last:border-0 pb-4 last:pb-0 flex items-center justify-between gap-4 flex-wrap"
                  data-testid={`user-approval-${u.id}`}
                >
                  <div className="text-sm">
                    <div>
                      <span className="font-semibold">{u.fullName}</span>{" "}
                      <span className="text-muted-foreground">&lt;{u.email}&gt;</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {u.role}
                      </Badge>
                      <Badge variant="secondary">pending</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approve(u.id)}
                      disabled={busyId === u.id}
                      data-testid={`btn-approve-${u.id}`}
                      className="bg-green-700 hover:bg-green-800 text-white"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reject(u.id, u.fullName)}
                      disabled={busyId === u.id}
                      data-testid={`btn-reject-${u.id}`}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
