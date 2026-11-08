import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listEventTypes,
  saveEventType,
  deleteEventType,
  listSchedules,
  saveSchedule,
  listAppointments,
  cancelAppointment,
  markNoShow,
  rescheduleAppointment,
  bookingStats,
} from "@/lib/booking/booking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  TimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Users,
  Copy,
  Trash2,
  ExternalLink,
  BarChart3,
  LinkIcon,
  Ban,
  CheckCircle2,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { AppointmentTypesManager } from "@/components/app/booking/appointment-types-manager";
import { CalendarManager } from "@/components/app/booking/calendar-manager";

export const Route = createFileRoute("/_authenticated/booking/")({
  head: () => ({
    meta: [
      { title: "Appointments" },
      {
        name: "description",
        content:
          "Create meeting types, publish booking pages, manage availability and view all upcoming appointments.",
      },
    ],
  }),
  component: BookingPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BookingPage() {
  const fmtZoned = useZonedDateFormatter();
  const loc = useLocation();
  const search =
    new URLSearchParams(loc.search as Record<string, string>).get("tab") ?? "appointments";
  return (
    <>
      <AppTopbar
        title="Appointments"
        subtitle="Meeting types, availability, calendar & bookings"
        actions={
          <ActionBar
            primary={[
              <Link key="analytics" to="/booking/analytics">
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4" /> Analytics
                </Button>
              </Link>,
              <Link key="readiness" to="/booking/readiness">
                <Button variant="outline" size="sm">
                  <CheckCircle2 className="h-4 w-4" /> Readiness
                </Button>
              </Link>,
            ]}
            overflow={[
              <DropdownMenuItem key="ai" asChild>
                <Link to="/booking/ai-assistant">
                  <LinkIcon className="h-4 w-4" /> AI scheduling
                </Link>
              </DropdownMenuItem>,
              <DropdownMenuItem key="calendars" asChild>
                <Link to="/booking/calendar-integrations">
                  <LinkIcon className="h-4 w-4" /> Calendars
                </Link>
              </DropdownMenuItem>,
              <DropdownMenuItem key="meetings" asChild>
                <Link to="/booking/meeting-integrations">
                  <LinkIcon className="h-4 w-4" /> Meetings
                </Link>
              </DropdownMenuItem>,
              <DropdownMenuItem key="notifications" asChild>
                <Link to="/booking/notifications">
                  <LinkIcon className="h-4 w-4" /> Notifications
                </Link>
              </DropdownMenuItem>,
            ]}
          />
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs defaultValue={search} className="space-y-6">
          <TabsList>
            <TabsTrigger value="appointments">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Appointments
            </TabsTrigger>
            <TabsTrigger value="event-types">
              <LinkIcon className="h-4 w-4 mr-2" />
              Appointment types
            </TabsTrigger>
            <TabsTrigger value="availability">
              <Clock className="h-4 w-4 mr-2" />
              Availability
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="appointments">
            <AppointmentsTab />
          </TabsContent>
          <TabsContent value="event-types">
            <AppointmentTypesManager />
          </TabsContent>
          <TabsContent value="availability">
            <AvailabilityTab />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarManager />
          </TabsContent>
          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab() {
  const fmtZoned = useZonedDateFormatter();
  const stats = useServerFn(bookingStats);
  const list = useServerFn(listAppointments);
  const {
    data: s,
    error: statsError,
    refetch: refetchStats,
    isFetching,
  } = useQuery({
    queryKey: ["booking-stats"],
    queryFn: () => stats(),
    retry: false,
  });
  const { data: upcoming } = useQuery({
    queryKey: ["booking-upcoming"],
    queryFn: () => list({ data: { from: new Date().toISOString(), status: "confirmed" } }),
    retry: false,
  });

  const cards = [
    { label: "Upcoming", value: s?.upcoming ?? "—", icon: CalendarIcon },
    { label: "This week", value: s?.thisWeek ?? "—", icon: Users },
    { label: "No-show rate (30d)", value: s ? `${s.noShowRatePct}%` : "—", icon: Ban },
    { label: "Bookings (30d)", value: s?.total30d ?? "—", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {statsError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium text-destructive">Couldn’t load booking stats</div>
              <div className="text-muted-foreground">{(statsError as Error).message}</div>
            </div>
            <button
              type="button"
              onClick={() => void refetchStats()}
              disabled={isFetching}
              className="text-sm font-medium px-3 h-9 rounded-control border hover:bg-muted disabled:opacity-50"
            >
              {isFetching ? "Retrying" : "Retry"}
            </button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-muted-foreground">{c.label}</span>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-semibold mt-2">{String(c.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next 10 appointments</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(upcoming ?? []).slice(0, 10).map((a: any) => (
            <div key={a.id} className="py-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{a.customer_name}</div>
                <div className="text-muted-foreground text-xs">
                  {a.booking_event_types?.name ?? "—"} ·{" "}
                  {fmtZoned(new Date(a.start_at), { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {a.source_channel}
                </div>
              </div>
              <Badge variant="outline" className="capitalize">
                {a.status}
              </Badge>
            </div>
          ))}
          {(!upcoming || upcoming.length === 0) && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No upcoming appointments yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Event Types ---------------- */

interface EventTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  location_kind: string;
  color: string | null;
  is_active: boolean;
}

function EventTypesTab() {
  const listFn = useServerFn(listEventTypes);
  const saveFn = useServerFn(saveEventType);
  const deleteFn = useServerFn(deleteEventType);
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["booking-event-types"],
    queryFn: () => listFn(),
  });
  const [editing, setEditing] = useState<Partial<EventTypeRow> | null>(null);

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      setEditing(null);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      toast.success("Deleted");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Publishable meeting types customers can book.
        </p>
        <Button
          size="sm"
          onClick={() =>
            setEditing({
              name: "",
              slug: "",
              duration_minutes: 30,
              buffer_before_minutes: 0,
              buffer_after_minutes: 0,
              min_notice_minutes: 60,
              max_advance_days: 60,
              location_kind: "custom",
              is_active: true,
            })
          }
        >
          <Plus className="h-4 w-4 mr-2" />
          New meeting type
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {((rows as EventTypeRow[] | undefined) ?? []).map((r) => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${r.slug}`;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: r.color ?? "#075E54" }}
                      />
                      <div>
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.duration_minutes} min · {r.location_kind.replace("_", " ")}
                        </div>
                      </div>
                    </div>
                    <Badge variant={r.is_active ? "default" : "outline"}>
                      {r.is_active ? "Live" : "Paused"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1.5">
                    <LinkIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{url}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <Link to="/book/$slug" params={{ slug: r.slug }} target="_blank">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this meeting type?")) remove.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {rows && rows.length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No meeting types yet. Create one to publish a booking link.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit meeting type" : "New meeting type"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>URL slug</Label>
                  <Input
                    value={editing.slug ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <RichTextarea
                  rows={2}
                  value={editing.description ?? ""}
                  onChange={(v) => setEditing({ ...editing, description: v })}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={editing.duration_minutes ?? 30}
                    onChange={(e) =>
                      setEditing({ ...editing, duration_minutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Buffer before</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.buffer_before_minutes ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, buffer_before_minutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Buffer after</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.buffer_after_minutes ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, buffer_after_minutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Min notice (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.min_notice_minutes ?? 60}
                    onChange={(e) =>
                      setEditing({ ...editing, min_notice_minutes: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Max advance (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.max_advance_days ?? 60}
                    onChange={(e) =>
                      setEditing({ ...editing, max_advance_days: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Select
                    value={editing.location_kind ?? "custom"}
                    onValueChange={(v) => setEditing({ ...editing, location_kind: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_person">In person</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Color</Label>
                  <Input
                    type="color"
                    value={editing.color ?? "#075E54"}
                    onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>Active (accepting bookings)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  id: editing?.id,
                  name: editing?.name,
                  slug: editing?.slug,
                  description: editing?.description ?? null,
                  duration_minutes: editing?.duration_minutes,
                  buffer_before_minutes: editing?.buffer_before_minutes,
                  buffer_after_minutes: editing?.buffer_after_minutes,
                  min_notice_minutes: editing?.min_notice_minutes,
                  max_advance_days: editing?.max_advance_days,
                  location_kind: editing?.location_kind,
                  location_details: {},
                  questions: [],
                  color: editing?.color,
                  is_active: editing?.is_active,
                })
              }
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Availability ---------------- */

function AvailabilityTab() {
  const listFn = useServerFn(listSchedules);
  const saveFn = useServerFn(saveSchedule);
  const qc = useQueryClient();
  const { data: rows } = useQuery({ queryKey: ["booking-schedules"], queryFn: () => listFn() });
  const first: any = rows?.[0];

  const [tz, setTz] = useState<string>(
    first?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [slots, setSlots] = useState<
    Array<{ day_of_week: number; start_time: string; end_time: string }>
  >(
    first?.booking_availability_slots?.map((s: any) => ({
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
    })) ??
      [1, 2, 3, 4, 5].map((d) => ({
        day_of_week: d,
        start_time: "09:00:00",
        end_time: "17:00:00",
      })),
  );

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: { id: first?.id, name: "Working hours", timezone: tz, is_default: true, slots },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-schedules"] });
      toast.success("Schedule saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const grid = useMemo(() => {
    const byDay: Record<number, Array<{ start_time: string; end_time: string }>> = {};
    for (let i = 0; i < 7; i++) byDay[i] = [];
    slots.forEach((s) =>
      byDay[s.day_of_week].push({ start_time: s.start_time, end_time: s.end_time }),
    );
    return byDay;
  }, [slots]);

  function updateDay(day: number, idx: number, key: "start_time" | "end_time", value: string) {
    const dayEntries = grid[day];
    const globalIdx = slots.findIndex(
      (s, i) =>
        s.day_of_week === day &&
        slots.slice(0, i + 1).filter((x) => x.day_of_week === day).length === idx + 1,
    );
    if (globalIdx >= 0) {
      const next = [...slots];
      next[globalIdx] = { ...next[globalIdx], [key]: value.length === 5 ? `${value}:00` : value };
      setSlots(next);
    }
    void dayEntries;
  }
  function addRow(day: number) {
    setSlots([...slots, { day_of_week: day, start_time: "09:00:00", end_time: "17:00:00" }]);
  }
  function removeRow(day: number, idx: number) {
    let seen = 0;
    setSlots(
      slots.filter((s) => {
        if (s.day_of_week !== day) return true;
        const keep = seen !== idx;
        seen++;
        return keep;
      }),
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Timezone</Label>
              <Input value={tz} onChange={(e) => setTz(e.target.value)} />
            </div>
          </div>
          <div className="divide-y border rounded-control">
            {DAYS.map((label, day) => (
              <div key={day} className="p-3 flex items-start gap-4">
                <div className="w-14 pt-2 text-sm font-medium">{label}</div>
                <div className="flex-1 space-y-2">
                  {grid[day].length === 0 && (
                    <div className="text-xs text-muted-foreground">Unavailable</div>
                  )}
                  {grid[day].map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimePicker
                        className="w-32"
                        value={r.start_time.slice(0, 5)}
                        onChange={(v) => updateDay(day, i, "start_time", v ?? "")}
                      />
                      <span className="text-muted-foreground">→</span>
                      <TimePicker
                        className="w-32"
                        value={r.end_time.slice(0, 5)}
                        onChange={(v) => updateDay(day, i, "end_time", v ?? "")}
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeRow(day, i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => addRow(day)}>
                    <Plus className="h-3 w-3 " />
                    Add hours
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save schedule
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Appointments ---------------- */

function AppointmentsTab() {
  const fmtZoned = useZonedDateFormatter();
  const listFn = useServerFn(listAppointments);
  const cancelFn = useServerFn(cancelAppointment);
  const noShowFn = useServerFn(markNoShow);
  const rescheduleFn = useServerFn(rescheduleAppointment);
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const { data: rows } = useQuery({
    queryKey: ["booking-appointments", status],
    queryFn: () => listFn({ data: status === "all" ? {} : { status } }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-appointments"] });
      toast.success("Cancelled");
    },
  });
  const noShow = useMutation({
    mutationFn: (id: string) => noShowFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-appointments"] });
      toast.success("Marked no-show");
    },
  });
  const [rescheduling, setRescheduling] = useState<any | null>(null);
  const [newStart, setNewStart] = useState<string>("");
  const doReschedule = useMutation({
    mutationFn: () => {
      const start = new Date(newStart);
      const durMin =
        (new Date(rescheduling.end_at).getTime() - new Date(rescheduling.start_at).getTime()) /
        60_000;
      const end = new Date(start.getTime() + durMin * 60_000);
      return rescheduleFn({
        data: { id: rescheduling.id, start_at: start.toISOString(), end_at: end.toISOString() },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-appointments"] });
      setRescheduling(null);
      toast.success("Rescheduled");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="text-xs uppercase text-muted-foreground">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0 divide-y">
          {(rows ?? []).map((a: any) => (
            <div key={a.id} className="p-4 flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{a.customer_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {a.booking_event_types?.name ?? "—"} ·{" "}
                  {fmtZoned(new Date(a.start_at), { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {a.source_channel}
                  {a.customer_email && ` · ${a.customer_email}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {a.status}
                </Badge>
                {["confirmed", "pending"].includes(a.status) && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRescheduling(a);
                        setNewStart(new Date(a.start_at).toISOString().slice(0, 16));
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => noShow.mutate(a.id)}
                      title="Mark no-show"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {(!rows || rows.length === 0) && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No appointments in this view.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rescheduling} onOpenChange={(o) => !o && setRescheduling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
          </DialogHeader>
          {rescheduling && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {rescheduling.customer_name} · currently{" "}
                {fmtZoned(new Date(rescheduling.start_at), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
              <Label>New start time</Label>
              <DateTimePicker
                value={fromLocalDateTimeString(newStart)}
                onChange={(d) => setNewStart(toLocalDateTimeString(d))}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRescheduling(null)}>
              Cancel
            </Button>
            <Button onClick={() => doReschedule.mutate()} disabled={doReschedule.isPending}>
              {doReschedule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
