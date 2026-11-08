/**
 * Meeting integrations — server functions.
 *
 * Auth-scoped CRUD for `meeting_provider_accounts`, plus history +
 * attendance retrieval and post-meeting actions (save notes, sync
 * attendance, fetch recording URL).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

const providerKind = z.enum(["zoom", "google_meet", "microsoft_teams", "jitsi", "livekit"]);

export const listMeetingAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => workspaceInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("meeting_provider_accounts")
      .select("id, provider, display_name, is_default, status, config, last_error, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("provider", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

const saveAccountInput = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid().nullable().optional(),
  provider: providerKind,
  display_name: z.string().min(1).max(120),
  credentials: z.record(z.string(), z.string()).default({}),
  config: z
    .object({
      waiting_room_default: z.boolean().optional(),
      password_required: z.boolean().optional(),
      auto_recording: z.enum(["none", "cloud", "local"]).optional(),
      domain: z.string().optional(),
      livekit_url: z.string().optional(),
      livekit_api_key: z.string().optional(),
      default_host_email: z.string().optional(),
    })
    .default({}),
  is_default: z.boolean().default(false),
});

export const saveMeetingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => saveAccountInput.parse(v))
  .handler(async ({ data, context }) => {
    const { encryptCredentials } = await import("@/lib/booking/providers/meeting.server");
    const credsCipher = Object.keys(data.credentials).length
      ? encryptCredentials(data.credentials)
      : null;

    // If setting default, clear other defaults for the same provider.
    if (data.is_default) {
      await sbAny(context.supabase)
        .from("meeting_provider_accounts")
        .update({ is_default: false })
        .eq("workspace_id", data.workspaceId)
        .eq("provider", data.provider);
    }

    const payload = {
      workspace_id: data.workspaceId,
      provider: data.provider,
      display_name: data.display_name,
      config: data.config,
      is_default: data.is_default,
      status: "active",
      ...(credsCipher ? { credentials_ciphertext: credsCipher } : {}),
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await sbAny(context.supabase)
        .from("meeting_provider_accounts")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;

      const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
      void recordServerAuditEvent({
        eventType: credsCipher ? "secrets.rotate" : "meeting_account.update",
        severity: credsCipher ? "warning" : "info",
        workspaceId: data.workspaceId,
        actorId: context.userId,
        resourceType: "meeting_account",
        resourceId: data.id,
        data: { rotates_secrets: !!credsCipher },
      });

      return { id: data.id };
    }
    const { data: row, error } = await sbAny(context.supabase)
      .from("meeting_provider_accounts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "meeting_account.connect",
      severity: "info",
      workspaceId: data.workspaceId,
      actorId: context.userId,
      resourceType: "meeting_account",
      resourceId: row!.id,
      data: { provider: data.provider },
    });

    return { id: row!.id };
  });

export const deleteMeetingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("meeting_provider_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listMeetingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      appointmentId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("meeting_history")
      .select("id, appointment_id, provider, action, join_url, external_meeting_id, error, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.appointmentId) q = q.eq("appointment_id", data.appointmentId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listMeetingAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid(), appointmentId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("meeting_attendance")
      .select("id, participant_name, participant_email, participant_role, joined_at, left_at, duration_seconds, provider")
      .eq("workspace_id", data.workspaceId)
      .eq("appointment_id", data.appointmentId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const recordAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      appointmentId: z.string().uuid(),
      participants: z.array(
        z.object({
          name: z.string().nullable(),
          email: z.string().nullable(),
          role: z.enum(["host", "co_host", "guest"]).default("guest"),
          joined_at: z.string().nullable(),
          left_at: z.string().nullable(),
          duration_seconds: z.number().nullable(),
          provider: z.string().nullable(),
        }),
      ),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const rows = data.participants.map((p) => ({
      workspace_id: data.workspaceId,
      appointment_id: data.appointmentId,
      participant_name: p.name,
      participant_email: p.email,
      participant_role: p.role,
      joined_at: p.joined_at,
      left_at: p.left_at,
      duration_seconds: p.duration_seconds,
      provider: p.provider,
    }));
    if (!rows.length) return { inserted: 0 };
    const { error } = await sbAny(context.supabase).from("meeting_attendance").insert(rows);
    if (error) throw error;
    await sbAny(context.supabase).from("meeting_history").insert({
      workspace_id: data.workspaceId,
      appointment_id: data.appointmentId,
      provider: rows[0].provider ?? "unknown",
      action: "attendance_synced",
      payload: { count: rows.length },
    });
    return { inserted: rows.length };
  });

export const saveMeetingNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ appointmentId: z.string().uuid(), notes: z.string().max(20000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: appt, error: e1 } = await sbAny(context.supabase)
      .from("booking_appointments")
      .update({ meeting_notes: data.notes })
      .eq("id", data.appointmentId)
      .select("workspace_id")
      .single();
    if (e1) throw e1;
    await sbAny(context.supabase).from("meeting_history").insert({
      workspace_id: (appt as { workspace_id: string }).workspace_id,
      appointment_id: data.appointmentId,
      provider: "system",
      action: "notes_saved",
      payload: { length: data.notes.length },
    });
    return { ok: true };
  });

export const syncMeetingAttendanceFromProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ appointmentId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: appt, error: e1 } = await sbAny(context.supabase)
      .from("booking_appointments")
      .select("id, workspace_id, location_kind, external_event_ids, meeting_provider_account_id")
      .eq("id", data.appointmentId)
      .single();
    if (e1) throw e1;
    const row = appt as {
      id: string;
      workspace_id: string;
      location_kind: string | null;
      external_event_ids: Record<string, string> | null;
      meeting_provider_account_id: string | null;
    };
    const kind = row.location_kind as
      | "zoom"
      | "google_meet"
      | "microsoft_teams"
      | "jitsi"
      | "livekit"
      | null;
    if (!kind || !["zoom", "microsoft_teams"].includes(kind)) {
      return { attendees: 0, note: "provider does not expose attendance API" };
    }
    const externalId = row.external_event_ids?.[`${kind}_meeting_id`];
    if (!externalId) return { attendees: 0, note: "no external meeting id" };

    // Load account
    let account = null;
    if (row.meeting_provider_account_id) {
      // Encrypted provider credentials are not readable by client-scoped roles;
      // the appointment above was already authorized through RLS.
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { data: acc } = await supabaseAdmin
        .from("meeting_provider_accounts")
        .select("id, workspace_id, provider, display_name, status, credentials_ciphertext, config")
        .eq("id", row.meeting_provider_account_id)
        .eq("workspace_id", row.workspace_id)
        .single();
      if (acc) {
        const { hydrateAccount } = await import("@/lib/booking/providers/meeting.server");
        account = hydrateAccount(acc as never);
      }
    }
    const { meetingProviderForKind } = await import("@/lib/booking/providers/meeting.server");
    const provider = meetingProviderForKind(kind);
    if (!provider.fetchAttendance) return { attendees: 0 };
    const attendees = await provider.fetchAttendance(account, externalId);
    if (!attendees.length) return { attendees: 0 };
    const rows = attendees.map((p) => ({
      workspace_id: row.workspace_id,
      appointment_id: row.id,
      participant_name: p.name,
      participant_email: p.email,
      participant_role: p.role,
      joined_at: p.joined_at,
      left_at: p.left_at,
      duration_seconds: p.duration_seconds,
      provider: kind,
      external_participant_id: p.external_participant_id ?? null,
    }));
    const { error } = await sbAny(context.supabase).from("meeting_attendance").insert(rows);
    if (error) throw error;
    return { attendees: rows.length };
  });
