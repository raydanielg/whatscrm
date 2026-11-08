/**
 * Synchronization orchestrator (server-only).
 *
 * A single `runSync(kind, ctx)` entry point:
 *   1. Creates a `sync_jobs` row (status=running)
 *   2. Dispatches to the sync operation for that kind
 *   3. Updates the job with counts + duration + status
 *   4. Upserts the per-account `sync_cursors` row for incremental sync
 *   5. Schedules retry on failure (exponential backoff)
 *
 * All ops are idempotent: they either drain queues (safe to re-run) or
 * upsert on natural keys. Duplicates never produce corrupt state.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { makeCorrelationId, log } from "./logger.server";
import { drainOutbox } from "./queue.server";
import { drainWebhookEvents } from "./webhook.server";
import { processDueScheduled } from "./scheduler.server";
import { syncTemplatesForAccount } from "./templates.server";
import { loadChannelAccount, loadCredentials, getProvider } from "./registry.server";
import type { ProviderName } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

export type SyncKind =
  | "templates"
  | "business_profile"
  | "phone_numbers"
  | "media_cleanup"
  | "webhook_drain"
  | "outbox_drain"
  | "scheduled_messages"
  | "contacts_reconcile"
  | "conversations_reconcile"
  | "status_reconcile"
  | "account_health";

export type SyncStatus = "pending" | "running" | "success" | "partial" | "failed";

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000; // 30s * 2^attempt

export interface RunSyncInput {
  workspaceId: string;
  channelAccountId?: string | null;
  kind: SyncKind;
  triggeredBy?: string | null;
  triggerSource?: "manual" | "cron" | "webhook" | "retry";
  parentJobId?: string | null;
  attempt?: number;
}

export interface RunSyncResult {
  jobId: string;
  status: SyncStatus;
  processed: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface OpResult {
  processed: number;
  succeeded: number;
  failed: number;
  metadata?: Record<string, unknown>;
  partial?: boolean;
}

// ---------------------------------------------------------------------------
// public entry point
// ---------------------------------------------------------------------------

export async function runSync(input: RunSyncInput): Promise<RunSyncResult> {
  const correlationId = makeCorrelationId();
  const attempt = input.attempt ?? 1;
  const startedAt = Date.now();

  // read cursor (idempotent, best-effort)
  const cursorBefore = await readCursor(input.workspaceId, input.channelAccountId ?? null, input.kind);

  // create job row
  const { data: created, error: insertErr } = await supabaseAdmin
    .from("sync_jobs" as never)
    .insert({
      workspace_id: input.workspaceId,
      channel_account_id: input.channelAccountId ?? null,
      kind: input.kind,
      status: "running",
      triggered_by: input.triggeredBy ?? null,
      trigger_source: input.triggerSource ?? "manual",
      correlation_id: correlationId,
      parent_job_id: input.parentJobId ?? null,
      attempt,
      cursor_before: cursorBefore,
    } as never)
    .select("id")
    .single();

  if (insertErr || !created) {
    throw new Error(`Failed to create sync job: ${insertErr?.message ?? "unknown"}`);
  }
  const jobId = (created as { id: string }).id;

  let result: OpResult = { processed: 0, succeeded: 0, failed: 0 };
  let status: SyncStatus = "success";
  let errorMsg: string | undefined;

  try {
    result = await dispatch(input, correlationId);
    if (result.failed > 0 && result.succeeded > 0) status = "partial";
    else if (result.failed > 0 && result.succeeded === 0 && result.processed > 0) status = "partial";
    if (result.partial) status = "partial";
  } catch (err) {
    status = "failed";
    errorMsg = err instanceof Error ? err.message : String(err);
    await log({
      workspaceId: input.workspaceId,
      channelAccountId: input.channelAccountId ?? undefined,
      provider: "whatsapp_cloud",
      level: "error",
      scope: "sync",
      message: `sync ${input.kind} failed: ${errorMsg}`,
      correlationId,
    });
  }

  const durationMs = Date.now() - startedAt;
  const completedAt = new Date().toISOString();
  const nextRetryAt =
    status === "failed" && attempt < MAX_ATTEMPTS
      ? new Date(Date.now() + BASE_BACKOFF_MS * Math.pow(2, attempt - 1)).toISOString()
      : null;

  await supabaseAdmin
    .from("sync_jobs" as never)
    .update({
      status,
      completed_at: completedAt,
      duration_ms: durationMs,
      items_processed: result.processed,
      items_succeeded: result.succeeded,
      items_failed: result.failed,
      error: errorMsg ?? null,
      cursor_after: status === "success" || status === "partial" ? completedAt : cursorBefore,
      next_retry_at: nextRetryAt,
      metadata: result.metadata ?? {},
    } as never)
    .eq("id", jobId);

  // upsert cursor
  await upsertCursor({
    workspaceId: input.workspaceId,
    channelAccountId: input.channelAccountId ?? null,
    kind: input.kind,
    jobId,
    status,
    completedAt,
    error: errorMsg,
  });

  return {
    jobId,
    status,
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    durationMs,
    error: errorMsg,
    metadata: result.metadata,
  };
}

// ---------------------------------------------------------------------------
// dispatch by kind
// ---------------------------------------------------------------------------

async function dispatch(input: RunSyncInput, correlationId: string): Promise<OpResult> {
  switch (input.kind) {
    case "templates":            return syncTemplates(input);
    case "business_profile":     return syncBusinessProfile(input);
    case "phone_numbers":        return syncPhoneNumbers(input);
    case "media_cleanup":        return syncMediaCleanup(input);
    case "webhook_drain":        return syncWebhookDrain(correlationId);
    case "outbox_drain":         return syncOutboxDrain(correlationId);
    case "scheduled_messages":   return syncScheduledMessages();
    case "contacts_reconcile":   return syncContactsReconcile(input);
    case "conversations_reconcile": return syncConversationsReconcile(input);
    case "status_reconcile":     return syncStatusReconcile(input);
    case "account_health":       return syncAccountHealth(input);
  }
}

// ---------------------------------------------------------------------------
// operations
// ---------------------------------------------------------------------------

async function syncTemplates(input: RunSyncInput): Promise<OpResult> {
  if (!input.channelAccountId) throw new Error("channelAccountId required for templates sync");
  const res = await syncTemplatesForAccount(input.channelAccountId);
  return { processed: res.synced, succeeded: res.synced, failed: 0 };
}

async function syncBusinessProfile(input: RunSyncInput): Promise<OpResult> {
  if (!input.channelAccountId) throw new Error("channelAccountId required");
  const account = await loadChannelAccount(input.channelAccountId);
  const impl = getProvider(account.provider as ProviderName);
  const creds = loadCredentials(account);
  if (!account.phoneNumberId) throw new Error("phone number id missing");

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${account.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } },
  );
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const profile = body.data?.[0] ?? null;

  // persist profile snapshot on channel_accounts.metadata
  await supabaseAdmin
    .from("channel_accounts" as never)
    .update({
      metadata: { ...(profile ? { business_profile: profile } : {}) },
      last_verified_at: new Date().toISOString(),
    } as never)
    .eq("id", input.channelAccountId);

  void impl;
  return { processed: profile ? 1 : 0, succeeded: profile ? 1 : 0, failed: 0, metadata: { profile } };
}

async function syncPhoneNumbers(input: RunSyncInput): Promise<OpResult> {
  if (!input.channelAccountId) throw new Error("channelAccountId required");
  const account = await loadChannelAccount(input.channelAccountId);
  if (!account.wabaId) throw new Error("waba id missing");
  const creds = loadCredentials(account);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${account.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,name_status,platform_type`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } },
  );
  if (!res.ok) throw new Error(`phone_numbers fetch failed: ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string; display_phone_number: string; verified_name?: string; code_verification_status?: string; quality_rating?: string; name_status?: string }> };
  const nums = body.data ?? [];

  let matched = 0;
  for (const n of nums) {
    const { data: rows } = await supabaseAdmin
      .from("channel_accounts" as never)
      .select("id, metadata")
      .eq("waba_id", account.wabaId)
      .eq("phone_number_id", n.id);
    for (const r of (rows ?? []) as Array<{ id: string; metadata: Record<string, unknown> }>) {
      await supabaseAdmin
        .from("channel_accounts" as never)
        .update({
          phone_number: n.display_phone_number,
          metadata: { ...r.metadata, verified_name: n.verified_name, quality_rating: n.quality_rating, code_verification_status: n.code_verification_status, name_status: n.name_status },
        } as never)
        .eq("id", r.id);
      matched += 1;
    }
  }
  return { processed: nums.length, succeeded: matched, failed: nums.length - matched, metadata: { totalOnWaba: nums.length, matchedLocal: matched } };
}

async function syncMediaCleanup(input: RunSyncInput): Promise<OpResult> {
  const { data, error } = await sbAny(supabaseAdmin).rpc("claim_expired_media" as never, { _limit: 200 } as never);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; storage_bucket: string; storage_path: string }>;

  let deleted = 0;
  for (const r of rows) {
    const { error: rmErr } = await supabaseAdmin.storage.from(r.storage_bucket).remove([r.storage_path]);
    if (!rmErr) deleted += 1;
  }
  void input;
  return { processed: rows.length, succeeded: deleted, failed: rows.length - deleted };
}

async function syncWebhookDrain(correlationId: string): Promise<OpResult> {
  const res = await drainWebhookEvents(`sync-${correlationId}`, 50);
  return {
    processed: res.claimed,
    succeeded: res.processed,
    failed: res.failed,
    metadata: { ...res },
  };
}

async function syncOutboxDrain(correlationId: string): Promise<OpResult> {
  const res = await drainOutbox(`sync-${correlationId}`, 50);
  return {
    processed: res.claimed,
    succeeded: res.sent,
    failed: res.failed,
    metadata: { ...res },
  };
}

async function syncScheduledMessages(): Promise<OpResult> {
  const res = await processDueScheduled(100);
  return {
    processed: res.claimed,
    succeeded: res.sent,
    failed: res.failed,
    metadata: { ...res },
  };
}

/**
 * Reconcile contacts: find messages with a `wa_id` in metadata but no contact
 * row and upsert the placeholder. Idempotent via unique(workspace, phone).
 */
async function syncContactsReconcile(input: RunSyncInput): Promise<OpResult> {
  const { data: orphaned } = await supabaseAdmin
    .from("messages" as never)
    .select("id, conversation_id, metadata")
    .eq("direction", "inbound")
    .is("contact_id" as never, null)
    .limit(500);
  const rows = (orphaned ?? []) as Array<{ id: string; conversation_id: string; metadata: Record<string, unknown> }>;
  let fixed = 0;
  for (const m of rows) {
    const waId = (m.metadata as { from?: string })?.from;
    if (!waId) continue;
    const { data: c } = await supabaseAdmin
      .from("contacts" as never)
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("phone", waId)
      .maybeSingle();
    if (c) {
      await supabaseAdmin
        .from("messages" as never)
        .update({ contact_id: (c as { id: string }).id } as never)
        .eq("id", m.id);
      fixed += 1;
    }
  }
  return { processed: rows.length, succeeded: fixed, failed: rows.length - fixed };
}

/**
 * Reconcile conversations: recompute last_message_at / unread_count for
 * conversations whose counters drift.
 */
async function syncConversationsReconcile(input: RunSyncInput): Promise<OpResult> {
  const { data, error } = await supabaseAdmin
    .from("conversations" as never)
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  let repaired = 0;
  for (const id of ids) {
    const { data: last } = await supabaseAdmin
      .from("messages" as never)
      .select("created_at, body, direction, message_type")
      .eq("conversation_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) continue;
    const l = last as unknown as { created_at: string; body: string | null; direction: string; message_type: string };
    await supabaseAdmin
      .from("conversations" as never)
      .update({
        last_message_at: l.created_at,
        last_message_preview: (l.body ?? l.message_type).slice(0, 200),
        last_message_from: l.direction === "inbound" ? "contact" : "agent",
      } as never)
      .eq("id", id);
    repaired += 1;
  }
  return { processed: ids.length, succeeded: repaired, failed: ids.length - repaired };
}

/**
 * Reconcile message statuses: find outbound messages stuck in `sent` for
 * >24h with no delivery event and mark as `failed` so retry logic engages.
 */
async function syncStatusReconcile(input: RunSyncInput): Promise<OpResult> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("messages" as never)
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("direction", "outbound")
    .eq("status", "sent")
    .lt("created_at", cutoff)
    .limit(200);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return { processed: 0, succeeded: 0, failed: 0 };
  await supabaseAdmin
    .from("messages" as never)
    .update({ status: "failed", error_message: "no delivery confirmation within 24h" } as never)
    .in("id", ids);
  return { processed: ids.length, succeeded: ids.length, failed: 0 };
}

/**
 * Health check: ping Graph API with the account's phone number id and mark
 * the channel_accounts row accordingly.
 */
async function syncAccountHealth(input: RunSyncInput): Promise<OpResult> {
  if (!input.channelAccountId) throw new Error("channelAccountId required");
  const account = await loadChannelAccount(input.channelAccountId);
  const creds = loadCredentials(account);
  if (!account.phoneNumberId) throw new Error("phone number id missing");
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${account.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } },
  );
  const ok = res.ok;
  await supabaseAdmin
    .from("channel_accounts" as never)
    .update({
      status: ok ? "connected" : "error",
      status_reason: ok ? null : `health check failed: ${res.status}`,
      last_verified_at: new Date().toISOString(),
    } as never)
    .eq("id", input.channelAccountId);
  return { processed: 1, succeeded: ok ? 1 : 0, failed: ok ? 0 : 1 };
}

// ---------------------------------------------------------------------------
// cursor helpers
// ---------------------------------------------------------------------------

async function readCursor(
  workspaceId: string,
  channelAccountId: string | null,
  kind: SyncKind,
): Promise<string | null> {
  let q = supabaseAdmin
    .from("sync_cursors" as never)
    .select("last_success_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind);
  q = channelAccountId ? q.eq("channel_account_id", channelAccountId) : q.is("channel_account_id", null);
  const { data } = await q.maybeSingle();
  return (data as { last_success_at?: string } | null)?.last_success_at ?? null;
}

async function upsertCursor(args: {
  workspaceId: string;
  channelAccountId: string | null;
  kind: SyncKind;
  jobId: string;
  status: SyncStatus;
  completedAt: string;
  error?: string;
}) {
  const patch: Record<string, unknown> = {
    workspace_id: args.workspaceId,
    channel_account_id: args.channelAccountId,
    kind: args.kind,
    last_synced_at: args.completedAt,
    last_job_id: args.jobId,
  };
  if (args.status === "success" || args.status === "partial") {
    patch.last_success_at = args.completedAt;
    patch.last_error = null;
  } else if (args.status === "failed") {
    patch.last_failure_at = args.completedAt;
    patch.last_error = args.error ?? "unknown";
  }
  await supabaseAdmin
    .from("sync_cursors" as never)
    .upsert(patch as never, { onConflict: "workspace_id,channel_account_id,kind" } as never);
}

// ---------------------------------------------------------------------------
// retry claim (used by cron)
// ---------------------------------------------------------------------------

export async function claimFailedJobsForRetry(limit = 20): Promise<Array<{
  id: string; workspace_id: string; channel_account_id: string | null;
  kind: SyncKind; attempt: number;
}>> {
  const { data } = await supabaseAdmin
    .from("sync_jobs" as never)
    .select("id, workspace_id, channel_account_id, kind, attempt")
    .eq("status", "failed")
    .not("next_retry_at", "is", null)
    .lt("next_retry_at", new Date().toISOString())
    .lt("attempt", MAX_ATTEMPTS)
    .order("next_retry_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as Array<{
    id: string; workspace_id: string; channel_account_id: string | null;
    kind: SyncKind; attempt: number;
  }>;
}
