/**
 * Instagram Messaging Webhook — server-only.
 *
 *   GET   → hub.challenge verification (META_WEBHOOK_VERIFY_TOKEN)
 *   POST  → inbound envelope: verify X-Hub-Signature-256 against META_APP_SECRET,
 *           parse messaging entries, dedupe by provider message id, run the
 *           configured Instagram chatbot, and echo the reply back through the
 *           Graph API using the account's stored access token.
 *
 * This module is imported dynamically from the public route handler so no
 * server-only client (`supabaseAdmin`) reaches the browser bundle.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { decryptToken } from "./token-crypto.server";
import { mirrorInstagramMessage } from "./inbox-bridge.server";
import { sbAny } from "@/lib/supabase/untyped";
import { normalizeMetaAttachment, type MetaAttachment } from "@/lib/messaging/meta-attachment";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------- Types (loose — payloads come straight from Meta) ----------

interface IgAccountRow {
  id: string;
  workspace_id: string;
  ig_user_id: string;
  page_id: string | null;
  username: string | null;
  access_token_ciphertext: string | null;
  status: string;
}

interface ChatbotRow {
  id: string;
  workspace_id: string;
  status: string;
  fallback_message: string | null;
  welcome_message: string | null;
  model: string | null;
  provider_id: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string | null;
  handoff_enabled: boolean;
  handoff_keywords: string[] | null;
  language: string | null;
  personality: string | null;
  tone: string | null;
  widget_config: Record<string, unknown> | null;
}

// ---------- GET verification ----------

export async function verifyInstagramWebhook(url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.IG_WEBHOOK_VERIFY_TOKEN || "";
  if (!expected) {
    return new Response("Verify token not configured", { status: 500 });
  }
  if (mode === "subscribe" && token && challenge && safeEq(token, expected)) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response("forbidden", { status: 403 });
}

// ---------- POST handler ----------

export async function handleInstagramWebhook(request: Request, rawBody: string): Promise<Response> {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("app secret not configured", { status: 500 });

  const signatureHeader =
    request.headers.get("x-hub-signature-256") ?? request.headers.get("X-Hub-Signature-256") ?? "";

  const { claimWebhookDelivery, completeWebhookDelivery, recordRejectedDelivery } =
    await import("@/lib/webhooks/idempotency.server");

  const deliveryKey = createHash("sha256").update(rawBody, "utf8").digest("hex");

  const signatureValid = verifyMetaSignature(rawBody, secret, signatureHeader);
  if (!signatureValid) {
    // Meta requires 200 in some retry scenarios, but for bad signatures we
    // return 401 so misconfiguration surfaces during setup.
    await recordRejectedDelivery({
      provider: "instagram",
      deliveryKey: `unverified:${deliveryKey}:${Date.now()}`,
      reason: "Invalid or missing X-Hub-Signature-256",
    });
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const claim = await claimWebhookDelivery({
    provider: "instagram",
    deliveryKey,
    payload,
  });
  if (!claim.fresh) return new Response("EVENT_RECEIVED", { status: 200 });

  // Never let a single bad entry take the whole webhook down: Meta retries on
  // any non-2xx, which would multiply broken payloads.
  // Meta's envelope names an IG account, not a workspace, so the delivery is
  // claimed before the tenant is known. `processEntries` writes back whichever
  // workspace it resolved so the row can be attributed — the delivery log is
  // RLS-scoped on workspace_id, and an unattributed row is invisible to the
  // people who need it. Passed as an out-parameter so attribution survives a
  // processing error too.
  const attribution: { workspaceId: string | null } = { workspaceId: null };
  try {
    await processEntries(payload, attribution);
    await completeWebhookDelivery(claim.id, "processed", null, attribution.workspaceId);
  } catch (err) {
    console.error("[instagram-webhook] processing error:", err);
    await completeWebhookDelivery(
      claim.id,
      "failed",
      (err as Error).message,
      attribution.workspaceId,
    );
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

// ---------- Core processing ----------

function verifyMetaSignature(rawBody: string, secret: string, header: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const IG_ACCOUNT_COLUMNS =
  "id, workspace_id, ig_user_id, page_id, username, access_token_ciphertext, status";

/**
 * Every account this event belongs to.
 *
 * Meta identifies the business by its Instagram id, which arrives as
 * `recipient.id` and (for the `instagram` object) is repeated as `entry.id`.
 * Both are consulted because the shape differs between the `instagram` and
 * `page` objects, and the previous lookup read only `recipient.id`.
 *
 * `instagram_accounts` is unique on `(workspace_id, ig_user_id)`, so the same
 * professional account can be linked in several workspaces. The old
 * `.maybeSingle()` turned exactly that case into a PostgREST "multiple rows"
 * error, which surfaced as "no account" and silently orphaned the DM. Every
 * match is returned instead and the caller writes one copy per workspace.
 */
async function resolveInstagramAccounts(
  admin: SupabaseAdminLike,
  opts: { recipientId: string; entryId: string; object: string },
): Promise<IgAccountRow[]> {
  const ids = [...new Set([opts.recipientId, opts.entryId].filter(Boolean))];
  if (ids.length === 0) return [];

  const byId = new Map<string, IgAccountRow>();
  const collect = (rows: unknown) => {
    for (const row of (Array.isArray(rows) ? rows : []) as IgAccountRow[]) {
      byId.set(row.id, row);
    }
  };

  const { data: byIgUser, error } = await admin
    .from("instagram_accounts")
    .select(IG_ACCOUNT_COLUMNS)
    .in("ig_user_id", ids);
  if (error) throw new Error(`instagram_accounts lookup failed: ${error.message}`);
  collect(byIgUser);

  // Page-id fallback only under the `instagram` object. Under `page`, matching
  // a Page id would let a Messenger conversation resolve to an Instagram
  // account and mirror Messenger DMs into an Instagram thread.
  if (byId.size === 0 && opts.object === "instagram") {
    const { data: byPage } = await admin
      .from("instagram_accounts")
      .select(IG_ACCOUNT_COLUMNS)
      .in("page_id", ids);
    collect(byPage);
  }

  return [...byId.values()];
}

/**
 * Exported so the Messenger route can hand a Page-linked Instagram DM to this
 * pipeline. Meta delivers those under `object: "page"`.
 */
export async function processEntries(
  payload: unknown,
  attribution?: { workspaceId: string | null },
) {
  const root = payload as { object?: string; entry?: Array<Record<string, unknown>> };
  if (root?.object !== "instagram" && root?.object !== "page") return;

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const entries = root.entry ?? [];
  // A failure for one account must not stop the others, but it must not vanish
  // either: Meta's retry repeats the same body and is rejected by the delivery
  // digest, so a swallowed error means the DM is gone for good.
  const failures: string[] = [];

  for (const entry of entries) {
    const entryId = String(entry.id ?? "");
    const messaging = (entry.messaging as Array<Record<string, unknown>> | undefined) ?? [];
    for (const evt of messaging) {
      try {
        await processMessagingEvent(supabaseAdmin, evt, {
          entryId,
          object: root.object ?? "",
          attribution,
        });
      } catch (err) {
        const detail = (err as Error).message;
        console.error("[instagram-webhook] event failed:", detail);
        failures.push(detail);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} Instagram event(s) failed — ${failures.slice(0, 5).join("; ")}`,
    );
  }
}

type SupabaseAdminLike = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function processMessagingEvent(
  supabaseAdmin: SupabaseAdminLike,
  evt: Record<string, unknown>,
  ctx: {
    entryId: string;
    object: string;
    attribution?: { workspaceId: string | null };
  },
) {
  const message = evt.message as Record<string, unknown> | undefined;
  const postback = evt.postback as Record<string, unknown> | undefined;
  const sender = evt.sender as { id?: string } | undefined;
  const recipient = evt.recipient as { id?: string } | undefined;

  // Ignore delivery/read receipts and echoes.
  if (!message && !postback) return;
  if (message?.is_echo) return;

  const senderId = sender?.id ?? "";
  const recipientId = recipient?.id ?? "";
  const providerMessageId =
    (message?.mid as string | undefined) ?? (postback?.mid as string | undefined) ?? null;
  const text =
    (message?.text as string | undefined) ?? (postback?.title as string | undefined) ?? "";
  const attachments = (message?.attachments as unknown[] | undefined) ?? [];

  if (!senderId) return;
  if (!recipientId && !ctx.entryId) return;

  const matches = await resolveInstagramAccounts(supabaseAdmin, {
    recipientId,
    entryId: ctx.entryId,
    object: ctx.object,
  });
  // A disconnected link must stop delivery for that workspace without hiding
  // the event, and without blocking another workspace that is still live.
  const active = matches.filter((a) => a.status !== "disconnected");

  if (active.length === 0) {
    await logOrphanEvent(supabaseAdmin, {
      evt,
      senderId,
      recipientId: recipientId || ctx.entryId,
      providerMessageId,
      text,
      attachments,
      eventType: message ? "message" : "postback",
      reason: matches.length
        ? "instagram_account is disconnected in every workspace that links it"
        : "no instagram_account matches this recipient — link the professional account that received the DM",
      status: matches.length ? "disconnected" : "orphaned",
    });
    return;
  }

  if (ctx.attribution && !ctx.attribution.workspaceId) {
    ctx.attribution.workspaceId = active[0].workspace_id;
  }

  // One customer DM must reach every workspace that links the account, but only
  // one of them may answer it.
  let botReplied = false;
  const failures: string[] = [];
  for (const account of active) {
    try {
      const replied = await deliverToAccount(supabaseAdmin, account, {
        evt,
        senderId,
        recipientId: recipientId || ctx.entryId,
        providerMessageId,
        text,
        attachments,
        eventType: message ? "message" : "postback",
        allowChatbot: !botReplied,
      });
      botReplied ||= replied;
    } catch (err) {
      failures.push(`workspace ${account.workspace_id}: ${(err as Error).message}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
}

interface IgEventFacts {
  evt: Record<string, unknown>;
  senderId: string;
  recipientId: string;
  providerMessageId: string | null;
  text: string;
  attachments: unknown[];
  eventType: string;
}

/** Record an event that no live account claimed, so it stays diagnosable. */
async function logOrphanEvent(
  supabaseAdmin: SupabaseAdminLike,
  facts: IgEventFacts & { reason: string; status: string },
) {
  const { error } = await supabaseAdmin.from("instagram_webhook_events").insert({
    workspace_id: null,
    instagram_account_id: null,
    provider_message_id: facts.providerMessageId,
    sender_id: facts.senderId,
    recipient_id: facts.recipientId,
    event_type: facts.eventType,
    text: facts.text,
    attachments: facts.attachments,
    raw_payload: facts.evt,
    signature_valid: true,
    status: facts.status,
    error: facts.reason,
  });
  if (
    error &&
    !String(error.message ?? "")
      .toLowerCase()
      .includes("duplicate")
  ) {
    console.error("[instagram-webhook] orphan log failed:", error.message);
  }
}

/**
 * Display name for an Instagram sender. A name already stored on the sender's
 * identity is reused, so Graph is only called for a first-seen sender. Any
 * failure returns null and the DM still ingests with the fallback label.
 * The token travels in the Authorization header, never in the URL or logs.
 */
async function resolveInstagramSenderName(
  supabaseAdmin: SupabaseAdminLike,
  account: IgAccountRow,
  senderId: string,
): Promise<string | null> {
  try {
    const { data: known } = await supabaseAdmin
      .from("channel_identities")
      .select("display_name")
      .eq("workspace_id", account.workspace_id)
      .eq("channel", "instagram")
      .eq("external_id", senderId)
      .maybeSingle();
    const stored = (known as { display_name?: string | null } | null)?.display_name;
    if (stored?.trim()) return stored.trim();

    if (!account.access_token_ciphertext) return null;
    const token = decryptToken(account.access_token_ciphertext);
    const res = await fetch(`${GRAPH_BASE}/${encodeURIComponent(senderId)}?fields=name,username`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string; username?: string };
    return (body.name || body.username || "").trim() || null;
  } catch {
    return null;
  }
}

/** Persist and (optionally) auto-reply for one linked account. */
async function deliverToAccount(
  supabaseAdmin: SupabaseAdminLike,
  account: IgAccountRow,
  facts: IgEventFacts & { allowChatbot: boolean },
): Promise<boolean> {
  const { senderId, providerMessageId, text, attachments } = facts;

  // Dedupe + observability row. The table is unique on
  // (instagram_account_id, provider_message_id), so a Meta retry that slips
  // past the envelope digest is rejected here, per account.
  const { data: insertedRaw, error: insertErr } = await supabaseAdmin
    .from("instagram_webhook_events")
    .insert({
      workspace_id: account.workspace_id,
      instagram_account_id: account.id,
      provider_message_id: providerMessageId,
      sender_id: senderId,
      recipient_id: facts.recipientId,
      event_type: facts.eventType,
      text,
      attachments,
      raw_payload: facts.evt,
      signature_valid: true,
      status: "received",
      error: null,
    })
    .select("id")
    .maybeSingle();
  const inserted = insertedRaw as { id: string } | null;

  if (insertErr) {
    if (
      String(insertErr.message ?? "")
        .toLowerCase()
        .includes("duplicate")
    )
      return false;
    throw new Error(`event log insert failed: ${insertErr.message}`);
  }
  if (!text.trim() && attachments.length === 0) return false;

  // Mirror the inbound DM into the unified inbox so Instagram threads appear
  // in the omnichannel Inbox even when no chatbot is deployed.
  // Every attachment is kept: the first carries the text, the rest become
  // their own inbox rows. Extra rows get a derived provider id so the per-
  // conversation dedupe does not treat them as retries of the first.
  const displayName = await resolveInstagramSenderName(supabaseAdmin, account, senderId);
  const items: Array<unknown> = attachments.length > 0 ? attachments : [undefined];
  let conversationId: string | null = null;
  for (let i = 0; i < items.length; i++) {
    const attachment = normalizeMetaAttachment(items[i] as MetaAttachment | undefined);
    const messageId =
      i === 0 ? providerMessageId : providerMessageId ? `${providerMessageId}#${i}` : null;
    conversationId = await mirrorInstagramMessage(supabaseAdmin, account, senderId, {
      body: i === 0 ? text : "",
      direction: "inbound",
      providerMessageId: messageId,
      mediaType: attachment.mediaType,
      mediaUrl: attachment.mediaUrl,
      displayName,
    });
    if (!conversationId) break;
  }
  // The bridge swallows its own errors, so a null return is the only signal
  // that the inbox row — the thing the operator actually sees — never landed.
  if (!conversationId) {
    await supabaseAdmin
      .from("instagram_webhook_events")
      .update({
        status: "persist_failed",
        error: "message could not be mirrored into the inbox",
        processed_at: new Date().toISOString(),
      })
      .eq("id", inserted?.id ?? "");
    throw new Error("inbox mirror failed");
  }

  if (!facts.allowChatbot) {
    await supabaseAdmin
      .from("instagram_webhook_events")
      .update({ status: "delivered", processed_at: new Date().toISOString() })
      .eq("id", inserted?.id ?? "");
    return false;
  }

  return runChatbotForAccount(supabaseAdmin, account, senderId, text, inserted?.id ?? "");
}

async function runChatbotForAccount(
  supabaseAdmin: SupabaseAdminLike,
  account: IgAccountRow,
  senderId: string,
  text: string,
  eventRowId: string,
): Promise<boolean> {
  // Find an active chatbot deployed to this Instagram account.
  const { data: botRaw } = await supabaseAdmin
    .from("chatbots")
    .select(
      "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config",
    )
    .eq("workspace_id", account.workspace_id)
    .eq("status", "active")
    .contains("widget_config", { channel: "instagram", instagram_account_id: account.id })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let bot = botRaw as ChatbotRow | null;
  if (!bot) {
    // No per-account wiring; fall back to a Channels-tab deployment.
    const { findDeployedBot } = await import("@/lib/chatbots/channel-dispatch.server");
    const deployed = await findDeployedBot(supabaseAdmin, {
      workspaceId: account.workspace_id,
      channel: "instagram",
      accountId: account.id,
    });
    if (deployed) {
      const { data: fullRaw } = await supabaseAdmin
        .from("chatbots")
        .select(
          "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config",
        )
        .eq("id", deployed.id)
        .maybeSingle();
      bot = fullRaw as ChatbotRow | null;
    }
  }
  if (!bot) {
    await supabaseAdmin
      .from("instagram_webhook_events")
      .update({ status: "no_bot", processed_at: new Date().toISOString() })
      .eq("id", eventRowId);
    return false;
  }

  const reply = await runInstagramTurn({
    supabaseAdmin,
    account,
    bot,
    senderId,
    userText: text || "[non-text message]",
  });

  let replySent = false;
  let sendError: string | null = null;
  if (reply) {
    try {
      await sendInstagramMessage({
        accessTokenCipher: account.access_token_ciphertext,
        recipientId: senderId,
        text: reply,
      });
      replySent = true;
      await mirrorInstagramMessage(supabaseAdmin, account, senderId, {
        body: reply,
        direction: "outbound",
      });
    } catch (err) {
      // Never leaks the token: sendInstagramMessage only surfaces status + body.
      sendError = (err as Error).message;
      console.error("[instagram-webhook] send failed:", sendError);
    }
  }

  await supabaseAdmin
    .from("instagram_webhook_events")
    .update({
      chatbot_id: bot.id,
      status: replySent ? "replied" : reply ? "send_failed" : "no_reply",
      error: sendError,
      reply_sent: replySent,
      reply_text: reply,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventRowId);

  return replySent;
}

// ---------- Turn runner (session + LLM + persistence) ----------

interface RunTurnArgs {
  supabaseAdmin: SupabaseAdminLike;
  account: IgAccountRow;
  bot: ChatbotRow;
  senderId: string;
  userText: string;
}

async function runInstagramTurn({
  supabaseAdmin,
  account,
  bot,
  senderId,
  userText,
}: RunTurnArgs): Promise<string | null> {
  const start = Date.now();

  // Reuse an existing session for this (bot, sender) or open a new one.
  const { data: existingRaw } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("id, status")
    .eq("chatbot_id", bot.id)
    .eq("channel", "instagram")
    .eq("external_id", senderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingSession = existingRaw as { id?: string; status?: string } | null;
  // A human agent owns this thread; the bot must stay silent.
  if (existingSession?.status === "handed_off") return null;
  let sessionId = existingSession?.id ?? null;

  if (!sessionId) {
    const { data: createdRaw, error } = await supabaseAdmin
      .from("chatbot_sessions")
      .insert({
        workspace_id: bot.workspace_id,
        chatbot_id: bot.id,
        channel: "instagram",
        external_id: senderId,
        status: "active",
        metadata: {
          instagram_account_id: account.id,
          ig_user_id: account.ig_user_id,
          username: account.username,
        },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    sessionId = (createdRaw as { id: string }).id;
  }

  // Prompt-injection heuristic (kept in sync with chatbotChat).
  const cleaned = userText
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

  await sbAny(supabaseAdmin).from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "user",
    content: cleaned,
  });

  // Handoff via keyword — mirror chatbotChat semantics.
  const lower = cleaned.toLowerCase();
  const handoff =
    bot.handoff_enabled &&
    (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
  if (handoff) {
    const reply = "Connecting you with a human agent — one moment.";
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: "keyword",
        handed_off_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    await sbAny(supabaseAdmin)
      .from("chatbot_messages")
      .insert({
        workspace_id: bot.workspace_id,
        session_id: sessionId,
        role: "assistant",
        content: reply,
        latency_ms: Date.now() - start,
      });
    return reply;
  }

  // Load short history.
  const { data: histRaw } = await supabaseAdmin
    .from("chatbot_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((histRaw as { role: string; content: string }[] | null) ?? []).reverse();

  const system = [
    bot.system_prompt || "You are a helpful Instagram DM assistant.",
    `Channel: Instagram DM as @${account.username ?? "our_business"}.`,
    bot.personality ? `Personality:\n${bot.personality}` : "",
    bot.tone ? `Tone: ${bot.tone}.` : "",
    bot.language
      ? `Reply in language code "${bot.language}" unless the user writes another language.`
      : "",
    "Keep replies short and DM-appropriate (under 3 short sentences unless clarifying).",
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply = bot.fallback_message ?? "Thanks for your message! We'll get back to you shortly.";
  let model = bot.model ?? "google/gemini-2.5-flash";
  let providerKind = "";
  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: bot.workspace_id,
      feature: "chatbot:instagram",
      primaryProviderId: bot.provider_id,
      request: {
        model: bot.model || "google/gemini-2.5-flash",
        temperature: bot.temperature ?? 0.4,
        max_tokens: bot.max_tokens ?? 500,
        messages: [
          { role: "system", content: system },
          ...history.map((m) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: cleaned },
        ],
      },
    });
    reply = res.content?.trim() || reply;
    model = res.model || model;
    providerKind = res.providerKind;
  } catch (err) {
    console.warn("[instagram-webhook] AI call failed, using fallback:", (err as Error).message);
  }

  await sbAny(supabaseAdmin)
    .from("chatbot_messages")
    .insert({
      workspace_id: bot.workspace_id,
      session_id: sessionId,
      role: "assistant",
      content: reply,
      latency_ms: Date.now() - start,
      model,
      provider_kind: providerKind,
    });

  await supabaseAdmin
    .from("chatbot_sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);

  return reply;
}

// ---------- Graph API send ----------

async function sendInstagramMessage(opts: {
  accessTokenCipher: string | null;
  recipientId: string;
  text: string;
}) {
  if (!opts.accessTokenCipher) throw new Error("account has no access token stored");
  const accessToken = decryptToken(opts.accessTokenCipher);
  const url = `${GRAPH_BASE}/me/messages?access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      messaging_type: "RESPONSE",
      message: { text: opts.text.slice(0, 1000) },
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`graph ${res.status}: ${bodyText.slice(0, 200)}`);
  }
}
