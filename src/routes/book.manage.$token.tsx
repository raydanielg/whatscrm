/**
 * Public appointment self-service — /book/manage/$token
 * Lets guests reschedule or cancel without an account.
 */
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  format,
  addDays,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  addMonths,
  isBefore,
  endOfMonth,
} from "date-fns";
import { ThemeToggle } from "@/components/app/booking/public/theme-toggle";
import { brandStyle } from "@/components/app/booking/public/theme";

type Appointment = {
  id: string;
  event_type_id: string;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed" | "cancelled" | string;
  customer_name: string;
  customer_email: string | null;
  customer_timezone: string | null;
  location_kind: string;
  join_url: string | null;
};
type EventType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_kind: string;
  color: string | null;
};

export const Route = createFileRoute("/book/manage/$token")({
  ssr: false,
  loader: async ({ params }) => {
    const res = await fetch(`/api/public/booking/manage?token=${encodeURIComponent(params.token)}`);
    if (!res.ok) throw notFound();
    return (await res.json()) as { appointment: Appointment; eventType: EventType | null };
  },
  head: () => ({
    meta: [
      { title: "Manage your booking" },
      { name: "description", content: "Reschedule or cancel your booking." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ManageBookingPage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Link not found</h1>
        <p className="text-muted-foreground">
          This management link is invalid or has expired.
        </p>
      </div>
    </div>
  ),
});

function ManageBookingPage() {
  const initial = Route.useLoaderData() as {
    appointment: Appointment;
    eventType: EventType | null;
  };
  const { token } = Route.useParams();
  const [appt, setAppt] = useState(initial.appointment);
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const brand = initial.eventType?.color ?? "#075E54";

  if (appt.status === "cancelled") {
    return (
      <Shell brand={brand}>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
            <h1 className="text-xl font-semibold">This booking is cancelled</h1>
            <p className="text-sm text-muted-foreground">
              Originally scheduled for {format(new Date(appt.start_at), "PPPP 'at' p")}.
            </p>
            {initial.eventType && (
              <Link
                to="/book/$slug"
                params={{ slug: initial.eventType.slug }}
                className="text-sm underline"
              >
                Book a new meeting
              </Link>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell brand={brand}>
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <div className="h-1 w-10 rounded-full" style={{ background: brand }} />
            <h1 className="text-2xl font-semibold">
              {initial.eventType?.name ?? "Your booking"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Confirmed for <span className="text-foreground font-medium">{appt.customer_name}</span>
            </p>
          </div>

          <div className="space-y-2 text-sm border rounded-control p-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {format(new Date(appt.start_at), "EEEE, MMMM d, yyyy")}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {format(new Date(appt.start_at), "p")} – {format(new Date(appt.end_at), "p")}
              {appt.customer_timezone && (
                <span className="text-muted-foreground">· {appt.customer_timezone}</span>
              )}
            </div>
            <div className="flex items-center gap-2 capitalize">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {String(appt.location_kind).replace(/_/g, " ")}
            </div>
            {appt.join_url && (
              <a
                href={appt.join_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline break-all"
              >
                Join link →
              </a>
            )}
          </div>

          {mode === "idle" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setMode("reschedule")}>
                Reschedule
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setMode("cancel")}
              >
                Cancel booking
              </Button>
            </div>
          )}

          {mode === "cancel" && (
            <CancelForm
              token={token}
              onDone={() => setAppt({ ...appt, status: "cancelled" })}
              onBack={() => setMode("idle")}
            />
          )}

          {mode === "reschedule" && initial.eventType && (
            <RescheduleForm
              token={token}
              eventType={initial.eventType}
              onDone={(next) => {
                setAppt({ ...appt, start_at: next.start_at, end_at: next.end_at });
                setMode("idle");
              }}
              onBack={() => setMode("idle")}
              brand={brand}
            />
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ brand, children }: { brand: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground" style={brandStyle(brand)}>
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 md:px-8 h-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-control" style={{ background: brand }} />
            <span className="font-semibold text-sm">Manage booking</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="max-w-2xl mx-auto p-4 md:p-8">{children}</div>
    </div>
  );
}

function CancelForm({
  token,
  onDone,
  onBack,
}: {
  token: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/public/booking/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", token, reason: reason || undefined }),
      });
      if (!res.ok) throw new Error("Cancellation failed");
      setDone(true);
      setTimeout(onDone, 800);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-6 space-y-2">
        <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
        <p className="text-sm">Your booking has been cancelled.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <button
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <div>
        <Label>Reason for cancelling (optional)</Label>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Let us know why"
        />
      </div>
      <Button variant="destructive" className="w-full" onClick={submit} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Confirm cancellation
      </Button>
    </div>
  );
}

function RescheduleForm({
  token,
  eventType,
  onDone,
  onBack,
  brand,
}: {
  token: string;
  eventType: EventType;
  onDone: (next: { start_at: string; end_at: string }) => void;
  onBack: () => void;
  brand: string;
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [slots, setSlots] = useState<Array<{ start_at: string; end_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start_at: string; end_at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const from = startOfDay(monthAnchor).toISOString();
      const to = addDays(endOfMonth(monthAnchor), 1).toISOString();
      const res = await fetch(
        `/api/public/booking/slots?event_type_id=${eventType.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const j = await res.json();
      if (!cancelled) setSlots(j.slots ?? []);
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [eventType.id, monthAnchor]);

  const daysWithSlots = useMemo(() => {
    const s = new Set<string>();
    slots.forEach((x) => s.add(new Date(x.start_at).toDateString()));
    return s;
  }, [slots]);

  const monthGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
    return Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  }, [monthAnchor]);

  const daySlots = useMemo(
    () => (selectedDay ? slots.filter((s) => isSameDay(new Date(s.start_at), selectedDay)) : []),
    [slots, selectedDay],
  );

  async function submit() {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      const res = await fetch("/api/public/booking/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          token,
          start_at: selectedSlot.start_at,
          end_at: selectedSlot.end_at,
        }),
      });
      const j = await res.json();
      if (!res.ok)
        throw new Error(
          j.error === "slot_taken" ? "That slot was just taken." : "Reschedule failed",
        );
      onDone({ start_at: selectedSlot.start_at, end_at: selectedSlot.end_at });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <div className="flex items-center justify-between">
        <div className="font-medium">{format(monthAnchor, "MMMM yyyy")}</div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}
            disabled={isBefore(startOfMonth(monthAnchor), startOfMonth(new Date()))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] uppercase text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGrid.map((d, i) => {
          const inMonth = d.getMonth() === monthAnchor.getMonth();
          const has = daysWithSlots.has(d.toDateString());
          const isSel = selectedDay && isSameDay(selectedDay, d);
          const past = isBefore(d, startOfDay(new Date()));
          const disabled = !has || past || !inMonth;
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => setSelectedDay(d)}
              className={[
                "aspect-square rounded-control text-sm flex items-center justify-center transition-all",
                isSel
                  ? "text-white font-semibold"
                  : has && inMonth && !past
                    ? "hover:bg-muted font-medium"
                    : "text-muted-foreground/30",
              ].join(" ")}
              style={isSel ? { background: brand } : undefined}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
      <div className="border-t pt-4">
        <div className="text-xs uppercase text-muted-foreground mb-3">
          {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Pick a day"}
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading times
          </div>
        ) : selectedDay && daySlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No times on this day.</p>
        ) : selectedDay ? (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {daySlots.map((s) => {
              const active = selectedSlot?.start_at === s.start_at;
              return (
                <button
                  key={s.start_at}
                  onClick={() => setSelectedSlot(s)}
                  className={`border rounded-control py-2 text-sm transition-all ${active ? "text-white" : "hover:bg-muted"}`}
                  style={active ? { background: brand, borderColor: brand } : undefined}
                >
                  {format(new Date(s.start_at), "p")}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <Button
        className="w-full text-white"
        style={{ background: brand }}
        disabled={!selectedSlot || busy}
        onClick={submit}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Confirm new time
      </Button>
    </div>
  );
}
