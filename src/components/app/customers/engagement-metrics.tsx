import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Clock, Timer, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type Msg = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound" | string;
  created_at: string;
};
type Conv = { id: string; status: string | null; last_message_at: string | null };

const STATUS_COLORS: Record<string, string> = {
  open: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  on_hold: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  resolved: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  closed: "bg-muted text-muted-foreground",
};

export function EngagementMetrics({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ["engagement-metrics", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const conv = await sbAny(db).from("conversations")
        .select("id, status, last_message_at")
        .eq("contact_id", customerId);
      const conversations: Conv[] = conv.data ?? [];
      const ids = conversations.map((c) => c.id);
      let messages: Msg[] = [];
      if (ids.length) {
        const { data } = await sbAny(db).from("messages")
          .select("id, conversation_id, direction, created_at")
          .in("conversation_id", ids)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(2000);
        messages = data ?? [];
      }
      return { conversations, messages };
    },
  });

  const metrics = useMemo(() => {
    const conversations = q.data?.conversations ?? [];
    const messages = q.data?.messages ?? [];

    // Last contact = latest message timestamp
    const lastMsg = messages.length ? messages[messages.length - 1].created_at : null;
    const lastContact = lastMsg ??
      conversations.map((c) => c.last_message_at).filter(Boolean).sort().slice(-1)[0] ?? null;

    // Average first-response time: time from inbound → next outbound within same conversation
    const byConv = new Map<string, Msg[]>();
    for (const m of messages) {
      if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []);
      byConv.get(m.conversation_id)!.push(m);
    }
    const gaps: number[] = [];
    for (const arr of byConv.values()) {
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i].direction === "inbound" && arr[i + 1].direction === "outbound") {
          gaps.push(new Date(arr[i + 1].created_at).getTime() - new Date(arr[i].created_at).getTime());
        }
      }
    }
    const avgMs = gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : null;

    // Status breakdown
    const status = new Map<string, number>();
    for (const c of conversations) {
      const k = c.status ?? "unknown";
      status.set(k, (status.get(k) ?? 0) + 1);
    }

    return {
      lastContact,
      totalConversations: conversations.length,
      totalMessages: messages.length,
      avgResponseMs: avgMs,
      statusBreakdown: Array.from(status.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [q.data]);

  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Engagement metrics</h3>
        {q.isLoading && <span className="text-[11px] text-muted-foreground">Loading</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Clock className="w-4 h-4 text-sky-500" />}
          label="Last contact"
          value={metrics.lastContact ? fmtRelative(metrics.lastContact) : "—"}
          hint={metrics.lastContact ? new Date(metrics.lastContact).toLocaleString() : undefined}
        />
        <Stat
          icon={<MessageSquare className="w-4 h-4 text-emerald-500" />}
          label="Conversations"
          value={String(metrics.totalConversations)}
          hint={`${metrics.totalMessages} messages`}
        />
        <Stat
          icon={<Timer className="w-4 h-4 text-amber-500" />}
          label="Avg response time"
          value={metrics.avgResponseMs != null ? fmtDuration(metrics.avgResponseMs) : "—"}
          hint={metrics.avgResponseMs != null ? "inbound → outbound" : "No replies yet"}
        />
        <div className="rounded-control border border-border p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <Activity className="w-4 h-4 text-violet-500" /> Status breakdown
          </div>
          {metrics.statusBreakdown.length ? (
            <div className="flex flex-wrap gap-1">
              {metrics.statusBreakdown.map(([s, n]) => (
                <Badge
                  key={s}
                  variant="outline"
                  className={cn("capitalize text-[11px]", STATUS_COLORS[s] ?? "")}
                >
                  {s.replace(/_/g, " ")} · {n}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No conversations</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-control border border-border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-lg font-display font-semibold mt-1  truncate">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
