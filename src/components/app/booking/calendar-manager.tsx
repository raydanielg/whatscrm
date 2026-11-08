/**
 * Calendar Manager — Day / Week / Month / Agenda views with realtime updates.
 * Supports personal, team, and organization calendars plus working hours,
 * breaks, vacations, holidays, blocked dates, and recurring rules.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  CalendarDays,
  Clock,
  Coffee,
  Plane,
  PartyPopper,
  Ban,
  Repeat,
  Users,
  Building2,
  User,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  AlertCircle,
  Globe,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listCalendarEntries,
  upsertCalendarEntry,
  deleteCalendarEntry,
  searchCalendarEntries,
  detectCalendarConflicts,
} from "@/lib/booking/calendar.functions";

type ViewMode = "day" | "week" | "month" | "agenda";
type Scope = "personal" | "team" | "organization" | "all";
type Kind =
  | "working_hours"
  | "break"
  | "vacation"
  | "holiday"
  | "blocked"
  | "custom"
  | "recurring_available"
  | "recurring_unavailable";

interface Entry {
  id: string;
  scope: "personal" | "team" | "organization";
  kind: Kind;
  title: string;
  description: string | null;
  color: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  rrule: string | null;
  is_blocking: boolean;
  owner_id: string | null;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Clock; color: string }> = {
  working_hours: { label: "Working hours", icon: Clock, color: "hsl(var(--primary))" },
  break: { label: "Break", icon: Coffee, color: "#f59e0b" },
  vacation: { label: "Vacation", icon: Plane, color: "#3b82f6" },
  holiday: { label: "Holiday", icon: PartyPopper, color: "#ec4899" },
  blocked: { label: "Blocked", icon: Ban, color: "#ef4444" },
  custom: { label: "Custom", icon: CalendarDays, color: "#8b5cf6" },
  recurring_available: { label: "Recurring available", icon: Repeat, color: "#10b981" },
  recurring_unavailable: { label: "Recurring unavailable", icon: Repeat, color: "#dc2626" },
};

const SCOPE_META: Record<Exclude<Scope, "all">, { label: string; icon: typeof User }> = {
  personal: { label: "Personal", icon: User },
  team: { label: "Team", icon: Users },
  organization: { label: "Organization", icon: Building2 },
};

function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function CalendarManager() {
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [scope, setScope] = useState<Scope>("all");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [timezone, setTimezone] = useState<string>(getUserTimezone());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);

  const qc = useQueryClient();
  const listFn = useServerFn(listCalendarEntries);

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(cursor), end: endOfDay(cursor) };
    if (view === "week")
      return {
        start: startOfWeek(cursor, { weekStartsOn: 1 }),
        end: endOfWeek(cursor, { weekStartsOn: 1 }),
      };
    if (view === "month") {
      const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
      const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
      return { start: s, end: e };
    }
    return { start: startOfDay(cursor), end: addDays(cursor, 30) };
  }, [view, cursor]);

  const { data: entries = [] } = useQuery({
    queryKey: [
      "calendar-entries",
      range.start.toISOString(),
      range.end.toISOString(),
      scope,
      kindFilter,
    ],
    queryFn: () =>
      listFn({
        data: {
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          scope: scope === "all" ? undefined : scope,
          kind: kindFilter === "all" ? undefined : kindFilter,
        },
      }),
  });

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("calendar-entries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_entries" }, () => {
        qc.invalidateQueries({ queryKey: ["calendar-entries"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const navigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) return setCursor(new Date());
    if (view === "day") return setCursor(addDays(cursor, dir));
    if (view === "week") return setCursor(dir < 0 ? subWeeks(cursor, 1) : addWeeks(cursor, 1));
    if (view === "month") return setCursor(dir < 0 ? subMonths(cursor, 1) : addMonths(cursor, 1));
    setCursor(addDays(cursor, dir * 7));
  };

  const filtered = entries as Entry[];

  const label =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "day"
        ? format(cursor, "EEEE, MMM d, yyyy")
        : `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border bg-card p-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(0)}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => navigate(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => navigate(1)}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-2 text-sm font-medium">{label}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="agenda">Agenda</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All calendars</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
              </SelectContent>
            </Select>

            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as Kind | "all")}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(KIND_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search className="h-4 w-4" /> Search
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search calendar entries</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 rounded-control border px-2 h-9 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="bg-transparent focus:outline-none"
                  >
                    {[
                      getUserTimezone(),
                      "UTC",
                      "America/New_York",
                      "America/Los_Angeles",
                      "Europe/London",
                      "Europe/Paris",
                      "Asia/Dubai",
                      "Asia/Singapore",
                      "Asia/Tokyo",
                      "Australia/Sydney",
                    ]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                  </select>
                </div>
              </TooltipTrigger>
              <TooltipContent>Display timezone</TooltipContent>
            </Tooltip>

            <Button
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setEditing({
                  scope: "personal",
                  kind: "custom",
                  title: "",
                  all_day: false,
                  start_at: new Date().toISOString(),
                  end_at: addDays(new Date(), 0).toISOString(),
                  timezone,
                  is_blocking: true,
                  metadata: {},
                } as Partial<Entry>)
              }
            >
              <Plus className="h-4 w-4" /> New entry
            </Button>
          </div>
        </div>

        {/* Views */}
        <div className="rounded-control border bg-card p-3">
          {view === "month" && (
            <MonthView
              cursor={cursor}
              entries={filtered}
              onSelect={(d) => {
                setCursor(d);
                setView("day");
              }}
              onEdit={setEditing}
              timezone={timezone}
            />
          )}
          {view === "week" && (
            <WeekView cursor={cursor} entries={filtered} onEdit={setEditing} timezone={timezone} />
          )}
          {view === "day" && (
            <DayView cursor={cursor} entries={filtered} onEdit={setEditing} timezone={timezone} />
          )}
          {view === "agenda" && (
            <AgendaView entries={filtered} onEdit={setEditing} timezone={timezone} />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(KIND_META).map(([k, m]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: m.color }} />
              {m.label}
            </div>
          ))}
        </div>
      </div>

      <EntryDialog
        entry={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        timezone={timezone}
      />
      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        query={searchQuery}
        setQuery={setSearchQuery}
        onSelect={(entry) => {
          setSearchOpen(false);
          setEditing(entry);
        }}
      />
    </TooltipProvider>
  );
}

/* ---------------- Views ---------------- */

function MonthView({
  cursor,
  entries,
  onSelect,
  onEdit,
  timezone,
}: {
  cursor: Date;
  entries: Entry[];
  onSelect: (d: Date) => void;
  onEdit: (e: Entry) => void;
  timezone: string;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor]);

  const entriesByDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = format(new Date(e.start_at), "yyyy-MM-dd");
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [entries]);

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-control border">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div key={d} className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const list = entriesByDay.get(key) ?? [];
        const isCurrent = isSameMonth(d, cursor);
        return (
          <button
            key={key}
            onClick={() => onSelect(d)}
            className={cn(
              "flex min-h-[104px] flex-col gap-1 bg-card p-1.5 text-left transition-colors hover:bg-muted",
              !isCurrent && "opacity-40",
            )}
          >
            <div
              className={cn(
                "text-xs font-medium",
                isToday(d) &&
                  "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
              )}
            >
              {format(d, "d")}
            </div>
            <div className="flex flex-col gap-0.5">
              {list.slice(0, 3).map((e) => (
                <span
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEdit(e);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.stopPropagation();
                      onEdit(e);
                    }
                  }}
                  className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: e.color ?? KIND_META[e.kind].color }}
                  title={`${e.title} · ${format(new Date(e.start_at), "p", {})} (${timezone})`}
                >
                  {e.title}
                </span>
              ))}
              {list.length > 3 && (
                <span className="text-[11px] text-muted-foreground">+{list.length - 3} more</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WeekView({
  cursor,
  entries,
  onEdit,
  timezone,
}: {
  cursor: Date;
  entries: Entry[];
  onEdit: (e: Entry) => void;
  timezone: string;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const dayEntries = entries.filter((e) => isSameDay(new Date(e.start_at), d));
        return (
          <div key={d.toISOString()} className="rounded-control border bg-background p-2">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">{format(d, "EEE")}</span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  isToday(d) &&
                    "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                )}
              >
                {format(d, "d")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {dayEntries.length === 0 && (
                <div className="text-[11px] text-muted-foreground">—</div>
              )}
              {dayEntries.map((e) => (
                <EntryPill key={e.id} entry={e} onClick={() => onEdit(e)} timezone={timezone} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  cursor,
  entries,
  onEdit,
  timezone,
}: {
  cursor: Date;
  entries: Entry[];
  onEdit: (e: Entry) => void;
  timezone: string;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayEntries = entries.filter((e) => isSameDay(new Date(e.start_at), cursor));
  return (
    <div className="grid grid-cols-[60px_1fr] gap-0 overflow-hidden rounded-control border">
      {hours.map((h) => (
        <div key={h} className="contents">
          <div className="border-b border-r bg-muted/30 px-2 py-3 text-[11px] text-muted-foreground">
            {format(new Date(2020, 0, 1, h), "ha")}
          </div>
          <div className="relative min-h-[52px] border-b bg-background">
            {dayEntries
              .filter((e) => new Date(e.start_at).getHours() === h)
              .map((e) => {
                const startMin = new Date(e.start_at).getMinutes();
                const durMin = Math.max(
                  20,
                  differenceInMinutes(new Date(e.end_at), new Date(e.start_at)),
                );
                return (
                  <button
                    key={e.id}
                    onClick={() => onEdit(e)}
                    className="absolute left-1 right-1 rounded px-2 py-1 text-left text-xs font-medium text-white shadow-sm transition-transform"
                    style={{
                      top: `${(startMin / 60) * 52}px`,
                      height: `${Math.min(200, (durMin / 60) * 52)}px`,
                      background: e.color ?? KIND_META[e.kind].color,
                    }}
                  >
                    <div className="truncate">{e.title}</div>
                    <div className="truncate text-[11px] opacity-90">
                      {format(new Date(e.start_at), "p")} – {format(new Date(e.end_at), "p")} ·{" "}
                      {timezone}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaView({
  entries,
  onEdit,
  timezone,
}: {
  entries: Entry[];
  onEdit: (e: Entry) => void;
  timezone: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No entries in this range.
      </div>
    );
  }
  const grouped = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = format(new Date(e.start_at), "yyyy-MM-dd");
    const list = grouped.get(key) ?? [];
    list.push(e);
    grouped.set(key, list);
  }
  return (
    <div className="flex flex-col gap-4">
      {Array.from(grouped.entries()).map(([day, list]) => (
        <div key={day}>
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            {format(new Date(day), "EEEE, MMMM d")}
          </div>
          <div className="flex flex-col gap-1.5">
            {list.map((e) => {
              const Icon = KIND_META[e.kind].icon;
              const Scoper = SCOPE_META[e.scope].icon;
              return (
                <button
                  key={e.id}
                  onClick={() => onEdit(e)}
                  className="flex items-center gap-3 rounded-control border bg-card p-3 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className="h-9 w-1 rounded-full"
                    style={{ background: e.color ?? KIND_META[e.kind].color }}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.all_day
                        ? "All day"
                        : `${format(new Date(e.start_at), "p")} – ${format(new Date(e.end_at), "p")}`}{" "}
                      · {timezone}
                    </div>
                  </div>
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <Scoper className="h-3 w-3" />
                    {SCOPE_META[e.scope].label}
                  </Badge>
                  {e.rrule && (
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <Repeat className="h-3 w-3" />
                      Recurring
                    </Badge>
                  )}
                  {!e.is_blocking && (
                    <Badge variant="outline" className="text-[11px]">
                      Non-blocking
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EntryPill({
  entry,
  onClick,
  timezone,
}: {
  entry: Entry;
  onClick: () => void;
  timezone: string;
}) {
  return (
    <button
      onClick={onClick}
      className="truncate rounded px-1.5 py-1 text-left text-[11px] font-medium text-white"
      style={{ background: entry.color ?? KIND_META[entry.kind].color }}
      title={`${entry.title} · ${format(new Date(entry.start_at), "p")} (${timezone})`}
    >
      {entry.all_day ? "◦ " : ""}
      {entry.title}
    </button>
  );
}

/* ---------------- Dialogs ---------------- */

function EntryDialog({
  entry,
  onOpenChange,
  timezone,
}: {
  entry: Partial<Entry> | null;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const [draft, setDraft] = useState<Partial<Entry> | null>(entry);
  const [conflicts, setConflicts] = useState<
    Array<{ kind: string; title: string; start_at: string; end_at: string }>
  >([]);
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCalendarEntry);
  const deleteFn = useServerFn(deleteCalendarEntry);
  const conflictFn = useServerFn(detectCalendarConflicts);

  useEffect(() => {
    setDraft(entry);
    setConflicts([]);
  }, [entry?.id, entry?.start_at]);

  const upsert = useMutation({
    mutationFn: (payload: Partial<Entry>) => upsertFn({ data: payload as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-entries"] });
      toast.success(entry?.id ? "Entry updated" : "Entry created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: entry!.id! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-entries"] });
      toast.success("Entry deleted");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkConflicts = async () => {
    if (!draft?.start_at || !draft?.end_at) return;
    const res = await conflictFn({ data: { start_at: draft.start_at, end_at: draft.end_at } });
    setConflicts(res as never);
    if ((res as unknown[]).length === 0) toast.success("No conflicts");
  };

  if (!draft) return null;

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toLocal = (iso: string) => {
    try {
      return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
    } catch {
      return "";
    }
  };

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry?.id ? "Edit entry" : "New calendar entry"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Title</Label>
            <Input
              value={draft.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Team standup, Company holiday"
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={draft.kind} onValueChange={(v) => set("kind", v as Kind)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Scope</Label>
            <Select value={draft.scope} onValueChange={(v) => set("scope", v as Entry["scope"])}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Starts</Label>
            <DateTimePicker
              value={new Date(draft.start_at ?? new Date().toISOString())}
              onChange={(d) => d && set("start_at", d.toISOString())}
            />
          </div>
          <div>
            <Label>Ends</Label>
            <DateTimePicker
              value={new Date(draft.end_at ?? new Date().toISOString())}
              onChange={(d) => d && set("end_at", d.toISOString())}
            />
          </div>

          <div>
            <Label>Timezone</Label>
            <Input
              value={draft.timezone ?? timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </div>
          <div>
            <Label>Color (hex)</Label>
            <Input
              value={draft.color ?? ""}
              onChange={(e) => set("color", e.target.value)}
              placeholder="#075e54"
            />
          </div>

          <div className="col-span-2">
            <Label>Recurrence (RRULE)</Label>
            <Input
              value={draft.rrule ?? ""}
              onChange={(e) => set("rrule", e.target.value)}
              placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Leave empty for one-off. iCal RRULE syntax.
            </p>
          </div>

          <div className="col-span-2">
            <Label>Description</Label>
            <RichTextarea
              rows={2}
              value={draft.description ?? ""}
              onChange={(v) => set("description", v)}
            />
          </div>

          <div className="col-span-2 flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!draft.all_day} onCheckedChange={(v) => set("all_day", v)} /> All
              day
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!draft.is_blocking}
                onCheckedChange={(v) => set("is_blocking", v)}
              />{" "}
              Blocks availability
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={checkConflicts}
              className="ml-auto gap-1.5"
            >
              <AlertCircle className="h-4 w-4" /> Check conflicts
            </Button>
          </div>

          {conflicts.length > 0 && (
            <Card className="col-span-2 border-destructive/40 bg-destructive/5 p-3">
              <div className="text-xs font-semibold text-destructive">
                {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} found
              </div>
              <ul className="mt-1.5 space-y-1 text-xs">
                {conflicts.slice(0, 5).map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.title}</span>{" "}
                    <span className="text-muted-foreground">
                      · {format(new Date(c.start_at), "MMM d, p")} –{" "}
                      {format(new Date(c.end_at), "p")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {entry?.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => remove.mutate()}
                className="gap-1.5 text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => draft && upsert.mutate(draft)}
              disabled={!draft?.title || !draft?.start_at || !draft?.end_at || upsert.isPending}
            >
              {upsert.isPending ? "Saving" : entry?.id ? "Save changes" : "Create entry"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SearchDialog({
  open,
  onOpenChange,
  query,
  setQuery,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  onSelect: (e: Entry) => void;
}) {
  const searchFn = useServerFn(searchCalendarEntries);
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["calendar-search", query],
    queryFn: () => searchFn({ data: { query } }),
    enabled: query.trim().length > 0,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Search calendar</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search title, description"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-2 max-h-72 overflow-auto">
          {isFetching && (
            <div className="py-6 text-center text-sm text-muted-foreground">Searching</div>
          )}
          {!isFetching && query.trim() && (results as Entry[]).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">No results</div>
          )}
          <div className="flex flex-col gap-1">
            {(results as Entry[]).map((r) => {
              const Icon = KIND_META[r.kind].icon;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className="flex items-center gap-2 rounded-control border p-2 text-left hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {format(new Date(r.start_at), "MMM d, yyyy p")} · {KIND_META[r.kind].label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
