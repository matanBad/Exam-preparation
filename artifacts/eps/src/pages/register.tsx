import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister, useListPrograms } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import logoUrl from "@/assets/ep-logo.png";

const STUDENT_DOMAIN = "@ac.sce.ac.il";
type StudyYear = "First" | "Second" | "Third" | "Fourth";
type Semester = "A" | "B";
const STUDY_YEARS: StudyYear[] = ["First", "Second", "Third", "Fourth"];
const SEMESTERS: Semester[] = ["A", "B"];

export default function Register() {
  const [, setLocation] = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [studyYear, setStudyYear] = useState<string>("");
  const [semester, setSemester] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const register = useRegister();
  const { data: programs } = useListPrograms();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim().toLowerCase().endsWith(STUDENT_DOMAIN)) {
      setError(`Email must end with ${STUDENT_DOMAIN}`);
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!programId) {
      setError("Please select your program / track.");
      return;
    }
    if (!studyYear) {
      setError("Please select your current year of study.");
      return;
    }
    if (!semester) {
      setError("Please select your current semester.");
      return;
    }
    register.mutate(
      {
        data: {
          fullName,
          email,
          password,
          programId: Number(programId),
          currentStudyYear: studyYear as StudyYear,
          currentSemester: semester as Semester,
        },
      },
      {
        onSuccess: () => setSuccess(true),
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } };
          setError(
            e?.data?.error ?? "Registration failed. Please try again.",
          );
        },
      },
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center text-center mb-2">
            <img
              src={logoUrl}
              alt="Exam Preparation"
              className="w-64 h-auto object-contain"
            />
            <CardTitle className="sr-only">Create a student account</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Create a student account
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center" data-testid="register-success">
              <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Registration submitted.</p>
                <p className="text-muted-foreground mt-1">
                  Your account is pending admin approval. You'll be able to sign
                  in once an administrator activates it.
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => setLocation("/login")}
                data-testid="btn-back-to-login"
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-4"
              data-testid="form-register"
            >
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  data-testid="input-fullName"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
                <p className="text-xs text-muted-foreground">
                  Use your SCE college email (ends with{" "}
                  <span className="font-medium">{STUDENT_DOMAIN}</span>).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="program">Program / track</Label>
                <Select value={programId} onValueChange={setProgramId}>
                  <SelectTrigger id="program" data-testid="select-program">
                    <SelectValue placeholder="Select your program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="studyYear">Year of study</Label>
                  <Select value={studyYear} onValueChange={setStudyYear}>
                    <SelectTrigger id="studyYear" data-testid="select-study-year">
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
                <div className="space-y-2">
                  <Label htmlFor="semester">Semester</Label>
                  <Select value={semester} onValueChange={setSemester}>
                    <SelectTrigger id="semester" data-testid="select-semester">
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-confirm"
                />
              </div>
              {error && (
                <p
                  className="text-sm text-destructive"
                  data-testid="text-register-error"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={register.isPending}
                data-testid="btn-register"
              >
                {register.isPending ? "Creating account..." : "Create account"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                New accounts require admin approval before you can sign in.
              </p>
              <div className="text-center text-sm">
                <Link
                  href="/login"
                  className="text-primary hover:underline"
                  data-testid="link-to-login"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
