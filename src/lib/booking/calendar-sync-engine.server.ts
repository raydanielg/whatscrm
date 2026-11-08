/**
 * Calendar sync engine — bi-directional sync between booking_appointments
 * and connected external calendars (Google, Microsoft, Apple/ICS).
 *
 * All calls go through the provider abstraction; the engine never touches
 * provider-specific APIs directly.
 */
import { BRAND_NAME } from "@/lib/branding/brand";
import type { CalendarProvider, BusyBlock, ExternalEvent } from "./providers/types";
import { providerForKind, contextFor, type CalendarAccountRow } from "./providers/index.server";
import { sbAny } from "@/lib/supabase/untyped";

export type BookingAppointment = {
  id: string;
  workspace_id: string;
  host_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  start_at: string;
  end_at: string;
  location_kind: string | null;
  location_details: Record<string, unknown> | null;
  join_url?: string | null;
  external_calendar_events?: Record<string, string> | null;
  event_type_title?: string | null;
};

function appointmentToEvent(a: BookingAppointment): ExternalEvent {
  return {
    title: a.event_type_title ?? `Meeting with ${a.customer_name ?? "Guest"}`,
    description: `Booked via ${BRAND_NAME}.\n\nGuest: ${a.customer_name ?? ""}\nEmail: ${a.customer_email ?? ""}`,
    location: (a.location_details?.address as string | undefined) ?? null,
    start_at: a.start_at,
    end_at: a.end_at,
    attendees: a.customer_email ? [a.customer_email] : [],
    join_url: a.join_url ?? null,
  };
}

/** Fetch busy blocks from every enabled calendar account for a host. */
export async function fetchHostBusyBlocks(
  hostId: string,
  fromISO: string,
  toISO: string,
): Promise<BusyBlock[]> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: accounts } = await supabaseAdmin
    .from("calendar_accounts")
    .select("id,workspace_id,user_id,provider,calendar_id,connection_key_ciphertext,ics_url,enabled,status,sync_direction")
    .eq("user_id", hostId)
    .eq("enabled", true);

  const all: BusyBlock[] = [];
  for (const acc of (accounts ?? []) as Array<CalendarAccountRow & { sync_direction: string }>) {
    if (acc.sync_direction === "outbound") continue;
    const provider = providerForKind(acc.provider);
    if (provider.kind === "none") continue;
    try {
      const blocks = await provider.listBusy(contextFor(acc, hostId), fromISO, toISO);
      all.push(...blocks);
      // Best-effort cache; ignore failure
      await sbAny(supabaseAdmin).from("calendar_busy_cache").delete().eq("account_id", acc.id);
      if (blocks.length) {
        await sbAny(supabaseAdmin).from("calendar_busy_cache").insert(
          blocks.map((b) => ({
            workspace_id: acc.workspace_id,
            account_id: acc.id,
            host_id: hostId,
            external_id: b.external_id ?? null,
            start_at: b.start_at,
            end_at: b.end_at,
            title: b.title ?? null,
          })),
        );
      }
      await supabaseAdmin
        .from("calendar_accounts")
        .update({ last_synced_at: new Date().toISOString(), status: "connected", last_sync_error: null })
        .eq("id", acc.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("calendar_accounts")
        .update({ status: "error", last_sync_error: msg })
        .eq("id", acc.id);
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id,
        account_id: acc.id,
        direction: "inbound",
        operation: "list_busy",
        status: "error",
        message: msg,
      });
    }
  }
  return all;
}

/** Push a new appointment to every writable calendar for the host. */
export async function pushAppointmentToCalendars(a: BookingAppointment): Promise<Record<string, string>> {
  if (!a.host_id) return {};
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: accounts } = await supabaseAdmin
    .from("calendar_accounts")
    .select("id,workspace_id,user_id,provider,calendar_id,connection_key_ciphertext,ics_url,enabled,status,sync_direction")
    .eq("user_id", a.host_id)
    .eq("enabled", true);

  const results: Record<string, string> = { ...(a.external_calendar_events ?? {}) };
  const event = appointmentToEvent(a);
  for (const acc of (accounts ?? []) as Array<CalendarAccountRow & { sync_direction: string }>) {
    if (acc.sync_direction === "inbound") continue;
    const provider: CalendarProvider = providerForKind(acc.provider);
    if (provider.kind === "none" || provider.kind === "apple") continue;
    try {
      const { external_id } = await provider.createEvent(contextFor(acc, a.host_id), event);
      results[acc.id] = external_id;
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id,
        account_id: acc.id,
        direction: "outbound",
        operation: "create_event",
        status: "success",
        payload: { appointment_id: a.id, external_id },
      });
    } catch (err) {
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id,
        account_id: acc.id,
        direction: "outbound",
        operation: "create_event",
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        payload: { appointment_id: a.id },
      });
    }
  }
  await supabaseAdmin
    .from("booking_appointments")
    .update({ external_calendar_events: results })
    .eq("id", a.id);
  return results;
}

/** Reschedule sync — patch the event on every calendar it was pushed to. */
export async function updateAppointmentInCalendars(a: BookingAppointment): Promise<void> {
  const map = a.external_calendar_events ?? {};
  if (!Object.keys(map).length) return;
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: accounts } = await supabaseAdmin
    .from("calendar_accounts")
    .select("id,workspace_id,user_id,provider,calendar_id,connection_key_ciphertext,ics_url,enabled,status")
    .in("id", Object.keys(map));
  const event = appointmentToEvent(a);
  for (const acc of (accounts ?? []) as Array<CalendarAccountRow>) {
    const externalId = map[acc.id];
    if (!externalId) continue;
    const provider = providerForKind(acc.provider);
    try {
      await provider.updateEvent(contextFor(acc, a.host_id ?? undefined), externalId, event);
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id, account_id: acc.id,
        direction: "outbound", operation: "update_event", status: "success",
        payload: { appointment_id: a.id, external_id: externalId },
      });
    } catch (err) {
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id, account_id: acc.id,
        direction: "outbound", operation: "update_event", status: "error",
        message: err instanceof Error ? err.message : String(err),
        payload: { appointment_id: a.id },
      });
    }
  }
}

/** Cancellation sync — delete the event everywhere it was pushed. */
export async function cancelAppointmentInCalendars(a: BookingAppointment): Promise<void> {
  const map = a.external_calendar_events ?? {};
  if (!Object.keys(map).length) return;
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: accounts } = await supabaseAdmin
    .from("calendar_accounts")
    .select("id,workspace_id,user_id,provider,calendar_id,connection_key_ciphertext,ics_url,enabled,status")
    .in("id", Object.keys(map));
  for (const acc of (accounts ?? []) as Array<CalendarAccountRow>) {
    const externalId = map[acc.id];
    if (!externalId) continue;
    const provider = providerForKind(acc.provider);
    try {
      await provider.deleteEvent(contextFor(acc, a.host_id ?? undefined), externalId);
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id, account_id: acc.id,
        direction: "outbound", operation: "delete_event", status: "success",
        payload: { appointment_id: a.id, external_id: externalId },
      });
    } catch (err) {
      await sbAny(supabaseAdmin).from("calendar_sync_log").insert({
        workspace_id: acc.workspace_id, account_id: acc.id,
        direction: "outbound", operation: "delete_event", status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  await supabaseAdmin
    .from("booking_appointments")
    .update({ external_calendar_events: {} })
    .eq("id", a.id);
}
