import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SalesActivity } from "@/hooks/use-sales-activities";
import { ACTIVITY_TYPE_META, expandRecurring } from "@/hooks/use-sales-activities";
import { ScrollArea } from "@/components/ui/scroll-area";

type View = "day" | "week" | "month" | "agenda";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

type Props = {
  activities: SalesActivity[];
  view: View;
  onViewChange: (v: View) => void;
  onSelectActivity: (a: SalesActivity) => void;
  onSelectSlot?: (date: Date) => void;
};

export function ActivityCalendar({ activities, view, onViewChange, onSelectActivity, onSelectSlot }: Props) {
  const [cursor, setCursor] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(cursor), end: addDays(startOfDay(cursor), 1) };
    if (view === "week") { const s = startOfWeek(cursor); return { start: s, end: addDays(s, 7) }; }
    if (view === "month") {
      const s = startOfMonth(cursor);
      const gridStart = startOfWeek(s);
      const gridEnd = addDays(gridStart, 42);
      return { start: gridStart, end: gridEnd };
    }
    // agenda: 30 days ahead
    return { start: startOfDay(cursor), end: addDays(startOfDay(cursor), 30) };
  }, [cursor, view]);

  const expanded = useMemo(() => expandRecurring(activities, range.start, range.end), [activities, range]);

  const byDay = useMemo(() => {
    const map = new Map<string, SalesActivity[]>();
    for (const a of expanded) {
      if (!a.start_at) continue;
      const d = new Date(a.start_at);
      if (d < range.start || d >= range.end) continue;
      const key = startOfDay(d).toISOString();
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => new Date(x.start_at!).getTime() - new Date(y.start_at!).getTime());
    }
    return map;
  }, [expanded, range]);

  const shift = (dir: -1 | 1) => {
    const c = new Date(cursor);
    if (view === "day") c.setDate(c.getDate() + dir);
    else if (view === "week") c.setDate(c.getDate() + 7 * dir);
    else if (view === "month") c.setMonth(c.getMonth() + dir);
    else c.setDate(c.getDate() + 30 * dir);
    setCursor(c);
  };

  const heading = useMemo(() => {
    if (view === "day") return cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(cursor); const e = addDays(s, 6);
      return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (view === "month") return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return "Next 30 days";
  }, [cursor, view]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b p-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <h2 className="font-semibold text-lg ml-2">{heading}</h2>
        </div>
        <div className="flex gap-1 rounded-control border p-0.5">
          {(["day","week","month","agenda"] as View[]).map(v => (
            <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} className="h-7 capitalize" onClick={() => onViewChange(v)}>
              {v}
            </Button>
          ))}
        </div>
      </div>

      {view === "month" && <MonthGrid cursor={cursor} byDay={byDay} onSelectActivity={onSelectActivity} onSelectSlot={onSelectSlot} />}
      {view === "week" && <WeekGrid cursor={cursor} byDay={byDay} onSelectActivity={onSelectActivity} onSelectSlot={onSelectSlot} />}
      {view === "day" && <DayGrid cursor={cursor} byDay={byDay} onSelectActivity={onSelectActivity} onSelectSlot={onSelectSlot} />}
      {view === "agenda" && <AgendaList cursor={cursor} byDay={byDay} onSelectActivity={onSelectActivity} />}
    </Card>
  );
}

function MonthGrid({ cursor, byDay, onSelectActivity, onSelectSlot }: {
  cursor: Date; byDay: Map<string, SalesActivity[]>;
  onSelectActivity: (a: SalesActivity) => void; onSelectSlot?: (d: Date) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(cursor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = startOfDay(new Date());
  return (
    <div className="grid grid-cols-7 divide-x divide-y border-t">
      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
        <div key={d} className="p-2 text-xs font-medium text-muted-foreground bg-muted/30">{d}</div>
      ))}
      {days.map(d => {
        const key = d.toISOString();
        const items = byDay.get(key) ?? [];
        const isCurMonth = d.getMonth() === cursor.getMonth();
        const isToday = sameDay(d, today);
        return (
          <div key={key}
            onClick={() => onSelectSlot?.(d)}
            className={cn("min-h-[110px] p-1.5 cursor-pointer hover:bg-muted/30 transition-colors",
              !isCurMonth && "bg-muted/10 text-muted-foreground",
              isToday && "bg-primary/5 ring-1 ring-primary/30")}>
            <div className={cn("text-xs font-medium mb-1", isToday && "text-primary")}>
              {d.getDate()}
            </div>
            <div className="space-y-0.5">
              {items.slice(0, 3).map(a => {
                const meta = ACTIVITY_TYPE_META[a.type];
                return (
                  <button key={a.id} onClick={(e) => { e.stopPropagation(); onSelectActivity(a); }}
                    className={cn("w-full truncate rounded px-1.5 py-0.5 text-[11px] text-left", meta.tone,
                      a.status === "completed" && "opacity-60 line-through")}>
                    {a.start_at && !a.all_day && (
                      <span className="opacity-70 ">{new Date(a.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {a.title}
                  </button>
                );
              })}
              {items.length > 3 && (
                <div className="text-[11px] text-muted-foreground px-1">+{items.length - 3} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ cursor, byDay, onSelectActivity, onSelectSlot }: {
  cursor: Date; byDay: Map<string, SalesActivity[]>;
  onSelectActivity: (a: SalesActivity) => void; onSelectSlot?: (d: Date) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = startOfDay(new Date());
  return (
    <div className="grid grid-cols-7 divide-x border-t">
      {days.map(d => {
        const key = d.toISOString();
        const items = byDay.get(key) ?? [];
        const isToday = sameDay(d, today);
        return (
          <div key={key} className={cn("min-h-[400px] p-2", isToday && "bg-primary/5")}>
            <div className="mb-2 pb-2 border-b" onClick={() => onSelectSlot?.(d)}>
              <div className="text-xs uppercase text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className={cn("text-2xl font-bold", isToday && "text-primary")}>{d.getDate()}</div>
            </div>
            <div className="space-y-1.5">
              {items.map(a => {
                const meta = ACTIVITY_TYPE_META[a.type];
                return (
                  <button key={a.id} onClick={() => onSelectActivity(a)}
                    className={cn("w-full rounded-control px-2 py-1.5 text-left text-xs", meta.tone,
                      a.status === "completed" && "opacity-60 line-through")}>
                    <div className="font-medium truncate">{a.title}</div>
                    {a.start_at && !a.all_day && (
                      <div className="opacity-80 text-[11px] mt-0.5">
                        {new Date(a.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayGrid({ cursor, byDay, onSelectActivity }: {
  cursor: Date; byDay: Map<string, SalesActivity[]>;
  onSelectActivity: (a: SalesActivity) => void; onSelectSlot?: (d: Date) => void;
}) {
  const key = startOfDay(cursor).toISOString();
  const items = byDay.get(key) ?? [];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <ScrollArea type="hover" viewportClassName="max-h-[70vh]">
      {hours.map(h => {
        const hourItems = items.filter(a => a.start_at && new Date(a.start_at).getHours() === h);
        return (
          <div key={h} className="flex border-t min-h-[56px]">
            <div className="w-16 shrink-0 p-2 text-xs text-muted-foreground border-r">
              {h.toString().padStart(2, "0")}:00
            </div>
            <div className="flex-1 p-1 space-y-1">
              {hourItems.map(a => {
                const meta = ACTIVITY_TYPE_META[a.type];
                return (
                  <button key={a.id} onClick={() => onSelectActivity(a)}
                    className={cn("block w-full rounded-control px-3 py-2 text-left text-sm", meta.tone,
                      a.status === "completed" && "opacity-60 line-through")}>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs opacity-80 mt-0.5">
                      {new Date(a.start_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {a.end_at && ` – ${new Date(a.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </ScrollArea>
  );
}

function AgendaList({ cursor, byDay, onSelectActivity }: {
  cursor: Date; byDay: Map<string, SalesActivity[]>;
  onSelectActivity: (a: SalesActivity) => void;
}) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(startOfDay(cursor), i))
    .filter(d => (byDay.get(d.toISOString()) ?? []).length > 0);

  if (days.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">No activities in the next 30 days.</div>;
  }

  return (
    <div className="divide-y">
      {days.map(d => {
        const items = byDay.get(d.toISOString()) ?? [];
        return (
          <div key={d.toISOString()} className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              <Badge variant="secondary">{items.length}</Badge>
            </h3>
            <div className="space-y-2">
              {items.map(a => {
                const meta = ACTIVITY_TYPE_META[a.type];
                return (
                  <button key={a.id} onClick={() => onSelectActivity(a)}
                    className="flex w-full items-center gap-3 rounded-control border p-3 text-left hover:bg-muted/40 transition-colors">
                    <div className={cn("h-2 w-2 rounded-full", meta.tone.replace("bg-", "bg-").replace("/15", ""))} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-medium truncate", a.status === "completed" && "line-through opacity-60")}>{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} · {a.start_at && (a.all_day ? "All day" : new Date(a.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[11px]">{a.status}</Badge>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
