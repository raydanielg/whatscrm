/**
 * Monitoring server functions — read-only aggregations plus targeted
 * retry actions across the messaging stack (outbox, webhooks, providers,
 * syncs, accounts). All entry points are auth-gated and workspace-scoped.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

const wsInput = z.object({ workspaceId: z.string().uuid() });

// ---------------------------------------------------------------------------
// Overview: KPIs across outbox, webhooks, syncs, accounts (24h window)
// ---------------------------------------------------------------------------

export const getMonitoringOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => wsInput.parse(i))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sb = context.supabase;

    const [ob, wh, sy, ac, msg, api] = await Promise.all([
      sbAny(sb).from("message_outbox" as never)
        .select("status,attempts,sent_at,created_at,failed_at,delivered_at,read_at,last_error_code")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since),
      sbAny(sb).from("webhook_events" as never)
        .select("processed,signature_valid,attempts,received_at,processed_at,dead_letter_at,last_error_kind")
        .eq("workspace_id", data.workspaceId)
        .gte("received_at", since),
      sbAny(sb).from("sync_jobs" as never)
        .select("status,duration_ms")
        .eq("workspace_id", data.workspaceId)
        .gte("started_at", since),
      sbAny(sb).from("channel_accounts" as never)
        .select("id,display_name,phone_number,status,status_reason,last_verified_at,provider")
        .eq("workspace_id", data.workspaceId),
      sbAny(sb).from("messages" as never)
        .select("direction,status,created_at")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since),
      sbAny(sb).from("provider_logs" as never)
        .select("level,provider,created_at")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since),
    ]);

    if (ob.error) throw new Error(ob.error.message);
    if (wh.error) throw new Error(wh.error.message);

    const outbox = (ob.data ?? []) as Array<{
      status: string; attempts: number;
      sent_at: string | null; created_at: string; failed_at: string | null;
      delivered_at: string | null; read_at: string | null; last_error_code: string | null;
    }>;
    const webhooks = (wh.data ?? []) as Array<{
      processed: boolean; signature_valid: boolean; attempts: number;
      received_at: string; processed_at: string | null; dead_letter_at: string | null;
      last_error_kind: string | null;
    }>;
    const syncs = (sy.data ?? []) as Array<{ status: string; duration_ms: number | null }>;
    const accounts = (ac.data ?? []) as Array<{
      id: string; display_name: string | null; phone_number: string | null;
      status: string; status_reason: string | null; last_verified_at: string | null; provider: string;
    }>;
    const messages = (msg.data ?? []) as Array<{ direction: string; status: string; created_at: string }>;
    const logs = (api.data ?? []) as Array<{ level: string; provider: string; created_at: string }>;

    // Outbox stats
    const obTotal = outbox.length;
    const obSent = outbox.filter((r) => r.status === "sent" || r.sent_at).length;
    const obFailed = outbox.filter((r) => r.status === "failed").length;
    const obPending = outbox.filter((r) => r.status === "pending" || r.status === "queued").length;
    const obRetrying = outbox.filter((r) => (r.attempts ?? 0) > 0 && r.status !== "sent" && r.status !== "failed").length;
    const latencies = outbox
      .filter((r) => r.sent_at && r.created_at)
      .map((r) => new Date(r.sent_at!).getTime() - new Date(r.created_at).getTime())
      .filter((n) => n >= 0)
      .sort((a, b) => a - b);
    const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const avgLatency = latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : 0;

    // Webhook stats
    const whTotal = webhooks.length;
    const whProcessed = webhooks.filter((r) => r.processed).length;
    const whInvalidSig = webhooks.filter((r) => !r.signature_valid).length;
    const whDead = webhooks.filter((r) => r.dead_letter_at).length;
    const whPending = webhooks.filter((r) => !r.processed && !r.dead_letter_at).length;

    // Sync stats
    const syTotal = syncs.length;
    const sySuccess = syncs.filter((r) => r.status === "success").length;
    const syFailed = syncs.filter((r) => r.status === "failed").length;

    // Bucket outbox / webhooks by hour for time series
    const buckets: Record<string, { hour: string; sent: number; failed: number; wh: number; whFail: number }> = {};
    const bucketKey = (iso: string) => {
      const d = new Date(iso);
      d.setMinutes(0, 0, 0);
      return d.toISOString();
    };
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      const k = d.toISOString();
      buckets[k] = { hour: k, sent: 0, failed: 0, wh: 0, whFail: 0 };
    }
    for (const r of outbox) {
      const k = bucketKey(r.created_at);
      if (buckets[k]) {
        if (r.status === "failed") buckets[k].failed += 1;
        else if (r.sent_at) buckets[k].sent += 1;
      }
    }
    for (const r of webhooks) {
      const k = bucketKey(r.received_at);
      if (buckets[k]) {
        buckets[k].wh += 1;
        if (!r.signature_valid || r.dead_letter_at) buckets[k].whFail += 1;
      }
    }

    // Health = per account rollup
    const accountHealth = accounts.map((a) => {
      const isConnected = a.status === "connected" || a.status === "active";
      const staleVerify = a.last_verified_at
        ? Date.now() - new Date(a.last_verified_at).getTime() > 24 * 60 * 60 * 1000
        : true;
      return {
        id: a.id,
        display_name: a.display_name,
        phone_number: a.phone_number,
        provider: a.provider,
        status: a.status,
        status_reason: a.status_reason,
        last_verified_at: a.last_verified_at,
        healthy: isConnected && !staleVerify,
      };
    });

    return {
      window: "24h",
      outbox: {
        total: obTotal, sent: obSent, failed: obFailed,
        pending: obPending, retrying: obRetrying,
        successRate: obTotal ? +(obSent / obTotal * 100).toFixed(1) : 100,
        failureRate: obTotal ? +(obFailed / obTotal * 100).toFixed(1) : 0,
        avgLatencyMs: avgLatency, p50, p95,
      },
      webhooks: {
        total: whTotal, processed: whProcessed, pending: whPending,
        deadLetter: whDead, invalidSignature: whInvalidSig,
        successRate: whTotal ? +(whProcessed / whTotal * 100).toFixed(1) : 100,
      },
      syncs: { total: syTotal, success: sySuccess, failed: syFailed },
      messages: {
        inbound: messages.filter((m) => m.direction === "inbound").length,
        outbound: messages.filter((m) => m.direction === "outbound").length,
        total: messages.length,
      },
      providerLogs: {
        total: logs.length,
        errors: logs.filter((l) => l.level === "error").length,
        warnings: logs.filter((l) => l.level === "warn" || l.level === "warning").length,
      },
      accounts: accountHealth,
      timeSeries: Object.values(buckets),
    };
  });

// ---------------------------------------------------------------------------
// Outbox listing / retry / cancel
// ---------------------------------------------------------------------------

export const listOutboxJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      status: z.enum(["pending", "sending", "sent", "failed", "queued", "canceled"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("message_outbox" as never)
      .select("id,status,attempts,max_attempts,next_attempt_at,created_at,sent_at,failed_at,last_error,last_error_code,to_address,provider,channel_account_id,conversation_id")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const retryOutboxJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_outbox" as never)
      .update({
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        last_error_code: null,
        locked_at: null,
        locked_by: null,
      } as never)
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Webhook events listing + retry (reset dead letter)
// ---------------------------------------------------------------------------

export const listWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      onlyFailures: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("webhook_events" as never)
      .select("id,event_type,provider,processed,signature_valid,attempts,received_at,processed_at,dead_letter_at,last_error,last_error_kind,channel_account_id,external_event_id")
      .eq("workspace_id", data.workspaceId)
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (data.onlyFailures) q = q.or("processed.eq.false,dead_letter_at.not.is.null,signature_valid.eq.false");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const retryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("webhook_events" as never)
      .update({
        processed: false,
        process_error: null,
        last_error: null,
        last_error_kind: null,
        dead_letter_at: null,
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      } as never)
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Provider log tail
// ---------------------------------------------------------------------------

export const listProviderLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      level: z.enum(["debug", "info", "warn", "warning", "error"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("provider_logs" as never)
      .select("id,level,provider,scope,message,data,correlation_id,created_at,channel_account_id")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// API keys usage snapshot
// ---------------------------------------------------------------------------

export const listApiKeyUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Try org-scoped lookup: workspace's owning org (best-effort).
    const { data: ws } = await context.supabase
      .from("workspaces" as never)
      .select("organization_id")
      .eq("id", data.workspaceId)
      .maybeSingle() as unknown as { data: { organization_id: string | null } | null };
    const orgId = ws?.organization_id ?? null;
    if (!orgId) return { rows: [] };
    const { data: rows, error } = await context.supabase
      .from("api_keys" as never)
      .select("id,name,prefix,scopes,last_used_at,expires_at,revoked_at,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
