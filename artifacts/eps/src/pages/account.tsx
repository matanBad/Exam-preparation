import { useState } from "react";
import { useLocation } from "wouter";
import {
  useChangeMyEmail,
  useChangeMyPassword,
  useDeleteMyAccount,
} from "@workspace/api-client-react";
import { getAuthUser, setAuthUser, clearAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function Account() {
  const user = getAuthUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  const changeEmail = useChangeMyEmail();
  const changePassword = useChangeMyPassword();
  const deleteAccount = useDeleteMyAccount();

  const submitDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteConfirmed) {
      toast({
        title: "Please confirm",
        description: "Tick the confirmation box to continue.",
        variant: "destructive",
      });
      return;
    }
    if (deleteReason.trim().length < 5) {
      toast({
        title: "Reason too short",
        description: "Please tell us why you want to leave (min 5 characters).",
        variant: "destructive",
      });
      return;
    }
    deleteAccount.mutate(
      {
        data: {
          currentPassword: deletePassword,
          reason: deleteReason.trim(),
          confirm: true,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Account deleted", description: "Sorry to see you go." });
          clearAuth();
          setLocation("/login");
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } };
          toast({
            title: "Failed to delete account",
            description: e?.data?.error ?? "Try again",
            variant: "destructive",
          });
        },
      },
    );
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !emailPassword) return;
    changeEmail.mutate(
      { data: { newEmail: email, currentPassword: emailPassword } },
      {
        onSuccess: (updated) => {
          if (user) setAuthUser({ ...user, email: updated.email });
          setEmailPassword("");
          toast({ title: "Email updated" });
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } };
          toast({
            title: "Failed to update email",
            description: e?.data?.error ?? "Try again",
            variant: "destructive",
          });
        },
      },
    );
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Minimum 6 characters",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }
    changePassword.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          toast({ title: "Password updated" });
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } };
          toast({
            title: "Failed to update password",
            description: e?.data?.error ?? "Try again",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Manage my account</h1>
        <p className="text-muted-foreground mt-1">
          Update your email or password.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Name: </span>
            {user.fullName}
          </p>
          <p>
            <span className="text-muted-foreground">Role: </span>
            <span className="capitalize">{user.role}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change email</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitEmail} className="space-y-4" data-testid="form-change-email">
            <div className="space-y-2">
              <Label htmlFor="email">New email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-cur-pw">Current password</Label>
              <Input
                id="email-cur-pw"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                required
                data-testid="input-email-current-password"
              />
            </div>
            <Button
              type="submit"
              disabled={changeEmail.isPending}
              data-testid="btn-save-email"
            >
              {changeEmail.isPending ? "Saving..." : "Update email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={submitPassword}
            className="space-y-4"
            data-testid="form-change-password"
          >
            <div className="space-y-2">
              <Label htmlFor="cur-pw">Current password</Label>
              <Input
                id="cur-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                data-testid="input-current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              disabled={changePassword.isPending}
              data-testid="btn-save-password"
            >
              {changePassword.isPending ? "Saving..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {user.role === "student" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Delete my account</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This permanently removes your account, enrollments, and exam history. This
              cannot be undone. A record of this request (including your reason) will be
              sent to the system administrators.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={submitDelete}
              className="space-y-4"
              data-testid="form-delete-account"
            >
              <div className="space-y-2">
                <Label htmlFor="del-reason">Why are you deleting your account?</Label>
                <Textarea
                  id="del-reason"
                  rows={4}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  required
                  minLength={5}
                  maxLength={1000}
                  placeholder="Help us understand why you're leaving..."
                  data-testid="input-delete-reason"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="del-pw">Current password</Label>
                <Input
                  id="del-pw"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  data-testid="input-delete-password"
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={deleteConfirmed}
                  onChange={(e) => setDeleteConfirmed(e.target.checked)}
                  data-testid="checkbox-delete-confirm"
                />
                <span>
                  I understand this action is permanent and I am sure I want to delete
                  my account.
                </span>
              </label>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  deleteAccount.isPending ||
                  !deleteConfirmed ||
                  deleteReason.trim().length < 5 ||
                  !deletePassword
                }
                data-testid="btn-delete-account"
              >
                {deleteAccount.isPending ? "Deleting..." : "Permanently delete my account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
