import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const wid = (data as { workspace_id: string } | null)?.workspace_id;
  if (!wid) throw new Error("No workspace");
  return wid;
}

const kindEnum = z.enum([
  "confirmation",
  "reschedule",
  "cancellation",
  "reminder",
  "follow_up",
  "review_request",
]);
const channelEnum = z.enum(["whatsapp", "email", "sms", "push", "in_app"]);
const recipientEnum = z.enum(["customer", "host", "both"]);

// ---------- Templates ---------------------------------------------------------

export const listNotificationTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ event_type_id: z.string().uuid().optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let q = sbAny(context.supabase)
      .from("booking_notification_templates")
      .select("id, event_type_id, kind, channel, subject, body, is_active, is_default, updated_at")
      .eq("workspace_id", workspaceId)
      .order("kind", { ascending: true });
    if (data.event_type_id) q = q.eq("event_type_id", data.event_type_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      event_type_id: z.string().uuid().nullable().optional(),
      kind: kindEnum,
      channel: channelEnum,
      subject: z.string().max(200).optional(),
      body: z.string().min(1).max(5000),
      is_active: z.boolean().optional(),
      is_default: z.boolean().optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = {
      workspace_id: workspaceId,
      event_type_id: data.event_type_id ?? null,
      kind: data.kind,
      channel: data.channel,
      subject: data.subject ?? null,
      body: data.body,
      is_active: data.is_active ?? true,
      is_default: data.is_default ?? false,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await sbAny(context.supabase)
        .from("booking_notification_templates")
        .update(payload)
        .eq("id", data.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sbAny(context.supabase)
      .from("booking_notification_templates")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const deleteNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase)
      .from("booking_notification_templates")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Rules -------------------------------------------------------------

export const listNotificationRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ event_type_id: z.string().uuid().optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let q = sbAny(context.supabase)
      .from("booking_notification_rules")
      .select("id, event_type_id, name, kind, channels, offset_minutes, send_to, is_active, template_ids, updated_at")
      .eq("workspace_id", workspaceId)
      .order("kind", { ascending: true });
    if (data.event_type_id) q = q.eq("event_type_id", data.event_type_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertNotificationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      event_type_id: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(100),
      kind: kindEnum,
      channels: z.array(channelEnum).min(1),
      offset_minutes: z.number().int().min(-10080).max(43200),
      send_to: recipientEnum,
      is_active: z.boolean().optional(),
      template_ids: z.record(z.string(), z.string().nullable()).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = {
      workspace_id: workspaceId,
      event_type_id: data.event_type_id ?? null,
      name: data.name,
      kind: data.kind,
      channels: data.channels,
      offset_minutes: data.offset_minutes,
      send_to: data.send_to,
      is_active: data.is_active ?? true,
      template_ids: data.template_ids ?? {},
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await sbAny(context.supabase)
        .from("booking_notification_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await sbAny(context.supabase)
      .from("booking_notification_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const deleteNotificationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase)
      .from("booking_notification_rules")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Push subscriptions -----------------------------------------------

export const registerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
      user_agent: z.string().max(500).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase)
      .from("booking_push_subscriptions")
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: context.userId,
          endpoint: data.endpoint,
          keys: data.keys,
          user_agent: data.user_agent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Test send (used by settings UI) ----------------------------------

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ appointment_id: z.string().uuid(), kind: kindEnum }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: appt } = await sbAny(context.supabase)
      .from("booking_appointments")
      .select("id, workspace_id")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (!appt || (appt as { workspace_id: string }).workspace_id !== workspaceId) {
      throw new Error("Appointment not found");
    }
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { sendAppointmentNotification } = await import(
      "@/lib/booking/notifications-engine.server"
    );
    return sendAppointmentNotification(supabaseAdmin, data.appointment_id, data.kind);
  });
