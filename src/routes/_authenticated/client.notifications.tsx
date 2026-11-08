import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Bell, Check, CheckCheck, Loader2, MessageSquare, Calendar, Receipt, CreditCard,
  Package, Headphones, Megaphone, Info, ShieldAlert, Mail, Smartphone, Globe, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotificationsV2, markNotificationRead,
  getMyNotificationPrefs, updateMyNotificationPrefs,
} from "@/lib/client-portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/client/notifications")({
  component: NotificationsPage,
});

type NotifGroup =
  | "messages" | "appointments" | "invoices" | "payments"
  | "orders" | "tickets" | "campaigns" | "announcements" | "system";

type Notif = {
  id: string; title: string | null; body: string | null; category: string | null;
  channel: string | null; action_url: string | null; status: string | null;
  read_at: string | null; created_at: string; group: NotifGroup;
};

type Counts = Record<NotifGroup, number>;

const GROUPS: Array<{ key: NotifGroup; label: string; icon: typeof Bell }> = [
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "appointments", label: "Appointments", icon: Calendar },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "orders", label: "Orders", icon: Package },
  { key: "tickets", label: "Tickets", icon: Headphones },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "announcements", label: "Announcements", icon: Info },
  { key: "system", label: "System alerts", icon: ShieldAlert },
];

const CHANNELS: Array<{ key: "in_app" | "email" | "whatsapp" | "push"; label: string; icon: typeof Bell }> = [
  { key: "in_app", label: "In-app", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: Globe },
  { key: "push", label: "Push", icon: Smartphone },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function NotificationsPage() {
  const listFn = useServerFn(listMyNotificationsV2);
  const markFn = useServerFn(markNotificationRead);
  const qc = useQueryClient();
  const [category, setCategory] = useState<NotifGroup | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const q = useQuery({
    queryKey: ["client-notifications-v2", category, unreadOnly],
    queryFn: () => listFn({
      data: {
        category: category === "all" ? undefined : category,
        unread_only: unreadOnly || undefined,
        limit: 100,
      },
    }),
  });

  useEffect(() => {
    const ch = supabase
      .channel("client-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" },
        () => qc.invalidateQueries({ queryKey: ["client-notifications-v2"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const mark = useMutation({
    mutationFn: (v: { id?: string; all?: boolean }) => markFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-notifications-v2"] }),
  });

  const rows = (q.data?.items ?? []) as Notif[];
  const counts = (q.data?.counts ?? {} as Counts) as Counts;
  const unreadTotal = q.data?.unread_total ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase   text-accent font-medium">Notifications</p>
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" /> Inbox
            {unreadTotal > 0 && (
              <span className="text-xs bg-accent text-accent-foreground rounded-control px-2 py-0.5">{unreadTotal}</span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stay on top of activity across your account, and pick where you get notified.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground flex items-center gap-2 pr-2">
            <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} /> Unread only
          </label>
          {unreadTotal > 0 && (
            <Button variant="outline" size="sm" onClick={() => mark.mutate({ all: true })}>
              <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all read
            </Button>
          )}
          <PreferencesDialog />
        </div>
      </header>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        <CatTab
          active={category === "all"} onClick={() => setCategory("all")}
          label="All" icon={Bell}
          count={Object.values(counts).reduce((a: number, b) => a + (b as number), 0)}
        />
        {GROUPS.map((g) => (
          <CatTab
            key={g.key} active={category === g.key} onClick={() => setCategory(g.key)}
            label={g.label} icon={g.icon} count={counts[g.key] ?? 0}
          />
        ))}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-14 text-center">
          <div className="w-12 h-12 mx-auto rounded-control bg-accent/10 text-accent grid place-items-center">
            <Bell className="w-6 h-6" />
          </div>
          <p className="font-display text-lg font-semibold mt-3">You're all caught up</p>
          <p className="text-sm text-muted-foreground mt-1">Nothing new in this category.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-control border border-border bg-surface overflow-hidden">
          {rows.map((n) => (
            <NotifRow key={n.id} n={n} onMark={(id) => mark.mutate({ id })} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CatTab({
  active, onClick, label, icon: Icon, count,
}: { active: boolean; onClick: () => void; label: string; icon: typeof Bell; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-surface hover:bg-muted"
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
      {count > 0 && (
        <span className={`ml-0.5 rounded-control text-[11px] px-1.5 py-0.5 ${
          active ? "bg-white/20" : "bg-background/60 border border-border"
        }`}>{count}</span>
      )}
    </button>
  );
}

function channelIcon(ch: string | null) {
  const k = (ch ?? "").toLowerCase();
  if (k.includes("email")) return Mail;
  if (k.includes("whatsapp") || k.includes("wa")) return Globe;
  if (k.includes("push") || k.includes("sms")) return Smartphone;
  return Bell;
}

function NotifRow({ n, onMark }: { n: Notif; onMark: (id: string) => void }) {
  const group = GROUPS.find((g) => g.key === n.group);
  const ChannelIcon = channelIcon(n.channel);
  return (
    <li className={`p-4 flex items-start gap-3 transition-colors ${n.read_at ? "opacity-70" : "bg-accent/[0.03]"}`}>
      <div className={`mt-0.5 w-8 h-8 rounded-control grid place-items-center shrink-0 ${
        n.read_at ? "bg-muted/50 text-muted-foreground" : "bg-accent/10 text-accent"
      }`}>
        {group ? <group.icon className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{n.title || "Notification"}</p>
          {group && (
            <span className="text-[11px]  text-muted-foreground border border-border rounded px-1.5 py-0.5">
              {group.label}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <ChannelIcon className="w-3 h-3" /> {n.channel || "in-app"}
          </span>
        </div>
        {n.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.body}</p>}
        <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {n.action_url && (
          <a href={n.action_url} className="text-xs text-accent hover:underline">Open</a>
        )}
        {!n.read_at && (
          <button onClick={() => onMark(n.id)} title="Mark as read"
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

/* Preferences dialog */

function PreferencesDialog() {
  const getPrefs = useServerFn(getMyNotificationPrefs);
  const setPrefs = useServerFn(updateMyNotificationPrefs);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notif-prefs"],
    queryFn: () => getPrefs(),
    enabled: open,
  });

  const upd = useMutation({
    mutationFn: (v: { category: NotifGroup; channels: Record<string, boolean> }) =>
      setPrefs({ data: { category: v.category, channels: v.channels } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-prefs"] });
      toast.success("Preferences updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const prefs = q.data as Record<NotifGroup, Record<string, boolean>> | undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-4 h-4 mr-1.5" /> Channels
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notification channels</DialogTitle>
        </DialogHeader>
        {q.isLoading || !prefs ? (
          <div className="p-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pl-1">Category</th>
                  {CHANNELS.map((c) => (
                    <th key={c.key} className="py-2 text-center">
                      <div className="inline-flex items-center gap-1"><c.icon className="w-3 h-3" /> {c.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => {
                  const row = prefs[g.key] ?? {};
                  return (
                    <tr key={g.key} className="border-b border-border last:border-0">
                      <td className="py-2.5 pl-1 flex items-center gap-2">
                        <g.icon className="w-4 h-4 text-accent" /> {g.label}
                      </td>
                      {CHANNELS.map((c) => (
                        <td key={c.key} className="py-2.5 text-center">
                          <Switch
                            checked={!!row[c.key]}
                            onCheckedChange={(v) => upd.mutate({
                              category: g.key,
                              channels: { [c.key]: v },
                            })}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-3">
          Note: for legal or security-critical events, we may still contact you by email.
        </p>
      </DialogContent>
    </Dialog>
  );
}
