/**
 * Availability engine — computes free slot ranges for an event type over a date
 * range, taking weekly schedules, date overrides, existing bookings, buffers,
 * min-notice and max-advance windows into account.
 *
 * All times stored & returned as ISO UTC; the caller applies the customer TZ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AvailabilitySlot {
  host_id: string;
  start_at: string;
  end_at: string;
}

interface EventType {
  id: string;
  workspace_id: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
}

interface WeeklySlot { day_of_week: number; start_time: string; end_time: string }
interface HostSchedule {
  host_id: string;
  timezone: string;
  weekly: WeeklySlot[];
  overrides: Array<{ override_date: string; is_blocked: boolean; start_time: string | null; end_time: string | null }>;
  busy: Array<{ start_at: string; end_at: string }>;
}

function addMinutes(d: Date, m: number) { return new Date(d.getTime() + m * 60_000); }
function parseTimeOnDate(date: Date, hhmm: string): Date {
  const [h, m, s] = hhmm.split(":").map(Number);
  const out = new Date(date);
  out.setUTCHours(h, m, s || 0, 0);
  return out;
}
function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeAvailability(
  supabase: SupabaseClient,
  eventTypeId: string,
  fromISO: string,
  toISO: string,
): Promise<AvailabilitySlot[]> {
  const { data: et } = await supabase
    .from("booking_event_types")
    .select("id, workspace_id, duration_minutes, buffer_before_minutes, buffer_after_minutes, min_notice_minutes, max_advance_days, is_active")
    .eq("id", eventTypeId)
    .maybeSingle();
  if (!et || !et.is_active) return [];
  const eventType = et as EventType;

  const { data: hostsData } = await supabase
    .from("booking_event_type_hosts")
    .select("host_id, schedule_id, priority, booking_availability_schedules(timezone, booking_availability_slots(day_of_week, start_time, end_time))")
    .eq("event_type_id", eventTypeId)
    .order("priority", { ascending: true });

  const now = new Date();
  const from = new Date(Math.max(new Date(fromISO).getTime(), addMinutes(now, eventType.min_notice_minutes).getTime()));
  const maxTo = addMinutes(now, eventType.max_advance_days * 24 * 60);
  const to = new Date(Math.min(new Date(toISO).getTime(), maxTo.getTime()));
  if (to <= from) return [];

  const hosts: HostSchedule[] = [];
  for (const row of (hostsData ?? []) as any[]) {
    const sched = row.booking_availability_schedules;
    hosts.push({
      host_id: row.host_id,
      timezone: sched?.timezone ?? "UTC",
      weekly: (sched?.booking_availability_slots ?? []) as WeeklySlot[],
      overrides: [],
      busy: [],
    });
  }
  if (hosts.length === 0) return [];

  const hostIds = hosts.map((h) => h.host_id);

  const { data: overrides } = await supabase
    .from("booking_availability_overrides")
    .select("host_id, override_date, is_blocked, start_time, end_time")
    .in("host_id", hostIds)
    .gte("override_date", toDateOnly(from))
    .lte("override_date", toDateOnly(to));
  for (const o of (overrides ?? []) as any[]) {
    const h = hosts.find((x) => x.host_id === o.host_id);
    if (h) h.overrides.push(o);
  }

  const { data: busyRows } = await supabase
    .from("booking_appointments")
    .select("host_id, start_at, end_at, status")
    .in("host_id", hostIds)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", to.toISOString())
    .gt("end_at", from.toISOString());
  for (const b of (busyRows ?? []) as any[]) {
    const h = hosts.find((x) => x.host_id === b.host_id);
    if (h) h.busy.push({ start_at: b.start_at, end_at: b.end_at });
  }

  // Subtract busy time cached from connected external calendars
  // (Google / Microsoft / Apple ICS via the provider abstraction layer).
  const { data: extBusy } = await supabase
    .from("calendar_busy_cache")
    .select("host_id, start_at, end_at")
    .in("host_id", hostIds)
    .lt("start_at", to.toISOString())
    .gt("end_at", from.toISOString());
  for (const b of (extBusy ?? []) as Array<{ host_id: string; start_at: string; end_at: string }>) {
    const h = hosts.find((x) => x.host_id === b.host_id);
    if (h) h.busy.push({ start_at: b.start_at, end_at: b.end_at });
  }

  const slots: AvailabilitySlot[] = [];
  const step = eventType.duration_minutes;
  const bBefore = eventType.buffer_before_minutes;
  const bAfter = eventType.buffer_after_minutes;

  for (const host of hosts) {
    for (let day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); day <= to; day = addMinutes(day, 24 * 60)) {
      const dateStr = toDateOnly(day);
      const dow = day.getUTCDay();

      const override = host.overrides.find((o) => o.override_date === dateStr);
      let windows: Array<{ start: string; end: string }> = [];
      if (override) {
        if (override.is_blocked) continue;
        if (override.start_time && override.end_time) windows = [{ start: override.start_time, end: override.end_time }];
      } else {
        windows = host.weekly.filter((w) => w.day_of_week === dow).map((w) => ({ start: w.start_time, end: w.end_time }));
      }

      for (const w of windows) {
        let cursor = parseTimeOnDate(day, w.start);
        const windowEnd = parseTimeOnDate(day, w.end);
        while (addMinutes(cursor, step) <= windowEnd) {
          const slotStart = cursor;
          const slotEnd = addMinutes(slotStart, step);
          const blockStart = addMinutes(slotStart, -bBefore);
          const blockEnd = addMinutes(slotEnd, bAfter);

          if (slotStart < from) { cursor = addMinutes(cursor, step); continue; }
          if (slotEnd > to) break;

          const conflict = host.busy.some((b) => {
            const bs = new Date(b.start_at);
            const be = new Date(b.end_at);
            return bs < blockEnd && be > blockStart;
          });
          if (!conflict) {
            slots.push({ host_id: host.host_id, start_at: slotStart.toISOString(), end_at: slotEnd.toISOString() });
          }
          cursor = addMinutes(cursor, step);
        }
      }
    }
  }

  slots.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return slots;
}

/** Group slots by start time (round-robin picks first host per timeslot). */
export function dedupeSlotsByStart(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const seen = new Set<string>();
  const out: AvailabilitySlot[] = [];
  for (const s of slots) {
    if (seen.has(s.start_at)) continue;
    seen.add(s.start_at);
    out.push(s);
  }
  return out;
}
