import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callWorker } from "./qr-sessions.server";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * QR WhatsApp login server functions.
 *
 * These functions manage the DB-side lifecycle of QR sessions and proxy
 * QR/status polls to an external Baileys-style worker service. If the
 * worker isn't configured (WA_QR_WORKER_URL missing), functions still
 * succeed at the DB layer and return a `worker_available: false` flag so
 * the UI can render an informative empty state.
 */

export const listQrSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .select(
        "id, workspace_id, created_by, status, worker_session_id, phone_number, display_name, device_platform, error_message, last_seen_at, connected_at, revoked_at, disconnected_at, created_at, updated_at, expires_at, qr_expires_at, metadata",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const startQrSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .insert({
        workspace_id: data.workspaceId,
        created_by: context.userId,
        status: "pending",
      })
      .select(
        "id, workspace_id, created_by, status, worker_session_id, phone_number, display_name, device_platform, error_message, last_seen_at, connected_at, revoked_at, disconnected_at, created_at, updated_at, expires_at, qr_expires_at, metadata",
      )
      .single();
    if (error) throw new Error(error.message);

    const worker = await callWorker("/sessions", {
      method: "POST",
      body: JSON.stringify({
        session_id: row.id,
        workspace_id: data.workspaceId,
      }),
    });

    if (worker.available && worker.ok && worker.data?.worker_session_id) {
      await sbAny(context.supabase)
        .from("whatsapp_qr_sessions")
        .update({
          worker_session_id: worker.data.worker_session_id,
          status: "awaiting_scan",
        })
        .eq("id", row.id);
    }

    return { id: row.id, worker_available: worker.available };
  });

export const pollQrSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .select(
        "id, workspace_id, created_by, status, worker_session_id, phone_number, display_name, device_platform, error_message, last_seen_at, connected_at, revoked_at, disconnected_at, created_at, updated_at, expires_at, qr_expires_at, metadata",
      )
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Session not found");

    let qr: string | null = null;
    let worker_available = true;
    if (row.status !== "connected" && row.status !== "revoked" && row.status !== "disconnected") {
      const worker = await callWorker(`/sessions/${row.id}/qr`, { method: "GET" });
      worker_available = worker.available;
      if (worker.available && worker.ok && worker.data) {
        qr = worker.data.qr ?? null;
        const nextStatus = worker.data.status as string | undefined;
        const patch: {
          last_seen_at: string;
          status?: string;
          phone_number?: string;
          display_name?: string;
          device_platform?: string;
          connected_at?: string;
          error_message?: string;
        } = { last_seen_at: new Date().toISOString() };
        if (nextStatus && nextStatus !== row.status) patch.status = nextStatus;
        if (worker.data.phone_number) patch.phone_number = worker.data.phone_number;
        if (worker.data.display_name) patch.display_name = worker.data.display_name;
        if (worker.data.device_platform) patch.device_platform = worker.data.device_platform;
        if (nextStatus === "connected") patch.connected_at = new Date().toISOString();
        if (nextStatus === "error") patch.error_message = worker.data.error ?? "Worker reported error";
        if (Object.keys(patch).length > 1) {
          await sbAny(context.supabase)
            .from("whatsapp_qr_sessions")
            .update(patch)
            .eq("id", row.id);
          Object.assign(row, patch);
        }
      }
    }
    return { session: row, qr, worker_available };
  });

export const revokeQrSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await callWorker(`/sessions/${data.sessionId}`, { method: "DELETE" });
    const { error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Restart an existing session row against the worker: drops any stale
 * worker session and requests a fresh QR without losing the audit row.
 */
export const reconnectQrSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .select("id, workspace_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Session not found");

    await callWorker(`/sessions/${row.id}`, { method: "DELETE" });
    const worker = await callWorker("/sessions", {
      method: "POST",
      body: JSON.stringify({ session_id: row.id, workspace_id: row.workspace_id }),
    });

    const { error: upErr } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .update({
        status: worker.available && worker.ok ? "awaiting_scan" : "pending",
        worker_session_id: worker.data?.worker_session_id ?? null,
        error_message: null,
        revoked_at: null,
        disconnected_at: null,
        connected_at: null,
      })
      .eq("id", row.id);
    if (upErr) throw new Error(upErr.message);

    return { id: row.id, worker_available: worker.available };
  });

/** Permanently remove a session row (and its worker session, if any). */
export const deleteQrSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await callWorker(`/sessions/${data.sessionId}`, { method: "DELETE" });
    const { error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .delete()
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Store a human-friendly label for a session inside its metadata blob. */
export const renameQrSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string; label: string }) =>
    z
      .object({ sessionId: z.string().uuid(), label: z.string().trim().max(80) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .select("metadata")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Session not found");

    const metadata = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
      label: data.label || null,
    };
    const { error: upErr } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .update({ metadata })
      .eq("id", data.sessionId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/** Bulk revoke every non-revoked session in a workspace. */
export const revokeAllQrSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("whatsapp_qr_sessions")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .neq("status", "revoked");
    if (error) throw new Error(error.message);

    for (const r of rows ?? []) {
      await callWorker(`/sessions/${r.id}`, { method: "DELETE" });
    }
    if ((rows ?? []).length > 0) {
      const { error: upErr } = await sbAny(context.supabase)
        .from("whatsapp_qr_sessions")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .in("id", (rows ?? []).map((r) => r.id));
      if (upErr) throw new Error(upErr.message);
    }
    return { revoked: (rows ?? []).length };
  });

/** Worker reachability + session counters for the management header. */
export const qrWorkerHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const worker = await callWorker("/health", { method: "GET" });
    return {
      configured: worker.available,
      reachable: worker.available && worker.ok,
      uptime: worker.data?.uptime ?? null,
    };
  });
