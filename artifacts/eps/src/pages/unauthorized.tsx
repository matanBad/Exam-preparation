import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-destructive">Unauthorized</h1>
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
        <Button onClick={() => setLocation("/")} data-testid="btn-back-home">Return to Dashboard</Button>
      </div>
    </div>
  );
}
