/**
 * Inbound email webhook (server-only).
 *
 *   POST /api/public/webhooks/email/<accountId>?token=<webhook_secret>
 *
 * Accepts Resend received-email events, Postmark inbound JSON, and Mailgun
 * form posts, then stores the message in the omnichannel inbox.
 * A deployed chatbot then answers through Resend. Automated mail (bounces,
 * auto-replies, mailing lists, our own address) is stored but never answered,
 * so two auto-responders cannot loop.
 */
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { decryptToken } from "@/lib/instagram/token-crypto.server";
import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";
import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export interface EmailAccountRow {
  id: string;
  workspace_id: string;
  provider: string;
  display_name: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  status: string;
  webhook_secret: string | null;
  api_key_ciphertext: string | null;
}

export interface ParsedInboundEmail {
  from: string;
  fromName: string | null;
  to: string | null;
  subject: string;
  text: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  automated: boolean;
  attachments: InboundAttachment[];
}

export interface InboundAttachment {
  name: string;
  contentType: string;
  /** base64, as Postmark delivers it */
  content: string;
  contentId: string | null;
}

const MAX_BODY = 20_000;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const RESEND_API = "https://api.resend.com";

/** Postmark's `Attachments` array (inline images included, with a ContentID). */
function attachmentsFromPostmark(list: unknown): InboundAttachment[] {
  if (!Array.isArray(list)) return [];
  const out: InboundAttachment[] = [];
  for (const a of list as Array<Record<string, unknown>>) {
    const content = str(a?.Content);
    if (!content) continue;
    out.push({
      name: str(a?.Name) || "attachment",
      contentType: str(a?.ContentType) || "application/octet-stream",
      content,
      contentId: str(a?.ContentID) || null,
    });
  }
  return out.slice(0, MAX_ATTACHMENTS);
}

function messageTypeFor(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Gmail's plain-text part writes "[image: name.jpg]" where an inline image
 * sat. Once the image itself is stored, the placeholder is noise.
 */
function stripImagePlaceholders(text: string, names: string[]): string {
  if (!names.length) return text;
  const known = new Set(names.map((n) => n.toLowerCase()));
  return text
    .replace(/\[image:\s*([^\]]+)\]/gi, (whole, name: string) =>
      known.has(name.trim().toLowerCase()) ? "" : whole,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const MAX_BOT_INPUT = 4_000;

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** "Ann <ann@x.com>" -> { email, name } */
export function parseAddress(raw: string): { email: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : raw).trim().toLowerCase();
  const name = m ? m[1].trim() || null : null;
  return { email, name };
}

const AUTOMATED_LOCAL =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[s]?|notifications?)([+.\-_].*)?$/i;

export function isAutomatedMail(args: {
  from: string;
  ownAddress: string;
  headers: Record<string, string>;
}): boolean {
  const h = args.headers;
  const autoSubmitted = (h["auto-submitted"] ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test((h["precedence"] ?? "").trim())) return true;
  if (h["x-auto-response-suppress"]) return true;
  if (h["list-id"] || h["list-unsubscribe"]) return true;
  if (args.from === args.ownAddress.toLowerCase()) return true;
  const local = args.from.split("@")[0] ?? "";
  return AUTOMATED_LOCAL.test(local);
}

function headersFromPostmark(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(list)) {
    for (const h of list as Array<{ Name?: unknown; Value?: unknown }>) {
      if (typeof h?.Name === "string") out[h.Name.toLowerCase()] = str(h.Value);
    }
  }
  return out;
}

function headersFromMailgun(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const arr = JSON.parse(raw) as Array<[string, string]>;
    for (const [k, v] of arr) out[String(k).toLowerCase()] = String(v);
  } catch {
    /* optional header dump */
  }
  return out;
}

/** Normalise a Postmark JSON object or a Mailgun form (as a plain record). */
export function parseInboundEmail(
  payload: Record<string, unknown>,
  ownAddress: string,
): ParsedInboundEmail | null {
  const isMailgun = "sender" in payload || "body-plain" in payload;
  let from: string;
  let fromName: string | null;
  let headers: Record<string, string>;
  let text: string;
  let subject: string;
  let messageId: string;
  let to: string;
  // Mailgun only includes files in multipart posts, which are not accepted here.
  let attachments: InboundAttachment[] = [];

  if (isMailgun) {
    const addr = parseAddress(str(payload["From"]) || str(payload["sender"]));
    from = addr.email;
    fromName = addr.name;
    headers = headersFromMailgun(str(payload["message-headers"]));
    text = str(payload["stripped-text"]) || str(payload["body-plain"]);
    subject = str(payload["subject"]) || str(payload["Subject"]);
    messageId = str(payload["Message-Id"]) || headers["message-id"] || "";
    to = str(payload["recipient"]) || str(payload["To"]);
    headers["in-reply-to"] ||= str(payload["In-Reply-To"]);
    headers["references"] ||= str(payload["References"]);
  } else {
    const full = (payload["FromFull"] ?? {}) as { Email?: unknown; Name?: unknown };
    const addr = parseAddress(str(full.Email) || str(payload["From"]));
    from = addr.email;
    fromName = str(full.Name).trim() || addr.name;
    headers = headersFromPostmark(payload["Headers"]);
    text = str(payload["StrippedTextReply"]) || str(payload["TextBody"]);
    subject = str(payload["Subject"]);
    messageId = str(payload["MessageID"]) || headers["message-id"] || "";
    to = str(payload["OriginalRecipient"]) || str(payload["To"]);
    attachments = attachmentsFromPostmark(payload["Attachments"]);
  }

  if (!from || !from.includes("@")) return null;
  text = text.trim().slice(0, MAX_BODY);
  return {
    from,
    fromName,
    to: to ? parseAddress(to).email : null,
    subject: subject.trim().slice(0, 300),
    text,
    messageId: messageId.trim() || null,
    inReplyTo: headers["in-reply-to"]?.trim() || null,
    references: headers["references"]?.trim() || null,
    automated: isAutomatedMail({ from, ownAddress, headers }),
    attachments,
  };
}

async function readPayload(
  request: Request,
  rawBody: string,
): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return JSON.parse(rawBody) as Record<string, unknown>;
    if (type.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(rawBody).entries());
    }
  } catch {
    return null;
  }
  return null;
}

/** Resend's webhook is metadata only; fetch the actual body before ingestion. */
export async function resolveResendInboundPayload(
  event: Record<string, unknown>,
  apiKeyCipher: string,
): Promise<Record<string, unknown> | null> {
  if (event.type !== "email.received") return null;
  const data = event.data as Record<string, unknown> | null;
  const emailId = str(data?.email_id);
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) throw new Error("Resend event has no valid email ID");
  const authHeaders = { Authorization: `Bearer ${decryptToken(apiKeyCipher)}` };
  const response = await fetch(`${RESEND_API}/emails/receiving/${emailId}`, {
    headers: authHeaders,
  });
  if (!response.ok) throw new Error(`Resend received-email retrieval failed (${response.status})`);
  const mail = (await response.json()) as Record<string, unknown>;
  const attachmentsResponse = await fetch(
    `${RESEND_API}/emails/receiving/${emailId}/attachments?limit=${MAX_ATTACHMENTS}`,
    { headers: authHeaders },
  );
  if (!attachmentsResponse.ok) {
    throw new Error(`Resend attachment listing failed (${attachmentsResponse.status})`);
  }
  const listing = (await attachmentsResponse.json()) as Record<string, unknown>;
  if (!Array.isArray(listing.data)) throw new Error("Invalid Resend attachment listing");
  const attachments: InboundAttachment[] = [];
  for (const item of listing.data.slice(0, MAX_ATTACHMENTS) as Record<string, unknown>[]) {
    const size = item.size;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
      throw new Error("Invalid Resend attachment size");
    }
    if (size === 0 || size > MAX_ATTACHMENT_BYTES) continue;
    const downloadUrl = str(item.download_url);
    const url = new URL(downloadUrl);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      isIP(url.hostname) !== 0 || url.hostname === "localhost" || url.hostname.endsWith(".localhost")
    ) {
      throw new Error("Invalid Resend attachment download URL");
    }
    const download = await fetch(url, { redirect: "error" });
    if (!download.ok || !download.body) {
      throw new Error(`Resend attachment download failed (${download.status})`);
    }
    const reader = download.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ATTACHMENT_BYTES) throw new Error("Resend attachment exceeds size limit");
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    attachments.push({
      name: str(item.filename) || "attachment",
      contentType: str(item.content_type) || "application/octet-stream",
      content: Buffer.concat(chunks, total).toString("base64"),
      contentId: str(item.content_id) || null,
    });
  }
  const headers = mail.headers && typeof mail.headers === "object" && !Array.isArray(mail.headers)
    ? Object.entries(mail.headers as Record<string, unknown>).map(([Name, Value]) => ({ Name, Value: str(Value) }))
    : [];
  return {
    From: str(mail.from),
    To: Array.isArray(mail.to) ? str(mail.to[0]) : "",
    Subject: str(mail.subject),
    TextBody: str(mail.text),
    MessageID: str(mail.message_id) || emailId,
    Headers: headers,
    Attachments: attachments.map((att) => ({
      Name: att.name,
      ContentType: att.contentType,
      Content: att.content,
      ContentID: att.contentId,
    })),
  };
}

export async function handleEmailWebhook(
  accountId: string,
  request: Request,
  rawBody: string,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return new Response("not found", { status: 404 });

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as Admin;
  const { data: acctRaw } = await admin
    .from("email_accounts")
    .select(
      "id, workspace_id, provider, display_name, from_email, from_name, reply_to, status, webhook_secret, api_key_ciphertext",
    )
    .eq("id", accountId)
    .maybeSingle();
  const account = acctRaw as EmailAccountRow | null;
  if (!account) return new Response("not found", { status: 404 });

  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? request.headers.get("x-webhook-secret") ?? "";
  if (!account.webhook_secret || !safeEq(provided, account.webhook_secret)) {
    return new Response("invalid token", { status: 401 });
  }
  if (account.status === "disconnected" || account.status === "suspended") {
    return Response.json({ ok: true, ignored: `account ${account.status}` });
  }

  const payload = await readPayload(request, rawBody);
  if (!payload) return new Response("unsupported payload", { status: 400 });

  try {
    const inbound = account.provider === "resend" && payload.type === "email.received"
      ? await resolveResendInboundPayload(payload, account.api_key_ciphertext ?? "")
      : payload;
    if (inbound) await processInboundEmail(admin, account, inbound);
  } catch (err) {
    // Resend retries non-2xx deliveries; preserve the event if its body could
    // not be fetched or persisted. Other webhook formats keep legacy handling.
    console.error("[email-webhook] processing error:", (err as Error).message);
    if (account.provider === "resend") return new Response("inbound processing failed", { status: 503 });
  }
  return Response.json({ ok: true });
}

export async function processInboundEmail(
  admin: Admin,
  account: EmailAccountRow,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const mail = parseInboundEmail(payload, account.from_email);
  if (!mail) return false;

  let existingMessage = false;
  if (mail.messageId) {
    const { data: dupe } = await admin
      .from("messages")
      .select("id")
      .eq("workspace_id", account.workspace_id)
      .eq("provider_message_id", mail.messageId)
      .maybeSingle();
    existingMessage = Boolean(dupe);
    if (existingMessage && account.provider !== "resend") return true;
  }

  const contactId = await resolveContact(admin, account.workspace_id, mail.from, mail.fromName);
  const preview = mail.subject || mail.text.slice(0, 120);
  const { conversationId } = await ensureInboxThread(admin, {
    workspaceId: account.workspace_id,
    channel: "email",
    externalConversationId: `email:${account.id}:${mail.from}`,
    accountId: account.id,
    contactId,
    inbound: true,
    preview,
    metadata: {
      source: "email_webhook",
      from: mail.from,
      last_subject: mail.subject,
      last_message_id: mail.messageId,
      last_references: mail.references,
    },
  });

  const baseMeta = { source: "email_webhook", subject: mail.subject, automated: mail.automated };
  const body = stripImagePlaceholders(
    mail.text,
    mail.attachments.map((a) => a.name),
  );
  // An attachment-only mail needs no empty text bubble.
  if (!existingMessage && (body || !mail.attachments.length)) {
    const { error: msgErr } = await sbAny(admin)
      .from("messages")
      .insert({
        workspace_id: account.workspace_id,
        conversation_id: conversationId,
        direction: "inbound",
        status: "delivered",
        body: body || mail.text,
        message_type: "text",
        provider_message_id: mail.messageId,
        from_address: mail.from,
        to_address: mail.to ?? account.from_email,
        metadata: baseMeta,
      });
    if (
      msgErr &&
      !String(msgErr.message ?? "")
        .toLowerCase()
        .includes("duplicate")
    ) {
      throw new Error(msgErr.message);
    }
  }

  // Each file becomes its own media message, rendered like WhatsApp media.
  for (const [i, att] of mail.attachments.entries()) {
    try {
      const attachmentMessageId = mail.messageId
        ? body || i > 0 ? `${mail.messageId}#att${i}` : mail.messageId
        : null;
      if (existingMessage && attachmentMessageId) {
        const { data: existingAttachment, error: lookupError } = await admin
          .from("messages")
          .select("id")
          .eq("workspace_id", account.workspace_id)
          .eq("provider_message_id", attachmentMessageId)
          .maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        if (existingAttachment) continue;
      }
      const bytes = Buffer.from(att.content, "base64");
      if (!bytes.byteLength || bytes.byteLength > MAX_ATTACHMENT_BYTES) continue;
      const safe = att.name.replace(/[^\w.\-]/g, "_").slice(-120);
      const path = `${account.workspace_id}/email-media/${crypto.randomUUID()}-${safe}`;
      const up = await admin.storage
        .from("attachments")
        .upload(path, bytes, { contentType: att.contentType, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const { error: attachmentError } = await sbAny(admin)
        .from("messages")
        .insert({
          workspace_id: account.workspace_id,
          conversation_id: conversationId,
          direction: "inbound",
          status: "delivered",
          body: null,
          message_type: messageTypeFor(att.contentType),
          media_type: att.contentType,
          media_size: bytes.byteLength,
          // The first row keeps the bare id so the duplicate check still matches.
          provider_message_id: attachmentMessageId,
          from_address: mail.from,
          to_address: mail.to ?? account.from_email,
          metadata: { ...baseMeta, media_path: path, media_name: att.name },
        });
      if (attachmentError) throw new Error(attachmentError.message);
    } catch (err) {
      console.error("[email-webhook] attachment failed:", (err as Error).message);
      if (account.provider === "resend") throw err;
    }
  }

  if (!existingMessage && mail.text && !mail.automated) {
    try {
      await runEmailChatbot(admin, account, { conversationId, contactId, mail });
    } catch (err) {
      console.error("[email-webhook] chatbot failed:", (err as Error).message);
    }
  }
  return true;
}

async function runEmailChatbot(
  admin: Admin,
  account: EmailAccountRow,
  args: { conversationId: string; contactId: string; mail: ParsedInboundEmail },
): Promise<void> {
  const { mail, conversationId, contactId } = args;
  const { dispatchChannelBot } = await import("@/lib/chatbots/channel-dispatch.server");
  const result = await dispatchChannelBot({
    admin,
    channel: "email",
    workspaceId: account.workspace_id,
    accountId: account.id,
    externalId: mail.from,
    userText: [mail.subject ? `Subject: ${mail.subject}` : "", mail.text.slice(0, MAX_BOT_INPUT)]
      .filter(Boolean)
      .join("\n\n"),
    conversationId,
    contactId,
    sessionMetadata: { email_account_id: account.id },
  });
  if (!result?.reply) return;

  if (account.provider !== "resend" || !account.api_key_ciphertext) {
    console.warn("[email-webhook] bot reply skipped: Resend API key not configured");
    return;
  }

  const { sendResendEmail, replySubject } = await import("./send.server");
  const subject = replySubject(mail.subject);
  const sent = await sendResendEmail({
    apiKeyCipher: account.api_key_ciphertext,
    fromEmail: account.from_email,
    fromName: account.from_name,
    to: mail.from,
    subject,
    text: result.reply,
    replyTo: account.reply_to,
    inReplyTo: mail.messageId,
    references: [mail.references, mail.messageId].filter(Boolean).join(" ") || null,
  });

  await sbAny(admin)
    .from("messages")
    .insert({
      workspace_id: account.workspace_id,
      conversation_id: conversationId,
      direction: "outbound",
      status: "sent",
      body: result.reply,
      message_type: "text",
      provider_message_id: sent.messageId,
      from_address: account.from_email,
      to_address: mail.from,
      metadata: { source: "chatbot", chatbot_id: result.botId, subject },
    });
}

async function resolveContact(
  admin: Admin,
  workspaceId: string,
  email: string,
  name: string | null,
): Promise<string> {
  const { data: idRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "email")
    .eq("external_id", email)
    .maybeSingle();
  const ident = idRaw as { id: string; contact_id: string | null } | null;
  if (ident?.contact_id) {
    await admin
      .from("channel_identities")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", ident.id);
    return ident.contact_id;
  }

  const { data: existing } = await admin
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  let contactId = (existing as { id: string } | null)?.id ?? null;

  if (!contactId) {
    const label = name ?? email;
    const { data: created, error } = await admin
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        name: label,
        display_name: label,
        email,
        source: "email",
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    contactId = (created as { id: string }).id;
  }

  const identity = {
    workspace_id: workspaceId,
    contact_id: contactId,
    channel: "email",
    external_id: email,
    display_name: name ?? email,
    last_seen_at: new Date().toISOString(),
  };
  if (ident) await sbAny(admin).from("channel_identities").update(identity).eq("id", ident.id);
  else await sbAny(admin).from("channel_identities").insert(identity);
  return contactId;
}
