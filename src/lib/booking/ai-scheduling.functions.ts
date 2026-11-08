/**
 * AI Scheduling — booking intelligence server functions.
 *
 * All model calls go through the AI Provider Engine (`runChat` in
 * `src/lib/ai/complete.functions.ts`) so provider/model/fallbacks/logging
 * are consistent with the rest of WACRM.
 *
 * Features:
 *  - suggestBestTime
 *  - findCommonAvailability
 *  - rescheduleRecommendations
 *  - detectConflicts
 *  - travelTimeSuggestions
 *  - meetingSummary
 *  - meetingPreparation
 *  - followUpSuggestions
 *  - smartAvailability
 *  - naturalLanguageScheduling
 *  - generateCalendarEvent
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "@/lib/ai/complete.functions";
import {
  computeAvailability,
  dedupeSlotsByStart,
  type AvailabilitySlot,
} from "./availability-engine";
import { sbAny } from "@/lib/supabase/untyped";

// ---------- Helpers ----------

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin)
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace found for current user");
  return (data as { workspace_id: string }).workspace_id;
}

interface AIOpts {
  system: string;
  user: string;
  json?: boolean;
  feature?: string;
  model?: string;
}

async function askAI<T = string>(
  workspaceId: string,
  userId: string,
  opts: AIOpts,
): Promise<T | string> {
  const res = await runChat({
    workspaceId,
    userId,
    feature: opts.feature ?? "ai_scheduling",
    request: {
      model: opts.model ?? (await resolveDefaultModel(workspaceId)),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: 0.4,
      response_format: opts.json ? "json_object" : "text",
    },
  });
  const content = res.content ?? "";
  if (!opts.json) return content;
  try {
    const clean = content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(clean) as T;
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}

// ---------- Types ----------

export interface RankedSlot {
  start_at: string;
  end_at: string;
  host_id: string;
  score: number;
  rationale: string;
}

export interface NLSchedulingIntent {
  intent: "book" | "reschedule" | "cancel" | "check_availability" | "unknown";
  title: string | null;
  duration_minutes: number | null;
  start_at: string | null;
  end_at: string | null;
  participants: string[];
  location: string | null;
  notes: string | null;
  confidence: number;
}

export interface ConflictReport {
  hasConflicts: boolean;
  conflicts: Array<{ start_at: string; end_at: string; reason: string }>;
  suggestions: string[];
}

// ---------- 1. Suggest Best Time ----------

const suggestBestTimeInput = z.object({
  event_type_id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  preferences: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(3),
});

export const suggestBestTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => suggestBestTimeInput.parse(v))
  .handler(async ({ data, context }): Promise<RankedSlot[]> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const slots = await computeAvailability(
      context.supabase as never,
      data.event_type_id,
      data.from,
      data.to,
    );
    if (slots.length === 0) return [];
    const candidates = dedupeSlotsByStart(slots).slice(0, 40);
    const system =
      "You are a scheduling assistant. Rank meeting time slots based on typical productivity heuristics (mid-morning and mid-afternoon on weekdays are strongest; avoid lunch, early morning, late evening, and Fridays after 3pm). Return strict JSON.";
    const user = `Preferences: ${data.preferences ?? "none"}\nCandidate slots (UTC ISO):\n${candidates.map((s, i) => `${i + 1}. ${s.start_at} → ${s.end_at} (host ${s.host_id})`).join("\n")}\n\nReturn {"picks":[{"index":1,"score":0-100,"rationale":"..."}]} with the top ${data.limit}.`;
    const parsed = await askAI<{ picks: { index: number; score: number; rationale: string }[] }>(
      workspaceId,
      context.userId,
      { system, user, json: true, feature: "ai_suggest_best_time" },
    );
    const picks = typeof parsed === "string" ? { picks: [] } : parsed;
    return picks.picks
      .map((p) => {
        const s = candidates[p.index - 1];
        return s ? { ...s, score: p.score, rationale: p.rationale } : null;
      })
      .filter(Boolean) as RankedSlot[];
  });

// ---------- 2. Find Common Availability ----------

const findCommonInput = z.object({
  host_ids: z.array(z.string().uuid()).min(1),
  from: z.string(),
  to: z.string(),
  duration_minutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  timezone: z.string().default("UTC"),
});

export const findCommonAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => findCommonInput.parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<{ start_at: string; end_at: string; host_ids: string[] }>> => {
      const { supabase } = context;
      const from = new Date(data.from).getTime();
      const to = new Date(data.to).getTime();
      const durMs = data.duration_minutes * 60_000;

      // Gather busy events per host from calendar_events.
      const { data: events } = await supabase
        .from("calendar_events" as never)
        .select("host_id, start_at, end_at")
        .in("host_id", data.host_ids as never)
        .gte("end_at", new Date(from).toISOString())
        .lte("start_at", new Date(to).toISOString());

      const busy = new Map<string, Array<[number, number]>>();
      for (const h of data.host_ids) busy.set(h, []);
      for (const e of (events ?? []) as Array<{
        host_id: string;
        start_at: string;
        end_at: string;
      }>) {
        busy.get(e.host_id)?.push([new Date(e.start_at).getTime(), new Date(e.end_at).getTime()]);
      }

      // Walk 15-minute windows and pick intervals free for everyone.
      const step = 15 * 60_000;
      const out: Array<{ start_at: string; end_at: string; host_ids: string[] }> = [];
      for (let t = from; t + durMs <= to; t += step) {
        const end = t + durMs;
        const freeForAll = data.host_ids.every(
          (h) => !(busy.get(h) ?? []).some(([bs, be]) => bs < end && be > t),
        );
        if (freeForAll) {
          out.push({
            start_at: new Date(t).toISOString(),
            end_at: new Date(end).toISOString(),
            host_ids: data.host_ids,
          });
          if (out.length >= 20) break;
        }
      }
      return out;
    },
  );

// ---------- 3. Reschedule Recommendations ----------

const rescheduleInput = z.object({ booking_id: z.string().uuid(), reason: z.string().optional() });

export const rescheduleRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => rescheduleInput.parse(v))
  .handler(async ({ data, context }): Promise<RankedSlot[]> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: booking } = await context.supabase
      .from("bookings" as never)
      .select("id, event_type_id, start_at, end_at, host_id")
      .eq("id", data.booking_id)
      .maybeSingle();
    if (!booking) return [];
    const b = booking as { event_type_id: string; start_at: string };
    const start = new Date(b.start_at);
    const from = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const slots = await computeAvailability(context.supabase as never, b.event_type_id, from, to);
    if (slots.length === 0) return [];
    const candidates = dedupeSlotsByStart(slots).slice(0, 25);
    const system =
      "You recommend the best reschedule times. Prioritize slots close to the original time-of-day and day-of-week, without being too soon. Return strict JSON.";
    const user = `Original: ${b.start_at}\nReason: ${data.reason ?? "not specified"}\nCandidates:\n${candidates.map((s, i) => `${i + 1}. ${s.start_at}`).join("\n")}\n\nReturn {"picks":[{"index":n,"score":0-100,"rationale":"..."}]} with top 3.`;
    const parsed = await askAI<{ picks: { index: number; score: number; rationale: string }[] }>(
      workspaceId,
      context.userId,
      { system, user, json: true, feature: "ai_reschedule_recs" },
    );
    const picks = typeof parsed === "string" ? { picks: [] } : parsed;
    return picks.picks
      .map((p) => {
        const s = candidates[p.index - 1];
        return s ? { ...s, score: p.score, rationale: p.rationale } : null;
      })
      .filter(Boolean) as RankedSlot[];
  });

// ---------- 4. Conflict Detection ----------

const conflictsInput = z.object({
  host_id: z.string().uuid(),
  start_at: z.string(),
  end_at: z.string(),
  exclude_booking_id: z.string().uuid().optional(),
});

export const detectConflicts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => conflictsInput.parse(v))
  .handler(async ({ data, context }): Promise<ConflictReport> => {
    const { supabase } = context;
    const start = new Date(data.start_at).toISOString();
    const end = new Date(data.end_at).toISOString();

    const [bookingsRes, eventsRes] = await Promise.all([
      sbAny(supabase)
        .from("bookings" as never)
        .select("id, start_at, end_at, status")
        .eq("host_id", data.host_id)
        .in("status", ["confirmed", "pending"] as never)
        .lt("start_at", end)
        .gt("end_at", start),
      sbAny(supabase)
        .from("calendar_events" as never)
        .select("id, summary, start_at, end_at")
        .eq("host_id", data.host_id)
        .lt("start_at", end)
        .gt("end_at", start),
    ]);

    const conflicts: ConflictReport["conflicts"] = [];
    for (const b of (bookingsRes.data ?? []) as Array<{
      id: string;
      start_at: string;
      end_at: string;
    }>) {
      if (data.exclude_booking_id && b.id === data.exclude_booking_id) continue;
      conflicts.push({ start_at: b.start_at, end_at: b.end_at, reason: "Existing booking" });
    }
    for (const e of (eventsRes.data ?? []) as Array<{
      summary: string | null;
      start_at: string;
      end_at: string;
    }>) {
      conflicts.push({
        start_at: e.start_at,
        end_at: e.end_at,
        reason: `Calendar event: ${e.summary ?? "busy"}`,
      });
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      suggestions: conflicts.length
        ? [
            "Move by 30 minutes",
            "Try the next available day",
            "Shorten the meeting",
            "Reassign to another host",
          ]
        : [],
    };
  });

// ---------- 5. Travel Time Suggestions ----------

const travelInput = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  mode: z.enum(["driving", "walking", "transit", "cycling"]).default("driving"),
  arrive_by: z.string().optional(),
});

export const travelTimeSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => travelInput.parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      estimated_minutes: number;
      buffer_minutes: number;
      leave_by: string | null;
      notes: string;
    }> => {
      const workspaceId = await getWorkspaceId(context.userId);
      const system =
        "You estimate realistic travel time between two locations. Return strict JSON. Be conservative; include buffer for parking, security, or transfers.";
      const user = `Origin: ${data.origin}\nDestination: ${data.destination}\nMode: ${data.mode}\nArrive by: ${data.arrive_by ?? "any"}\n\nReturn {"estimated_minutes":n,"buffer_minutes":n,"notes":"..."}. Buffer is extra minutes on top of estimated_minutes.`;
      const parsed = await askAI<{
        estimated_minutes: number;
        buffer_minutes: number;
        notes: string;
      }>(workspaceId, context.userId, { system, user, json: true, feature: "ai_travel_time" });
      const p =
        typeof parsed === "string"
          ? { estimated_minutes: 30, buffer_minutes: 10, notes: parsed }
          : parsed;
      let leaveBy: string | null = null;
      if (data.arrive_by) {
        const t =
          new Date(data.arrive_by).getTime() - (p.estimated_minutes + p.buffer_minutes) * 60_000;
        leaveBy = new Date(t).toISOString();
      }
      return { ...p, leave_by: leaveBy };
    },
  );

// ---------- 6/7/8. Meeting Summary / Prep / Follow-up ----------

async function loadBookingContext(supabase: unknown, bookingId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data: booking } = await s
    .from("bookings")
    .select(
      "id, event_type_id, host_id, start_at, end_at, status, title, notes, customer_name, customer_email, location",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const { data: et } = await s
    .from("booking_event_types")
    .select("name, description, duration_minutes")
    .eq("id", booking.event_type_id)
    .maybeSingle();
  return { booking, event_type: et };
}

const bookingIdInput = z.object({ booking_id: z.string().uuid() });

export const meetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => bookingIdInput.parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ summary: string; key_points: string[]; action_items: string[] }> => {
      const workspaceId = await getWorkspaceId(context.userId);
      const ctx = await loadBookingContext(context.supabase, data.booking_id);
      if (!ctx) throw new Error("Booking not found");
      const system = "You summarize a completed or upcoming meeting. Return strict JSON.";
      const user = `Meeting context:\n${JSON.stringify(ctx, null, 2)}\n\nReturn {"summary":"...","key_points":["..."],"action_items":["..."]}.`;
      const parsed = await askAI<{ summary: string; key_points: string[]; action_items: string[] }>(
        workspaceId,
        context.userId,
        { system, user, json: true, feature: "ai_meeting_summary" },
      );
      return typeof parsed === "string"
        ? { summary: parsed, key_points: [], action_items: [] }
        : parsed;
    },
  );

export const meetingPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => bookingIdInput.parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      agenda: string[];
      questions: string[];
      research: string[];
      talking_points: string[];
    }> => {
      const workspaceId = await getWorkspaceId(context.userId);
      const ctx = await loadBookingContext(context.supabase, data.booking_id);
      if (!ctx) throw new Error("Booking not found");
      const system = "You prepare an agent for an upcoming meeting. Return strict JSON.";
      const user = `Meeting context:\n${JSON.stringify(ctx, null, 2)}\n\nReturn {"agenda":["..."],"questions":["..."],"research":["..."],"talking_points":["..."]}.`;
      const parsed = await askAI<{
        agenda: string[];
        questions: string[];
        research: string[];
        talking_points: string[];
      }>(workspaceId, context.userId, { system, user, json: true, feature: "ai_meeting_prep" });
      return typeof parsed === "string"
        ? { agenda: [], questions: [], research: [], talking_points: [] }
        : parsed;
    },
  );

export const followUpSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => bookingIdInput.parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      email: string;
      whatsapp: string;
      internal_note: string;
      next_steps: string[];
    }> => {
      const workspaceId = await getWorkspaceId(context.userId);
      const ctx = await loadBookingContext(context.supabase, data.booking_id);
      if (!ctx) throw new Error("Booking not found");
      const system =
        "You draft follow-up messages after a meeting. Return strict JSON with `email`, `whatsapp`, `internal_note`, `next_steps`.";
      const user = `Meeting:\n${JSON.stringify(ctx, null, 2)}`;
      const parsed = await askAI<{
        email: string;
        whatsapp: string;
        internal_note: string;
        next_steps: string[];
      }>(workspaceId, context.userId, { system, user, json: true, feature: "ai_followup" });
      return typeof parsed === "string"
        ? { email: parsed, whatsapp: "", internal_note: "", next_steps: [] }
        : parsed;
    },
  );

// ---------- 9. Smart Availability ----------

const smartAvailInput = z.object({
  event_type_id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  customer_hint: z.string().optional(),
});

export const smartAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => smartAvailInput.parse(v))
  .handler(async ({ data, context }): Promise<RankedSlot[]> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const slots = dedupeSlotsByStart(
      await computeAvailability(context.supabase as never, data.event_type_id, data.from, data.to),
    ).slice(0, 30);
    if (slots.length === 0) return [];
    const system =
      "You are a scheduling optimizer. Rank ALL provided slots by likely booking-conversion score (weekday mornings/afternoons highest, avoid fringe hours). Return strict JSON.";
    const user = `Customer hint: ${data.customer_hint ?? "none"}\nSlots:\n${slots.map((s, i) => `${i + 1}. ${s.start_at}`).join("\n")}\n\nReturn {"ranking":[{"index":n,"score":0-100,"rationale":"..."}]} for every slot.`;
    const parsed = await askAI<{ ranking: { index: number; score: number; rationale: string }[] }>(
      workspaceId,
      context.userId,
      { system, user, json: true, feature: "ai_smart_availability" },
    );
    const r = typeof parsed === "string" ? { ranking: [] } : parsed;
    return r.ranking
      .map((p) => {
        const s = slots[p.index - 1];
        return s ? { ...s, score: p.score, rationale: p.rationale } : null;
      })
      .filter(Boolean) as RankedSlot[];
  });

// ---------- 10. Natural Language Scheduling ----------

const nlInput = z.object({
  prompt: z.string().min(2),
  reference_now: z.string().optional(),
  timezone: z.string().default("UTC"),
});

export const naturalLanguageScheduling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => nlInput.parse(v))
  .handler(async ({ data, context }): Promise<NLSchedulingIntent> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const now = data.reference_now ?? new Date().toISOString();
    const system = `You parse scheduling requests into structured JSON. Reference time: ${now}. Timezone: ${data.timezone}. Interpret relative phrases ("tomorrow at 2pm", "next Tuesday morning", "in 30 min"). Return ISO-8601 UTC.`;
    const user = `Parse: """${data.prompt}"""\n\nReturn {"intent":"book|reschedule|cancel|check_availability|unknown","title":null,"duration_minutes":null,"start_at":null,"end_at":null,"participants":[],"location":null,"notes":null,"confidence":0.0-1.0}.`;
    const parsed = await askAI<NLSchedulingIntent>(workspaceId, context.userId, {
      system,
      user,
      json: true,
      feature: "ai_nl_scheduling",
    });
    if (typeof parsed === "string") {
      return {
        intent: "unknown",
        title: null,
        duration_minutes: null,
        start_at: null,
        end_at: null,
        participants: [],
        location: null,
        notes: parsed,
        confidence: 0,
      };
    }
    return parsed;
  });

// ---------- 11. Generate Calendar Event (ICS) ----------

const genEventInput = z.object({ booking_id: z.string().uuid() });

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function icsDate(iso: string) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export const generateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => genEventInput.parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ics: string; google_url: string; outlook_url: string }> => {
      const ctx = await loadBookingContext(context.supabase, data.booking_id);
      if (!ctx) throw new Error("Booking not found");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = ctx.booking as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const et = ctx.event_type as any;
      const title = b.title ?? et?.name ?? "Meeting";
      const desc = b.notes ?? et?.description ?? "";
      const loc = b.location ?? "";
      const uid = `${b.id}@wacrm`;

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//WACRM//Booking//EN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${icsDate(new Date().toISOString())}`,
        `DTSTART:${icsDate(b.start_at)}`,
        `DTEND:${icsDate(b.end_at)}`,
        `SUMMARY:${icsEscape(title)}`,
        `DESCRIPTION:${icsEscape(desc)}`,
        `LOCATION:${icsEscape(loc)}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const gcalParams = new URLSearchParams({
        action: "TEMPLATE",
        text: title,
        dates: `${icsDate(b.start_at)}/${icsDate(b.end_at)}`,
        details: desc,
        location: loc,
      });
      const outlookParams = new URLSearchParams({
        path: "/calendar/action/compose",
        rru: "addevent",
        subject: title,
        body: desc,
        location: loc,
        startdt: b.start_at,
        enddt: b.end_at,
      });

      return {
        ics,
        google_url: `https://calendar.google.com/calendar/render?${gcalParams.toString()}`,
        outlook_url: `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`,
      };
    },
  );
