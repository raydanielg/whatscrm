/**
 * Booking notifications engine.
 *
 * Renders + schedules + dispatches notifications for the appointment
 * lifecycle across channels (WhatsApp, Email, SMS, Push, In-App).
 *
 * Called from booking lifecycle server functions and the cron reminders tick.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";

type Kind =
  | "confirmation"
  | "reschedule"
  | "cancellation"
  | "reminder"
  | "follow_up"
  | "review_request";

type Channel = "whatsapp" | "email" | "sms" | "push" | "in_app";
type Recipient = "customer" | "host" | "both";

interface Appointment {
  id: string;
  workspace_id: string;
  event_type_id: string;
  host_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  start_at: string;
  end_at: string;
  join_url: string | null;
  status: string;
  manage_token: string;
  meeting_notes?: string | null;
}

interface Rule {
  id: string;
  workspace_id: string;
  event_type_id: string | null;
  kind: Kind;
  channels: Channel[];
  offset_minutes: number;
  send_to: Recipient;
  is_active: boolean;
  template_ids: Record<string, string | null>;
}

interface Template {
  id: string;
  channel: Channel;
  subject: string | null;
  body: string;
}

/** Resolve simple {{token}} placeholders. */
export function renderTemplate(source: string, vars: Record<string, string | null | undefined>): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

function buildVars(appt: Appointment, extras: Record<string, string> = {}): Record<string, string> {
  const start = new Date(appt.start_at);
  return {
    customer_name: appt.customer_name,
    customer_email: appt.customer_email ?? "",
    customer_phone: appt.customer_phone ?? "",
    start_at: start.toUTCString(),
    start_date: start.toISOString().slice(0, 10),
    start_time: start.toISOString().slice(11, 16),
    join_url: appt.join_url ?? "",
    manage_url: `/book/manage/${appt.manage_token}`,
    ...extras,
  };
}

/** Default templates baked in when the workspace hasn't customized. */
const DEFAULT_BODIES: Record<Kind, string> = {
  confirmation: "Hi {{customer_name}}, your appointment is confirmed for {{start_at}}. {{join_url}}",
  reschedule: "Hi {{customer_name}}, your appointment has been rescheduled to {{start_at}}. {{join_url}}",
  cancellation: "Hi {{customer_name}}, your appointment on {{start_at}} has been cancelled.",
  reminder: "Reminder: {{customer_name}}, your appointment is at {{start_at}}. {{join_url}}",
  follow_up: "Hi {{customer_name}}, thanks for meeting with us on {{start_date}}. Let us know how it went.",
  review_request: "Hi {{customer_name}}, could you take a moment to share feedback about your session on {{start_date}}?",
};

const DEFAULT_SUBJECTS: Record<Kind, string> = {
  confirmation: "Appointment confirmed",
  reschedule: "Appointment rescheduled",
  cancellation: "Appointment cancelled",
  reminder: "Reminder: your appointment",
  follow_up: "Following up on our meeting",
  review_request: "How was your session?",
};

async function loadTemplate(
  admin: SupabaseClient,
  workspaceId: string,
  eventTypeId: string | null,
  kind: Kind,
  channel: Channel,
  overrideId: string | null | undefined,
): Promise<Template> {
  if (overrideId) {
    const { data } = await admin
      .from("booking_notification_templates")
      .select("id, channel, subject, body")
      .eq("id", overrideId)
      .maybeSingle();
    if (data) return data as Template;
  }
  // Prefer event-type specific, fall back to workspace default.
  const { data: rows } = await admin
    .from("booking_notification_templates")
    .select("id, channel, subject, body, event_type_id, is_default")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .eq("channel", channel)
    .eq("is_active", true);
  const scoped = (rows ?? []).find((r) => (r as { event_type_id: string | null }).event_type_id === eventTypeId);
  const fallback = (rows ?? []).find((r) => !(r as { event_type_id: string | null }).event_type_id) ??
    (rows ?? [])[0];
  const picked = (scoped ?? fallback) as Template | undefined;
  if (picked) return picked;
  return { id: "default", channel, subject: DEFAULT_SUBJECTS[kind], body: DEFAULT_BODIES[kind] };
}

async function loadRules(
  admin: SupabaseClient,
  workspaceId: string,
  eventTypeId: string,
  kind: Kind,
): Promise<Rule[]> {
  const { data } = await admin
    .from("booking_notification_rules")
    .select("id, workspace_id, event_type_id, kind, channels, offset_minutes, send_to, is_active, template_ids")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .eq("is_active", true);
  return ((data ?? []) as Rule[]).filter(
    (r) => r.event_type_id == null || r.event_type_id === eventTypeId,
  );
}

/** Queue reminders (offset_minutes < 0 => before start; > 0 => after). */
export async function scheduleAppointmentReminders(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ scheduled: number }> {
  const { data: appt } = await admin
    .from("booking_appointments")
    .select("id, workspace_id, event_type_id, host_id, start_at, end_at, customer_email, customer_phone, status")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { scheduled: 0 };
  const a = appt as Appointment;
  if (a.status !== "confirmed") return { scheduled: 0 };

  // Wipe old pending reminders for this appointment (idempotent).
  await admin
    .from("booking_reminders")
    .delete()
    .eq("appointment_id", a.id)
    .in("status", ["pending", "queued"]);

  const kinds: Kind[] = ["reminder", "follow_up", "review_request"];
  const startMs = new Date(a.start_at).getTime();
  let scheduled = 0;
  for (const kind of kinds) {
    const rules = await loadRules(admin, a.workspace_id, a.event_type_id, kind);
    for (const rule of rules) {
      const sendAt = new Date(startMs + rule.offset_minutes * 60_000);
      if (sendAt.getTime() <= Date.now() - 60_000) continue; // don't schedule in the past
      for (const channel of rule.channels) {
        const recipients: Recipient[] =
          rule.send_to === "both" ? ["customer", "host"] : [rule.send_to];
        for (const recipient of recipients) {
          await sbAny(admin).from("booking_reminders").insert({
            appointment_id: a.id,
            workspace_id: a.workspace_id,
            rule_id: rule.id,
            kind,
            channel,
            recipient,
            send_at: sendAt.toISOString(),
            status: "queued",
            template_id: rule.template_ids?.[channel] ?? null,
          } as never);
          scheduled += 1;
        }
      }
    }
  }
  return { scheduled };
}

/** Send an immediate notification (confirmation, reschedule, cancellation). */
export async function sendAppointmentNotification(
  admin: SupabaseClient,
  appointmentId: string,
  kind: Kind,
): Promise<{ sent: number }> {
  const { data: appt } = await admin
    .from("booking_appointments")
    .select(
      "id, workspace_id, event_type_id, host_id, customer_name, customer_email, customer_phone, start_at, end_at, join_url, status, manage_token",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { sent: 0 };
  const a = appt as Appointment;

  const rules = await loadRules(admin, a.workspace_id, a.event_type_id, kind);
  // If no rules configured, dispatch a sensible default (email + whatsapp).
  const fallbackChannels: Channel[] = [];
  if (a.customer_email) fallbackChannels.push("email");
  if (a.customer_phone) fallbackChannels.push("whatsapp");
  fallbackChannels.push("in_app");

  const jobs: Array<{ channel: Channel; recipient: Recipient; templateId: string | null }> = [];
  if (rules.length) {
    for (const rule of rules) {
      for (const channel of rule.channels) {
        const recipients: Recipient[] =
          rule.send_to === "both" ? ["customer", "host"] : [rule.send_to];
        for (const recipient of recipients) {
          jobs.push({ channel, recipient, templateId: rule.template_ids?.[channel] ?? null });
        }
      }
    }
  } else {
    for (const channel of fallbackChannels) {
      jobs.push({ channel, recipient: "customer", templateId: null });
    }
  }

  let sent = 0;
  for (const job of jobs) {
    try {
      await dispatchOne(admin, a, kind, job.channel, job.recipient, job.templateId);
      sent += 1;
    } catch (e) {
      console.error("[booking-notifications] dispatch failed", { kind, channel: job.channel, err: (e as Error).message });
    }
  }
  return { sent };
}

/** Called by the cron tick: renders + dispatches a single queued reminder. */
export async function dispatchQueuedReminder(
  admin: SupabaseClient,
  reminderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: r } = await admin
    .from("booking_reminders")
    .select("id, appointment_id, workspace_id, channel, kind, recipient, template_id, status")
    .eq("id", reminderId)
    .maybeSingle();
  if (!r) return { ok: false, error: "reminder_not_found" };
  const rem = r as {
    id: string;
    appointment_id: string;
    workspace_id: string;
    channel: Channel;
    kind: Kind;
    recipient: Recipient;
    template_id: string | null;
    status: string;
  };
  const { data: appt } = await admin
    .from("booking_appointments")
    .select(
      "id, workspace_id, event_type_id, host_id, customer_name, customer_email, customer_phone, start_at, end_at, join_url, status, manage_token",
    )
    .eq("id", rem.appointment_id)
    .maybeSingle();
  if (!appt) return { ok: false, error: "appointment_not_found" };
  const a = appt as Appointment;
  if (a.status !== "confirmed") return { ok: false, error: "appointment_not_confirmed" };
  try {
    const { subject, body } = await dispatchOne(admin, a, rem.kind, rem.channel, rem.recipient, rem.template_id);
    await admin
      .from("booking_reminders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        rendered_subject: subject,
        rendered_body: body,
      })
      .eq("id", rem.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("booking_reminders")
      .update({
        status: "failed",
        last_error: msg,
        attempts: undefined, // handled by trigger not required; keep column monotonic
      })
      .eq("id", rem.id);
    return { ok: false, error: msg };
  }
}

async function dispatchOne(
  admin: SupabaseClient,
  a: Appointment,
  kind: Kind,
  channel: Channel,
  recipient: Recipient,
  overrideTemplateId: string | null,
): Promise<{ subject: string; body: string }> {
  const tpl = await loadTemplate(admin, a.workspace_id, a.event_type_id, kind, channel, overrideTemplateId);
  const vars = buildVars(a);
  const body = renderTemplate(tpl.body, vars);
  const subject = renderTemplate(tpl.subject ?? DEFAULT_SUBJECTS[kind], vars);

  // Resolve destination based on recipient.
  const toEmail = recipient === "customer" ? a.customer_email : null;
  const toPhone = recipient === "customer" ? a.customer_phone : null;
  const hostUserId = recipient === "host" ? a.host_id : null;

  const metadata = {
    kind: `booking.${kind}`,
    appointment_id: a.id,
    channel,
    recipient,
  };

  if (channel === "email") {
    if (!toEmail && recipient === "customer") throw new Error("no_customer_email");
    // If recipient is host, look up user email.
    let target = toEmail;
    if (!target && hostUserId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("email")
        .eq("id", hostUserId)
        .maybeSingle();
      target = (prof as { email: string | null } | null)?.email ?? null;
    }
    if (!target) throw new Error("no_email_address");
    await sbAny(admin).from("message_outbox").insert({
      workspace_id: a.workspace_id,
      channel: "email",
      to_address: target,
      body,
      status: "queued",
      metadata: { ...metadata, subject },
    } as never);
  } else if (channel === "whatsapp" || channel === "sms") {
    if (!toPhone && recipient === "customer") throw new Error("no_customer_phone");
    let target = toPhone;
    if (!target && hostUserId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("phone")
        .eq("id", hostUserId)
        .maybeSingle();
      target = (prof as { phone: string | null } | null)?.phone ?? null;
    }
    if (!target) throw new Error("no_phone_number");
    await sbAny(admin).from("message_outbox").insert({
      workspace_id: a.workspace_id,
      channel,
      to_address: target,
      body,
      status: "queued",
      metadata,
    } as never);
  } else if (channel === "in_app") {
    // The header feed is user-scoped and uses organization_id, category and data.
    const targetUserId = recipient === "host" || recipient === "both" ? a.host_id : null;
    if (!targetUserId) return { subject, body };
    const { data: workspace, error: workspaceError } = await admin.from("workspaces")
      .select("organization_id").eq("id", a.workspace_id).single();
    if (workspaceError || !workspace?.organization_id) throw workspaceError ?? new Error("Workspace organization not found");
    const { data: member, error: memberError } = await admin.from("workspace_members")
      .select("user_id").eq("workspace_id", a.workspace_id).eq("user_id", targetUserId)
      .eq("status", "active").maybeSingle();
    if (memberError) throw memberError;
    if (!member) return { subject, body };
    const { error: notificationError } = await sbAny(admin).from("notifications").insert({
      user_id: targetUserId,
      organization_id: workspace.organization_id,
      channel: "in_app",
      status: "unread",
      category: "communication",
      title: subject,
      body,
      action_url: "/booking",
      data: { ...metadata, workspace_id: a.workspace_id },
    });
    if (notificationError) throw notificationError;
  } else if (channel === "push") {
    // Web Push: dispatch to any subscription owned by the target user/contact.
    let ownerFilter = "";
    let ownerId: string | null = null;
    if (recipient === "host" && a.host_id) {
      ownerFilter = "user_id";
      ownerId = a.host_id;
    }
    if (!ownerId) return { subject, body };
    const { data: subs } = await admin
      .from("booking_push_subscriptions")
      .select("endpoint, keys")
      .eq("workspace_id", a.workspace_id)
      .eq(ownerFilter, ownerId);
    for (const s of subs ?? []) {
      await sbAny(admin).from("message_outbox").insert({
        workspace_id: a.workspace_id,
        channel: "push",
        to_address: (s as { endpoint: string }).endpoint,
        body,
        status: "queued",
        metadata: { ...metadata, subject, keys: (s as { keys: unknown }).keys },
      } as never);
    }
  }

  return { subject, body };
}
