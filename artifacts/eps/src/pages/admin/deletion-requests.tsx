import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useListDeletionRequests } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDeletionRequests() {
  const { data, isLoading, isError } = useListDeletionRequests();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Account deletion requests</h2>
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
            All requests {data ? `(${data.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load requests.</p>
          ) : !data || data.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="empty-deletion-requests"
            >
              No deletion requests yet.
            </p>
          ) : (
            <ul className="space-y-4" data-testid="list-deletion-requests">
              {data.map((r) => (
                <li
                  key={r.id}
                  className="border-b last:border-0 pb-4 last:pb-0 text-sm"
                  data-testid={`deletion-request-${r.id}`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-semibold">{r.formerFullName}</span>{" "}
                      <span className="text-muted-foreground">
                        &lt;{r.formerEmail}&gt;
                      </span>{" "}
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        ({r.formerRole})
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.deletedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                    {r.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
