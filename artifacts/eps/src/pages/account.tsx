import { useState } from "react";
import {
  useChangeMyEmail,
  useChangeMyPassword,
} from "@workspace/api-client-react";
import { getAuthUser, setAuthUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Account() {
  const user = getAuthUser();
  const { toast } = useToast();

  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changeEmail = useChangeMyEmail();
  const changePassword = useChangeMyPassword();

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
    </div>
  );
}
