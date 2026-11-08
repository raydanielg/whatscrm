/**
 * Public booking page — /book/$slug
 * Beautiful, branded, themable Calendly-style flow.
 */
import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { platformBrandingQueryOptions } from "@/hooks/use-platform-branding";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Globe,
  DollarSign,
} from "lucide-react";
import {
  format,
  addDays,
  startOfDay,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  addMonths,
  isBefore,
} from "date-fns";
import { ThemeToggle } from "@/components/app/booking/public/theme-toggle";
import { brandStyle } from "@/components/app/booking/public/theme";
import {
  CustomFieldsRenderer,
  type BookingQuestion,
} from "@/components/app/booking/public/custom-fields";

type EventType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_kind: string;
  color: string | null;
  confirmation_message: string | null;
  questions: BookingQuestion[];
  price: number | null;
  currency: string | null;
  redirect_url: string | null;
};

export const Route = createFileRoute("/book/$slug")({
  ssr: false,
  loader: async ({ params, context }) => {
    const brandingPromise = context.queryClient.ensureQueryData(platformBrandingQueryOptions());
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("booking_event_types")
      .select(
        "id, name, slug, description, duration_minutes, location_kind, color, confirmation_message, questions, price, currency, redirect_url, is_active",
      )
      .eq("slug", params.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) throw notFound();
    return { eventType: data as unknown as EventType, branding: await brandingPromise };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.eventType.name} · Book a meeting` : "Book a meeting" },
      {
        name: "description",
        content: loaderData?.eventType.description ?? "Pick a time that works for you.",
      },
      {
        property: "og:title",
        content: loaderData ? `${loaderData.eventType.name} · Book a meeting` : "Book",
      },
      {
        property: "og:description",
        content: loaderData?.eventType.description ?? "Pick a time that works for you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index, follow" },
    ],
    links: [
      { rel: "canonical", href: loaderData ? `/book/${loaderData.eventType.slug}` : "/book" },
    ],
    scripts: loaderData
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Service",
              name: loaderData.eventType.name,
              description: loaderData.eventType.description ?? undefined,
              provider: {
                "@type": "Organization",
                name: loaderData.branding.platformName || BRAND_NAME,
              },
              // `head()` is a route option, not a component, so there is no hook
              // to read the platform currency from here. Rather than assert
              // dollars in structured data a search engine will index, the offer
              // is omitted when the event type carries no currency of its own.
              offers:
                loaderData.eventType.price && loaderData.eventType.currency
                  ? {
                      "@type": "Offer",
                      price: loaderData.eventType.price,
                      priceCurrency: loaderData.eventType.currency,
                    }
                  : undefined,
            }),
          },
        ]
      : undefined,
  }),
  component: PublicBookingPage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-8 text-center bg-background text-foreground">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Meeting not found</h1>
        <p className="text-muted-foreground">This booking link is no longer active.</p>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
    </div>
  ),
});

function PublicBookingPage() {
  const { eventType } = Route.useLoaderData() as { eventType: EventType };
  const brand = eventType.color ?? "#075E54";

  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<Array<{ start_at: string; end_at: string }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    start_at: string;
    end_at: string;
    manage_token?: string;
  } | null>(null);
  const [tz, setTz] = useState<string>("UTC");

  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingSlots(true);
      const from = startOfDay(monthAnchor).toISOString();
      const to = addDays(endOfMonth(monthAnchor), 1).toISOString();
      const res = await fetch(
        `/api/public/booking/slots?event_type_id=${eventType.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const j = await res.json();
      if (!cancelled) setSlots(j.slots ?? []);
      setLoadingSlots(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [eventType.id, monthAnchor]);

  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => set.add(new Date(s.start_at).toDateString()));
    return set;
  }, [slots]);

  const slotsForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return slots.filter((s) => isSameDay(new Date(s.start_at), selectedDay));
  }, [slots, selectedDay]);

  // Build a 6-row calendar grid for the current month
  const monthGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
    return Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  }, [monthAnchor]);

  const questions = (eventType.questions ?? []) as BookingQuestion[];

  const requiredMissing = questions.some((q) => {
    if (!q.required) return false;
    const k = q.key ?? q.id ?? "";
    const v = answers[k];
    return v === undefined || v === null || v === "";
  });

  async function submit() {
    if (!selectedSlot || !form.name || !form.email || !agreed || requiredMissing) return;
    const slot = slots.find((s) => s.start_at === selectedSlot);
    if (!slot) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/booking/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type_id: eventType.id,
          customer_name: form.name,
          customer_email: form.email,
          customer_phone: form.phone || null,
          customer_timezone: tz,
          start_at: slot.start_at,
          end_at: slot.end_at,
          answers: { ...answers, notes: form.notes || undefined },
          source_channel: "booking_page",
        }),
      });
      const j = await res.json();
      if (!res.ok)
        throw new Error(
          j.error === "slot_taken"
            ? "That slot was just taken. Please pick another."
            : (j.error ?? "Booking failed"),
        );
      setConfirmed({
        start_at: slot.start_at,
        end_at: slot.end_at,
        manage_token: j.appointment?.manage_token,
      });
      if (eventType.redirect_url) {
        setTimeout(() => {
          window.location.href = eventType.redirect_url!;
        }, 1200);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={brandStyle(brand)}>
        <TopBar brand={brand} />
        <div className="max-w-md mx-auto p-6 pt-16">
          <Card className="border-2" style={{ borderColor: brand }}>
            <CardContent className="p-8 text-center space-y-4">
              <div
                className="h-14 w-14 mx-auto rounded-full flex items-center justify-center"
                style={{ background: brand }}
              >
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">You're booked</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(confirmed.start_at), "PPPP 'at' p")} · {tz}
                </p>
              </div>
              {eventType.confirmation_message && (
                <p className="text-sm">{eventType.confirmation_message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                A confirmation was sent to {form.email}.
              </p>
              {confirmed.manage_token && (
                <Link
                  to="/book/manage/$token"
                  params={{ token: confirmed.manage_token }}
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Reschedule or cancel
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground" style={brandStyle(brand)}>
      <TopBar brand={brand} />
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="grid gap-6 md:grid-cols-[300px_1fr] items-start">
          <aside className="space-y-4 md:sticky md:top-20">
            <div className="h-1.5 w-12 rounded-full" style={{ background: brand }} />
            <div>
              <h1 className="text-2xl font-semibold leading-tight">{eventType.name}</h1>
              {eventType.description && (
                <p className="text-sm text-muted-foreground mt-2">{eventType.description}</p>
              )}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-2 pt-3">
                <Clock className="h-4 w-4 shrink-0" />
                {eventType.duration_minutes} minutes
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="capitalize">
                  {String(eventType.location_kind).replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 shrink-0" />
                {tz}
              </div>
              {eventType.price != null && eventType.price > 0 && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 shrink-0" />
                  {eventType.price} {eventType.currency ?? ""}
                </div>
              )}
            </div>
          </aside>

          <main className="space-y-4">
            {selectedSlot ? (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <button
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={() => setSelectedSlot(null)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to time slots
                  </button>
                  <div
                    className="text-sm py-3 px-4 rounded-control"
                    style={{ background: `${brand}12`, color: brand }}
                  >
                    <span className="font-medium">{format(new Date(selectedSlot), "PPPP")}</span> at{" "}
                    <span className="font-medium">{format(new Date(selectedSlot), "p")}</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label>
                        Your name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>
                        Email <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Phone (optional)</Label>
                      <Input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                    <CustomFieldsRenderer
                      questions={questions}
                      answers={answers}
                      onChange={setAnswers}
                    />
                    <div>
                      <Label>Anything we should know? (optional)</Label>
                      <Textarea
                        rows={3}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      />
                    </div>
                    <div className="flex items-start gap-2 pt-2">
                      <Checkbox
                        id="terms"
                        checked={agreed}
                        onCheckedChange={(v) => setAgreed(Boolean(v))}
                      />
                      <Label htmlFor="terms" className="font-normal leading-snug text-sm">
                        I agree to the{" "}
                        <a href="/terms" className="underline" target="_blank" rel="noreferrer">
                          Terms
                        </a>{" "}
                        and{" "}
                        <a href="/privacy" className="underline" target="_blank" rel="noreferrer">
                          Privacy Policy
                        </a>
                        .
                      </Label>
                    </div>
                  </div>
                  <Button
                    className="w-full text-white"
                    style={{ background: brand }}
                    onClick={submit}
                    disabled={submitting || !form.name || !form.email || !agreed || requiredMissing}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Confirm booking
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-medium">{format(monthAnchor, "MMMM yyyy")}</div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}
                        disabled={isBefore(startOfMonth(monthAnchor), startOfMonth(new Date()))}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-[11px] uppercase text-muted-foreground mb-1">
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
                            !inMonth ? "opacity-30" : "",
                          ].join(" ")}
                          style={isSel ? { background: brand } : undefined}
                          aria-label={format(d, "PPP")}
                        >
                          {format(d, "d")}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 border-t pt-5">
                    <div className="text-xs uppercase text-muted-foreground mb-3">
                      {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Pick a day"}
                    </div>
                    {loadingSlots ? (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading times
                      </div>
                    ) : selectedDay ? (
                      slotsForSelectedDay.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No times available on this day.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                          {slotsForSelectedDay.map((s) => (
                            <button
                              key={s.start_at}
                              onClick={() => setSelectedSlot(s.start_at)}
                              className="border rounded-control py-2 text-sm hover:border-foreground hover:bg-muted transition-all"
                            >
                              {format(new Date(s.start_at), "p")}
                            </button>
                          ))}
                        </div>
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Available days are highlighted. Pick one to see times.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            <p className="text-xs text-center text-muted-foreground">
              Powered by{" "}
              <span className="font-medium">
                <Brand />
              </span>
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}

function TopBar({ brand }: { brand: string }) {
  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-control" style={{ background: brand }} />
          <span className="font-semibold text-sm">Book a meeting</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
