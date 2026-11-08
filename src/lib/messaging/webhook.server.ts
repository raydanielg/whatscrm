/**
 * Webhook processing engine.
 *
 * Ingest path (`handleWebhook`):
 *   1. Compute dedupe_key = SHA-256(raw body).
 *   2. Route body -> channel_account, verify signature.
 *   3. INSERT into webhook_events with unique dedupe_key. Conflict = duplicate,
 *      silently ack. Invalid signature -> stored (signature_valid=false), 401.
 *   4. Ack 200 immediately.
 *
 * Worker path (`drainWebhookEvents`):
 *   * `webhook_events_claim_batch(worker, N)` claims rows via FOR UPDATE SKIP
 *     LOCKED and increments attempts.
 *   * Rows are parsed with the provider's parseWebhook and dispatched by kind:
 *       - message           -> upsert contact/conversation + insert message + media
 *       - status            -> update messages/outbox delivery states
 *       - template_status   -> update wa_templates
 *       - contact_update    -> update contacts profile
 *       - account_update    -> patch channel_accounts.metadata
 *   * Errors bump next_attempt_at with exponential backoff; once
 *     attempts >= max_attempts the envelope is dead-lettered.
 *
 * All writes go through supabaseAdmin (RLS bypassed) because the caller is
 * the provider, not a signed-in user.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import type {
  ChannelAccountRecord,
  NormalizedAccountUpdateEvent,
  NormalizedContactUpdateEvent,
  NormalizedInboundEvent,
  NormalizedInboundMessage,
  NormalizedStatusEvent,
  NormalizedTemplateStatusEvent,
  ProviderName,
  WebhookRequest,
} from "./types";
import {
  getProvider,
  loadChannelAccount,
  resolveAppSecret,
  routeWebhookToAccount,
} from "./registry.server";
import { fetchAndCacheMedia } from "./media.server";
import { log, makeCorrelationId } from "./logger.server";
import { ProviderError, computeBackoffMs } from "./errors";
import { sbAny } from "@/lib/supabase/untyped";
import { findReplyTarget } from "./reply-context.server";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// verify subscription (Meta GET challenge)
// ---------------------------------------------------------------------------

export async function handleVerify(provider: ProviderName, url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const { data: accounts } = await supabaseAdmin
    .from("channel_accounts" as never)
    .select("id")
    .eq("provider", provider)
    .eq("verify_token", token ?? "")
    .limit(1);

  const first = (accounts ?? [])[0] as { id: string } | undefined;
  if (!first) {
    // Fallback: a verify token registered by the setup wizard before the
    // channel account exists. Lets Meta validate the callback URL first.
    if (mode === "subscribe" && token && challenge) {
      const { data: pending } = await supabaseAdmin
        .from("webhook_verify_tokens" as never)
        .select("id, expires_at")
        .eq("provider", provider)
        .eq("token", token)
        .limit(1);
      const row = (pending ?? [])[0] as { id: string; expires_at: string } | undefined;
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        return new Response(challenge, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
    }
    return new Response("forbidden", { status: 403 });
  }

  const account = await loadChannelAccount(first.id);
  const impl = getProvider(provider);
  const echoed = impl.verifySubscription?.({ mode, token, challenge }, account);
  if (!echoed) return new Response("forbidden", { status: 403 });
  return new Response(echoed, { status: 200, headers: { "content-type": "text/plain" } });
}

// ---------------------------------------------------------------------------
// INGEST — POST /webhooks/*
// ---------------------------------------------------------------------------

export async function handleWebhook(
  provider: ProviderName,
  req: WebhookRequest,
): Promise<Response> {
  const correlationId = makeCorrelationId();
  const dedupeKey = `${provider}:${await sha256Hex(req.rawBody)}`;

  let body: unknown = null;
  try {
    body = JSON.parse(req.rawBody);
  } catch {
    body = null;
  }

  const account = body ? await routeWebhookToAccount(provider, body) : null;

  let signatureValid = false;
  if (account) {
    try {
      // Signature verification only needs the app secret. Resolving full
      // credentials here would throw when the access token is missing and
      // silently mark every inbound envelope as unverified.
      const { secret: appSecret, secretName } = resolveAppSecret(account);
      if (!appSecret) {
        // Distinguish "secret not configured" from "signature mismatch" —
        // the former is an install/env problem, not a spoofed request.
        await log({
          workspaceId: account.workspaceId,
          channelAccountId: account.id,
          provider,
          level: "error",
          scope: "webhook",
          message: "app secret not configured — cannot verify signature",
          data: { appSecretName: secretName },
          correlationId,
        });
      } else {
        const impl = getProvider(provider);
        signatureValid =
          (await impl.verifySignature?.(req, { accessToken: "", appSecret })) ?? false;
        if (!signatureValid) {
          await log({
            workspaceId: account.workspaceId,
            channelAccountId: account.id,
            provider,
            level: "warn",
            scope: "webhook",
            message: "webhook signature mismatch",
            data: { appSecretName: secretName },
            correlationId,
          });
        }
      }
    } catch (err) {
      await log({
        workspaceId: account.workspaceId,
        channelAccountId: account.id,
        provider,
        level: "error",
        scope: "webhook",
        message: "signature verification failed",
        data: { error: String(err) },
        correlationId,
      });
    }
  }

  // Insert envelope. Unique dedupe_key = idempotent ingestion — same payload
  // arriving twice is a no-op.
  const { error: insertErr } = await supabaseAdmin.from("webhook_events" as never).insert({
    provider,
    channel_account_id: account?.id ?? null,
    workspace_id: account?.workspaceId ?? null,
    event_type: guessEventType(body),
    dedupe_key: dedupeKey,
    signature_valid: signatureValid,
    headers: Object.fromEntries(req.headers.entries()),
    payload: body ?? { raw: req.rawBody },
    processed: false,
    next_attempt_at: new Date().toISOString(),
  } as never);

  // 23505 = duplicate → treat as ack.
  const isDup = insertErr && String((insertErr as { code?: string }).code) === "23505";
  if (insertErr && !isDup) {
    await log({
      provider,
      level: "error",
      scope: "webhook",
      message: "failed to persist envelope",
      data: { error: String(insertErr) },
      correlationId,
    });
    // Return 200 to avoid provider retry storms on our own storage errors.
    return new Response("ok", { status: 200 });
  }

  if (!account) return new Response("ok", { status: 200 });
  if (!signatureValid) {
    await log({
      workspaceId: account.workspaceId,
      channelAccountId: account.id,
      provider,
      level: "warn",
      scope: "webhook",
      message: "invalid signature — envelope stored, not processed",
      correlationId,
    });
    return new Response("invalid signature", { status: 401 });
  }

  // Best-effort inline processing so latency stays low; anything that fails
  // is picked up by the worker (row is left with processed=false).
  try {
    await processEnvelope(provider, account, body, correlationId);
    await supabaseAdmin
      .from("webhook_events" as never)
      .update({ processed: true, processed_at: new Date().toISOString() } as never)
      .eq("dedupe_key", dedupeKey);
  } catch (err) {
    await handleProcessingError(dedupeKey, err, correlationId, provider, account.workspaceId);
  }

  return new Response("ok", { status: 200 });
}

function guessEventType(body: unknown): string {
  const b = body as {
    object?: string;
    entry?: Array<{ changes?: Array<{ field?: string }> }>;
  } | null;
  const field = b?.entry?.[0]?.changes?.[0]?.field;
  if (field) return String(field);
  return b?.object ? String(b.object) : "unknown";
}

// ---------------------------------------------------------------------------
// WORKER — drain
// ---------------------------------------------------------------------------

export interface DrainStats {
  claimed: number;
  processed: number;
  failed: number;
  deadLettered: number;
}

/**
 * Claim a batch of webhook envelopes and process them. Safe to invoke
 * concurrently from many workers — `webhook_events_claim_batch` uses
 * FOR UPDATE SKIP LOCKED.
 */
export async function drainWebhookEvents(workerId: string, batchSize = 25): Promise<DrainStats> {
  const stats: DrainStats = { claimed: 0, processed: 0, failed: 0, deadLettered: 0 };

  const { data: claimed, error } = await sbAny(supabaseAdmin).rpc(
    "webhook_events_claim_batch" as never,
    {
      _worker: workerId,
      _limit: batchSize,
    } as never,
  );
  if (error) throw error;
  const rows = (claimed ?? []) as Array<{
    id: string;
    provider: ProviderName;
    channel_account_id: string | null;
    workspace_id: string | null;
    dedupe_key: string | null;
    payload: unknown;
    attempts: number;
    max_attempts: number;
  }>;
  stats.claimed = rows.length;

  for (const row of rows) {
    const correlationId = makeCorrelationId();
    if (!row.channel_account_id) {
      // Envelopes with no routable account are terminal — mark processed.
      await supabaseAdmin
        .from("webhook_events" as never)
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          last_error: "unroutable",
        } as never)
        .eq("id", row.id);
      stats.processed++;
      continue;
    }
    try {
      const account = await loadChannelAccount(row.channel_account_id);
      await processEnvelope(row.provider, account, row.payload, correlationId);
      await supabaseAdmin
        .from("webhook_events" as never)
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          last_error: null,
        } as never)
        .eq("id", row.id);
      stats.processed++;
    } catch (err) {
      const outcome = await handleProcessingError(
        row.dedupe_key ?? row.id,
        err,
        correlationId,
        row.provider,
        row.workspace_id ?? undefined,
        row.attempts,
        row.max_attempts,
      );
      if (outcome === "dead_letter") stats.deadLettered++;
      else stats.failed++;
    }
  }
  return stats;
}

async function handleProcessingError(
  keyOrId: string,
  err: unknown,
  correlationId: string,
  provider: ProviderName,
  workspaceId?: string,
  attempts?: number,
  maxAttempts?: number,
): Promise<"retry" | "dead_letter"> {
  const pe = err instanceof ProviderError ? err : null;
  const nextAttempt = (attempts ?? 0) + 1;
  const willDeadLetter =
    (attempts != null && maxAttempts != null && nextAttempt >= maxAttempts) ||
    pe?.retryable === false;

  const backoff = pe?.retryable === false ? 0 : computeBackoffMs(attempts ?? 1, pe?.retryAfterMs);
  const patch: Record<string, unknown> = {
    last_error: String((err as Error)?.message ?? err),
    last_error_kind: pe?.kind ?? "unknown",
    next_attempt_at: new Date(Date.now() + backoff).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (willDeadLetter) {
    patch.dead_letter_at = new Date().toISOString();
  }

  // Match on dedupe_key when available, otherwise id.
  const q = sbAny(supabaseAdmin)
    .from("webhook_events" as never)
    .update(patch as never);
  const isUuid = /^[0-9a-f-]{36}$/i.test(keyOrId);
  await (isUuid ? q.eq("id", keyOrId) : q.eq("dedupe_key", keyOrId));

  await log({
    provider,
    workspaceId,
    level: willDeadLetter ? "error" : "warn",
    scope: "webhook",
    message: willDeadLetter ? "webhook dead-lettered" : "webhook processing failed — will retry",
    data: { error: String((err as Error)?.message ?? err), kind: pe?.kind, backoffMs: backoff },
    correlationId,
  });
  return willDeadLetter ? "dead_letter" : "retry";
}

// ---------------------------------------------------------------------------
// PROCESS
// ---------------------------------------------------------------------------

async function processEnvelope(
  provider: ProviderName,
  account: ChannelAccountRecord,
  body: unknown,
  correlationId: string,
): Promise<void> {
  const impl = getProvider(provider);
  const events = impl.parseWebhook(body, account);
  for (const ev of events) {
    await processEvent(provider, account, ev, correlationId);
  }
}

async function processEvent(
  provider: ProviderName,
  account: ChannelAccountRecord,
  ev: NormalizedInboundEvent,
  correlationId: string,
): Promise<void> {
  switch (ev.kind) {
    case "message":
      return processInboundMessage(provider, account, ev, correlationId);
    case "status":
      return processStatusEvent(account, ev);
    case "template_status":
      return processTemplateStatus(account, ev);
    case "contact_update":
      return processContactUpdate(account, ev);
    case "account_update":
      return processAccountUpdate(account, ev);
    default:
      await log({
        provider,
        workspaceId: account.workspaceId,
        channelAccountId: account.id,
        level: "info",
        scope: "webhook",
        message: "unknown event kind",
        data: { event: ev },
        correlationId,
      });
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function upsertContact(
  workspaceId: string,
  phone: string,
  displayName?: string,
): Promise<string> {
  const { findContactByPhone } = await import("./phone-matching");
  const existing = await findContactByPhone(supabaseAdmin, workspaceId, phone);
  if (existing) {
    if (displayName && displayName !== existing.display_name) {
      await supabaseAdmin
        .from("contacts" as never)
        .update({ display_name: displayName } as never)
        .eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: inserted, error } = await supabaseAdmin
    .from("contacts" as never)
    .insert({
      workspace_id: workspaceId,
      display_name: displayName ?? phone,
      phone,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (inserted as { id: string }).id;
}

async function upsertConversation(
  workspaceId: string,
  channelAccountId: string,
  contactId: string,
  fromPhone: string,
  phoneNumberId: string | null,
): Promise<string> {
  const stableThreadKey = phoneNumberId && fromPhone ? `wa:${phoneNumberId}:${fromPhone}` : null;

  if (stableThreadKey) {
    const { data: byExternal } = await supabaseAdmin
      .from("conversations" as never)
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("channel", "whatsapp")
      .eq("external_conversation_id", stableThreadKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (byExternal) return (byExternal as { id: string }).id;
  }

  const { data: existing } = await supabaseAdmin
    .from("conversations" as never)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .eq("channel_account_id", channelAccountId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    // Stamp the external id on the next event so future webhook deliveries
    // can deduplicate on the stable thread key.
    if (stableThreadKey) {
      await supabaseAdmin
        .from("conversations" as never)
        .update({ external_conversation_id: stableThreadKey } as never)
        .eq("id", (existing as { id: string }).id);
    }
    return (existing as { id: string }).id;
  }

  const { data: acc } = await supabaseAdmin
    .from("channel_accounts" as never)
    .select("inbox_id")
    .eq("id", channelAccountId)
    .maybeSingle();
  let inboxId = (acc as { inbox_id: string | null } | null)?.inbox_id ?? null;
  if (!inboxId) {
    const { data: anyInbox } = await supabaseAdmin
      .from("inboxes" as never)
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();
    inboxId = (anyInbox as { id: string } | null)?.id ?? null;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("conversations" as never)
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      inbox_id: inboxId,
      channel_account_id: channelAccountId,
      external_conversation_id: stableThreadKey,
      // Every provider in this module is a WhatsApp transport, so the Inbox
      // channel filter must see `whatsapp` explicitly rather than relying on
      // the column default.
      channel: "whatsapp",
      status: "open",
      // `conversation_priority` uses `normal` as its default/middle value.
      // Using `medium` rejects every first inbound message before the thread
      // can be inserted, leaving the Inbox permanently empty.
      priority: "normal",
      metadata: { account_id: channelAccountId, source: "whatsapp_cloud" },
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (inserted as { id: string }).id;
}

/**
 * Applies a contact's reaction to the message it targets. A contact holds at
 * most one reaction per message, so any earlier emoji from them is removed
 * first; an empty emoji means the reaction was taken back.
 */
async function applyInboundReaction(
  workspaceId: string,
  ev: NormalizedInboundMessage,
): Promise<void> {
  const targetId = ev.contextMessageId;
  if (!targetId) return;

  const { data: target } = await supabaseAdmin
    .from("messages" as never)
    .select("id, metadata")
    .eq("workspace_id", workspaceId)
    .eq("external_message_id", targetId)
    .maybeSingle();
  if (!target) return;

  const row = target as unknown as { id: string; metadata: Record<string, unknown> | null };
  const reactions: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(
    (row.metadata?.reactions as Record<string, string[]> | undefined) ?? {},
  )) {
    const rest = users.filter((u) => u !== ev.from);
    if (rest.length > 0) reactions[emoji] = rest;
  }
  if (ev.text) reactions[ev.text] = [...(reactions[ev.text] ?? []), ev.from];

  await supabaseAdmin
    .from("messages" as never)
    .update({ metadata: { ...(row.metadata ?? {}), reactions } } as never)
    .eq("id", row.id);
}

export async function processInboundMessage(
  provider: ProviderName,
  account: ChannelAccountRecord,
  ev: NormalizedInboundMessage,
  correlationId: string,
): Promise<void> {
  // Idempotency at the message level too — we may see the same message id
  // across multiple envelopes (Meta re-delivers on 5xx).
  const { data: dup } = await supabaseAdmin
    .from("messages" as never)
    .select("id")
    .eq("workspace_id", account.workspaceId)
    .eq("external_message_id", ev.externalMessageId)
    .maybeSingle();
  if (dup) return;

  // A reaction is not a message of its own: it belongs on the message it
  // targets, so it is folded into that message's metadata.reactions instead.
  if (ev.type === "reaction") {
    await applyInboundReaction(account.workspaceId, ev);
    return;
  }

  // A Coexistence echo is from the business, to the customer — the opposite
  // of a normal inbound message — so the thread must be keyed on `ev.to`.
  const isOutboundEcho = ev.direction === "outbound";
  const customerPhone = isOutboundEcho ? ev.to : ev.from;
  const contactId = await upsertContact(account.workspaceId, customerPhone, ev.contactName);
  const conversationId = await upsertConversation(
    account.workspaceId,
    account.id,
    contactId,
    customerPhone,
    account.phoneNumberId ?? null,
  );
  const replyToId = await findReplyTarget(
    supabaseAdmin,
    account.workspaceId,
    conversationId,
    ev.contextMessageId,
  );

  const attachments: Array<Record<string, unknown>> = [];
  if (ev.media) {
    try {
      const cached = await fetchAndCacheMedia(provider, ev.media.externalMediaId, account);
      attachments.push({
        storage_bucket: "attachments",
        storage_path: cached.storagePath,
        mime_type: cached.mimeType,
        size_bytes: cached.sizeBytes,
        file_name: ev.media.filename ?? null,
      });
    } catch (err) {
      await log({
        workspaceId: account.workspaceId,
        channelAccountId: account.id,
        provider,
        level: "error",
        scope: "media",
        message: "media fetch failed",
        data: { external_media_id: ev.media.externalMediaId, error: String(err) },
        correlationId,
      });
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("messages" as never)
    .insert({
      workspace_id: account.workspaceId,
      conversation_id: conversationId,
      external_message_id: ev.externalMessageId,
      reply_to_id: replyToId,
      provider,
      direction: isOutboundEcho ? "outbound" : "inbound",
      message_type: ev.type === "unknown" ? "text" : ev.type,
      body: ev.text ?? null,
      status: "delivered",
      media_type: attachments[0]?.mime_type ?? null,
      media_size: attachments[0]?.size_bytes ?? null,
      metadata: {
        location: ev.location,
        context_message_id: ev.contextMessageId,
        raw: ev.raw,
        media_path: attachments[0]?.storage_path ?? null,
        media_name: attachments[0]?.file_name ?? null,
        // Marks this row as sent from the agent's phone (WhatsApp app/Web),
        // not from WACRM — so the UI can label it distinctly from a reply
        // sent through the composer.
        source: isOutboundEcho ? "whatsapp_app_coexistence" : undefined,
      },
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const messageId = (inserted as { id: string }).id;

  for (const att of attachments) {
    const { error: attErr } = await sbAny(supabaseAdmin)
      .from("message_attachments" as never)
      .insert({
        workspace_id: account.workspaceId,
        message_id: messageId,
        ...att,
      } as never);
    if (attErr) {
      await log({
        workspaceId: account.workspaceId,
        channelAccountId: account.id,
        provider,
        level: "error",
        scope: "media",
        message: "attachment row insert failed",
        data: { message_id: messageId, error: attErr.message },
        correlationId,
      });
    }
  }

  // Without these the thread has no `last_message_at`, so it sorts to the
  // bottom of the Inbox list. unread_count is bumped by the insert trigger
  // only; incrementing it here too double-counted every inbound message.
  const preview =
    ev.text?.slice(0, 200) ??
    (ev.type && ev.type !== "text" && ev.type !== "unknown" ? `[${ev.type}]` : null);
  await supabaseAdmin
    .from("conversations" as never)
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_from: isOutboundEcho ? "agent" : "contact",
      status: "open",
    } as never)
    .eq("id", conversationId);

  // An echo is the agent's own reply, sent from their phone — never trigger
  // the chatbot on it, or it would answer the agent instead of the customer.
  if (!isOutboundEcho && ev.type === "text" && ev.text?.trim()) {
    try {
      await runWhatsAppChatbot({ provider, account, ev, conversationId, contactId });
    } catch (err) {
      console.error("[whatsapp-webhook] chatbot failed:", (err as Error).message);
    }
  }
}

/** Answer an inbound WhatsApp text with the deployed bot via the outbox. */
async function runWhatsAppChatbot(args: {
  provider: ProviderName;
  account: ChannelAccountRecord;
  ev: NormalizedInboundMessage;
  conversationId: string;
  contactId: string;
}): Promise<void> {
  const { provider, account, ev, conversationId, contactId } = args;
  const { dispatchChannelBot } = await import("@/lib/chatbots/channel-dispatch.server");
  const result = await dispatchChannelBot({
    admin: supabaseAdmin,
    channel: "whatsapp",
    workspaceId: account.workspaceId,
    accountId: account.id,
    externalId: ev.from,
    userText: ev.text ?? "",
    conversationId,
    contactId,
    sessionMetadata: { channel_account_id: account.id },
  });
  if (!result?.reply) return;

  const { data: msg, error: msgErr } = await sbAny(supabaseAdmin)
    .from("messages")
    .insert({
      workspace_id: account.workspaceId,
      conversation_id: conversationId,
      provider,
      direction: "outbound",
      message_type: "text",
      body: result.reply,
      status: "queued",
      metadata: { source: "chatbot", chatbot_id: result.botId },
    })
    .select("id")
    .single();
  if (msgErr) throw msgErr;

  const { error: outErr } = await sbAny(supabaseAdmin)
    .from("message_outbox")
    .insert({
      workspace_id: account.workspaceId,
      channel_account_id: account.id,
      conversation_id: conversationId,
      message_id: (msg as { id: string }).id,
      provider,
      to_address: ev.from,
      payload: { to: ev.from, type: "text", text: { body: result.reply } },
      idempotency_key: `bot:${ev.externalMessageId}`,
      status: "queued",
    });
  if (outErr) throw outErr;
}

/**
 * Delivery states are monotonic: queued → sent → delivered → read.
 * Meta may redeliver webhooks out of order (retries, parallel workers), so an
 * older "sent" event must never overwrite a newer "delivered"/"read" state.
 * `failed` is terminal and only applies before a positive receipt.
 */
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  processing: 0,
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export function shouldApplyStatus(current: string | null | undefined, incoming: string): boolean {
  if (!current) return true;
  if (current === incoming) return true;
  if (current === "failed") return STATUS_RANK[incoming] !== undefined; // recovery receipt wins
  if (incoming === "failed") return (STATUS_RANK[current] ?? 0) < 2; // not already delivered/read
  return (STATUS_RANK[incoming] ?? -1) > (STATUS_RANK[current] ?? -1);
}

/** Keep the earliest known timestamp for a receipt column. */
function earliest(existing: unknown, incoming: string): string {
  return typeof existing === "string" && existing && existing < incoming ? existing : incoming;
}

export async function processStatusEvent(
  account: ChannelAccountRecord,
  ev: NormalizedStatusEvent,
): Promise<void> {
  const now = new Date().toISOString();

  // ---- message_outbox ----
  const { data: outboxRow } = await supabaseAdmin
    .from("message_outbox" as never)
    .select("id, status, sent_at, delivered_at, read_at")
    .eq("workspace_id", account.workspaceId)
    .eq("external_message_id", ev.externalMessageId)
    .maybeSingle();

  if (outboxRow) {
    const row = outboxRow as Record<string, unknown>;
    const advance = shouldApplyStatus(row.status as string | null, ev.status);
    const patch: Record<string, unknown> = { updated_at: now };
    if (advance) patch.status = ev.status;
    // Receipt timestamps are backfilled even when the status doesn't advance,
    // so an out-of-order "delivered" after "read" still records when delivery
    // actually happened (earliest value always wins).
    if (ev.status === "sent") patch.sent_at = earliest(row.sent_at, ev.timestamp);
    if (ev.status === "delivered") patch.delivered_at = earliest(row.delivered_at, ev.timestamp);
    if (ev.status === "read") patch.read_at = earliest(row.read_at, ev.timestamp);
    if (ev.status === "failed" && advance) {
      patch.failed_at = ev.timestamp;
      patch.last_error_code = ev.errorCode;
      patch.last_error = ev.errorMessage;
    }
    await supabaseAdmin
      .from("message_outbox" as never)
      .update(patch as never)
      .eq("id", row.id as string);
  }

  // Mirror the receipt onto the inbox message so the thread's delivery ticks
  // update in realtime (the `messages` table is in the realtime publication).
  // Inbox-sent messages store the provider id in `provider_message_id`, older
  // outbox-sent ones in `external_message_id` — match either.
  const { data: msgRows } = await supabaseAdmin
    .from("messages" as never)
    .select("id, status, delivered_at, read_at")
    .eq("workspace_id", account.workspaceId)
    .or(
      `external_message_id.eq."${ev.externalMessageId}",provider_message_id.eq."${ev.externalMessageId}"`,
    );

  for (const raw of (msgRows ?? []) as Array<Record<string, unknown>>) {
    const advance = shouldApplyStatus(raw.status as string | null, ev.status);
    const messagePatch: Record<string, unknown> = { updated_at: now };
    if (advance) messagePatch.status = ev.status;
    if (ev.status === "delivered") {
      messagePatch.delivered_at = earliest(raw.delivered_at, ev.timestamp);
    }
    if (ev.status === "read") {
      messagePatch.read_at = earliest(raw.read_at, ev.timestamp);
      messagePatch.delivered_at = earliest(raw.delivered_at, ev.timestamp);
    }
    if (ev.status === "failed" && advance) {
      messagePatch.failed_reason = [ev.errorCode, ev.errorMessage].filter(Boolean).join(": ") || "Delivery failed";
    }
    await supabaseAdmin
      .from("messages" as never)
      .update(messagePatch as never)
      .eq("id", raw.id as string);
  }
}

async function processTemplateStatus(
  account: ChannelAccountRecord,
  ev: NormalizedTemplateStatusEvent,
): Promise<void> {
  if (!ev.name) return;
  const patch: Record<string, unknown> = {
    status: (ev.status || "unknown").toLowerCase(),
    last_synced_at: new Date().toISOString(),
  };
  if (ev.category) patch.category = ev.category;
  if (ev.reason) patch.rejection_reason = ev.reason;
  if (ev.externalTemplateId) patch.external_template_id = ev.externalTemplateId;

  // Update by (channel_account_id, name, language) — unique per account.
  let q = supabaseAdmin
    .from("wa_templates" as never)
    .update(patch as never)
    .eq("channel_account_id", account.id)
    .eq("name", ev.name);
  if (ev.language) q = q.eq("language", ev.language);
  await q;
}

async function processContactUpdate(
  account: ChannelAccountRecord,
  ev: NormalizedContactUpdateEvent,
): Promise<void> {
  if (!ev.displayName) return;
  await upsertContact(account.workspaceId, ev.waId, ev.displayName);
}

async function processAccountUpdate(
  account: ChannelAccountRecord,
  ev: NormalizedAccountUpdateEvent,
): Promise<void> {
  // Load current metadata to merge.
  const { data } = await supabaseAdmin
    .from("channel_accounts" as never)
    .select("metadata, display_name, phone_number")
    .eq("id", account.id)
    .maybeSingle();
  const current = data as {
    metadata: Record<string, unknown> | null;
    display_name: string;
    phone_number: string | null;
  } | null;
  const merged = {
    ...(current?.metadata ?? {}),
    [ev.subtype]: ev.patch,
    updated_via_webhook_at: ev.timestamp,
  };

  const patch: Record<string, unknown> = { metadata: merged };
  // Best-effort surface changes to first-class columns.
  const p = ev.patch as Record<string, unknown>;
  if (
    ev.subtype === "phone_number_name_update" &&
    typeof p.decision === "string" &&
    p.decision === "APPROVED" &&
    typeof p.requested_verified_name === "string"
  ) {
    patch.display_name = p.requested_verified_name;
  }
  if (ev.subtype === "phone_number_quality_update" && typeof p.current_limit === "string") {
    // stash quality on metadata only
  }
  await supabaseAdmin
    .from("channel_accounts" as never)
    .update(patch as never)
    .eq("id", account.id);
}
