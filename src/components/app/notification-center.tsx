import {
  Bell,
  CheckCheck,
  Archive,
  Trash2,
  ExternalLink,
  MessagesSquare,
  Send,
  Sparkles,
  ShieldAlert,
  CreditCard,
  UserPlus,
  AtSign,
  CheckSquare,
  Handshake,
  Megaphone,
  Info,
  Building2,
  MoreHorizontal,
  Settings2,
  KeyRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { playTaskReminderSound } from "@/lib/tasks/reminder-sound";
import { notificationActionUrl, selectNotificationTenant } from "@/lib/notifications/action-url";
import {
  notificationSection,
  NOTIFICATION_SECTIONS,
  type NotificationSection,
} from "@/lib/notifications/presentation";
import { useOrganizations } from "@/hooks/use-organization";
import { useWorkspaces } from "@/hooks/use-workspace";
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useArchiveNotification,
  useDeleteNotification,
  useNotificationsRealtime,
  type NotificationRow,
  type NotificationCategory,
} from "@/hooks/use-notifications";

const CATEGORY_META: Record<
  NotificationCategory,
  {
    icon: typeof Bell;
    tone: "info" | "success" | "warn" | "danger";
  }
> = {
  system: { icon: Info, tone: "info" },
  workspace: { icon: Building2, tone: "info" },
  invitation: { icon: UserPlus, tone: "info" },
  security: { icon: ShieldAlert, tone: "danger" },
  subscription: { icon: CreditCard, tone: "warn" },
  mention: { icon: AtSign, tone: "info" },
  assignment: { icon: CheckSquare, tone: "info" },
  task: { icon: CheckSquare, tone: "info" },
  deal: { icon: Handshake, tone: "success" },
  campaign: { icon: Megaphone, tone: "success" },
  workflow: { icon: Sparkles, tone: "info" },
  usage_alert: { icon: ShieldAlert, tone: "warn" },
  ai: { icon: Sparkles, tone: "info" },
  info: { icon: MessagesSquare, tone: "info" },
  ticket_mention: { icon: AtSign, tone: "info" },
  livechat_handoff: { icon: MessagesSquare, tone: "warn" },
  birthday: { icon: UserPlus, tone: "success" },
  communication: { icon: MessagesSquare, tone: "info" },
  crm: { icon: Handshake, tone: "success" },
  marketing: { icon: Megaphone, tone: "success" },
  automation: { icon: Sparkles, tone: "info" },
  project: { icon: CheckSquare, tone: "info" },
  insights: { icon: Info, tone: "info" },
  api_configuration: { icon: KeyRound, tone: "warn" },
  settings: { icon: Settings2, tone: "info" },
  platform: { icon: Building2, tone: "warn" },
};

export function iconForCategory(category: NotificationCategory | null | undefined) {
  return CATEGORY_META[category ?? "info"] ?? CATEGORY_META.info;
}

/**
 * Resolves a notification's `action_url` (a plain path+query string, e.g.
 * `/inbox?conversationId=`) through the SPA router instead of a bare `<a
 * href>`. A real anchor forces a full page reload — the Popover closes from
 * the navigation itself, but on a slow connection the old page sits there
 * looking unresponsive, which is what read as "clicking does nothing". Client
 * navigation is instant and also lets the click close the popover first, so
 * the Inbox underneath is already in view.
 */
function navigateToAction(router: ReturnType<typeof useRouter>, actionUrl: string): void {
  if (actionUrl.startsWith("https://")) {
    window.location.assign(actionUrl);
    return;
  }
  // `href` lets the router parse pathname + search + hash itself instead of
  // us re-deriving them — the previous `to: url.pathname, search: {...}`
  // split silently dropped the navigation when a param's shape didn't match
  // what the target route's `validateSearch` expected (e.g. `view` being a
  // string from `URLSearchParams` instead of its real union type), since
  // `router.navigate`'s rejection is an unhandled promise, not a thrown error.
  router.navigate({ href: actionUrl }).catch((err) => {
    console.warn("[notifications] client navigation failed, falling back to a hard link:", err);
    window.location.href = actionUrl;
  });
}

export function NotificationCenter() {
  const router = useRouter();
  const { data: organizations = [] } = useOrganizations();
  const { data: workspaces = [] } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<NotificationSection | "All">("All");
  const sectionViewportRef = useRef<HTMLDivElement>(null);
  const { data: items = [], isLoading, isError, refetch } = useNotifications({ status: "active" });
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const archive = useArchiveNotification();
  const del = useDeleteNotification();

  useNotificationsRealtime((row) => {
    toast(row.title, { description: row.body ?? undefined });
    if (row.category === "task" && typeof row.data?.kind === "string") {
      playTaskReminderSound();
    }
  });

  const availableSections = NOTIFICATION_SECTIONS.filter((name) =>
    items.some((item) => notificationSection(item) === name),
  );
  const visible = section === "All" ? items : items.filter((item) => notificationSection(item) === section);

  useEffect(() => {
    if (!open) return;
    const viewport = sectionViewportRef.current;
    const active = viewport?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!viewport || !active) return;

    const viewportBounds = viewport.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    const centeredLeft = viewport.scrollLeft + activeBounds.left - viewportBounds.left
      + activeBounds.width / 2 - viewportBounds.width / 2;
    viewport.scrollTo({
      left: centeredLeft,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [open, section, availableSections.length]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative grid h-9 w-9 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-background bg-accent px-1.5 text-[11px] font-semibold leading-none text-accent-foreground shadow-sm animate-scale-in">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)] p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-display text-sm font-semibold">Notifications</div>
            <div className="text-[11px] text-muted-foreground">{unread} unread</div>
          </div>
          <button
            onClick={() => markAllRead.mutate()}
            disabled={unread === 0 || markAllRead.isPending}
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
        {(availableSections.length > 1 || section !== "All") && (
          <ScrollArea
            orientation="horizontal"
            type="hover"
            viewportRef={sectionViewportRef}
            className="w-full border-b border-border"
            aria-label="Notification sections"
          >
            <div className="flex w-max gap-1 px-3 py-2">
              {(["All", ...availableSections] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSection(name)}
                  aria-pressed={section === name}
                  className={cn(
                    "shrink-0 rounded-xs px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    section === name ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
        <ScrollArea className="max-h-[420px]" viewportClassName="max-h-[420px]">
        <ul className="divide-y divide-border">
          {isLoading && <li className="p-8 text-center text-sm text-muted-foreground">Loading notifications...</li>}
          {isError && <li className="p-8 text-center text-sm text-destructive">Could not load notifications. <button className="underline" onClick={() => void refetch()}>Retry</button></li>}
          {!isLoading && !isError && visible.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</li>
          )}
          {visible.map((n) => (
            <NotificationRowItem
              key={n.id}
              n={n}
              onRead={markRead.mutate}
              onArchive={archive.mutate}
              onDelete={del.mutate}
              onNavigate={(url, notification) => {
                selectNotificationTenant(notification, organizations, workspaces);
                setOpen(false);
                navigateToAction(router, url);
              }}
            />
          ))}
        </ul>
        </ScrollArea>
        <div className="border-t border-border px-4 py-2 text-center">
          <Link
            to="/notifications"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRowItem({
  n,
  onRead,
  onArchive,
  onDelete,
  onNavigate,
}: {
  n: NotificationRow;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (actionUrl: string, notification: NotificationRow) => void;
}) {
  const meta = iconForCategory(n.category);
  const Icon = meta.icon;
  const unread = n.status === "unread";
  const actionUrl = notificationActionUrl(n);
  const source = notificationSection(n);

  const body = (
    <div className="flex gap-3 px-4 pb-1 pt-3">
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-control",
          meta.tone === "success" && "bg-success/15 text-success",
          meta.tone === "warn" && "bg-warning/15 text-warning",
          meta.tone === "info" && "bg-accent/15 text-accent",
          meta.tone === "danger" && "bg-destructive/15 text-destructive",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {source && <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{source}</div>}
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{n.title}</div>
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: false })}
          </div>
        </div>
        {n.body && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
        )}
      </div>
      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </div>
  );

  return (
    <li className={cn("transition-colors hover:bg-muted/50", unread && "bg-accent/[0.04]")}>
      {actionUrl ? (
        <a
          href={actionUrl}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.preventDefault();
            if (unread) onRead(n.id);
            onNavigate(actionUrl, n);
          }}
        >
          {body}
        </a>
      ) : (
        <button
          type="button"
          className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => unread && onRead(n.id)}
        >
          {body}
        </button>
      )}
      <div className="pb-2 pl-14">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Actions for ${n.title}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" /> Actions
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            {actionUrl && (
              <DropdownMenuItem onSelect={() => {
                if (unread) onRead(n.id);
                onNavigate(actionUrl, n);
              }}>
                <ExternalLink className="h-4 w-4" /> Open
              </DropdownMenuItem>
            )}
            {unread && (
              <DropdownMenuItem onSelect={() => onRead(n.id)}>
                <CheckCheck className="h-4 w-4" /> Mark read
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onArchive(n.id)}>
              <Archive className="h-4 w-4" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDelete(n.id)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
