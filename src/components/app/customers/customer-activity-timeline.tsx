import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  AlarmClock,
  Sparkles,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { sbAny } from "@/lib/supabase/untyped";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type Kind = "message" | "call" | "email" | "meeting" | "task" | "followup";

type Event = {
  id: string;
  kind: Kind;
  at: string; // sort timestamp (ISO)
  isFuture: boolean; // scheduled / due in the future
  title: string;
  subtitle?: string;
  meta?: string;
  status?: string;
  direction?: "in" | "out";
  href?: { to: string; params?: Record<string, string> };
};

const META: Record<Kind, { label: string; icon: any; color: string }> = {
  message: { label: "Messages", icon: MessageSquare, color: "bg-sky-500/10 text-sky-500" },
  call: { label: "Calls", icon: Phone, color: "bg-emerald-500/10 text-emerald-500" },
  email: { label: "Emails", icon: Mail, color: "bg-cyan-500/10 text-cyan-500" },
  meeting: { label: "Meetings", icon: Calendar, color: "bg-violet-500/10 text-violet-500" },
  task: { label: "Tasks", icon: CheckCircle2, color: "bg-orange-500/10 text-orange-500" },
  followup: { label: "Follow-ups", icon: AlarmClock, color: "bg-amber-500/10 text-amber-500" },
};
const ALL: Kind[] = ["message", "call", "email", "meeting", "task", "followup"];

export function CustomerActivityTimeline({ customerId }: { customerId: string }) {
  const [enabled, setEnabled] = useState<Set<Kind>>(new Set(ALL));

  const messagesQ = useQuery({
    queryKey: ["cust-tl-messages", customerId],
    queryFn: async () => {
      const conv = await sbAny(db).from("conversations").select("id").eq("contact_id", customerId);
      const ids = (conv.data ?? []).map((c: any) => c.id);
      if (!ids.length) return [];
      const { data } = await sbAny(db)
        .from("messages")
        .select("id, conversation_id, direction, body, message_type, status, created_at, provider")
        .in("conversation_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const salesQ = useQuery({
    queryKey: ["cust-tl-sales", customerId],
    queryFn: async () => {
      const { data } = await sbAny(db)
        .from("sales_activities")
        .select(
          "id, type, title, description, start_at, end_at, status, outcome, reminder_at, completed_at, created_at",
        )
        .in("entity_type", ["contact", "customer"])
        .eq("entity_id", customerId)
        .is("deleted_at", null)
        .order("start_at", { ascending: false, nullsFirst: false })
        .limit(200);
      return data ?? [];
    },
  });

  const tasksQ = useQuery({
    queryKey: ["cust-tl-tasks", customerId],
    queryFn: async () => {
      const { data } = await sbAny(db)
        .from("tasks")
        .select("id, title, status, priority, due_at, reminder_at, completed_at, created_at")
        .in("entity_type", ["contact", "customer"])
        .eq("entity_id", customerId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(200);
      return data ?? [];
    },
  });

  const events = useMemo<Event[]>(() => {
    const now = Date.now();
    const out: Event[] = [];

    for (const m of messagesQ.data ?? []) {
      out.push({
        id: `msg-${m.id}`,
        kind: "message",
        at: m.created_at,
        isFuture: false,
        title: m.body?.slice(0, 140) || `${m.message_type ?? "message"}`,
        subtitle: `${m.provider ?? "whatsapp"} · ${m.status ?? ""}`,
        direction: m.direction === "outbound" ? "out" : "in",
        status: m.status,
      });
    }

    for (const a of salesQ.data ?? []) {
      const kind: Kind =
        a.type === "call"
          ? "call"
          : a.type === "email"
            ? "email"
            : a.type === "meeting"
              ? "meeting"
              : "task";
      const at = a.start_at ?? a.reminder_at ?? a.created_at;
      const isFuture = !a.completed_at && at && new Date(at).getTime() > now;
      out.push({
        id: `sa-${a.id}`,
        kind,
        at,
        isFuture: !!isFuture,
        title: a.title || META[kind].label,
        subtitle: a.description || undefined,
        meta: [a.status, a.outcome].filter(Boolean).join(" · ") || undefined,
        status: a.completed_at ? "completed" : a.status,
      });
      if (a.reminder_at && !a.completed_at && new Date(a.reminder_at).getTime() > now) {
        out.push({
          id: `sa-rem-${a.id}`,
          kind: "followup",
          at: a.reminder_at,
          isFuture: true,
          title: `Reminder: ${a.title || META[kind].label}`,
          subtitle: `${META[kind].label.toLowerCase()} follow-up`,
        });
      }
    }

    for (const t of tasksQ.data ?? []) {
      const at = t.due_at ?? t.reminder_at ?? t.created_at;
      const isFuture = !t.completed_at && !!t.due_at && new Date(t.due_at).getTime() > now;
      out.push({
        id: `task-${t.id}`,
        kind: t.completed_at ? "task" : isFuture ? "followup" : "task",
        at,
        isFuture,
        title: t.title,
        subtitle: t.priority ? `Priority: ${t.priority}` : undefined,
        meta: t.status,
        status: t.completed_at ? "completed" : t.status,
      });
    }

    return out.filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [messagesQ.data, salesQ.data, tasksQ.data]);

  const filtered = useMemo(() => events.filter((e) => enabled.has(e.kind)), [events, enabled]);

  const upcoming = useMemo(() => {
    return events
      .filter((e) => e.isFuture)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .slice(0, 5);
  }, [events]);

  const formatZonedDate = useZonedDateFormatter();
  const grouped = useMemo(() => groupByDay(filtered, formatZonedDate), [filtered, formatZonedDate]);
  const isLoading = messagesQ.isLoading || salesQ.isLoading || tasksQ.isLoading;

  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Customer activity</h3>
          <Badge variant="outline" className="text-[11px]">
            {events.length}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5" /> Filter
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Event types</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL.map((k) => (
              <DropdownMenuCheckboxItem
                key={k}
                checked={enabled.has(k)}
                onCheckedChange={(v) =>
                  setEnabled((s) => {
                    const n = new Set(s);
                    if (v) n.add(k);
                    else n.delete(k);
                    return n;
                  })
                }
              >
                {META[k].label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {upcoming.length > 0 && (
        <div className="p-4 border-b border-border bg-amber-500/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500 uppercase tracking-wide">
            <AlarmClock className="w-3 h-3" /> Upcoming follow-ups
          </div>
          <ul className="space-y-1.5">
            {upcoming.map((e) => {
              const Icon = META[e.kind].icon;
              return (
                <li key={e.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full grid place-items-center shrink-0",
                      META[e.kind].color,
                    )}
                  >
                    <Icon className="w-3 h-3" />
                  </span>
                  <span className="flex-1 min-w-0 truncate">{e.title}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {fmtRelative(e.at)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="relative">
        {isLoading && <div className="p-6 text-xs text-muted-foreground">Loading activity</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No message, call, or follow-up events yet.
          </div>
        )}
        {grouped.map(([day, items]) => (
          <div key={day}>
            <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur px-4 py-1.5 text-[11px] font-medium  text-muted-foreground border-b border-border">
              {day}
            </div>
            <ol className="relative">
              <div className="absolute left-[27px] top-0 bottom-0 w-px bg-border" aria-hidden />
              {items.map((e) => (
                <EventNode key={e.id} e={e} formatZonedDate={formatZonedDate} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventNode({
  e,
  formatZonedDate,
}: {
  e: Event;
  formatZonedDate: (date: Date | string | number, options: Intl.DateTimeFormatOptions) => string;
}) {
  const meta = META[e.kind];
  const Icon = meta.icon;
  return (
    <li className="relative pl-12 pr-4 py-2.5">
      <span
        className={cn(
          "absolute left-[15px] top-3 w-6 h-6 rounded-full grid place-items-center ring-4 ring-surface",
          meta.color,
        )}
      >
        <Icon className="w-3 h-3" />
      </span>
      <div className="flex items-start gap-2 text-sm">
        <div className="flex-1 min-w-0">
          <p className="leading-tight flex items-center gap-1.5 flex-wrap">
            {e.kind === "message" &&
              e.direction &&
              (e.direction === "out" ? (
                <ArrowUpRight className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <ArrowDownLeft className="w-3 h-3 text-sky-500 shrink-0" />
              ))}
            <span className="font-medium truncate">{e.title}</span>
            {e.isFuture && (
              <Badge variant="outline" className="text-[11px] text-amber-500 border-amber-500/40">
                Upcoming
              </Badge>
            )}
            {e.status === "completed" && (
              <Badge variant="outline" className="text-[11px]">
                Done
              </Badge>
            )}
          </p>
          {e.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.subtitle}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
            {formatZonedDate(e.at, {
              hour: "numeric",
              minute: "2-digit",
              month: "short",
              day: "numeric",
            })}{" "}
            · {meta.label}
            {e.meta ? ` · ${e.meta}` : ""}
          </p>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------- Helpers ------------------------------- */

function groupByDay(
  items: Event[],
  formatZonedDate: (date: Date | string | number, options: Intl.DateTimeFormatOptions) => string,
): [string, Event[]][] {
  const map = new Map<string, Event[]>();
  for (const it of items) {
    const key = formatZonedDate(it.at, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return Array.from(map.entries());
}

function fmtRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = d - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(mins / 60);
  const days = Math.round(hrs / 24);
  const suffix = diff >= 0 ? "" : " ago";
  const prefix = diff >= 0 ? "in " : "";
  if (mins < 60) return `${prefix}${mins}m${suffix}`;
  if (hrs < 24) return `${prefix}${hrs}h${suffix}`;
  return `${prefix}${days}d${suffix}`;
}
