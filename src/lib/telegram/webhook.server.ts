/**
 * Telegram webhook processing — server-only.
 *
 * Telegram posts every update to a per-account URL:
 *   POST /api/public/webhooks/telegram/<accountId>
 * authenticated with the `X-Telegram-Bot-Api-Secret-Token` header, which must
 * match `telegram_accounts.webhook_secret` for that row.
 *
 * Inbound updates are normalised into the omnichannel inbox tables
 * (`contacts`, `channel_identities`, `conversations`, `messages`) exactly the
 * way the Messenger/Instagram ingest paths do, so the Inbox UI needs no
 * channel-specific handling.
 */
import { timingSafeEqual } from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = { from: (t: string) => any };

interface TelegramAccountRow {
  id: string;
  workspace_id: string;
  bot_id: string;
  bot_username: string | null;
  webhook_secret: string;
  status: string;
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

async function logEvent(admin: Admin, row: Record<string, unknown>): Promise<void> {
  try {
    await sbAny(admin).from("telegram_webhook_events").insert(row);
  } catch (err) {
    console.warn("[telegram-webhook] event log insert failed:", err);
  }
}

import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";
import { sbAny } from "@/lib/supabase/untyped";

export async function handleTelegramWebhook(
  accountId: string,
  request: Request,
  rawBody: string,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
    return new Response("not found", { status: 404 });
  }

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as Admin;
  const { data: acctRaw } = await supabaseAdmin
    .from("telegram_accounts" as never)
    .select("id, workspace_id, bot_id, bot_username, webhook_secret, status")
    .eq("id", accountId)
    .maybeSingle();
  const account = acctRaw as unknown as TelegramAccountRow | null;
  if (!account) return new Response("not found", { status: 404 });

  const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const verified = safeEq(provided, account.webhook_secret);
  if (!verified) {
    await logEvent(admin, {
      workspace_id: account.workspace_id,
      account_id: account.id,
      verified: false,
      status: "unauthorized",
      error_message: "Secret token mismatch on X-Telegram-Bot-Api-Secret-Token",
      payload: {},
    });
    return new Response("invalid secret token", { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await logEvent(admin, {
      workspace_id: account.workspace_id,
      account_id: account.id,
      verified: true,
      status: "failed",
      error_message: "Invalid JSON body",
      payload: { raw: rawBody.slice(0, 4000) },
    });
    return new Response("invalid json", { status: 400 });
  }

  const updateId = typeof update.update_id === "number" ? update.update_id : null;

  const { claimWebhookDelivery, completeWebhookDelivery } =
    await import("@/lib/webhooks/idempotency.server");

  // Telegram redelivers an update until it receives a 2xx; `update_id` is
  // unique per bot, so it is the natural idempotency key.
  const claim = await claimWebhookDelivery({
    provider: "telegram",
    deliveryKey: `${account.id}:${updateId ?? `raw:${rawBody.length}:${Date.now()}`}`,
    workspaceId: account.workspace_id,
    payload: update,
  });
  if (!claim.fresh) return Response.json({ ok: true, duplicate: true });

  let status = "processed";
  let errorMessage: string | null = null;
  try {
    const handled = await processUpdate(admin, account, update);
    if (!handled) status = "ignored";
  } catch (err) {
    // Telegram retries on non-2xx; log and ack so a poison update can't loop.
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[telegram-webhook] processing error:", err);
  }

  await completeWebhookDelivery(
    claim.id,
    status as "processed" | "ignored" | "failed",
    errorMessage,
  );

  await logEvent(admin, {
    workspace_id: account.workspace_id,
    account_id: account.id,
    update_id: updateId,
    verified: true,
    status,
    error_message: errorMessage,
    payload: update,
  });

  return Response.json({ ok: true });
}

/**
 * A customer tapping an emoji on a message arrives as its own update type,
 * not a `message`, and was previously dropped entirely — both because
 * `message_reaction` wasn't in `setWebhook`'s `allowed_updates` (see
 * accounts.functions.ts) and because nothing here looked for it. Mirrors
 * WhatsApp's `applyInboundReaction`: folded into the target message's
 * `metadata.reactions`, keyed by the reacting user, rather than stored as a
 * message of its own.
 */
async function applyTelegramReaction(
  admin: Admin,
  account: TelegramAccountRow,
  reactionUpdate: Record<string, unknown>,
): Promise<boolean> {
  const chat = (reactionUpdate.chat as Record<string, unknown> | undefined) ?? {};
  const chatId = chat.id != null ? String(chat.id) : "";
  const messageId = reactionUpdate.message_id != null ? String(reactionUpdate.message_id) : "";
  if (!chatId || !messageId) return false;

  const user = reactionUpdate.user as Record<string, unknown> | undefined;
  const actorChat = reactionUpdate.actor_chat as Record<string, unknown> | undefined;
  const userKey =
    user?.id != null ? String(user.id) : actorChat?.id != null ? String(actorChat.id) : null;
  if (!userKey) return false;

  const newReactions =
    (reactionUpdate.new_reaction as Array<Record<string, unknown>> | undefined) ?? [];
  const emojis = newReactions
    .map((r) => (r.type === "emoji" ? (r.emoji as string | undefined) : undefined))
    .filter((e): e is string => !!e);

  const externalConversationId = `tg:${account.bot_id}:${chatId}`;
  const { data: convRaw } = await admin
    .from("conversations")
    .select("id")
    .eq("workspace_id", account.workspace_id)
    .eq("external_conversation_id", externalConversationId)
    .maybeSingle();
  const conversationId = (convRaw as { id: string } | null)?.id;
  if (!conversationId) return false;

  const { data: msgRaw } = await admin
    .from("messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .eq("provider_message_id", messageId)
    .maybeSingle();
  const target = msgRaw as { id: string; metadata: Record<string, unknown> | null } | null;
  if (!target) return false;

  const reactions: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(
    (target.metadata?.reactions as Record<string, string[]> | undefined) ?? {},
  )) {
    const rest = users.filter((u) => u !== userKey);
    if (rest.length > 0) reactions[emoji] = rest;
  }
  for (const emoji of emojis) {
    reactions[emoji] = [...(reactions[emoji] ?? []), userKey];
  }

  await admin
    .from("messages")
    .update({ metadata: { ...(target.metadata ?? {}), reactions } })
    .eq("id", target.id);
  return true;
}

export async function processUpdate(
  admin: Admin,
  account: TelegramAccountRow,
  update: Record<string, unknown>,
): Promise<boolean> {
  const reactionUpdate = update.message_reaction as Record<string, unknown> | undefined;
  if (reactionUpdate) return applyTelegramReaction(admin, account, reactionUpdate);

  const message =
    (update.message as Record<string, unknown> | undefined) ??
    (update.edited_message as Record<string, unknown> | undefined) ??
    (update.channel_post as Record<string, unknown> | undefined);
  if (!message) return false;

  const chat = (message.chat as Record<string, unknown> | undefined) ?? {};
  const from = (message.from as Record<string, unknown> | undefined) ?? {};
  const chatId = chat.id != null ? String(chat.id) : "";
  if (!chatId) return false;

  const providerMessageId = message.message_id != null ? String(message.message_id) : null;
  const timestamp = typeof message.date === "number" ? message.date * 1000 : Date.now();
  const nowIso = new Date(timestamp).toISOString();

  const displayName =
    [from.first_name, from.last_name].filter(Boolean).join(" ").trim() ||
    (typeof from.username === "string" ? `@${from.username}` : null) ||
    (typeof chat.title === "string" ? chat.title : null);

  const { text, mediaType } = extractContent(message);
  const preview = text ? text.slice(0, 240) : mediaType ? `[${mediaType}]` : "";

  const contactId = await resolveContact(admin, account.workspace_id, chatId, {
    displayName: displayName ?? null,
    username: typeof from.username === "string" ? from.username : null,
  });

  const externalConversationId = `tg:${account.bot_id}:${chatId}`;

  const { conversationId } = await ensureInboxThread(admin, {
    workspaceId: account.workspace_id,
    channel: "telegram",
    externalConversationId,
    accountId: account.id,
    contactId,
    inbound: true,
    preview,
    metadata: {
      source: "telegram_webhook",
      bot_id: account.bot_id,
      bot_username: account.bot_username,
      chat_id: chatId,
      chat_type: chat.type ?? null,
    },
  });

  if (providerMessageId) {
    const { data: dupe } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    if (dupe) return true;
  }

  const { error: msgErr } = await sbAny(admin)
    .from("messages")
    .insert({
      workspace_id: account.workspace_id,
      conversation_id: conversationId,
      direction: "inbound",
      status: "delivered",
      body: text,
      media_type: mediaType,
      message_type: mediaType ? "media" : "text",
      provider_message_id: providerMessageId,
      from_address: chatId,
      to_address: account.bot_id,
      created_at: nowIso,
      metadata: { source: "telegram_webhook", payload: update },
    });
  if (
    msgErr &&
    !String(msgErr.message ?? "")
      .toLowerCase()
      .includes("duplicate")
  ) {
    console.warn("[telegram-webhook] message insert failed:", msgErr.message);
  }

  if (text.trim() && from.is_bot !== true && chat.type === "private") {
    try {
      await runTelegramChatbot(admin, account, { conversationId, contactId, chatId, text });
    } catch (err) {
      console.error("[telegram-webhook] chatbot failed:", (err as Error).message);
    }
  }
  return true;
}

async function runTelegramChatbot(
  admin: Admin,
  account: TelegramAccountRow,
  msg: { conversationId: string; contactId: string; chatId: string; text: string },
): Promise<void> {
  const { dispatchChannelBot } = await import("@/lib/chatbots/channel-dispatch.server");
  const result = await dispatchChannelBot({
    admin,
    channel: "telegram",
    workspaceId: account.workspace_id,
    accountId: account.id,
    externalId: msg.chatId,
    userText: msg.text,
    conversationId: msg.conversationId,
    contactId: msg.contactId,
    sessionMetadata: { telegram_account_id: account.id, bot_username: account.bot_username },
  });
  if (!result?.reply) return;

  const { data: secretRaw } = await admin
    .from("telegram_accounts")
    .select("bot_token_ciphertext")
    .eq("id", account.id)
    .maybeSingle();
  const cipher = (secretRaw as { bot_token_ciphertext: string | null } | null)
    ?.bot_token_ciphertext;
  if (!cipher) {
    console.warn("[telegram-webhook] no bot token; skipping auto-reply");
    return;
  }

  const { sendTelegramMessage } = await import("./send.server");
  const sent = await sendTelegramMessage({
    botTokenCipher: cipher,
    chatId: msg.chatId,
    text: result.reply,
  });

  await sbAny(admin)
    .from("messages")
    .insert({
      workspace_id: account.workspace_id,
      conversation_id: msg.conversationId,
      direction: "outbound",
      status: "sent",
      body: result.reply,
      message_type: "text",
      provider_message_id: sent.messageId,
      from_address: account.bot_id,
      to_address: msg.chatId,
      metadata: { source: "chatbot", chatbot_id: result.botId },
    });
}

function extractContent(message: Record<string, unknown>): {
  text: string;
  mediaType: string | null;
} {
  const text =
    (typeof message.text === "string" && message.text) ||
    (typeof message.caption === "string" && message.caption) ||
    "";
  let mediaType: string | null = null;
  if (message.photo) mediaType = "image";
  else if (message.video) mediaType = "video";
  else if (message.voice) mediaType = "voice";
  else if (message.audio) mediaType = "audio";
  else if (message.document) mediaType = "document";
  else if (message.sticker) mediaType = "sticker";
  else if (message.location) mediaType = "location";
  else if (message.contact) mediaType = "contact";
  return { text, mediaType };
}

async function resolveContact(
  admin: Admin,
  workspaceId: string,
  externalId: string,
  meta: { displayName: string | null; username: string | null },
): Promise<string> {
  const { data: existingIdRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "telegram")
    .eq("external_id", externalId)
    .maybeSingle();
  const existingId = existingIdRaw as { id: string; contact_id: string | null } | null;

  if (existingId?.contact_id) {
    await admin
      .from("channel_identities")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existingId.id);
    return existingId.contact_id;
  }

  const { data: contactRaw, error: cErr } = await admin
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name: meta.displayName ?? `Telegram user ${externalId.slice(-6)}`,
      display_name: meta.displayName,
      source: "telegram",
    })
    .select("id")
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  const contactId = (contactRaw as { id: string }).id;

  const identity = {
    workspace_id: workspaceId,
    contact_id: contactId,
    channel: "telegram",
    external_id: externalId,
    display_name: meta.displayName,
    last_seen_at: new Date().toISOString(),
    metadata: meta.username ? { username: meta.username } : {},
  };
  if (existingId) {
    await sbAny(admin).from("channel_identities").update(identity).eq("id", existingId.id);
  } else {
    await sbAny(admin).from("channel_identities").insert(identity);
  }
  return contactId;
}
