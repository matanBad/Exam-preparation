import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, MessageSquare, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useListMyNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useListMyMessages,
  useMarkMessageRead,
  useMarkAllMessagesRead,
  getListMyNotificationsQueryKey,
  getListMyMessagesQueryKey,
  type Message,
} from "@workspace/api-client-react";

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/account$/, "My Account"],
  [/^\/courses(\/|$)/, "Courses"],
  [/^\/exams\/new$/, "New Exam"],
  [/^\/exams(\/|$)/, "My Exams"],
  [/^\/lecturer\/questions(\/|$)/, "Question Bank"],
  [/^\/admin\/users$/, "Users"],
  [/^\/admin\/user-approvals$/, "Users"],
];

function pageTitle(path: string): string {
  for (const [re, title] of TITLES) if (re.test(path)) return title;
  return "EPS";
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function TopBar() {
  const [location, setLocation] = useLocation();
  const user = useAuthUser();
  const qc = useQueryClient();
  const [openMessage, setOpenMessage] = useState<Message | null>(null);

  const notifQuery = useListMyNotifications();
  const msgQuery = useListMyMessages();

  const notifications = notifQuery.data ?? [];
  const messages = msgQuery.data ?? [];
  const unreadN = notifications.filter((n) => n.status === "unread").length;
  const unreadM = messages.filter((m) => m.status === "unread").length;

  const invalidateNotifs = () =>
    qc.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });
  const invalidateMsgs = () =>
    qc.invalidateQueries({ queryKey: getListMyMessagesQueryKey() });

  const markNotif = useMarkNotificationRead({
    mutation: { onSuccess: invalidateNotifs },
  });
  const markAllNotifs = useMarkAllNotificationsRead({
    mutation: { onSuccess: invalidateNotifs },
  });
  const markMsg = useMarkMessageRead({
    mutation: { onSuccess: invalidateMsgs },
  });
  const markAllMsgs = useMarkAllMessagesRead({
    mutation: { onSuccess: invalidateMsgs },
  });

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
  };

  const handleOpenMessage = (m: Message) => {
    setOpenMessage(m);
    if (m.status === "unread") {
      markMsg.mutate({ id: m.id });
    }
  };

  return (
    <>
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
                    data-testid="badge-notifications-unread"
                  >
                    {unreadN}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 max-h-[28rem] overflow-y-auto" align="end">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notifications</span>
                {unreadN > 0 && (
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => markAllNotifs.mutate()}
                    disabled={markAllNotifs.isPending}
                    data-testid="btn-mark-all-notifs-read"
                  >
                    Mark all read
                  </button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifQuery.isLoading ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  Loading...
                </div>
              ) : notifQuery.isError ? (
                <div className="px-3 py-6 text-sm text-destructive text-center">
                  Failed to load notifications.
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No notifications.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "px-3 py-2 text-sm border-l-2",
                      n.status === "read"
                        ? "border-transparent"
                        : "border-primary bg-accent/30",
                    )}
                    data-testid={`notification-${n.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{n.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {n.message}
                    </p>
                    {n.status === "unread" && (
                      <button
                        className="text-[11px] text-primary hover:underline mt-1"
                        onClick={() => markNotif.mutate({ id: n.id })}
                        disabled={markNotif.isPending}
                        data-testid={`btn-mark-notif-${n.id}-read`}
                      >
                        Mark as read
                      </button>
                    )}
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
                    data-testid="badge-messages-unread"
                  >
                    {unreadM}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 max-h-[28rem] overflow-y-auto" align="end">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Messages</span>
                {unreadM > 0 && (
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => markAllMsgs.mutate()}
                    disabled={markAllMsgs.isPending}
                    data-testid="btn-mark-all-msgs-read"
                  >
                    Mark all read
                  </button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {msgQuery.isLoading ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  Loading...
                </div>
              ) : msgQuery.isError ? (
                <div className="px-3 py-6 text-sm text-destructive text-center">
                  Failed to load messages.
                </div>
              ) : messages.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No messages.
                </div>
              ) : (
                messages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleOpenMessage(m)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm border-l-2 hover-elevate",
                      m.status === "read"
                        ? "border-transparent"
                        : "border-primary bg-accent/30",
                    )}
                    data-testid={`message-${m.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">
                        {m.senderName ?? "System"}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs font-medium mt-0.5 truncate">
                      {m.subject}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.body}
                    </p>
                  </button>
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

      <Dialog
        open={!!openMessage}
        onOpenChange={(o) => !o && setOpenMessage(null)}
      >
        <DialogContent
          className="max-w-lg"
          data-testid="dialog-message-details"
        >
          {openMessage && (
            <>
              <DialogHeader>
                <DialogTitle>{openMessage.subject}</DialogTitle>
                <DialogDescription>
                  From <span className="font-medium">{openMessage.senderName ?? "System"}</span>
                  {" · "}
                  {new Date(openMessage.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {openMessage.body}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
