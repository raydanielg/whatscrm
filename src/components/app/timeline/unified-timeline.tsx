import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import {
  MessageCircle,
  Instagram,
  Facebook,
  Send,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Sparkles,
  CheckSquare,
  Briefcase,
  FileText,
  CreditCard,
  Megaphone,
  Workflow,
  Calendar,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  Download,
  X,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUnifiedTimeline } from "@/hooks/use-unified-timeline";
import { useTenantTimezone, useZonedDateFormatter } from "@/hooks/use-timezone";
import { formatInTimezone, isSameZonedDay } from "@/lib/datetime/timezone";
import type {
  TimelineChannel,
  TimelineEvent,
  TimelineKind,
} from "@/lib/timeline/timeline.functions";

const KIND_META: Record<
  TimelineKind,
  { icon: React.ComponentType<{ className?: string }>; label: string; tone: string }
> = {
  message: {
    icon: MessageCircle,
    label: "Message",
    tone: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  },
  call: {
    icon: Phone,
    label: "Call",
    tone: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  },
  email: {
    icon: Mail,
    label: "Email",
    tone: "bg-indigo-500/10 text-indigo-500 ring-indigo-500/20",
  },
  sms: { icon: MessageSquare, label: "SMS", tone: "bg-cyan-500/10 text-cyan-500 ring-cyan-500/20" },
  note: {
    icon: StickyNote,
    label: "Note",
    tone: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  },
  ai_note: {
    icon: Sparkles,
    label: "AI",
    tone: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  },
  activity: {
    icon: Activity,
    label: "Activity",
    tone: "bg-muted text-muted-foreground ring-border",
  },
  task: { icon: CheckSquare, label: "Task", tone: "bg-teal-500/10 text-teal-500 ring-teal-500/20" },
  deal: {
    icon: Briefcase,
    label: "Deal",
    tone: "bg-fuchsia-500/10 text-fuchsia-500 ring-fuchsia-500/20",
  },
  invoice: {
    icon: FileText,
    label: "Invoice",
    tone: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
  },
  payment: {
    icon: CreditCard,
    label: "Payment",
    tone: "bg-green-500/10 text-green-500 ring-green-500/20",
  },
  campaign: {
    icon: Megaphone,
    label: "Campaign",
    tone: "bg-pink-500/10 text-pink-500 ring-pink-500/20",
  },
  workflow: {
    icon: Workflow,
    label: "Workflow",
    tone: "bg-sky-500/10 text-sky-500 ring-sky-500/20",
  },
  appointment: {
    icon: Calendar,
    label: "Appointment",
    tone: "bg-rose-500/10 text-rose-500 ring-rose-500/20",
  },
};

const CHANNEL_META: Record<
  TimelineChannel,
  { icon?: React.ComponentType<{ className?: string }>; label: string; tone: string }
> = {
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    tone: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  },
  instagram: {
    icon: Instagram,
    label: "Instagram",
    tone: "bg-pink-500/10 text-pink-500 ring-pink-500/20",
  },
  messenger: {
    icon: Facebook,
    label: "Messenger",
    tone: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  },
  telegram: { icon: Send, label: "Telegram", tone: "bg-sky-500/10 text-sky-500 ring-sky-500/20" },
  email: {
    icon: Mail,
    label: "Email",
    tone: "bg-indigo-500/10 text-indigo-500 ring-indigo-500/20",
  },
  sms: { icon: MessageSquare, label: "SMS", tone: "bg-cyan-500/10 text-cyan-500 ring-cyan-500/20" },
  live_chat: {
    icon: MessageSquare,
    label: "Live chat",
    tone: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  },
  voice: { icon: Phone, label: "Calls", tone: "bg-teal-500/10 text-teal-500 ring-teal-500/20" },
  internal: {
    icon: StickyNote,
    label: "Notes",
    tone: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  },
  crm: {
    icon: Briefcase,
    label: "CRM",
    tone: "bg-fuchsia-500/10 text-fuchsia-500 ring-fuchsia-500/20",
  },
  system: { icon: Activity, label: "System", tone: "bg-muted text-muted-foreground ring-border" },
};

const ALL_CHANNELS = Object.keys(CHANNEL_META) as TimelineChannel[];
const ALL_KINDS = Object.keys(KIND_META) as TimelineKind[];

function toCSV(events: TimelineEvent[]) {
  const rows = [
    [
      "timestamp",
      "kind",
      "channel",
      "direction",
      "status",
      "title",
      "preview",
      "amount",
      "currency",
    ].join(","),
    ...events.map((e) =>
      [
        e.at,
        e.kind,
        e.channel,
        e.direction ?? "",
        e.status ?? "",
        JSON.stringify(e.title ?? ""),
        JSON.stringify(e.preview ?? ""),
        e.amount ?? "",
        e.currency ?? "",
      ].join(","),
    ),
  ];
  return rows.join("\n");
}

export interface UnifiedTimelineProps {
  workspaceId: string;
  contactId: string;
  className?: string;
}

export function UnifiedTimeline({ workspaceId, contactId, className }: UnifiedTimelineProps) {
  const qc = useQueryClient();
  const tz = useTenantTimezone();
  const formatZonedDate = useZonedDateFormatter();
  const dayLabel = (iso: string) => {
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameZonedDay(iso, now, tz)) return "Today";
    if (isSameZonedDay(iso, yesterday, tz)) return "Yesterday";
    return formatInTimezone(iso, tz, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const { data, isLoading } = useUnifiedTimeline({ workspaceId, contactId });
  const [channels, setChannels] = useState<Set<TimelineChannel>>(new Set());
  const [kinds, setKinds] = useState<Set<TimelineKind>>(new Set());
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    if (!workspaceId || !contactId) return;
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ["timeline", workspaceId, contactId] });
    const ch = supabase
      .channel(`timeline:${workspaceId}:${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_notes",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communications",
          filter: `entity_id=eq.${contactId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales_activities",
          filter: `entity_id=eq.${contactId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `entity_id=eq.${contactId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [workspaceId, contactId, qc]);

  const events = (data ?? []) as TimelineEvent[];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (channels.size && !channels.has(e.channel)) return false;
      if (kinds.size && !kinds.has(e.kind)) return false;
      if (direction !== "all" && e.direction !== direction) return false;
      if (q) {
        const hay = `${e.title ?? ""} ${e.preview ?? ""} ${e.status ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, channels, kinds, direction, query]);

  const counts = useMemo(() => {
    let inbound = 0,
      outbound = 0;
    const byKind = new Map<TimelineKind, number>();
    for (const e of filtered) {
      if (e.direction === "in") inbound++;
      else if (e.direction === "out") outbound++;
      byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
    }
    const topKinds = Array.from(byKind.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { total: filtered.length, inbound, outbound, topKinds };
  }, [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const e of filtered) {
      // en-CA locale forces YYYY-MM-DD ordering so the key still sorts lexically.
      const key = formatInTimezone(
        e.at,
        tz,
        { year: "numeric", month: "2-digit", day: "2-digit" },
        "en-CA",
      );
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered, tz]);

  const activeFilterCount = channels.size + kinds.size + (direction !== "all" ? 1 : 0);

  const toggle = <T,>(set: Set<T>, value: T, apply: (n: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  };

  const clearFilters = () => {
    setChannels(new Set());
    setKinds(new Set());
    setDirection("all");
    setQuery("");
  };

  const download = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeline-${contactId}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardHeader className="pb-3 space-y-3 border-b">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-bold text-xl leading-tight">Unified timeline</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Every touchpoint across every channel, in one stream.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-[11px]">
              {isLoading ? "" : `${counts.total} events`}
            </Badge>
            {counts.inbound > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1">
                <ArrowDownLeft className="h-3 w-3" /> {counts.inbound}
              </Badge>
            )}
            {counts.outbound > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1">
                <ArrowUpRight className="h-3 w-3" /> {counts.outbound}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={download}
              disabled={filtered.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timeline"
              className="h-8 pl-8 pr-8 text-sm"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center rounded-control border overflow-hidden h-8 p-1">
            {(["all", "in", "out"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={cn(
                  "px-2.5 py-1 text-xs inline-flex items-center gap-1 transition-colors",
                  direction === d ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {d === "in" && <ArrowDownLeft className="h-3 w-3" />}
                {d === "out" && <ArrowUpRight className="h-3 w-3" />}
                {d === "all" ? "All" : d === "in" ? "In" : "Out"}
              </button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Channels
                {channels.size > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[11px]">
                    {channels.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by channel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_CHANNELS.map((c) => {
                const meta = CHANNEL_META[c];
                const Icon = meta.icon;
                return (
                  <DropdownMenuCheckboxItem
                    key={c}
                    checked={channels.has(c)}
                    onCheckedChange={() => toggle(channels, c, setChannels)}
                  >
                    <span className="inline-flex items-center gap-2">
                      {Icon && (
                        <span
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-control ring-1 ring-inset",
                            meta.tone,
                          )}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                      )}
                      {meta.label}
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Types
                {kinds.size > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[11px]">
                    {kinds.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_KINDS.map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                return (
                  <DropdownMenuCheckboxItem
                    key={k}
                    checked={kinds.has(k)}
                    onCheckedChange={() => toggle(kinds, k, setKinds)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-control ring-1 ring-inset",
                          meta.tone,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      {meta.label}
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {(channels.size > 0 || kinds.size > 0) && (
          <div className="flex flex-wrap gap-1">
            {[...channels].map((c) => (
              <Badge key={`c-${c}`} variant="secondary" className="text-[11px] gap-1 pr-1">
                {CHANNEL_META[c].label}
                <button
                  onClick={() => toggle(channels, c, setChannels)}
                  className="hover:text-destructive"
                  aria-label={`Remove ${c} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {[...kinds].map((k) => (
              <Badge key={`k-${k}`} variant="outline" className="text-[11px] gap-1 pr-1">
                {KIND_META[k].label}
                <button
                  onClick={() => toggle(kinds, k, setKinds)}
                  className="hover:text-destructive"
                  aria-label={`Remove ${k} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {counts.topKinds.length > 0 && (
          <ScrollArea orientation="horizontal" type="hover" className="w-full">
            <div className="flex w-max items-center gap-1.5 pb-0.5">
              {counts.topKinds.map(([k, n]) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const active = kinds.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggle(kinds, k, setKinds)}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-[11px] transition-colors",
                      active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{meta.label}</span>
                    <span className=" opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardHeader>

      <CardContent className="p-0 flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="px-4 py-3">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && groups.length === 0 && (
              <EmptyState
                hasFilters={activeFilterCount > 0 || query.length > 0}
                onReset={clearFilters}
              />
            )}

            <div className="space-y-6">
              {groups.map(([day, items]) => (
                <div key={day} className="space-y-2">
                  <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-background/95 backdrop-blur border-b border-border/50">
                    <p className="text-[11px] font-semibold text-muted-foreground ">
                      {dayLabel(items[0].at)}
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        · {items.length} {items.length === 1 ? "event" : "events"}
                      </span>
                    </p>
                  </div>
                  <ol className="relative border-l border-border ml-3 space-y-2.5">
                    {items.map((e) => (
                      <TimelineRow key={e.id} event={e} onSelect={setSelected} />
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
      <EventDetailSheet event={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
        <Activity className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">
          {hasFilters ? "No matches" : "No timeline events yet"}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          {hasFilters
            ? "Try widening the filters or clearing the search."
            : "Once this customer interacts across any channel, events will show here."}
        </p>
      </div>
      {hasFilters && (
        <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
          <X className="h-3.5 w-3.5" />
          Reset filters
        </Button>
      )}
    </div>
  );
}

function TimelineRow({
  event,
  onSelect,
}: {
  event: TimelineEvent;
  onSelect?: (e: TimelineEvent) => void;
}) {
  const kindMeta = KIND_META[event.kind] ?? KIND_META.activity;
  const KindIcon = kindMeta.icon;
  const channelMeta = CHANNEL_META[event.channel];
  const ChannelIcon = channelMeta?.icon;
  const DirIcon =
    event.direction === "in" ? ArrowDownLeft : event.direction === "out" ? ArrowUpRight : null;
  const isCompleted =
    event.status === "completed" || event.status === "paid" || event.status === "read";
  const formatZonedDate = useZonedDateFormatter();

  return (
    <li className="ml-4 relative">
      <span
        className={cn(
          "absolute -left-[26px] top-1.5 grid h-5 w-5 place-items-center rounded-full ring-4 ring-background",
          kindMeta.tone,
        )}
        aria-hidden="true"
      >
        <KindIcon className="h-3 w-3" />
      </span>
      <button
        type="button"
        onClick={() => onSelect?.(event)}
        className="w-full text-left rounded-control border bg-card p-3 hover:bg-muted/40 hover:border-primary/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {ChannelIcon && (
                <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              {DirIcon && <DirIcon className="h-3 w-3 text-muted-foreground shrink-0" />}
              <p
                className={cn(
                  "text-xs font-medium truncate",
                  isCompleted && "line-through opacity-60",
                )}
              >
                {event.title}
              </p>
            </div>
            {event.preview && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap break-words">
                {event.preview}
              </p>
            )}
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <Badge variant="outline" className="text-[11px] h-4 px-1 gap-0.5">
                {kindMeta.label}
              </Badge>
              {event.status && (
                <Badge
                  variant={isCompleted ? "secondary" : "outline"}
                  className="text-[11px] h-4 px-1 gap-0.5"
                >
                  {isCompleted && <Check className="h-3 w-3" />}
                  {event.status}
                </Badge>
              )}
              {event.amount != null && (
                <Badge variant="secondary" className="text-[11px] h-4 px-1">
                  {event.currency ? `${event.currency} ` : ""}
                  {event.amount.toLocaleString()}
                </Badge>
              )}
            </div>
          </div>
          <time
            className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 "
            title={formatZonedDate(event.at, { dateStyle: "long", timeStyle: "short" })}
          >
            {formatZonedDate(event.at, { hour: "2-digit", minute: "2-digit", hour12: false })}
          </time>
        </div>
      </button>
    </li>
  );
}

function EventDetailSheet({
  event,
  onClose,
}: {
  event: TimelineEvent | null;
  onClose: () => void;
}) {
  const open = !!event;
  const kindMeta = event ? (KIND_META[event.kind] ?? KIND_META.activity) : null;
  const channelMeta = event ? CHANNEL_META[event.channel] : null;
  const KindIcon = kindMeta?.icon ?? Activity;
  const formatZonedDate = useZonedDateFormatter();

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2">
            {kindMeta && (
              <span
                className={cn("grid h-8 w-8 place-items-center rounded-control ring-1", kindMeta.tone)}
              >
                <KindIcon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <SheetTitle className="text-base truncate">{event?.title ?? "Event"}</SheetTitle>
              <SheetDescription className="text-xs">
                {kindMeta?.label}
                {channelMeta ? ` · ${channelMeta.label}` : ""}
                {event
                  ? ` · ${formatZonedDate(event.at, { dateStyle: "long", timeStyle: "short" })}`
                  : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        {event && (
          <div className="mt-4 flex-1 overflow-auto space-y-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {event.direction && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  {event.direction === "in" ? (
                    <ArrowDownLeft className="h-3 w-3" />
                  ) : (
                    <ArrowUpRight className="h-3 w-3" />
                  )}
                  {event.direction === "in" ? "Inbound" : "Outbound"}
                </Badge>
              )}
              {event.status && (
                <Badge variant="secondary" className="text-[11px]">
                  {event.status}
                </Badge>
              )}
              {event.amount != null && (
                <Badge variant="secondary" className="text-[11px]">
                  {event.currency ? `${event.currency} ` : ""}
                  {event.amount.toLocaleString()}
                </Badge>
              )}
            </div>
            {event.preview && (
              <section>
                <h4 className="text-[11px]  text-muted-foreground mb-1.5">Content</h4>
                <div className="rounded-control border bg-muted/40 p-3 whitespace-pre-wrap break-words text-sm">
                  {event.preview}
                </div>
              </section>
            )}
            {event.meta && Object.keys(event.meta).length > 0 && (
              <section>
                <h4 className="text-[11px]  text-muted-foreground mb-1.5">Metadata</h4>
                <dl className="rounded-control border divide-y text-xs">
                  {Object.entries(event.meta).map(([k, v]) => (
                    <div key={k} className="flex gap-2 px-3 py-1.5">
                      <dt className="text-muted-foreground min-w-24 shrink-0">{k}</dt>
                      <dd className="font-mono break-all">{v == null ? "—" : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <section>
              <h4 className="text-[11px]  text-muted-foreground mb-1.5">Reference</h4>
              <p className="text-[11px] font-mono text-muted-foreground break-all">{event.id}</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
