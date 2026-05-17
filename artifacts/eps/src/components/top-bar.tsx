import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, MessageSquare, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useAuthUser, clearAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

type Message = {
  id: string;
  from: string;
  body: string;
  time: string;
  read: boolean;
};

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    title: "New exam submitted",
    body: "A student just submitted a Database Systems mock exam.",
    time: "2m ago",
    read: false,
  },
  {
    id: "n2",
    title: "Question bank updated",
    body: "5 new questions were approved this morning.",
    time: "1h ago",
    read: false,
  },
  {
    id: "n3",
    title: "Course structure modified",
    body: "Topics for CS101 were reorganized.",
    time: "Yesterday",
    read: true,
  },
];

const DEMO_MESSAGES: Message[] = [
  {
    id: "m1",
    from: "Dr. Avery (Lecturer)",
    body: "Added new questions to the CS101 question bank.",
    time: "10m ago",
    read: false,
  },
  {
    id: "m2",
    from: "System Admin",
    body: "Reviewed weekly system activity. All clear.",
    time: "3h ago",
    read: true,
  },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/account$/, "My Account"],
  [/^\/courses(\/|$)/, "Courses"],
  [/^\/exams\/new$/, "New Exam"],
  [/^\/exams(\/|$)/, "My Exams"],
  [/^\/lecturer\/questions(\/|$)/, "Question Bank"],
  [/^\/admin\/users$/, "Users"],
];

function pageTitle(path: string): string {
  for (const [re, title] of TITLES) if (re.test(path)) return title;
  return "EPS";
}

export function TopBar() {
  const [location, setLocation] = useLocation();
  const user = useAuthUser();
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS);
  const [messages, setMessages] = useState(DEMO_MESSAGES);

  const unreadN = notifications.filter((n) => !n.read).length;
  const unreadM = messages.filter((m) => !m.read).length;

  const markAllRead = (kind: "n" | "m") => {
    if (kind === "n") setNotifications((arr) => arr.map((x) => ({ ...x, read: true })));
    else setMessages((arr) => arr.map((x) => ({ ...x, read: true })));
  };

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
  };

  return (
    <header className="hidden md:flex h-16 border-b border-border bg-card items-center justify-between px-6 gap-4">
      <h1
        className="text-lg font-semibold tracking-tight"
        data-testid="topbar-title"
      >
        {pageTitle(location)}
      </h1>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="btn-notifications"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadN > 0 && (
                <Badge
                  className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px]"
                  variant="destructive"
                >
                  {unreadN}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {unreadN > 0 && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => markAllRead("n")}
                >
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                You're all caught up.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "px-3 py-2 text-sm border-l-2",
                    n.read ? "border-transparent" : "border-primary bg-accent/30",
                  )}
                  data-testid={`notification-${n.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {n.time}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="btn-messages"
              aria-label="Messages"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadM > 0 && (
                <Badge
                  className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px]"
                  variant="destructive"
                >
                  {unreadM}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Messages</span>
              {unreadM > 0 && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => markAllRead("m")}
                >
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {messages.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                No messages.
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "px-3 py-2 text-sm border-l-2",
                    m.read ? "border-transparent" : "border-primary bg-accent/30",
                  )}
                  data-testid={`message-${m.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.from}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {m.time}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.body}</p>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full hover-elevate px-1 py-1 -my-1 transition-colors"
              data-testid="btn-profile-menu"
              aria-label="Profile menu"
            >
              <ProfileAvatar
                fullName={user?.fullName}
                imageUrl={user?.profileImageUrl}
                size="sm"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.fullName}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user?.role}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Link href="/account">
              <DropdownMenuItem data-testid="menu-my-account">
                <User className="w-4 h-4 mr-2" />
                My Account
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
