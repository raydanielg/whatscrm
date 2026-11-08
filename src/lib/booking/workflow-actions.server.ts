/**
 * Database work behind the flow-builder booking nodes (action.booking.create,
 * action.booking.cancel, action.booking.send_link). Input validation lives in
 * engine.server.ts so dry runs validate the same way real runs do.
 *
 * Every query is scoped by workspace_id. Notifications reuse the same helpers
 * that the booking page server functions call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";
import { SITE_URL } from "@/lib/marketing/landing-content";

type Supa = SupabaseClient | { from: (table: string) => unknown };

export type CreateBookingInput = {
  eventTypeId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startAt: string;
};

async function loadEventType(supabase: Supa, workspaceId: string, eventTypeId: string) {
  const { data, error } = await sbAny(supabase)
    .from("booking_event_types")
    .select("id, workspace_id, name, slug, duration_minutes, is_active")
    .eq("id", eventTypeId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Meeting type not found in this workspace.");
  return data as { id: string; name: string; slug: string; duration_minutes: number; is_active: boolean };
}

/** Inserts a confirmed appointment the same way createAppointment does, then sends the confirmation. */
export async function createWorkflowAppointment(
  supabase: Supa,
  workspaceId: string,
  input: CreateBookingInput,
): Promise<Record<string, unknown>> {
  const et = await loadEventType(supabase, workspaceId, input.eventTypeId);
  if (!et.is_active) throw new Error("This meeting type is not active, so it cannot be booked.");

  const { data: hosts } = await sbAny(supabase)
    .from("booking_event_type_hosts")
    .select("host_id")
    .eq("event_type_id", input.eventTypeId)
    .limit(1);
  const hostId = (hosts as Array<{ host_id: string }> | null)?.[0]?.host_id;
  if (!hostId) throw new Error("No host available for this meeting type.");

  const start = new Date(input.startAt);
  const end = new Date(start.getTime() + Number(et.duration_minutes ?? 30) * 60_000);

  const { data: row, error } = await sbAny(supabase)
    .from("booking_appointments")
    .insert({
      workspace_id: workspaceId,
      event_type_id: input.eventTypeId,
      host_id: hostId,
      customer_name: input.customerName,
      customer_email: input.customerEmail || null,
      customer_phone: input.customerPhone || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      source_channel: "workflow",
      answers: {},
      status: "confirmed",
    })
    .select("id, manage_token, start_at, end_at, status")
    .single();
  if (error) {
    if (String(error.message).includes("booking_no_double_book")) {
      throw new Error("That slot is no longer available");
    }
    throw new Error(error.message);
  }
  const created = row as { id: string; manage_token: string; start_at: string; end_at: string; status: string };

  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { sendAppointmentNotification, scheduleAppointmentReminders } = await import(
      "@/lib/booking/notifications-engine.server"
    );
    await sendAppointmentNotification(supabaseAdmin, created.id, "confirmation");
    await scheduleAppointmentReminders(supabaseAdmin, created.id);
  } catch (e) {
    console.error("[booking] workflow notify(confirmation) failed", e);
  }

  return { id: created.id, status: created.status, start_at: created.start_at, end_at: created.end_at, manage_token: created.manage_token };
}

/** Cancels an appointment in this workspace, then notifies and clears queued reminders (as cancelAppointment does). */
export async function cancelWorkflowAppointment(
  supabase: Supa,
  workspaceId: string,
  appointmentId: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  const { data, error } = await sbAny(supabase)
    .from("booking_appointments")
    .update({ status: "cancelled", cancellation_reason: reason || null })
    .eq("id", appointmentId)
    .eq("workspace_id", workspaceId)
    .select("id, status")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Appointment not found in this workspace.");

  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { sendAppointmentNotification } = await import("@/lib/booking/notifications-engine.server");
    await sendAppointmentNotification(supabaseAdmin, appointmentId, "cancellation");
    await sbAny(supabaseAdmin)
      .from("booking_reminders")
      .update({ status: "cancelled" })
      .eq("appointment_id", appointmentId)
      .eq("workspace_id", workspaceId)
      .in("status", ["queued", "pending"]);
  } catch (e) {
    console.error("[booking] workflow notify(cancel) failed", e);
  }

  return { id: appointmentId, status: "cancelled" };
}

/**
 * Queues a self-booking link for the customer on the chosen channel. Uses the
 * message_outbox queue that booking notifications already write to, so delivery
 * goes through the same sender.
 */
export async function queueWorkflowBookingLink(
  supabase: Supa,
  workspaceId: string,
  input: { eventTypeId: string; channel: "whatsapp" | "email" | "sms"; to: string },
): Promise<{ url: string; queued: true }> {
  const et = await loadEventType(supabase, workspaceId, input.eventTypeId);
  if (!et.is_active) throw new Error("This meeting type is not active, so its booking link cannot be sent.");

  const url = `${SITE_URL}/book/${et.slug}`;
  const body = `Book a ${et.name} with us here: ${url}`;

  const { error } = await sbAny(supabase)
    .from("message_outbox")
    .insert({
      workspace_id: workspaceId,
      channel: input.channel,
      to_address: input.to,
      body,
      status: "queued",
      metadata: {
        kind: "booking.send_link",
        event_type_id: input.eventTypeId,
        channel: input.channel,
        subject: `Book a ${et.name}`,
      },
    });
  if (error) throw new Error(error.message);

  return { url, queued: true };
}
