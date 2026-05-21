import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useChangeMyEmail,
  useChangeMyPassword,
  useDeleteMyAccount,
  useUpdateMyProfileImage,
  useListPrograms,
  useGetUserCourses,
  getGetUserCoursesQueryKey,
} from "@workspace/api-client-react";
import { useAuthUser, setAuthUser, clearAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export default function Account() {
  const user = useAuthUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const updateProfileImage = useUpdateMyProfileImage();
  const { data: programs } = useListPrograms();
  const programName = user?.programId
    ? (user.programName ??
       programs?.find((p) => p.id === user.programId)?.name ??
       null)
    : null;

  // Lecturer-only: resolve full program names from the user's programIds
  // (already returned by /auth/me) and count taught offerings via the
  // existing /users/:id/courses endpoint, which is server-scoped to
  // course_offerings.lecturer_id = me.
  const isLecturer = user?.role === "lecturer";
  const lecturerProgramNames = isLecturer
    ? ((user?.programIds ?? [])
        .map((id) => programs?.find((p) => p.id === id)?.name)
        .filter((n): n is string => Boolean(n)))
    : [];
  const { data: lecturerCourses } = useGetUserCourses(user?.id ?? 0, {
    query: {
      enabled: isLecturer && !!user?.id,
      queryKey: getGetUserCoursesQueryKey(user?.id ?? 0),
    },
  });
  const lecturerCoursesTaught = lecturerCourses?.length ?? 0;

  const handleImageFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please choose a JPG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({
        title: "Image too large",
        description: "Maximum file size is 2 MB.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      updateProfileImage.mutate(
        { data: { imageDataUrl: dataUrl } },
        {
          onSuccess: (updated) => {
            if (user) setAuthUser({ ...user, profileImageUrl: updated.profileImageUrl });
            toast({ title: "Profile picture updated" });
          },
          onError: (err: unknown) => {
            const e = err as { data?: { error?: string } };
            toast({
              title: "Failed to update picture",
              description: e?.data?.error ?? "Try again",
              variant: "destructive",
            });
          },
        },
      );
    };
    reader.onerror = () => {
      toast({
        title: "Could not read image",
        description: "Please try a different file.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    updateProfileImage.mutate(
      { data: { imageDataUrl: null } },
      {
        onSuccess: () => {
          if (user) setAuthUser({ ...user, profileImageUrl: null });
          toast({ title: "Profile picture removed" });
        },
      },
    );
  };

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
          // Clear the temporary-password flag locally so the forced-redirect
          // guard releases without a full reload, and so the warning banner
          // disappears immediately.
          if (user?.mustChangePassword) {
            setAuthUser({ ...user, mustChangePassword: false });
          }
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
        <h1 className="text-3xl font-bold">Account Management</h1>
      </div>
      {user.mustChangePassword && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Please change your temporary password.</p>
            <p className="text-muted-foreground mt-1">
              Your account was created with a temporary password. Set a new
              password below to start using the system.
            </p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-5 flex-wrap">
            <ProfileAvatar
              fullName={user.fullName}
              imageUrl={user.profileImageUrl}
              size="xl"
            />
            <div className="space-y-2 text-sm flex-1 min-w-[200px]">
              <p>
                <span className="text-muted-foreground">Name: </span>
                {user.fullName}
              </p>
              <p>
                <span className="text-muted-foreground">Role: </span>
                <span className="capitalize">{user.role}</span>
              </p>
              {user.role === "student" && (
                <p>
                  <span className="text-muted-foreground">Program: </span>
                  {programName ?? "—"}
                </p>
              )}
              {user.role === "student" &&
                (user.currentStudyYear || user.currentSemester) && (
                  <p>
                    <span className="text-muted-foreground">
                      Year / semester:{" "}
                    </span>
                    {user.currentStudyYear ?? "—"}
                    {user.currentSemester
                      ? ` · Semester ${user.currentSemester}`
                      : ""}
                  </p>
                )}
              {isLecturer && (
                <>
                  <p data-testid="text-lecturer-programs">
                    <span className="text-muted-foreground">
                      Program(s):{" "}
                    </span>
                    {lecturerProgramNames.length > 0
                      ? lecturerProgramNames.join(", ")
                      : "—"}
                  </p>
                  <p data-testid="text-lecturer-courses-taught">
                    <span className="text-muted-foreground">
                      Courses taught:{" "}
                    </span>
                    {lecturerCoursesTaught}
                  </p>
                </>
              )}
              <p>
                <span className="text-muted-foreground">Email: </span>
                {user.email}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  data-testid="input-profile-image"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageFile(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={updateProfileImage.isPending}
                  data-testid="btn-upload-image"
                >
                  {updateProfileImage.isPending
                    ? "Uploading..."
                    : user.profileImageUrl
                      ? "Change picture"
                      : "Upload picture"}
                </Button>
                {user.profileImageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveImage}
                    disabled={updateProfileImage.isPending}
                    data-testid="btn-remove-image"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                JPG, PNG, or WebP. Max 2 MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change email</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitEmail} className="space-y-4" data-testid="form-change-email">
            <div className="space-y-2">
              <Label htmlFor="email">Current email</Label>
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
              <Label htmlFor="email-cur-pw">New email</Label>
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
