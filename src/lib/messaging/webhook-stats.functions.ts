/**
 * Webhook configuration & health stats for WhatsApp Cloud channel accounts.
 *
 * Powers the WhatsApp Webhook settings panel: per-account counts of raw
 * envelopes recorded in `webhook_events`, split by processed / failed /
 * signature-valid, plus the most recent event timestamps. All reads go
 * through the caller's Supabase client so workspace RLS applies.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

export interface WebhookAccountStats {
  channel_account_id: string;
  total: number;
  processed: number;
  failed: number;
  signature_invalid: number;
  last_received_at: string | null;
  last_processed_at: string | null;
  last_error: string | null;
}

export const getWhatsAppWebhookStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Last 7 days is enough for a live health signal.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await context.supabase
      .from("webhook_events" as never)
      .select(
        "channel_account_id, processed, signature_valid, process_error, received_at, processed_at",
      )
      .eq("provider", "whatsapp_cloud")
      .eq("workspace_id", data.workspaceId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(5000);

    if (error) throw new Error(error.message);

    const byAccount = new Map<string, WebhookAccountStats>();
    for (const r of (rows ?? []) as Array<{
      channel_account_id: string | null;
      processed: boolean;
      signature_valid: boolean;
      process_error: string | null;
      received_at: string;
      processed_at: string | null;
    }>) {
      const key = r.channel_account_id ?? "__unknown__";
      const s =
        byAccount.get(key) ??
        ({
          channel_account_id: key,
          total: 0,
          processed: 0,
          failed: 0,
          signature_invalid: 0,
          last_received_at: null,
          last_processed_at: null,
          last_error: null,
        } as WebhookAccountStats);
      s.total += 1;
      if (r.processed) s.processed += 1;
      if (r.process_error) {
        s.failed += 1;
        if (!s.last_error) s.last_error = r.process_error;
      }
      if (!r.signature_valid) s.signature_invalid += 1;
      if (!s.last_received_at || r.received_at > s.last_received_at) {
        s.last_received_at = r.received_at;
      }
      if (r.processed_at && (!s.last_processed_at || r.processed_at > s.last_processed_at)) {
        s.last_processed_at = r.processed_at;
      }
      byAccount.set(key, s);
    }

    return {
      windowDays: 7,
      accounts: Array.from(byAccount.values()),
    };
  });

export interface WebhookDeliveryRow {
  id: string;
  channel_account_id: string | null;
  event_type: string | null;
  external_event_id: string | null;
  signature_valid: boolean;
  processed: boolean;
  attempts: number | null;
  received_at: string;
  processed_at: string | null;
  process_error: string | null;
  last_error_kind: string | null;
  dead_letter_at: string | null;
}

/**
 * Most recent raw webhook envelopes for the workspace, newest first.
 * Payload bodies are intentionally excluded — this is a delivery log,
 * not a message inspector.
 */
export const listWhatsAppWebhookDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("webhook_events" as never)
      .select(
        "id, channel_account_id, event_type, external_event_id, signature_valid, processed, attempts, received_at, processed_at, process_error, last_error_kind, dead_letter_at",
      )
      .eq("provider", "whatsapp_cloud")
      .eq("workspace_id", data.workspaceId)
      .order("received_at", { ascending: false })
      .limit(data.limit ?? 25);

    if (error) throw new Error(error.message);

    return { deliveries: (rows ?? []) as unknown as WebhookDeliveryRow[] };
  });

export interface WebhookTestResult {
  ok: boolean;
  callbackUrl: string;
  httpStatus: number | null;
  challengeEchoed: boolean;
  message: string;
  recentDeliveries: number;
  lastReceivedAt: string | null;
  lastError: string | null;
}

/**
 * Self-test the public callback URL exactly like Meta's subscription
 * challenge: GET ?hub.mode=subscribe&hub.verify_token=<account token>
 * &hub.challenge=<nonce>, and assert the nonce is echoed verbatim.
 *
 * The target URL is rebuilt server-side from the incoming request origin,
 * so a caller can never point this at an arbitrary host (no SSRF).
 */
export const testWhatsAppWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        channelAccountId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WebhookTestResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const callbackUrl = `${origin}/api/public/webhooks/whatsapp`;

    const { data: secretRows, error: accountError } = await sbAny(context.supabase).rpc(
      "channel_account_secrets" as never,
      { _workspace_id: data.workspaceId, _account_id: data.channelAccountId } as never,
    );

    if (accountError) throw new Error(accountError.message);
    const account = ((secretRows ?? []) as unknown as Array<{ id: string; verify_token: string | null }>)[0] ?? null;
    const verifyToken = (account as { verify_token?: string | null } | null)?.verify_token;

    // Recent delivery context, regardless of the challenge outcome.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await context.supabase
      .from("webhook_events" as never)
      .select("received_at, process_error")
      .eq("provider", "whatsapp_cloud")
      .eq("workspace_id", data.workspaceId)
      .eq("channel_account_id", data.channelAccountId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(100);

    const rows = (recent ?? []) as Array<{ received_at: string; process_error: string | null }>;
    const base = {
      callbackUrl,
      recentDeliveries: rows.length,
      lastReceivedAt: rows[0]?.received_at ?? null,
      lastError: rows.find((r) => r.process_error)?.process_error ?? null,
    };

    if (!verifyToken) {
      return {
        ...base,
        ok: false,
        httpStatus: null,
        challengeEchoed: false,
        message: "This account has no verify token saved. Add one before configuring Meta.",
      };
    }

    const challenge = `swf-${Math.random().toString(36).slice(2, 12)}`;
    const probe = new URL(callbackUrl);
    probe.searchParams.set("hub.mode", "subscribe");
    probe.searchParams.set("hub.verify_token", verifyToken);
    probe.searchParams.set("hub.challenge", challenge);

    try {
      const res = await fetch(probe.toString(), { method: "GET" });
      const body = (await res.text()).trim();
      const echoed = res.ok && body === challenge;
      return {
        ...base,
        ok: echoed,
        httpStatus: res.status,
        challengeEchoed: echoed,
        message: echoed
          ? "Callback URL and verify token validated — Meta's subscription challenge would succeed."
          : res.status === 403
            ? "Endpoint reachable but rejected the verify token. Make sure Meta uses this exact token."
            : `Unexpected response (HTTP ${res.status}). The challenge was not echoed back.`,
      };
    } catch {
      return {
        ...base,
        ok: false,
        httpStatus: null,
        challengeEchoed: false,
        message: "Could not reach the callback URL from the server. Publish the app and retry.",
      };
    }
  });

/* ------------------------------------------------------------------ *
 * Dead-letter queue: inspect and reprocess failed WhatsApp envelopes.
 * ------------------------------------------------------------------ */

export interface FailedWebhookRow extends WebhookDeliveryRow {
  max_attempts: number | null;
  next_attempt_at: string | null;
  last_error: string | null;
  /** Raw envelope JSON, pretty-printed. Only present when requested. */
  payload?: string | null;
}

export interface FailedWebhookSummary {
  deadLettered: number;
  retrying: number;
  total: number;
}

/**
 * Envelopes that failed processing: either permanently dead-lettered
 * (`dead_letter_at` set) or still in the retry window (`processed=false`
 * with at least one failed attempt). Workspace RLS restricts this to
 * workspace owners/admins.
 */
export const listWhatsAppFailedWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
        includePayload: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const columns = [
      "id, channel_account_id, event_type, external_event_id, signature_valid, processed",
      "attempts, max_attempts, next_attempt_at, received_at, processed_at",
      "process_error, last_error, last_error_kind, dead_letter_at",
      ...(data.includePayload ? ["payload"] : []),
    ].join(", ");

    const { data: rows, error } = await context.supabase
      .from("webhook_events" as never)
      .select(columns)
      .eq("provider", "whatsapp_cloud")
      .eq("workspace_id", data.workspaceId)
      .eq("processed", false)
      .or("dead_letter_at.not.is.null,attempts.gt.0")
      .order("received_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (error) throw new Error(error.message);

    const events = ((rows ?? []) as unknown as Array<
      Omit<FailedWebhookRow, "payload"> & { payload?: unknown }
    >).map((row) => ({
      ...row,
      payload:
        data.includePayload && row.payload !== undefined
          ? JSON.stringify(row.payload, null, 2)
          : null,
    })) as FailedWebhookRow[];
    const summary: FailedWebhookSummary = {
      deadLettered: events.filter((e) => e.dead_letter_at).length,
      retrying: events.filter((e) => !e.dead_letter_at).length,
      total: events.length,
    };

    return { events, summary };
  });

export interface RetryWebhookResult {
  requeued: number;
  drained: { claimed: number; processed: number; failed: number; deadLettered: number } | null;
  message: string;
}

/**
 * Requeue failed / dead-lettered envelopes for another processing pass.
 *
 * Authorization is enforced by first re-reading the target rows through
 * the caller's RLS-scoped client (only workspace owners/admins can see
 * `webhook_events`). Only ids that survive that read are then reset with
 * the service-role client, which is required because the table exposes
 * no UPDATE policy to `authenticated`.
 */
export const retryWhatsAppWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        eventIds: z.array(z.string().uuid()).max(500).optional(),
        allDeadLettered: z.boolean().optional(),
        runNow: z.boolean().optional(),
      })
      .refine((v) => (v.eventIds && v.eventIds.length > 0) || v.allDeadLettered, {
        message: "Select at least one event, or pass allDeadLettered.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RetryWebhookResult> => {
    // 1. Resolve target ids through RLS — this *is* the permission check.
    let query = context.supabase
      .from("webhook_events" as never)
      .select("id")
      .eq("provider", "whatsapp_cloud")
      .eq("workspace_id", data.workspaceId)
      .eq("processed", false);

    query = data.eventIds?.length
      ? query.in("id", data.eventIds)
      : query.not("dead_letter_at", "is", null);

    const { data: targets, error: readError } = await query.limit(500);
    if (readError) throw new Error(readError.message);

    const ids = ((targets ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) {
      return { requeued: 0, drained: null, message: "Nothing to reprocess." };
    }

    // 2. Reset the retry state with elevated privileges, scoped to those ids.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error: updateError } = await supabaseAdmin
      .from("webhook_events" as never)
      .update({
        processed: false,
        attempts: 0,
        dead_letter_at: null,
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        process_error: null,
        last_error: null,
        last_error_kind: null,
      } as never)
      .in("id", ids);
    if (updateError) throw new Error(updateError.message);

    // 3. Optionally drain immediately so the admin sees the outcome now.
    let drained: RetryWebhookResult["drained"] = null;
    if (data.runNow !== false) {
      const { drainWebhookEvents } = await import("@/lib/messaging/webhook.server");
      const workerId = `admin-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
      drained = await drainWebhookEvents(workerId, Math.min(ids.length, 50));
    }

    return {
      requeued: ids.length,
      drained,
      message: drained
        ? `Requeued ${ids.length} envelope${ids.length === 1 ? "" : "s"} — ${drained.processed} processed, ${drained.failed} failed, ${drained.deadLettered} dead-lettered.`
        : `Requeued ${ids.length} envelope${ids.length === 1 ? "" : "s"} for the next worker pass.`,
    };
  });
