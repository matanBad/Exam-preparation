import React from "react";
import { Link, useLocation } from "wouter";
import { getAuthUser, clearAuth } from "@/lib/auth";
import { BookOpen, CheckSquare, Home, Users, LogOut, Settings, List, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/ep-logo.png";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const user = getAuthUser();

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
  };

  const navItems = [
    { label: "Dashboard", href: "/", icon: Home, roles: ["student", "lecturer", "admin"] },
    { label: "Courses", href: "/courses", icon: BookOpen, roles: ["student", "lecturer", "admin"] },
    { label: "My Exams", href: "/exams", icon: CheckSquare, roles: ["student"] },
    { label: "Question Bank", href: "/lecturer/questions", icon: List, roles: ["lecturer", "admin"] },
    { label: "Admin Overview", href: "/admin", icon: Settings, roles: ["admin"] },
    { label: "Users", href: "/admin/users", icon: Users, roles: ["admin"] },
    { label: "My Account", href: "/account", icon: User, roles: ["student", "lecturer", "admin"] },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border bg-card flex flex-col justify-between hidden md:flex">
        <div>
          <div className="px-4 pt-6 pb-4 border-b border-border/60">
            <Link href="/" className="block" data-testid="brand-logo">
              <img
                src={logoUrl}
                alt="Exam Preparation"
                className="w-full h-36 object-contain"
              />
            </Link>
          </div>
          <nav className="px-4 space-y-2">
            {navItems
              .filter((item) => item.roles.includes(user?.role))
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
          </nav>
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium truncate w-32" data-testid="user-name">{user?.fullName}</span>
              <span className="text-xs text-muted-foreground capitalize" data-testid="user-role">{user?.role}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={handleLogout} data-testid="btn-logout">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:hidden">
          <Link href="/" className="flex items-center">
            <img src={logoUrl} alt="Exam Preparation" className="h-12 object-contain" />
          </Link>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
