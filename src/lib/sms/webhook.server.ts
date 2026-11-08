/**
 * Inbound SMS ingestion (server-only).
 *
 * Called by `/api/public/webhooks/sms/twilio` **after** the Twilio signature
 * has been verified and the delivery has been claimed for idempotency, so this
 * module never has to worry about spoofing or duplicate processing.
 *
 * The destination number (`To`) identifies the workspace: it must match an
 * `sms_accounts` row (digits-only comparison). Unknown or disabled numbers are
 * ignored rather than creating orphan conversations. The owning account is
 * recorded in `conversations.metadata.account_id` — `channel_account_id` has a
 * FK to `channel_accounts`, which only holds WhatsApp rows.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";
import { sbAny } from "@/lib/supabase/untyped";

export interface SmsIngestResult {
  handled: boolean;
  reason?: string | null;
  conversationId?: string | null;
}

interface SmsAccountRow {
  id: string;
  workspace_id: string;
  phone_number: string | null;
  display_name: string;
  status: string;
  provider: string | null;
  account_sid: string | null;
  auth_token_ciphertext: string | null;
}

/** Digits-only comparison so +47, 0047 and 47 all match. */
function normalizePhone(value: string): string {
  return (value ?? "").replace(/\D+/g, "").replace(/^00/, "");
}

async function resolveContact(
  admin: Admin,
  workspaceId: string,
  from: string,
): Promise<string | null> {
  const { data: existingRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "sms")
    .eq("external_id", from)
    .maybeSingle();
  const existing = existingRaw as { id: string; contact_id: string | null } | null;
  if (existing?.contact_id) {
    await admin
      .from("channel_identities")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.contact_id;
  }

  const { data: contactRaw, error } = await admin
    .from("contacts")
    .insert({ workspace_id: workspaceId, name: from, phone: from, source: "sms" })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const contactId = (contactRaw as { id: string }).id;

  const identity = {
    workspace_id: workspaceId,
    contact_id: contactId,
    channel: "sms",
    external_id: from,
    display_name: from,
    last_seen_at: new Date().toISOString(),
    metadata: {},
  };
  if (existing) await sbAny(admin).from("channel_identities").update(identity).eq("id", existing.id);
  else await sbAny(admin).from("channel_identities").insert(identity);
  return contactId;
}

/**
 * Mirror one verified inbound SMS into the unified inbox.
 * `params` is the raw Twilio form payload.
 */
export async function ingestInboundSms(
  params: Record<string, string>,
): Promise<SmsIngestResult> {
  const from = params["From"] ?? "";
  const to = params["To"] ?? "";
  const body = params["Body"] ?? "";
  const sid = params["MessageSid"] ?? params["SmsSid"] ?? null;
  if (!from || !to) return { handled: false, reason: "missing From/To" };

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as Admin;

  const wanted = normalizePhone(to);
  const { data: accountRaw } = await admin
    .from("sms_accounts")
    .select("id, workspace_id, phone_number, display_name, status, provider, account_sid, auth_token_ciphertext")
    .eq("phone_digits", wanted)
    .maybeSingle();
  const account = accountRaw as SmsAccountRow | null;
  if (!account) return { handled: false, reason: `no sms account for ${to}` };
  if (account.status === "disconnected" || account.status === "suspended") {
    return { handled: false, reason: `sms account ${account.id} is ${account.status}` };
  }

  const nowIso = new Date().toISOString();
  const externalConversationId = `sms:${wanted}:${normalizePhone(from)}`;

  const contactId = await resolveContact(admin, account.workspace_id, from);
  const { conversationId } = await ensureInboxThread(admin, {
    workspaceId: account.workspace_id,
    channel: "sms",
    externalConversationId,
    accountId: account.id,
    contactId,
    inbound: true,
    preview: body,
    metadata: { source: "sms_webhook", to, from },
  });

  const numMedia = Number(params["NumMedia"] ?? "0");
  const { error: msgErr } = await sbAny(admin).from("messages").insert({
    workspace_id: account.workspace_id,
    conversation_id: conversationId,
    direction: "inbound",
    status: "delivered",
    body,
    message_type: numMedia > 0 ? "media" : "text",
    media_url: numMedia > 0 ? params["MediaUrl0"] ?? null : null,
    provider_message_id: sid,
    from_address: from,
    to_address: to,
    metadata: { source: "sms_webhook", account_id: account.id, num_media: numMedia },
  });
  if (msgErr && !String(msgErr.message ?? "").toLowerCase().includes("duplicate")) {
    throw new Error(msgErr.message);
  }

  if (body.trim()) {
    try {
      await runSmsChatbot(admin, account, { conversationId, contactId, from, to, body });
    } catch (err) {
      console.error("[sms-webhook] chatbot failed:", (err as Error).message);
    }
  }

  return { handled: true, conversationId };
}

async function runSmsChatbot(
  admin: Admin,
  account: SmsAccountRow,
  msg: { conversationId: string; contactId: string | null; from: string; to: string; body: string },
): Promise<void> {
  const { dispatchChannelBot } = await import("@/lib/chatbots/channel-dispatch.server");
  const result = await dispatchChannelBot({
    admin,
    channel: "sms",
    workspaceId: account.workspace_id,
    accountId: account.id,
    externalId: normalizePhone(msg.from),
    userText: msg.body,
    conversationId: msg.conversationId,
    contactId: msg.contactId,
    sessionMetadata: { sms_account_id: account.id, to: msg.to },
  });
  if (!result?.reply) return;

  if (account.provider !== "twilio" || !account.account_sid || !account.auth_token_ciphertext) {
    console.warn("[sms-webhook] bot reply skipped: Twilio credentials not configured");
    return;
  }

  const { sendTwilioSms } = await import("./send.server");
  const sent = await sendTwilioSms({
    accountSid: account.account_sid,
    authTokenCipher: account.auth_token_ciphertext,
    from: msg.to,
    to: msg.from,
    body: result.reply,
  });

  await sbAny(admin).from("messages").insert({
    workspace_id: account.workspace_id,
    conversation_id: msg.conversationId,
    direction: "outbound",
    status: "sent",
    body: result.reply,
    message_type: "text",
    provider_message_id: sent.messageId,
    from_address: msg.to,
    to_address: msg.from,
    metadata: { source: "chatbot", chatbot_id: result.botId, account_id: account.id },
  });
}
