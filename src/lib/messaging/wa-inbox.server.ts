/**
 * WA Chatbot conversation inbox — ingestion layer.
 *
 * Turns QR-session WhatsApp traffic (Baileys worker webhooks) into real
 * `conversations` + `messages` rows so agents can read and reply from the
 * WA Chatbot inbox, and so the bot can be paused per conversation.
 *
 * All helpers take the service-role client (`admin`) because they run from the
 * public webhook route, which has no user session. Callers are responsible for
 * having verified the webhook signature first.
 */
import { sbAny } from "@/lib/supabase/untyped";
import { findReplyTarget } from "./reply-context.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type WaInboundMessage = {
  from?: string;
  text?: string;
  contact_name?: string;
  message_id?: string;
  waba_message_id?: string;
  context_message_id?: string | null;
  type?: string;
  media_url?: string;
  media_type?: string;
  caption?: string;
  from_me?: boolean;
  timestamp?: string | number;
};

const MESSAGE_TYPES = new Set([
  "text",
  "image",
  "video",
  "audio",
  "document",
  "location",
  "contact",
  "template",
  "sticker",
  "system",
  "interactive",
]);

function normalizeType(type?: string): string {
  const t = (type ?? "text").toLowerCase();
  return MESSAGE_TYPES.has(t) ? t : "text";
}

/** Digits-only phone key; WhatsApp JIDs arrive as `4712345678@s.whatsapp.net`. */
export function normalizeWaAddress(raw: string): string {
  const base = raw.split("@")[0] ?? raw;
  const digits = base.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : base;
}

function previewOf(msg: WaInboundMessage): string {
  if (msg.text) return msg.text.slice(0, 160);
  if (msg.caption) return msg.caption.slice(0, 160);
  const t = normalizeType(msg.type);
  return t === "text" ? "" : `[${t}]`;
}

async function upsertContact(
  db: any,
  workspaceId: string,
  phone: string,
  displayName?: string,
): Promise<string | null> {
  const { findContactByPhone } = await import("./phone-matching");
  const existing = await findContactByPhone(db, workspaceId, phone);
  if (existing) return existing.id;

  const { data, error } = await db
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      display_name: displayName || phone,
      phone,
    })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

/**
 * Finds (or creates) the conversation that carries a QR session thread with
 * one contact. Threads are keyed by `metadata.wa_session_id` so two instances
 * talking to the same contact stay separate.
 */
export async function resolveWaConversation(
  db: any,
  opts: {
    workspaceId: string;
    sessionId: string;
    phone: string;
    contactName?: string;
  },
): Promise<{ conversationId: string; contactId: string; botPaused: boolean } | null> {
  const contactId = await upsertContact(db, opts.workspaceId, opts.phone, opts.contactName);
  if (!contactId) return null;

  const { data: existing } = await db
    .from("conversations")
    .select("id, metadata")
    .eq("workspace_id", opts.workspaceId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .contains("metadata", { wa_session_id: opts.sessionId })
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    return {
      conversationId: existing.id as string,
      contactId,
      botPaused: meta.wa_bot_paused === true,
    };
  }

  const { data: inbox } = await db
    .from("inboxes")
    .select("id")
    .eq("workspace_id", opts.workspaceId)
    .eq("channel", "whatsapp")
    .limit(1)
    .maybeSingle();

  const { data: inserted, error } = await db
    .from("conversations")
    .insert({
      workspace_id: opts.workspaceId,
      contact_id: contactId,
      inbox_id: (inbox as { id: string } | null)?.id ?? null,
      channel: "whatsapp",
      status: "open",
      priority: "normal",
      metadata: { wa_session_id: opts.sessionId, source: "wa_qr" },
    })
    .select("id")
    .single();
  if (error) return null;

  return {
    conversationId: (inserted as { id: string }).id,
    contactId,
    botPaused: false,
  };
}

async function touchConversation(db: any, conversationId: string, patch: Record<string, unknown>) {
  await sbAny(db).from("conversations").update(patch).eq("id", conversationId);
}

/**
 * Persists an inbound QR message as a conversation message.
 * Returns the conversation id plus whether the bot is paused for that thread.
 */
export async function ingestInboundWaMessage(
  db: any,
  sessionId: string,
  msg: WaInboundMessage,
): Promise<{ conversationId: string; botPaused: boolean } | null> {
  const rawFrom = msg.from?.trim();
  if (!rawFrom || msg.from_me) return null;

  const { data: session } = await db
    .from("whatsapp_qr_sessions")
    .select("id, workspace_id, phone_number")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.workspace_id) return null;

  const phone = normalizeWaAddress(rawFrom);
  const resolved = await resolveWaConversation(db, {
    workspaceId: session.workspace_id,
    sessionId,
    phone,
    contactName: msg.contact_name,
  });
  if (!resolved) return null;

  // Idempotency — the same WhatsApp message id must never double-insert.
  const providerMessageId = msg.message_id ?? msg.waba_message_id ?? null;
  if (providerMessageId) {
    const { data: dup } = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", resolved.conversationId)
      .eq("external_message_id", providerMessageId)
      .maybeSingle();
    if (dup) return { conversationId: resolved.conversationId, botPaused: resolved.botPaused };
  }

  const body = msg.text ?? msg.caption ?? null;
  const replyToId = await findReplyTarget(
    db, session.workspace_id, resolved.conversationId, msg.context_message_id,
  );
  const { error } = await sbAny(db)
    .from("messages")
    .insert({
      workspace_id: session.workspace_id,
      conversation_id: resolved.conversationId,
      direction: "inbound",
      message_type: normalizeType(msg.type),
      status: "delivered",
      body,
      media_url: msg.media_url ?? null,
      media_type: msg.media_type ?? null,
      from_address: phone,
      to_address: session.phone_number ?? null,
      external_message_id: providerMessageId,
      reply_to_id: replyToId,
      delivered_at: new Date().toISOString(),
      metadata: { wa_session_id: sessionId, source: "wa_qr", context_message_id: msg.context_message_id ?? null },
    });
  if (error) return { conversationId: resolved.conversationId, botPaused: resolved.botPaused };

  // unread_count is owned by the insert trigger; do not bump it here.
  await touchConversation(db, resolved.conversationId, {
    last_message_at: new Date().toISOString(),
    last_message_preview: previewOf(msg),
    last_message_from: "contact",
    status: "open",
  });

  return { conversationId: resolved.conversationId, botPaused: resolved.botPaused };
}

/** Records an outbound WhatsApp message (bot auto-reply or agent reply). */
export async function recordOutboundWaMessage(
  db: any,
  opts: {
    workspaceId: string;
    conversationId: string;
    to: string;
    body?: string | null;
    messageType?: string;
    mediaUrl?: string | null;
    providerMessageId?: string | null;
    sentBy?: string | null;
    isBot?: boolean;
    status?: "queued" | "sent" | "failed";
    failedReason?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .insert({
      workspace_id: opts.workspaceId,
      conversation_id: opts.conversationId,
      direction: "outbound",
      message_type: normalizeType(opts.messageType),
      status: opts.status ?? "sent",
      body: opts.body ?? null,
      media_url: opts.mediaUrl ?? null,
      to_address: normalizeWaAddress(opts.to),
      sent_by: opts.sentBy ?? null,
      provider_message_id: opts.providerMessageId ?? null,
      failed_reason: opts.failedReason ?? null,
      metadata: { source: opts.isBot ? "wa_bot" : "wa_agent" },
    })
    .select("id")
    .single();
  if (error) return null;

  await touchConversation(db, opts.conversationId, {
    last_message_at: new Date().toISOString(),
    last_message_preview: (opts.body ?? `[${normalizeType(opts.messageType)}]`).slice(0, 160),
    last_message_from: opts.isBot ? "bot" : "agent",
  });

  return (data as { id: string }).id;
}

/** Applies a worker delivery/read receipt to a previously sent message. */
export async function applyWaMessageStatus(
  db: any,
  workspaceId: string,
  data: { message_id?: string; waba_message_id?: string; status?: string; error?: string },
): Promise<void> {
  const providerId = data.message_id ?? data.waba_message_id;
  if (!providerId) return;
  const status = (data.status ?? "").toLowerCase();
  const patch: Record<string, unknown> = {};
  if (status === "delivered") {
    patch.status = "delivered";
    patch.delivered_at = new Date().toISOString();
  } else if (status === "read") {
    patch.status = "read";
    patch.read_at = new Date().toISOString();
  } else if (status === "failed" || status === "error") {
    patch.status = "failed";
    patch.failed_reason = data.error ?? "Delivery failed";
  } else if (status === "sent") {
    patch.status = "sent";
  }
  if (Object.keys(patch).length === 0) return;
  await sbAny(db)
    .from("messages")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("provider_message_id", providerId);
}
