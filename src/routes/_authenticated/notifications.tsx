import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Archive, Trash2, ArchiveRestore, Send, Plus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import {
  useNotifications, useMarkRead, useMarkAllRead, useArchiveNotification,
  useUnarchiveNotification, useDeleteNotification,
  useCreateNotification, useUnreadCount,
  type NotificationRow, type NotificationCategory, type NotificationStatus,
} from "@/hooks/use-notifications";
import { iconForCategory } from "@/components/app/notification-center";
import { notificationActionUrl, selectNotificationTenant } from "@/lib/notifications/action-url";
import { notificationSection, NOTIFICATION_SECTIONS, type NotificationSection } from "@/lib/notifications/presentation";
import { useOrganizations } from "@/hooks/use-organization";
import { useWorkspaces } from "@/hooks/use-workspace";
import { AppTopbar } from "@/components/app/app-topbar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const CATEGORIES: { value: NotificationCategory; label: string }[] = [
  { value: "system", label: "System alerts" },
  { value: "workspace", label: "Workspace" },
  { value: "invitation", label: "Invitations" },
  { value: "security", label: "Security" },
  { value: "subscription", label: "Subscription" },
  { value: "mention", label: "Mentions" },
  { value: "assignment", label: "Assignments" },
  { value: "task", label: "Tasks" },
  { value: "deal", label: "Deals" },
  { value: "campaign", label: "Campaigns" },
  { value: "workflow", label: "Workflows" },
  { value: "usage_alert", label: "Usage alerts" },
  { value: "ai", label: "AI" },
  { value: "info", label: "General" },
  { value: "ticket_mention", label: "Ticket mentions" },
  { value: "livechat_handoff", label: "Live chat handoffs" },
  { value: "birthday", label: "Birthdays" },
  { value: "communication", label: "Communication" },
  { value: "crm", label: "CRM" },
  { value: "project", label: "Projects & boards" },
  { value: "marketing", label: "Marketing" },
  { value: "automation", label: "Automation" },
  { value: "insights", label: "Insights" },
  { value: "api_configuration", label: "API configuration" },
  { value: "settings", label: "Settings" },
  { value: "platform", label: "Platform" },
];

function NotificationsPage() {
  const [tab, setTab] = useState<NotificationStatus | "all">("unread");
  const [section, setSection] = useState<NotificationSection | "All">("All");
  const [query, setQuery] = useState("");

  const { data: unread = 0 } = useUnreadCount();
  const { data: all = [] } = useNotifications({ status: "all" });

  const markAllRead = useMarkAllRead();

  const filtered = useMemo(() => {
    let list = all;
    if (section !== "All") list = list.filter((n) => notificationSection(n) === section);
    if (tab !== "all") list = list.filter((n) => n.status === tab);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((n) =>
        n.title.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [all, tab, section, query]);

  const counts = useMemo(() => ({
    unread: all.filter((n) => n.status === "unread").length,
    read: all.filter((n) => n.status === "read").length,
    archived: all.filter((n) => n.status === "archived").length,
    all: all.length,
  }), [all]);

  return (
    <>
      <AppTopbar
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread · Realtime updates enabled` : "All caught up · Realtime updates enabled"}
        actions={
          <div className="flex gap-2">
            <TestNotificationButton />
            <Button variant="outline" onClick={() => markAllRead.mutate()} disabled={unread === 0}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </div>
        }
      />
      <main className="container mx-auto max-w-7xl p-6 space-y-6">

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search notifications"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={section} onValueChange={(v) => setSection(v as NotificationSection | "All")}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All sections</SelectItem>
            {NOTIFICATION_SECTIONS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="unread">Unread <Badge variant="secondary" className="ml-2">{counts.unread}</Badge></TabsTrigger>
          <TabsTrigger value="read">Read <Badge variant="secondary" className="ml-2">{counts.read}</Badge></TabsTrigger>
          <TabsTrigger value="archived">Archived <Badge variant="secondary" className="ml-2">{counts.archived}</Badge></TabsTrigger>
          <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{counts.all}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <NotificationList items={filtered} />
        </TabsContent>
      </Tabs>
    </main>
    </>
  );
}

function NotificationList({ items }: { items: NotificationRow[] }) {
  const { data: organizations = [] } = useOrganizations();
  const { data: workspaces = [] } = useWorkspaces();
  const markRead = useMarkRead();
  const archive = useArchiveNotification();
  const unarchive = useUnarchiveNotification();
  const del = useDeleteNotification();

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-40" />
          Nothing here yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="rounded-control border divide-y bg-card">
      {items.map((n) => {
        const meta = iconForCategory(n.category);
        const Icon = meta.icon;
        const unread = n.status === "unread";
        return (
          <li key={n.id} className={cn("flex gap-4 p-4 hover:bg-muted/40 transition-colors", unread && "bg-accent/[0.04]")}>
            <div className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-control",
              meta.tone === "success" && "bg-success/15 text-success",
              meta.tone === "warn" && "bg-warning/15 text-warning",
              meta.tone === "info" && "bg-accent/15 text-accent",
              meta.tone === "danger" && "bg-destructive/15 text-destructive",
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{n.title}</span>
                  {n.category && (
                    <Badge variant="outline" className="text-[11px] uppercase">{n.category}</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
              </div>
              {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {notificationActionUrl(n) && (
                  <Button asChild size="sm" variant="outline">
                    <a href={notificationActionUrl(n)!} onClick={() => {
                      selectNotificationTenant(n, organizations, workspaces);
                      if (unread) markRead.mutate(n.id);
                    }}>Open</a>
                  </Button>
                )}
                {unread && (
                  <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                    <CheckCheck className="h-3.5 w-3.5 " /> Mark read
                  </Button>
                )}
                {n.status !== "archived" ? (
                  <Button size="sm" variant="ghost" onClick={() => archive.mutate(n.id)}>
                    <Archive className="h-3.5 w-3.5 " /> Archive
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => unarchive.mutate(n.id)}>
                    <ArchiveRestore className="h-3.5 w-3.5 " /> Restore
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => del.mutate(n.id)}>
                  <Trash2 className="h-3.5 w-3.5 " /> Delete
                </Button>
              </div>
            </div>
            {unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </li>
        );
      })}
    </ul>
  );
}

function TestNotificationButton() {
  const create = useCreateNotification();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("info");

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    if (actionUrl.trim() && !notificationActionUrl({ action_url: actionUrl.trim(), data: {}, organization_id: null })) {
      return toast.error("Use an app path or an HTTPS URL");
    }
    await create.mutateAsync({ title: title.trim(), body: body.trim() || undefined, category, action_url: actionUrl.trim() || undefined });
    setTitle(""); setBody(""); setActionUrl("");
    setOpen(false);
    toast.success("Notification sent");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="h-4 w-4" /> Send test</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Send a test notification</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as NotificationCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New comment on deal" />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
              placeholder="Sarah replied on Acme Corp — Q4 renewal" />
          </div>
          <div>
            <Label>Open link (optional)</Label>
            <Input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="/projects/tasks" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={create.isPending}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
