/**
 * Booking analytics — aggregated reports and CSV export.
 *
 * One server function `getBookingAnalytics` returns every metric the
 * dashboard renders. All queries scope to the caller's workspace via
 * requireSupabaseAuth (RLS enforced) plus a supplied date range.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

const filterInput = z.object({
  from: z.string(), // ISO
  to: z.string(),
  host_id: z.string().uuid().optional(),
  event_type_id: z.string().uuid().optional(),
  source_channel: z.string().optional(),
});

export type AnalyticsFilter = z.infer<typeof filterInput>;

export interface BookingAnalytics {
  summary: {
    total: number;
    completed: number;
    cancelled: number;
    rescheduled: number;
    no_show: number;
    pending: number;
    confirmed: number;
    revenue: number;
    /** Null when no event type priced anything — the client fills in the tenant's. */
    currency: string | null;
    conversion_rate: number; // completed / total
    cancellation_rate: number;
    no_show_rate: number;
    avg_duration_minutes: number;
    avg_satisfaction: number | null;
    utilization_pct: number; // booked / working-hour capacity approximation
  };
  by_day: Array<{ date: string; total: number; completed: number; cancelled: number; no_show: number; revenue: number }>;
  by_status: Array<{ status: string; count: number }>;
  by_service: Array<{ event_type_id: string | null; name: string; count: number; revenue: number }>;
  by_agent: Array<{ host_id: string; name: string; total: number; completed: number; no_show: number; revenue: number; avg_rating: number | null }>;
  by_source: Array<{ source: string; count: number }>;
  by_duration: Array<{ bucket: string; count: number }>;
}

interface ApptRow {
  id: string;
  host_id: string;
  event_type_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  source_channel: string;
  reschedule_of: string | null;
  answers: Record<string, unknown> | null;
}

interface EventTypeRow {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  duration_minutes: number;
}

interface HostRow { id: string; display_name: string | null; email: string | null }

function isoDay(d: string): string { return d.slice(0, 10); }
function daysBetween(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const a = new Date(fromISO); a.setUTCHours(0, 0, 0, 0);
  const b = new Date(toISO); b.setUTCHours(0, 0, 0, 0);
  for (let t = a.getTime(); t <= b.getTime(); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
function ratingFromAnswers(a: Record<string, unknown> | null): number | null {
  if (!a) return null;
  const candidates = ["rating", "csat", "satisfaction", "score"];
  for (const k of candidates) {
    const v = a[k];
    if (typeof v === "number" && v >= 0 && v <= 10) return v;
    if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  }
  return null;
}

export const getBookingAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => filterInput.parse(v))
  .handler(async ({ data, context }): Promise<BookingAnalytics> => {
    const { supabase } = context;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("booking_appointments")
      .select("id, host_id, event_type_id, start_at, end_at, status, source_channel, reschedule_of, answers")
      .gte("start_at", data.from)
      .lte("start_at", data.to);
    if (data.host_id) q = q.eq("host_id", data.host_id);
    if (data.event_type_id) q = q.eq("event_type_id", data.event_type_id);
    if (data.source_channel) q = q.eq("source_channel", data.source_channel);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const appts = (rows ?? []) as ApptRow[];

    // Sidecar lookups
    const etIds = [...new Set(appts.map((a) => a.event_type_id).filter(Boolean) as string[])];
    const hostIds = [...new Set(appts.map((a) => a.host_id))];

    const [etRes, hostRes] = await Promise.all([
      etIds.length
        ? sbAny(supabase).from("booking_event_types" as never)
            .select("id, name, price, currency, duration_minutes")
            .in("id", etIds as never)
        : Promise.resolve({ data: [] as EventTypeRow[] }),
      hostIds.length
        ? sbAny(supabase).from("profiles" as never)
            .select("id, display_name, email")
            .in("id", hostIds as never)
        : Promise.resolve({ data: [] as HostRow[] }),
    ]);

    const etMap = new Map<string, EventTypeRow>();
    for (const r of ((etRes as { data: EventTypeRow[] | null }).data ?? [])) etMap.set(r.id, r);
    const hostMap = new Map<string, HostRow>();
    for (const r of ((hostRes as { data: HostRow[] | null }).data ?? [])) hostMap.set(r.id, r);

    // ---------- Aggregations ----------
    const dayBuckets = new Map<string, { total: number; completed: number; cancelled: number; no_show: number; revenue: number }>();
    for (const d of daysBetween(data.from, data.to)) {
      dayBuckets.set(d, { total: 0, completed: 0, cancelled: 0, no_show: 0, revenue: 0 });
    }

    const statusCounts = new Map<string, number>();
    const serviceAgg = new Map<string | null, { name: string; count: number; revenue: number }>();
    const agentAgg = new Map<string, { total: number; completed: number; no_show: number; revenue: number; ratings: number[] }>();
    const sourceCounts = new Map<string, number>();
    const durationBuckets = new Map<string, number>([
      ["≤15m", 0], ["16–30m", 0], ["31–60m", 0], ["61–120m", 0], [">120m", 0],
    ]);

    let totalDurationMin = 0;
    let revenue = 0;
    // Null means "no event type priced this", which the client resolves against
    // the tenant currency. Asserting "USD" here overrode that fallback.
    let currency: string | null = null;
    const ratingsAll: number[] = [];

    for (const a of appts) {
      const day = isoDay(a.start_at);
      const bucket = dayBuckets.get(day) ?? { total: 0, completed: 0, cancelled: 0, no_show: 0, revenue: 0 };
      bucket.total += 1;
      if (a.status === "completed") bucket.completed += 1;
      if (a.status === "cancelled") bucket.cancelled += 1;
      if (a.status === "no_show") bucket.no_show += 1;
      dayBuckets.set(day, bucket);

      statusCounts.set(a.status, (statusCounts.get(a.status) ?? 0) + 1);
      sourceCounts.set(a.source_channel, (sourceCounts.get(a.source_channel) ?? 0) + 1);

      const durMin = Math.max(0, Math.round((new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 60_000));
      totalDurationMin += durMin;
      const dk = durMin <= 15 ? "≤15m" : durMin <= 30 ? "16–30m" : durMin <= 60 ? "31–60m" : durMin <= 120 ? "61–120m" : ">120m";
      durationBuckets.set(dk, (durationBuckets.get(dk) ?? 0) + 1);

      const et = a.event_type_id ? etMap.get(a.event_type_id) : undefined;
      const price = (et?.price ?? 0);
      if (et?.currency) currency = et.currency;
      const bookingRev = a.status === "completed" ? Number(price) : 0;
      revenue += bookingRev;
      bucket.revenue += bookingRev;

      const skey = a.event_type_id;
      const sagg = serviceAgg.get(skey) ?? { name: et?.name ?? "Unassigned", count: 0, revenue: 0 };
      sagg.count += 1;
      sagg.revenue += bookingRev;
      serviceAgg.set(skey, sagg);

      const ag = agentAgg.get(a.host_id) ?? { total: 0, completed: 0, no_show: 0, revenue: 0, ratings: [] as number[] };
      ag.total += 1;
      if (a.status === "completed") ag.completed += 1;
      if (a.status === "no_show") ag.no_show += 1;
      ag.revenue += bookingRev;
      const r = ratingFromAnswers(a.answers);
      if (r != null) { ag.ratings.push(r); ratingsAll.push(r); }
      agentAgg.set(a.host_id, ag);
    }

    // Utilization: booked minutes / working-window minutes (8h × distinct-host-days).
    const workingHoursPerDay = 8;
    const hostDaySet = new Set<string>();
    for (const a of appts) hostDaySet.add(`${a.host_id}:${isoDay(a.start_at)}`);
    const capacityMin = hostDaySet.size * workingHoursPerDay * 60;
    const utilization = capacityMin > 0 ? Math.min(100, (totalDurationMin / capacityMin) * 100) : 0;

    const total = appts.length;
    const completed = statusCounts.get("completed") ?? 0;
    const cancelled = statusCounts.get("cancelled") ?? 0;
    const rescheduled = statusCounts.get("rescheduled") ?? 0;
    const noShow = statusCounts.get("no_show") ?? 0;
    const pending = statusCounts.get("pending") ?? 0;
    const confirmed = statusCounts.get("confirmed") ?? 0;

    const avgSat = ratingsAll.length ? ratingsAll.reduce((s, x) => s + x, 0) / ratingsAll.length : null;

    return {
      summary: {
        total, completed, cancelled, rescheduled, no_show: noShow, pending, confirmed,
        revenue, currency,
        conversion_rate: total ? (completed / total) * 100 : 0,
        cancellation_rate: total ? (cancelled / total) * 100 : 0,
        no_show_rate: total ? (noShow / total) * 100 : 0,
        avg_duration_minutes: total ? Math.round(totalDurationMin / total) : 0,
        avg_satisfaction: avgSat,
        utilization_pct: Math.round(utilization),
      },
      by_day: [...dayBuckets.entries()].map(([date, v]) => ({ date, ...v })),
      by_status: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
      by_service: [...serviceAgg.entries()]
        .map(([id, v]) => ({ event_type_id: id, name: v.name, count: v.count, revenue: v.revenue }))
        .sort((a, b) => b.count - a.count),
      by_agent: [...agentAgg.entries()].map(([host_id, v]) => {
        const h = hostMap.get(host_id);
        return {
          host_id,
          name: h?.display_name ?? h?.email ?? host_id.slice(0, 8),
          total: v.total, completed: v.completed, no_show: v.no_show, revenue: v.revenue,
          avg_rating: v.ratings.length ? v.ratings.reduce((s, x) => s + x, 0) / v.ratings.length : null,
        };
      }).sort((a, b) => b.total - a.total),
      by_source: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })),
      by_duration: [...durationBuckets.entries()].map(([bucket, count]) => ({ bucket, count })),
    };
  });

// ---------- CSV Export ----------

export const exportBookingAnalyticsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => filterInput.parse(v))
  .handler(async ({ data, context }): Promise<{ filename: string; csv: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = context.supabase
      .from("booking_appointments")
      .select("id, start_at, end_at, status, source_channel, host_id, event_type_id, customer_name, customer_email")
      .gte("start_at", data.from)
      .lte("start_at", data.to)
      .order("start_at", { ascending: false });
    if (data.host_id) q = q.eq("host_id", data.host_id);
    if (data.event_type_id) q = q.eq("event_type_id", data.event_type_id);
    if (data.source_channel) q = q.eq("source_channel", data.source_channel);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const headers = ["id", "start_at", "end_at", "status", "source", "host_id", "event_type_id", "customer_name", "customer_email"];
    const esc = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of (rows ?? []) as Record<string, unknown>[]) {
      lines.push([r.id, r.start_at, r.end_at, r.status, r.source_channel, r.host_id, r.event_type_id, r.customer_name, r.customer_email].map(esc).join(","));
    }
    return {
      filename: `booking-analytics-${data.from.slice(0, 10)}_${data.to.slice(0, 10)}.csv`,
      csv: lines.join("\n"),
    };
  });
