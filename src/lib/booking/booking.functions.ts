/**
 * Booking server functions — event types, schedules, appointments.
 * All privileged reads scope through the caller's workspace membership.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeAvailability, dedupeSlotsByStart, type AvailabilitySlot } from "./availability-engine";
import { sbAny } from "@/lib/supabase/untyped";

async function getWorkspaceId(userId: string): Promise<string> {
  const { resolveBookingWorkspaceId } = await import("./workspace.server");
  return resolveBookingWorkspaceId(userId);
}


/* ---------------- Event Types ---------------- */

export const listEventTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data, error } = await context.supabase
      .from("booking_event_types")
      .select("*, booking_event_type_hosts(host_id, strategy)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const questionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "long_text", "email", "phone", "number", "select", "checkbox"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  placeholder: z.string().max(200).optional().nullable(),
});

const availabilityRulesSchema = z.object({
  use_default_schedule: z.boolean().default(true),
  weekly_hours: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  })).default([]),
  date_range_start: z.string().optional().nullable(),
  date_range_end: z.string().optional().nullable(),
}).default({ use_default_schedule: true, weekly_hours: [] });

const eventTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum([
    "consultation", "demo", "support", "sales_meeting", "training",
    "interview", "discovery_call", "custom",
  ]).default("custom"),
  duration_minutes: z.number().int().min(5).max(1440),
  buffer_before_minutes: z.number().int().min(0).max(240).default(0),
  buffer_after_minutes: z.number().int().min(0).max(240).default(0),
  preparation_minutes: z.number().int().min(0).max(240).default(0),
  min_notice_minutes: z.number().int().min(0).max(43200).default(60),
  max_advance_days: z.number().int().min(1).max(365).default(60),
  location_kind: z.enum([
    "online", "offline", "in_person", "zoom", "google_meet",
    "phone", "whatsapp", "video", "custom",
  ]).default("custom"),
  location_details: z.record(z.any()).default({}),
  is_group: z.boolean().default(false),
  max_participants: z.number().int().min(1).max(1000).default(1),
  price: z.number().nullable().optional(),
  currency: z.string().max(8).optional().nullable(),
  color: z.string().max(16).optional().nullable(),
  questions: z.array(questionSchema).default([]),
  availability_rules: availabilityRulesSchema.optional(),
  confirmation_message: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const saveEventType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => eventTypeSchema.parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = { ...data, workspace_id: workspaceId, owner_id: context.userId };
    if (data.id) {
      const { error } = await sbAny(context.supabase).from("booking_event_types")
        .update(payload).eq("id", data.id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sbAny(context.supabase).from("booking_event_types")
      .insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    // Auto-attach owner as sole host + default schedule if none exists.
    await sbAny(context.supabase).from("booking_event_type_hosts").insert({
      event_type_id: row.id, host_id: context.userId, strategy: "first_available",
    });
    return { id: row.id };
  });

export const deleteEventType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("booking_event_types")
      .delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Availability Schedules ---------------- */

export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data } = await context.supabase
      .from("booking_availability_schedules")
      .select("*, booking_availability_slots(*)")
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false });
    return data ?? [];
  });

const scheduleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  timezone: z.string().min(1).max(60),
  is_default: z.boolean().default(false),
  slots: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  })).default([]),
});

export const saveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => scheduleSchema.parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let scheduleId = data.id;
    if (scheduleId) {
      await sbAny(context.supabase).from("booking_availability_schedules").update({
        name: data.name, timezone: data.timezone, is_default: data.is_default,
      }).eq("id", scheduleId).eq("workspace_id", workspaceId);
      await sbAny(context.supabase).from("booking_availability_slots").delete().eq("schedule_id", scheduleId);
    } else {
      const { data: row, error } = await sbAny(context.supabase).from("booking_availability_schedules").insert({
        workspace_id: workspaceId, owner_id: context.userId,
        name: data.name, timezone: data.timezone, is_default: data.is_default,
      }).select("id").single();
      if (error) throw new Error(error.message);
      scheduleId = row.id;
    }
    if (data.slots.length > 0) {
      await sbAny(context.supabase).from("booking_availability_slots").insert(
        data.slots.map((s) => ({ ...s, schedule_id: scheduleId })),
      );
    }
    return { id: scheduleId };
  });

/* ---------------- Availability lookup ---------------- */

export const getAvailableSlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    event_type_id: z.string().uuid(),
    from: z.string().datetime(),
    to: z.string().datetime(),
  }).parse(v))
  .handler(async ({ data, context }): Promise<AvailabilitySlot[]> => {
    const slots = await computeAvailability(context.supabase as never, data.event_type_id, data.from, data.to);
    return dedupeSlotsByStart(slots);
  });

/* ---------------- Appointments ---------------- */

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    status: z.string().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let q = sbAny(context.supabase).from("booking_appointments")
      .select("*, booking_event_types(name, color, duration_minutes)")
      .eq("workspace_id", workspaceId)
      .order("start_at", { ascending: true });
    if (data.from) q = q.gte("start_at", data.from);
    if (data.to) q = q.lte("start_at", data.to);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const appointmentInputSchema = z.object({
  event_type_id: z.string().uuid(),
  host_id: z.string().uuid().optional(),
  customer_name: z.string().min(1).max(120),
  customer_email: z.string().email().optional().nullable(),
  customer_phone: z.string().max(40).optional().nullable(),
  customer_timezone: z.string().max(60).default("UTC"),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  source_channel: z.enum(["booking_page", "whatsapp", "instagram", "telegram", "email", "livechat", "api", "internal"]).default("internal"),
  source_conversation_id: z.string().uuid().optional().nullable(),
  answers: z.record(z.any()).default({}),
});

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => appointmentInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: et } = await sbAny(context.supabase).from("booking_event_types")
      .select("id, workspace_id").eq("id", data.event_type_id).maybeSingle();
    if (!et || et.workspace_id !== workspaceId) throw new Error("Event type not found");
    let hostId = data.host_id;
    if (!hostId) {
      const { data: hosts } = await context.supabase
        .from("booking_event_type_hosts").select("host_id")
        .eq("event_type_id", data.event_type_id).limit(1);
      hostId = hosts?.[0]?.host_id;
    }
    if (!hostId) throw new Error("No host available for this event type");
    const { data: row, error } = await sbAny(context.supabase).from("booking_appointments").insert({
      workspace_id: workspaceId,
      event_type_id: data.event_type_id,
      host_id: hostId,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      customer_phone: data.customer_phone,
      customer_timezone: data.customer_timezone,
      start_at: data.start_at,
      end_at: data.end_at,
      source_channel: data.source_channel,
      source_conversation_id: data.source_conversation_id,
      answers: data.answers,
      status: "confirmed",
    }).select("id, manage_token").single();
    if (error) {
      if (String(error.message).includes("booking_no_double_book")) {
        throw new Error("That slot is no longer available");
      }
      throw new Error(error.message);
    }
    // Fire lifecycle notifications (confirmation + schedule reminders).
    try {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { sendAppointmentNotification, scheduleAppointmentReminders } = await import(
        "@/lib/booking/notifications-engine.server"
      );
      await sendAppointmentNotification(supabaseAdmin, row.id, "confirmation");
      await scheduleAppointmentReminders(supabaseAdmin, row.id);
    } catch (e) {
      console.error("[booking] notify(confirmation) failed", e);
    }
    return row;
  });


export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(), reason: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("booking_appointments")
      .update({ status: "cancelled", cancellation_reason: data.reason ?? null })
      .eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    try {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { sendAppointmentNotification } = await import(
        "@/lib/booking/notifications-engine.server"
      );
      await sendAppointmentNotification(supabaseAdmin, data.id, "cancellation");
      // Cancel any queued reminders.
      await supabaseAdmin
        .from("booking_reminders")
        .update({ status: "cancelled" })
        .eq("appointment_id", data.id)
        .in("status", ["queued", "pending"]);
    } catch (e) {
      console.error("[booking] notify(cancel) failed", e);
    }
    return { ok: true };
  });

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(), start_at: z.string().datetime(), end_at: z.string().datetime(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("booking_appointments")
      .update({ start_at: data.start_at, end_at: data.end_at, status: "confirmed" })
      .eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) {
      if (String(error.message).includes("booking_no_double_book")) throw new Error("That slot is no longer available");
      throw new Error(error.message);
    }
    try {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { sendAppointmentNotification, scheduleAppointmentReminders } = await import(
        "@/lib/booking/notifications-engine.server"
      );
      await sendAppointmentNotification(supabaseAdmin, data.id, "reschedule");
      await scheduleAppointmentReminders(supabaseAdmin, data.id);
    } catch (e) {
      console.error("[booking] notify(reschedule) failed", e);
    }
    return { ok: true };
  });


export const markNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("booking_appointments")
      .update({ status: "no_show" })
      .eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bookingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const now = new Date();
    const weekStart = new Date(now); weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
    const { count: upcoming } = await sbAny(context.supabase).from("booking_appointments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("start_at", now.toISOString())
      .in("status", ["pending", "confirmed"]);
    const { count: weekTotal } = await sbAny(context.supabase).from("booking_appointments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("start_at", weekStart.toISOString());
    const { count: noShows } = await sbAny(context.supabase).from("booking_appointments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "no_show")
      .gte("start_at", new Date(now.getTime() - 30 * 86400 * 1000).toISOString());
    const { count: total30 } = await sbAny(context.supabase).from("booking_appointments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("start_at", new Date(now.getTime() - 30 * 86400 * 1000).toISOString());
    return {
      upcoming: upcoming ?? 0,
      thisWeek: weekTotal ?? 0,
      noShowRatePct: total30 && total30 > 0 ? Math.round(((noShows ?? 0) / total30) * 1000) / 10 : 0,
      total30d: total30 ?? 0,
    };
  });
