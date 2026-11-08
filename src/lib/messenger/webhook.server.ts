/**
 * Facebook Messenger Webhook — server-only.
 *
 *   GET   → hub.challenge verification (META_WEBHOOK_VERIFY_TOKEN)
 *   POST  → inbound envelope: verify X-Hub-Signature-256 against META_APP_SECRET,
 *           dedupe by provider message id, and materialise incoming messages
 *           plus delivery / read receipts into the omnichannel inbox tables.
 *
 * Loaded dynamically from the public route handler so the server-only Supabase
 * admin client never reaches the browser bundle.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// ---------- GET verification ----------

import { ensureMessengerThread, messengerThreadKey } from "./thread.server";
import { deliveryMetadata, OUTBOUND_CLAIM_KEY } from "@/lib/inbox/outbound-claim.server";
import { normalizeMetaAttachment, type MetaAttachment } from "@/lib/messaging/meta-attachment";
import { sbAny } from "@/lib/supabase/untyped";
import { decryptToken } from "@/lib/instagram/token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function verifyMessengerWebhook(url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN || "";
  if (!expected) return new Response("Verify token not configured", { status: 500 });
  if (mode === "subscribe" && token && challenge && safeEq(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

// ---------- POST handler ----------

export async function handleMessengerWebhook(request: Request, rawBody: string): Promise<Response> {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("app secret not configured", { status: 500 });

  const signature =
    request.headers.get("x-hub-signature-256") ?? request.headers.get("X-Hub-Signature-256") ?? "";

  const { claimWebhookDelivery, completeWebhookDelivery, recordRejectedDelivery } =
    await import("@/lib/webhooks/idempotency.server");

  // Meta sends no delivery id header; retries repeat the exact body, so a
  // body digest is a stable idempotency key.
  const deliveryKey = createHash("sha256").update(rawBody, "utf8").digest("hex");

  if (!verifyMetaSignature(rawBody, secret, signature)) {
    await recordRejectedDelivery({
      provider: "messenger",
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
    provider: "messenger",
    deliveryKey,
    payload,
  });
  if (!claim.fresh) {
    // Duplicate redelivery from Meta — ack without reprocessing.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Meta's envelope names a Page, not a workspace, so the delivery is claimed
  // before the tenant is known. `processEntries` writes back whichever
  // workspace it resolved so the row can be attributed — the delivery log is
  // RLS-scoped on workspace_id, and an unattributed row is invisible to the
  // people who need it. Passed as an out-parameter so attribution survives a
  // processing error too.
  const attribution: { workspaceId: string | null } = { workspaceId: null };
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { routePageWebhook } = await import("@/lib/meta/page-router.server");
    const { processEntries: processInstagramEntries } =
      await import("@/lib/instagram/webhook.server");
    const { processFacebookFeedEntries } = await import("@/lib/social-inbox/webhook.server");
    await routePageWebhook(supabaseAdmin as unknown as Admin, payload, attribution, {
      instagram: (p, a) => processInstagramEntries(p, a),
      messenger: (p) => processMessengerEntries(supabaseAdmin as unknown as Admin, p, attribution),
      facebookFeed: (p, a) => processFacebookFeedEntries(supabaseAdmin as unknown as Admin, p, a),
    });
    await completeWebhookDelivery(claim.id, "processed", null, attribution.workspaceId);
  } catch (err) {
    // Meta retries on non-2xx; swallow processing errors after they're logged
    // so a poison entry doesn't multiply.
    console.error("[messenger-webhook] processing error:", err);
    await completeWebhookDelivery(
      claim.id,
      "failed",
      (err as Error).message,
      attribution.workspaceId,
    );
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

// ---------- signature ----------

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

// ---------- processing ----------

type Admin = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Matches the outbound reservation timeout: past it a row is no longer "in flight". */
const CLAIM_WINDOW_MS = 5 * 60 * 1000;

interface MessengerAccountRow {
  id: string;
  workspace_id: string;
  page_id: string;
  page_name: string | null;
  status: string;
  access_token_ciphertext: string | null;
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

/**
 * Materialise a verified Messenger envelope into the inbox.
 *
 * A Page may be linked in more than one workspace (`messenger_accounts` is
 * unique per workspace+page), so every event is written once per linked,
 * non-disconnected account — each into its own workspace's conversation.
 * `standby` events (another app owns the thread) are stored but never
 * auto-answered.
 */
export async function processMessengerEntries(
  admin: Admin,
  payload: unknown,
  attribution?: { workspaceId: string | null },
) {
  const root = payload as { object?: string; entry?: Array<Record<string, unknown>> };
  // Messenger webhooks are delivered under `object: "page"`.
  if (root?.object !== "page") return;

  const entries = root.entry ?? [];
  // One bad workspace must not stop the others, but a swallowed failure would
  // be invisible: Meta's retry carries the same body and is rejected by the
  // delivery digest, so the event is gone. Collect failures and surface them
  // on the delivery record instead.
  const failures: string[] = [];

  for (const entry of entries) {
    const pageId = String(entry.id ?? "");
    const messaging = (entry.messaging as Array<Record<string, unknown>> | undefined) ?? [];
    const standby = (entry.standby as Array<Record<string, unknown>> | undefined) ?? [];
    if (!pageId || (messaging.length === 0 && standby.length === 0)) continue;

    const { data: acctRows, error: acctErr } = await admin
      .from("messenger_accounts")
      .select("id, workspace_id, page_id, page_name, status, access_token_ciphertext")
      .eq("page_id", pageId)
      .neq("status", "disconnected")
      .order("connected_at", { ascending: true });
    if (acctErr) throw new Error(acctErr.message);
    const accounts = (acctRows ?? []) as MessengerAccountRow[];
    if (accounts.length === 0) {
      console.warn("[messenger-webhook] no connected account for page_id:", pageId);
      continue;
    }
    if (attribution && !attribution.workspaceId) {
      attribution.workspaceId = accounts[0].workspace_id;
    }

    const events = [
      ...messaging.map((evt) => ({ evt, standby: false })),
      ...standby.map((evt) => ({ evt, standby: true })),
    ];
    for (const { evt, standby: isStandby } of events) {
      // One customer message must never trigger two bot replies, even when
      // several workspaces have a chatbot on the same Page.
      let botReplied = false;
      for (const account of accounts) {
        try {
          const res = await processMessagingEvent(admin, account, pageId, evt, {
            allowChatbot: !isStandby && !botReplied,
          });
          botReplied ||= res.botReplied;
        } catch (err) {
          const detail = `workspace ${account.workspace_id}: ${(err as Error).message}`;
          console.error("[messenger-webhook] event failed:", detail);
          failures.push(detail);
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} Messenger event(s) failed — ${failures.slice(0, 5).join("; ")}`,
    );
  }
}

async function findMessageByProviderId(
  admin: Admin,
  workspaceId: string,
  providerMessageId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider_message_id", providerMessageId)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * An echo of a message this app sent races the sender's own write of the
 * provider id.
 *
 * The echo does not drop itself: if the sending process died between Meta
 * accepting the send and the sender stamping the row, dropping it would lose a
 * message that was really delivered and leave the row stuck at `queued`.
 * Instead the echo *adopts* the in-flight row — stamping Meta's mid and
 * marking it sent — which converges to exactly one row whichever writer wins.
 *
 * Only a row already reserved for delivery (`OUTBOUND_CLAIM_KEY`) is eligible,
 * so an unrelated older draft with the same text is never marked delivered.
 */
async function adoptInFlightOutbound(
  admin: Admin,
  conversationId: string,
  text: string,
  hasMedia: boolean,
  providerMessageId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
  const { data } = await admin
    .from("messages")
    .select("id, body, media_url, metadata")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("status", "queued")
    .is("provider_message_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20);
  const rows = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    body: string | null;
    media_url: string | null;
    metadata: unknown;
  }>;
  const wanted = text.trim();
  const match = rows.find((r) => {
    const claimed = (r.metadata as Record<string, unknown> | null)?.[OUTBOUND_CLAIM_KEY];
    if (!claimed) return false;
    return wanted ? (r.body ?? "").trim() === wanted : hasMedia && Boolean(r.media_url);
  });
  if (!match) return false;

  await admin
    .from("messages")
    .update({
      status: "sent",
      provider_message_id: providerMessageId,
      external_message_id: providerMessageId,
      failed_reason: null,
      metadata: deliveryMetadata(match.metadata),
    })
    .eq("id", match.id)
    .eq("status", "queued")
    .is("provider_message_id", null);
  // Matching zero rows means the sender stamped the same mid first. Either
  // way exactly one row now carries it, so the echo must not insert another.
  return true;
}

async function processMessagingEvent(
  admin: Admin,
  account: MessengerAccountRow,
  pageId: string,
  evt: Record<string, unknown>,
  opts: { allowChatbot: boolean },
): Promise<{ botReplied: boolean }> {
  const none = { botReplied: false };
  const message = evt.message as Record<string, unknown> | undefined;
  const postback = evt.postback as Record<string, unknown> | undefined;
  const delivery = evt.delivery as { mids?: string[]; watermark?: number } | undefined;
  const read = evt.read as { watermark?: number } | undefined;
  const reaction = evt.reaction as
    { reaction?: string; emoji?: string; action?: "react" | "unreact"; mid?: string } | undefined;
  const sender = evt.sender as { id?: string } | undefined;
  const recipient = evt.recipient as { id?: string } | undefined;
  const timestamp = Number(evt.timestamp ?? Date.now());

  // A customer reacting with an emoji needs the "message_reactions" webhook
  // field subscribed in the Meta App dashboard (Page webhooks, and for IG);
  // without it Meta never sends this event at all. Folded into the target
  // message's `metadata.reactions`, same as WhatsApp/Telegram, rather than
  // stored as a message of its own. Sending a reaction back as the Page is
  // not supported by Meta's Send API, so this is inbound-only.
  if (reaction) {
    if (!reaction.mid || !sender?.id) return none;
    const { data: target } = await admin
      .from("messages")
      .select("id, metadata")
      .eq("workspace_id", account.workspace_id)
      .eq("provider_message_id", reaction.mid)
      .maybeSingle();
    const row = target as { id: string; metadata: Record<string, unknown> | null } | null;
    if (!row) return none;

    const userKey = sender.id;
    const emoji = reaction.emoji || reaction.reaction || "";
    const reactions: Record<string, string[]> = {};
    for (const [e, users] of Object.entries(
      (row.metadata?.reactions as Record<string, string[]> | undefined) ?? {},
    )) {
      const rest = (users as string[]).filter((u) => u !== userKey);
      if (rest.length > 0) reactions[e] = rest;
    }
    if (reaction.action !== "unreact" && emoji) {
      reactions[emoji] = [...(reactions[emoji] ?? []), userKey];
    }

    await admin
      .from("messages")
      .update({ metadata: { ...(row.metadata ?? {}), reactions } })
      .eq("id", row.id);
    return none;
  }

  const senderId = sender?.id ?? "";
  const recipientId = recipient?.id ?? "";
  const isEcho = Boolean(message?.is_echo);

  // Direction: page -> user is outbound (echoes of agent sends), user -> page inbound.
  const direction: "inbound" | "outbound" = senderId === pageId || isEcho ? "outbound" : "inbound";

  // The customer's PSID is whichever end of the conversation is not the page.
  const customerPsid = direction === "inbound" ? senderId : recipientId;

  // Always log the raw event for observability & dedupe on Meta retries.
  const providerMessageId =
    (message?.mid as string | undefined) ??
    (postback?.mid as string | undefined) ??
    (delivery?.mids?.[0] as string | undefined) ??
    null;

  const eventType = message
    ? isEcho
      ? "message_echo"
      : "message"
    : postback
      ? "postback"
      : delivery
        ? "delivery"
        : read
          ? "read"
          : "other";

  // For message/postback events we need a customer + conversation.
  if (message || postback) {
    if (!customerPsid || customerPsid === pageId) return none;

    // Idempotency: Meta's message id (mid) is globally unique. A retried or
    // re-batched delivery of the same mid is dropped before it can touch the
    // thread (preview, reopen) or insert a second row.
    if (
      providerMessageId &&
      (await findMessageByProviderId(admin, account.workspace_id, providerMessageId))
    ) {
      return none;
    }

    // Resolve or create contact via channel_identities.
    const contactId = await resolveContact(admin, account.workspace_id, customerPsid, {
      displayName: null,
      accessTokenCipher: account.access_token_ciphertext,
    });

    // Thread key: Messenger conversations from webhooks arrive without the
    // t_XXXX thread id. We key the conversation on the customer PSID paired
    // with the page (that pair uniquely identifies the thread on Meta's side).
    const nowIso = new Date(timestamp).toISOString();

    const text =
      (message?.text as string | undefined) ?? (postback?.title as string | undefined) ?? "";
    const attachments = (message?.attachments as unknown[] | undefined) ?? [];
    const { mediaUrl, mediaType, messageType } = normalizeMetaAttachment(
      attachments[0] as MetaAttachment | undefined,
    );
    const preview = text ? text.slice(0, 240) : mediaType ? `[${mediaType}]` : "";

    const { conversationId } = await ensureMessengerThread(admin, {
      workspaceId: account.workspace_id,
      accountId: account.id,
      pageId,
      customerPsid,
      contactId,
      inbound: direction === "inbound",
      preview,
      source: "messenger_webhook",
    });

    const ownAppId = process.env.META_APP_ID;
    const sentByThisApp = isEcho && Boolean(ownAppId) && String(message?.app_id ?? "") === ownAppId;
    if (sentByThisApp) {
      // Without a mid the echo cannot be reconciled with anything later, so
      // suppress it rather than risk a duplicate bubble.
      if (!providerMessageId) return none;
      if (
        await adoptInFlightOutbound(
          admin,
          conversationId,
          text,
          attachments.length > 0,
          providerMessageId,
        )
      ) {
        return none;
      }
    }

    const { error: msgErr } = await sbAny(admin)
      .from("messages")
      .insert({
        workspace_id: account.workspace_id,
        conversation_id: conversationId,
        direction,
        status: direction === "outbound" ? "sent" : "delivered",
        body: text,
        media_url: mediaUrl,
        media_type: mediaType,
        message_type: messageType,
        provider_message_id: providerMessageId,
        from_address: senderId || null,
        to_address: recipientId || null,
        created_at: nowIso,
        metadata: {
          source: "messenger_webhook",
          event_type: eventType,
          payload: evt,
        },
      });
    if (msgErr) {
      if (
        String(msgErr.message ?? "")
          .toLowerCase()
          .includes("duplicate")
      )
        return none;
      throw new Error(`message insert failed: ${msgErr.message}`);
    }

    // Trigger chatbot auto-reply on inbound customer messages only.
    if (opts.allowChatbot && direction === "inbound" && (text.trim() || attachments.length > 0)) {
      try {
        const botReplied = await runMessengerChatbot({
          admin,
          account,
          conversationId,
          senderPsid: customerPsid,
          userText: text || "[non-text message]",
        });
        return { botReplied };
      } catch (err) {
        console.error("[messenger-webhook] chatbot failed:", (err as Error).message);
      }
    }
    return none;
  }

  // Delivery receipts → mark matching outbound messages as delivered.
  if (delivery) {
    const mids = delivery.mids ?? [];
    if (mids.length === 0) return none;
    await admin
      .from("messages")
      .update({ status: "delivered" })
      .eq("workspace_id", account.workspace_id)
      .in("provider_message_id", mids);
    return none;
  }

  // Read receipts → mark outbound messages up to watermark as read + zero unread.
  if (read) {
    const watermarkIso = new Date(Number(read.watermark ?? Date.now())).toISOString();
    if (!customerPsid) return none;
    const externalConversationId = messengerThreadKey(pageId, customerPsid);

    const { data: convRaw } = await admin
      .from("conversations")
      .select("id")
      .eq("workspace_id", account.workspace_id)
      .eq("channel", "messenger")
      .eq("external_conversation_id", externalConversationId)
      .maybeSingle();
    const conv = convRaw as { id: string } | null;
    if (!conv) return none;

    await admin
      .from("messages")
      .update({ status: "read" })
      .eq("conversation_id", conv.id)
      .eq("direction", "outbound")
      .lte("created_at", watermarkIso)
      .neq("status", "read");

    // This receipt means the customer read an outbound reply. It does not
    // mean an agent has read the customer's pending inbound messages.
    return none;
  }
  return none;
}

// ---------- contact / identity ----------

/**
 * Meta's Messenger webhook payload carries only the sender's PSID, never
 * their name — unlike some other channels, there is no inline profile data
 * to read. The real name has to be fetched separately via the Page token.
 * Best-effort: returns null on any failure so a new contact still gets
 * created (as "Messenger user xxxxxx") rather than blocking the message.
 */
async function fetchMessengerProfileName(
  psid: string,
  accessTokenCipher: string | null,
): Promise<string | null> {
  if (!accessTokenCipher) {
    console.warn("[messenger-webhook] no page token cipher; cannot resolve profile name");
    return null;
  }
  try {
    const token = decryptToken(accessTokenCipher);
    const url = `${GRAPH}/${encodeURIComponent(psid)}?fields=first_name,last_name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[messenger-webhook] profile lookup failed:", res.status, body.slice(0, 500));
      return null;
    }
    const j = (await res.json()) as { first_name?: string; last_name?: string };
    const name = [j.first_name, j.last_name].filter(Boolean).join(" ").trim();
    if (!name)
      console.warn("[messenger-webhook] profile lookup returned no name:", JSON.stringify(j));
    return name || null;
  } catch (err) {
    console.error("[messenger-webhook] profile lookup threw:", (err as Error).message);
    return null;
  }
}

async function resolveContact(
  admin: Admin,
  workspaceId: string,
  externalId: string,
  meta: { displayName: string | null; accessTokenCipher?: string | null },
): Promise<string> {
  const { data: existingIdRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "messenger")
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

  // Only a brand-new contact needs the Graph API round trip.
  const resolvedName =
    meta.displayName ??
    (await fetchMessengerProfileName(externalId, meta.accessTokenCipher ?? null));
  // The inbox list/header/drawer all read `display_name` (never `name`) for
  // their fallback chain, so it must carry the same fallback label as `name`
  // — leaving it null here made every contact whose Graph lookup failed
  // render as "Unknown contact" even though `name` had a usable value.
  const displayName = resolvedName ?? `Messenger user ${externalId.slice(-6)}`;

  const { data: contactRaw, error: cErr } = await admin
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name: displayName,
      display_name: displayName,
      source: "messenger",
    })
    .select("id")
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  const contactId = (contactRaw as { id: string }).id;

  if (existingId) {
    await admin
      .from("channel_identities")
      .update({ contact_id: contactId, last_seen_at: new Date().toISOString() })
      .eq("id", existingId.id);
  } else {
    await sbAny(admin).from("channel_identities").insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      channel: "messenger",
      external_id: externalId,
      display_name: displayName,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
  }

  return contactId;
}

// ---------- Chatbot auto-reply ----------

interface RunBotArgs {
  admin: Admin;
  account: MessengerAccountRow;
  conversationId: string;
  senderPsid: string;
  userText: string;
}

/** Returns true when an active bot handled (and answered) the message. */
async function runMessengerChatbot(args: RunBotArgs): Promise<boolean> {
  const { admin, account, conversationId, senderPsid, userText } = args;
  const start = Date.now();

  // Find an active chatbot deployed to this Messenger account.
  const { data: botRaw } = await admin
    .from("chatbots")
    .select(
      "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config",
    )
    .eq("workspace_id", account.workspace_id)
    .eq("status", "active")
    .contains("widget_config", { channel: "messenger", messenger_account_id: account.id })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let bot = botRaw as ChatbotRow | null;
  if (!bot) {
    // No per-account wiring; fall back to a Channels-tab deployment.
    const { findDeployedBot } = await import("@/lib/chatbots/channel-dispatch.server");
    const deployed = await findDeployedBot(admin, {
      workspaceId: account.workspace_id,
      channel: "messenger",
      accountId: account.id,
    });
    if (!deployed) return false;
    const { data: fullRaw } = await admin
      .from("chatbots")
      .select(
        "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config",
      )
      .eq("id", deployed.id)
      .maybeSingle();
    bot = fullRaw as ChatbotRow | null;
  }
  if (!bot) return false;

  // Reuse or open a chatbot session for this (bot, psid).
  const { data: existingRaw } = await admin
    .from("chatbot_sessions")
    .select("id, status")
    .eq("chatbot_id", bot.id)
    .eq("channel", "messenger")
    .eq("external_id", senderPsid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingSession = existingRaw as { id: string; status: string } | null;

  // If the session has been handed off to a human agent, don't auto-reply.
  if (existingSession?.status === "handed_off") return false;

  let sessionId = existingSession?.id ?? null;
  if (!sessionId) {
    const { data: createdRaw, error } = await admin
      .from("chatbot_sessions")
      .insert({
        workspace_id: bot.workspace_id,
        chatbot_id: bot.id,
        channel: "messenger",
        external_id: senderPsid,
        status: "active",
        metadata: {
          messenger_account_id: account.id,
          page_id: account.page_id,
          page_name: account.page_name,
          conversation_id: conversationId,
        },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    sessionId = (createdRaw as { id: string }).id;
  }

  // Prompt-injection heuristic (mirrors Instagram + chatbotChat).
  const cleaned = userText
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

  await sbAny(admin).from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "user",
    content: cleaned,
  });

  // Handoff via keyword.
  const lower = cleaned.toLowerCase();
  const handoff =
    bot.handoff_enabled &&
    (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
  if (handoff) {
    const reply = "Connecting you with a human agent — one moment.";
    await admin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: "keyword",
        handed_off_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    await sbAny(admin)
      .from("chatbot_messages")
      .insert({
        workspace_id: bot.workspace_id,
        session_id: sessionId,
        role: "assistant",
        content: reply,
        latency_ms: Date.now() - start,
      });
    await sendAndPersist({
      admin,
      account,
      conversationId,
      recipientPsid: senderPsid,
      text: reply,
    });
    return true;
  }

  // Load short history (last 10 turns).
  const { data: histRaw } = await admin
    .from("chatbot_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((histRaw as { role: string; content: string }[] | null) ?? []).reverse();

  const system = [
    bot.system_prompt || "You are a helpful Facebook Messenger assistant.",
    `Channel: Facebook Messenger for page "${account.page_name ?? "our business"}".`,
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
      feature: "chatbot:messenger",
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
    console.warn("[messenger-webhook] AI call failed, using fallback:", (err as Error).message);
  }

  await sbAny(admin)
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
  await admin
    .from("chatbot_sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);

  await sendAndPersist({ admin, account, conversationId, recipientPsid: senderPsid, text: reply });
  return true;
}

async function sendAndPersist(opts: {
  admin: Admin;
  account: MessengerAccountRow;
  conversationId: string;
  recipientPsid: string;
  text: string;
}) {
  const { admin, account, conversationId, recipientPsid, text } = opts;
  if (!account.access_token_ciphertext) {
    console.warn("[messenger-webhook] no page token; skipping auto-reply");
    return;
  }
  try {
    const { sendMessengerMessage } = await import("./send.server");
    const result = await sendMessengerMessage({
      pageId: account.page_id,
      accessTokenCipher: account.access_token_ciphertext,
      recipientPsid,
      text,
      messagingType: "RESPONSE",
    });
    const nowIso = new Date().toISOString();
    // The echo webhook for this reply may already have stored it.
    if (
      result.messageId &&
      (await findMessageByProviderId(admin, account.workspace_id, result.messageId))
    ) {
      return;
    }
    await sbAny(admin)
      .from("messages")
      .insert({
        workspace_id: account.workspace_id,
        conversation_id: conversationId,
        direction: "outbound",
        status: "sent",
        body: text,
        message_type: "text",
        provider_message_id: result.messageId,
        from_address: account.page_id,
        to_address: recipientPsid,
        created_at: nowIso,
        metadata: { source: "messenger_chatbot", auto_reply: true },
      });
    await admin
      .from("conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: text.slice(0, 240),
        last_message_from: "bot",
        updated_at: nowIso,
      })
      .eq("id", conversationId);
  } catch (err) {
    const kind = (err as { kind?: string }).kind ?? "generic";
    console.error("[messenger-webhook] auto-reply send failed:", kind, (err as Error).message);
  }
}
