import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { setAuthToken, setAuthUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";

const demos = [
  { label: "Student", email: "student@eps.com" },
  { label: "Lecturer", email: "lecturer@eps.com" },
  { label: "Admin", email: "admin@eps.com" },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (res) => {
          setAuthToken(res.token);
          setAuthUser(res.user);
          setLocation("/");
        },
        onError: (err: unknown) => {
          const e = err as { status?: number; data?: { error?: string } };
          setError(
            e?.data?.error ??
              (e?.status === 401 ? "Invalid email or password" : "Login failed"),
          );
        },
      },
    );
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("123456");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-2xl">Exam Preparation System</CardTitle>
              <p className="text-sm text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" data-testid="form-login">
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" data-testid="text-login-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending}
              data-testid="btn-login"
            >
              {login.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
              Demo accounts (password: 123456)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {demos.map((d) => (
                <Button
                  key={d.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillDemo(d.email)}
                  data-testid={`btn-demo-${d.label.toLowerCase()}`}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
