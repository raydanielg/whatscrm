/**
 * Outbound delivery for the Inbox composer — server-only.
 *
 * Takes an already-persisted `messages` row (inserted optimistically by the
 * composer) and delivers it to the external thread for channels that have a
 * real provider implementation (Messenger, Instagram, Telegram). Channels
 * without an outbound implementation are left as `sent` locally so existing
 * behaviour is unchanged.
 *
 * Routing conventions (set by the inbound webhooks):
 *   - owning account  → `conversations.metadata.account_id`
 *   - external thread → `conversations.metadata.chat_id`
 *                       ?? `conversations.external_conversation_id`
 *                       ?? `channel_identities.external_id` for the contact
 *   - Messenger is stricter: only the page-scoped PSID from the thread key /
 *     thread metadata / the thread's own inbound history (`resolveMessengerRecipient`).
 */

import type { TemplateSendPayload } from "@/lib/messaging/template-send-payload";
import { sbAny } from "@/lib/supabase/untyped";
import {
  claimOutboundMessage,
  deliveryMetadata,
  type ClaimableMessage,
} from "./outbound-claim.server";
import {
  MessengerSendError,
  redactSecrets,
  type MessengerDeliveryError,
} from "@/lib/messenger/errors";
import { resolveMessengerRecipient } from "@/lib/messenger/psid";
import { isOutsideMessagingWindow } from "@/lib/messenger/window";
import { outboundAttachmentProblem } from "./channel-attachments";
import { findProviderReplyId } from "@/lib/messaging/reply-context.server";
import { extractFirstUrl } from "@/lib/inbox/rich-text";

function clearDeliveryError(metadata: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...metadata };
  delete copy.delivery_error;
  return copy;
}

export type DeliverableChannel = "messenger" | "instagram" | "telegram" | "email";

export const DELIVERABLE_CHANNELS: readonly DeliverableChannel[] = [
  "messenger",
  "instagram",
  "telegram",
  "email",
];

export interface TemplateMessageMetadata {
  template_name?: string;
  template_language?: string;
  template_components?: TemplateSendPayload["components"];
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  channel: string;
  contact_id: string | null;
  channel_account_id?: string | null;
  external_conversation_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface MessageRow extends ClaimableMessage {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  direction: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  media_size?: number | null;
  status: string;
  message_type: string | null;
  reply_to_id: string | null;
  metadata: unknown | null;
}

export interface DeliverResult {
  delivered: boolean;
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string | null;
  error?: string;
}

/** Map a mime type onto the coarse media kind each provider expects. */
function mediaKind(mime: string | null): "image" | "video" | "audio" | "document" {
  const m = (mime ?? "").toLowerCase();
  if (m === "image" || m.startsWith("image/")) return "image";
  if (m === "video" || m.startsWith("video/")) return "video";
  if (m === "audio" || m.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Resolve the external recipient id from the conversation record.
 *
 * `external_conversation_id` may be a composite thread key written by the
 * inbound webhooks (e.g. `wa:<phone_number_id>:<msisdn>`); the recipient is the
 * last segment, never the whole key.
 */
function resolveRecipient(conv: ConversationRow): string | null {
  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const chatId = meta["chat_id"];
  if (typeof chatId === "string" && chatId) return chatId;
  if (typeof chatId === "number") return String(chatId);
  const ext = conv.external_conversation_id;
  if (ext) {
    if (ext.includes(":")) return ext.split(":").filter(Boolean).pop() ?? null;
    // Messenger history sync uses Graph thread ids (`t_`) as stable
    // conversation keys. They are not valid Send API recipient ids, so allow
    // the channel-identity fallback below to resolve the customer's PSID.
    if (conv.channel === "messenger" && ext.startsWith("t_")) return null;
    return ext;
  }
  return null;
}

/**
 * Deliver a persisted outbound message to its external channel.
 * Never throws — failures are recorded on the message row and returned.
 */
export async function deliverInboxMessage(args: {
  messageId: string;
  userId: string;
}): Promise<DeliverResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const { data: msgRaw } = await admin
    .from("messages")
    .select(
      "id, workspace_id, conversation_id, direction, body, media_url, media_type, media_size, status, message_type, reply_to_id, metadata, updated_at, is_internal, deleted_at, provider_message_id",
    )
    .eq("id", args.messageId)
    .maybeSingle();
  const msg = msgRaw as MessageRow | null;
  if (
    !msg ||
    msg.direction !== "outbound" ||
    !msg.conversation_id ||
    msg.status !== "queued" ||
    msg.is_internal ||
    msg.deleted_at ||
    msg.provider_message_id
  ) {
    return { delivered: false, status: "skipped" };
  }

  const { data: convRaw } = await admin
    .from("conversations")
    .select(
      "id, workspace_id, channel, contact_id, channel_account_id, external_conversation_id, metadata",
    )
    .eq("id", msg.conversation_id)
    .maybeSingle();
  const conv = convRaw as ConversationRow | null;
  if (!conv || conv.workspace_id !== msg.workspace_id) {
    return { delivered: false, status: "skipped" };
  }

  const markFailed = async (
    reason: string,
    deliveryError?: MessengerDeliveryError,
  ): Promise<DeliverResult> => {
    const metadata = clearDeliveryError(deliveryMetadata(msg.metadata));
    if (deliveryError) metadata.delivery_error = deliveryError;
    await admin
      .from("messages")
      .update({ status: "failed", failed_reason: reason.slice(0, 500), metadata })
      .eq("id", msg.id);
    return { delivered: false, status: "failed", error: reason };
  };

  try {
    const claim = await claimOutboundMessage(admin, msg);
    if (claim === "skipped") return { delivered: false, status: "skipped" };
    if (claim === "uncertain") {
      return markFailed(
        "The previous send was interrupted and delivery could not be confirmed. Check the channel's conversation before retrying to avoid sending a duplicate.",
      );
    }
  } catch (err) {
    // Do not send if the database cannot guarantee this worker owns the row.
    return { delivered: false, status: "failed", error: (err as Error).message };
  }

  // Reject kinds the channel cannot carry (same map the composer uses) with a
  // clear reason instead of a vague provider error.
  const attachmentProblem = outboundAttachmentProblem(conv.channel, msg);
  if (attachmentProblem) return markFailed(attachmentProblem);

  // ---- WhatsApp Cloud ------------------------------------------------------
  if (conv.channel === "whatsapp" || conv.channel === "whatsapp_cloud") {
    const metaAccount = ((conv.metadata ?? {}) as Record<string, unknown>)["account_id"];
    const waAccountId =
      (conv as unknown as { channel_account_id?: string | null }).channel_account_id ??
      (typeof metaAccount === "string" ? metaAccount : null);
    if (!waAccountId) {
      return markFailed("This conversation is not linked to a connected WhatsApp number.");
    }

    // Recipient: explicit to_address → conversation routing → contact phone.
    let to = resolveRecipient(conv);
    if (!to && conv.contact_id) {
      const { data: identRaw } = await admin
        .from("channel_identities")
        .select("external_id")
        .eq("contact_id", conv.contact_id)
        .eq("channel", "whatsapp")
        .maybeSingle();
      to = (identRaw as { external_id?: string } | null)?.external_id ?? null;
      if (!to) {
        const { data: contactRaw } = await admin
          .from("contacts")
          .select("phone")
          .eq("id", conv.contact_id)
          .maybeSingle();
        to = (contactRaw as { phone?: string | null } | null)?.phone ?? null;
      }
    }
    if (!to) {
      // Customers who message with a WhatsApp username (BSUID) may not share a
      // phone number, so the thread has no address to send to. Say so plainly.
      return markFailed(
        "No WhatsApp phone number is on file for this contact, so this reply cannot be delivered. Add the customer's number to the contact to send.",
      );
    }

    const cleanTo = to.replace(/[^\d+]/g, "");
    const providerReplyId = await findProviderReplyId(
      admin, msg.workspace_id, msg.conversation_id, msg.reply_to_id,
    );
    if (msg.reply_to_id && !providerReplyId) {
      return markFailed("The original message has not been delivered to WhatsApp yet. Retry this reply after it arrives.");
    }

    const isTemplate = msg.message_type === "template";
    const meta = (msg.metadata as TemplateMessageMetadata | null) ?? {};
    const hasTemplateMeta =
      isTemplate &&
      meta.template_name &&
      meta.template_language &&
      Array.isArray(meta.template_components);

    try {
      const { loadChannelAccount, loadCredentials, getProvider } =
        await import("@/lib/messaging/registry.server");
      const account = await loadChannelAccount(waAccountId);
      const credentials = loadCredentials(account);
      const impl = getProvider(account.provider);

      let payload: Record<string, unknown>;
      const interactivePayload =
        msg.message_type === "interactive" &&
        typeof (msg.metadata as Record<string, unknown> | null)?.["interactive"] === "object"
          ? ((msg.metadata as Record<string, unknown>)["interactive"] as Record<string, unknown>)
          : null;

      if (hasTemplateMeta) {
        payload = {
          to: cleanTo,
          type: "template",
          template: {
            name: meta.template_name,
            language: meta.template_language,
            components: meta.template_components,
          },
        };
      } else if (interactivePayload) {
        payload = { to: cleanTo, type: "interactive", interactive: interactivePayload };
      } else if (msg.message_type === "location") {
        // The composer stores the pin in metadata and leaves body empty, so the
        // text/media path below reported it as an empty message.
        const loc = ((msg.metadata ?? {}) as Record<string, any>)["location"] ?? {};
        const latitude = Number(loc.lat ?? loc.latitude);
        const longitude = Number(loc.lng ?? loc.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return markFailed("Location has no coordinates.");
        }
        payload = {
          to: cleanTo,
          type: "location",
          location: {
            latitude,
            longitude,
            ...(loc.label || loc.name ? { name: String(loc.label ?? loc.name) } : {}),
            ...(loc.address ? { address: String(loc.address) } : {}),
          },
        };
      } else if (
        msg.message_type === "contact" &&
        ((msg.metadata ?? {}) as Record<string, any>)["contact_card"]?.name // eslint-disable-line @typescript-eslint/no-explicit-any
      ) {
        // Native WhatsApp contact card instead of just the name as text.
        const card = ((msg.metadata ?? {}) as Record<string, any>)["contact_card"] as {
          // eslint-disable-line @typescript-eslint/no-explicit-any
          name: string;
          phone?: string;
          email?: string;
        };
        const [first, ...rest] = String(card.name).trim().split(/\s+/);
        payload = {
          to: cleanTo,
          type: "contacts",
          contacts: [
            {
              name: {
                formatted_name: card.name,
                first_name: first || card.name,
                ...(rest.length ? { last_name: rest.join(" ") } : {}),
              },
              ...(card.phone ? { phones: [{ phone: card.phone, type: "CELL" }] } : {}),
              ...(card.email ? { emails: [{ email: card.email, type: "WORK" }] } : {}),
            },
          ],
        };
      } else {
        const waText = msg.body?.trim() ? msg.body : null;
        const { resolveWhatsAppMedia } = await import("@/lib/messaging/whatsapp-media-support");
        const mediaName = ((msg.metadata ?? {}) as Record<string, unknown>)["media_name"];
        const waMedia = msg.media_url
          ? {
              ...resolveWhatsAppMedia({
                mimeType: msg.media_type,
                filename: typeof mediaName === "string" ? mediaName : null,
                asSticker: msg.message_type === "sticker",
              }),
              url: msg.media_url,
            }
          : null;
        if (!waText && !waMedia) return markFailed("Message is empty.");
        payload = {
          to: cleanTo,
          type: waMedia ? waMedia.kind : "text",
          ...(waMedia
            ? {
                media: {
                  kind: waMedia.kind,
                  url: waMedia.url,
                  mimeType: waMedia.mimeType,
                  filename: waMedia.filename,
                  caption: waText ?? undefined,
                },
              }
            : { text: { body: waText!, preview_url: !!extractFirstUrl(waText!) } }),
        };
      }

      if (providerReplyId) payload.contextMessageId = providerReplyId;

      const res = await impl.send(
        payload as never,
        {
          account,
          credentials,
          correlationId: `inbox-${msg.id}`,
          log: async () => {},
        } as never,
      );
      await admin
        .from("messages")
        .update({
          status: "sent",
          provider_message_id: res.externalMessageId,
          // Delivery receipts arrive keyed by the provider id; store it in
          // both columns so webhook status events match this row.
          external_message_id: res.externalMessageId,
          to_address: to,
          failed_reason: null,
          metadata: deliveryMetadata(msg.metadata),
        })
        .eq("id", msg.id);

      return { delivered: true, status: "sent", providerMessageId: res.externalMessageId };
    } catch (err) {
      const providerError = err as Error & { code?: string };
      const rawReason = [providerError?.code, providerError?.message ?? "WhatsApp delivery failed"]
        .filter(Boolean).join(": ");
      const { explainWhatsAppDeliveryFailure } =
        await import("@/lib/messaging/whatsapp-delivery-errors");
      const failure = explainWhatsAppDeliveryFailure(rawReason);
      const reason = failure.action ? `${failure.summary}. ${failure.action}` : failure.summary;
      return markFailed(reason);
    }
  }

  // ---- TikTok direct messages (Business Messaging) ----
  const tiktokDm = await import("@/lib/tiktok-dm/reply.server");
  if (tiktokDm.isTikTokDmConversation(conv as never)) {
    try {
      const res = await tiktokDm.deliverTikTokDmReply({
        admin,
        conv: conv as never,
        msg: { body: msg.body, reply_to_id: msg.reply_to_id },
      });
      await admin
        .from("messages")
        .update({
          status: "sent",
          provider_message_id: res.providerMessageId,
          external_message_id: res.providerMessageId,
          failed_reason: null,
          metadata: clearDeliveryError(deliveryMetadata(msg.metadata)),
        })
        .eq("id", msg.id);
      return { delivered: true, status: "sent", providerMessageId: res.providerMessageId ?? undefined };
    } catch (err) {
      return markFailed(redactSecrets((err as Error).message ?? "TikTok message failed"));
    }
  }

  // ---- Social comment threads (Facebook / YouTube / LinkedIn / TikTok) ----
  const { isSocialInboxPlatform } = await import("@/lib/social-inbox/normalize");
  if (isSocialInboxPlatform(conv.channel)) {
    try {
      const { deliverSocialCommentReply } = await import("@/lib/social-inbox/reply.server");
      const res = await deliverSocialCommentReply({
        admin,
        conv: conv as never,
        msg: { body: msg.body, reply_to_id: msg.reply_to_id },
      });
      await admin
        .from("messages")
        .update({
          status: "sent",
          provider_message_id: res.providerMessageId,
          external_message_id: res.providerMessageId,
          failed_reason: null,
          metadata: {
            ...clearDeliveryError(deliveryMetadata(msg.metadata)),
            reply_target_id: res.targetId,
            post_id: res.postId,
          },
        })
        .eq("id", msg.id);
      return {
        delivered: true,
        status: "sent",
        providerMessageId: res.providerMessageId ?? undefined,
      };
    } catch (err) {
      return markFailed(redactSecrets((err as Error).message ?? "Comment reply failed"));
    }
  }

  const channel = conv.channel as DeliverableChannel;
  if (!DELIVERABLE_CHANNELS.includes(channel)) {
    // No outbound implementation for this channel — keep the local ack.
    await sbAny(admin)
      .from("messages")
      .update({ status: "sent", metadata: deliveryMetadata(msg.metadata) })
      .eq("id", msg.id);
    return { delivered: false, status: "sent" };
  }

  const accountId = ((conv.metadata ?? {}) as Record<string, unknown>)["account_id"];

  const fail = markFailed;
  const failMessenger = (err: MessengerSendError) =>
    markFailed(err.userMessage(), err.toDeliveryError());

  if (typeof accountId !== "string" || !accountId) {
    return channel === "messenger"
      ? failMessenger(
          new MessengerSendError("account_config", "Conversation has no linked Facebook Page", {
            local: true,
          }),
        )
      : fail("This conversation is not linked to a connected account.");
  }

  // Messenger resolves its page-scoped recipient inside its own branch; CRM
  // channel identities are not page-scoped and must never become recipient.id.
  let recipient = "";
  if (channel !== "messenger") {
    let resolved = resolveRecipient(conv);
    if (!resolved && conv.contact_id) {
      const { data: identRaw } = await admin
        .from("channel_identities")
        .select("external_id")
        .eq("contact_id", conv.contact_id)
        .eq("channel", channel)
        .maybeSingle();
      resolved = (identRaw as { external_id?: string } | null)?.external_id ?? null;
    }
    if (!resolved) return fail("Could not resolve the recipient for this thread.");
    recipient = resolved;
  }

  const media = msg.media_url ? { url: msg.media_url, kind: mediaKind(msg.media_type) } : null;
  const text = msg.body?.trim() ? msg.body : null;
  const msgMeta = (msg.metadata ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const isTelegramLocation = channel === "telegram" && msg.message_type === "location";
  const isTelegramPoll = channel === "telegram" && msg.message_type === "poll";
  const isTelegramSticker = channel === "telegram" && msg.message_type === "sticker";
  if (!text && !media && !isTelegramLocation && !isTelegramPoll) return fail("Message is empty.");

  try {
    let providerMessageId = "";

    if (channel === "telegram") {
      const { data: accRaw } = await admin
        .from("telegram_accounts")
        .select("bot_token_ciphertext, status, status_reason, workspace_id")
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        bot_token_ciphertext?: string;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return fail("Telegram bot for this thread was not found.");
      }
      if (!acc.bot_token_ciphertext) return fail("Telegram bot token is missing.");
      if (acc.status && acc.status !== "connected") {
        return fail(
          `Telegram bot is ${acc.status}${acc.status_reason ? ` — ${acc.status_reason}` : ""}.`,
        );
      }
      const { sendTelegramMessage, callTelegram } = await import("@/lib/telegram/send.server");
      const card = msgMeta["contact_card"] as { name?: string; phone?: string } | undefined;
      if (isTelegramLocation) {
        const loc = msgMeta["location"] ?? {};
        const latitude = Number(loc.lat ?? loc.latitude);
        const longitude = Number(loc.lng ?? loc.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return fail("Location has no coordinates.");
        }
        const r = await callTelegram<{ message_id: number }>(
          acc.bot_token_ciphertext,
          "sendLocation",
          { chat_id: recipient, latitude, longitude },
        );
        providerMessageId = String(r.message_id);
      } else if (isTelegramPoll) {
        const { validatePoll } = await import("@/lib/inbox/poll");
        const pollMeta = msgMeta["poll"] as { question?: string; options?: string[] } | undefined;
        const validated = validatePoll({
          question: pollMeta?.question ?? "",
          options: Array.isArray(pollMeta?.options) ? pollMeta!.options : [],
        });
        if (!validated.ok) return fail(validated.reason);
        const r = await callTelegram<{ message_id: number }>(acc.bot_token_ciphertext, "sendPoll", {
          chat_id: recipient,
          question: validated.data.question,
          options: validated.data.options.map((text) => ({ text })),
          is_anonymous: false,
        });
        providerMessageId = String(r.message_id);
      } else if (isTelegramSticker) {
        if (!media) return fail("Sticker has no file.");
        const r = await callTelegram<{ message_id: number }>(
          acc.bot_token_ciphertext,
          "sendSticker",
          {
            chat_id: recipient,
            sticker: media.url,
          },
        );
        providerMessageId = String(r.message_id);
      } else if (msg.message_type === "contact" && card?.phone) {
        // Native Telegram contact card; without a phone it goes out as text.
        const r = await callTelegram<{ message_id: number }>(
          acc.bot_token_ciphertext,
          "sendContact",
          { chat_id: recipient, phone_number: card.phone, first_name: card.name || card.phone },
        );
        providerMessageId = String(r.message_id);
      } else {
        const res = await sendTelegramMessage({
          botTokenCipher: acc.bot_token_ciphertext,
          chatId: recipient,
          text,
          media: media
            ? {
                url: media.url,
                kind:
                  media.kind === "image"
                    ? "photo"
                    : media.kind === "video"
                      ? "video"
                      : media.kind === "audio"
                        ? "audio"
                        : "document",
              }
            : null,
        });
        providerMessageId = res.messageId;
      }
    } else if (channel === "email") {
      const { data: accRaw } = await admin
        .from("email_accounts")
        .select(
          "provider, from_email, from_name, reply_to, api_key_ciphertext, status, status_reason, workspace_id",
        )
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        provider?: string;
        from_email?: string;
        from_name?: string | null;
        reply_to?: string | null;
        api_key_ciphertext?: string | null;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return fail("Email account for this thread was not found.");
      }
      if (acc.provider !== "resend" || !acc.api_key_ciphertext || !acc.from_email) {
        return fail("This email account cannot send yet. Reconnect it with Resend.");
      }
      if (acc.status && acc.status !== "connected") {
        return fail(
          `Email account is ${acc.status}${acc.status_reason ? ` — ${acc.status_reason}` : ""}.`,
        );
      }
      const meta = (conv.metadata ?? {}) as Record<string, unknown>;
      const to =
        typeof meta["from"] === "string" && meta["from"] ? (meta["from"] as string) : recipient;
      const { sendResendEmail, replySubject } = await import("@/lib/email/send.server");
      const lastId =
        typeof meta["last_message_id"] === "string" ? (meta["last_message_id"] as string) : null;
      const lastRefs =
        typeof meta["last_references"] === "string" ? (meta["last_references"] as string) : null;
      // Media goes out as a real attachment (Resend fetches it by URL); the
      // link stays in the body for clients that strip attachments.
      const body = [text, media ? media.url : null].filter(Boolean).join("\n\n");
      const mediaName =
        typeof msgMeta["media_name"] === "string" ? (msgMeta["media_name"] as string) : null;
      const res = await sendResendEmail({
        apiKeyCipher: acc.api_key_ciphertext,
        fromEmail: acc.from_email,
        fromName: acc.from_name,
        to,
        subject: replySubject(
          typeof meta["last_subject"] === "string" ? (meta["last_subject"] as string) : "",
        ),
        text: body,
        attachments: media
          ? [{ path: media.url, filename: mediaName || `attachment-${msg.id.slice(0, 8)}` }]
          : undefined,
        replyTo: acc.reply_to,
        inReplyTo: lastId,
        references: [lastRefs, lastId].filter(Boolean).join(" ") || null,
      });
      providerMessageId = res.messageId;
    } else if (channel === "messenger") {
      const { data: accRaw } = await admin
        .from("messenger_accounts")
        .select("page_id, access_token_ciphertext, status, status_reason, workspace_id")
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        page_id?: string;
        access_token_ciphertext?: string;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return failMessenger(
          new MessengerSendError("account_config", "Facebook Page for this thread was not found", {
            local: true,
          }),
        );
      }
      if (!acc.page_id || !acc.access_token_ciphertext) {
        return failMessenger(
          new MessengerSendError("token_invalid", "Facebook Page access token is missing", {
            local: true,
          }),
        );
      }
      if (acc.status && acc.status !== "connected") {
        const kind = acc.status === "expired" ? "token_invalid" : "account_config";
        return failMessenger(
          new MessengerSendError(kind, `Facebook Page is ${acc.status}`, { local: true }),
        );
      }

      // The newest inbound message gives both a page-scoped PSID fallback for
      // legacy threads and the start of Meta's 24-hour reply window.
      const { data: lastInboundRaw } = await admin
        .from("messages")
        .select("from_address, created_at")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastInbound = lastInboundRaw as {
        from_address: string | null;
        created_at: string;
      } | null;

      const target = resolveMessengerRecipient(
        conv,
        acc.page_id,
        lastInbound?.from_address ?? null,
      );
      if (!target.ok) {
        return failMessenger(new MessengerSendError(target.kind, target.reason, { local: true }));
      }
      recipient = target.psid;

      if (isOutsideMessagingWindow(lastInbound?.created_at)) {
        return failMessenger(
          new MessengerSendError(
            "outside_window",
            "The customer's last message is older than 24 hours",
            { local: true },
          ),
        );
      }

      const { sendMessengerMessage } = await import("@/lib/messenger/send.server");
      try {
        const res = await sendMessengerMessage({
          pageId: acc.page_id,
          accessTokenCipher: acc.access_token_ciphertext,
          recipientPsid: recipient,
          text,
          attachment: media
            ? {
                type: media.kind === "document" ? "file" : media.kind,
                url: media.url,
              }
            : null,
          messagingType: "RESPONSE",
        });
        providerMessageId = res.messageId;
      } catch (err) {
        if (!(err instanceof MessengerSendError)) throw err;
        if (err.isAuthError) {
          const { handleMessengerSendError } = await import("@/lib/messenger/token.server");
          await handleMessengerSendError(accountId, err);
        }
        console.warn(
          "[inbox-outbound] messenger send rejected:",
          err.kind,
          err.metaCode ?? "",
          err.metaSubcode ?? "",
        );
        return failMessenger(err);
      }
    } else {
      const { data: accRaw } = await admin
        .from("instagram_accounts")
        .select("page_id, ig_user_id, access_token_ciphertext, status, status_reason, workspace_id")
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        page_id?: string;
        ig_user_id?: string;
        access_token_ciphertext?: string;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return fail("Instagram account for this thread was not found.");
      }
      if (!acc.access_token_ciphertext || !(acc.page_id || acc.ig_user_id)) {
        return fail("Instagram access token is missing. Reconnect the account.");
      }
      if (acc.status && acc.status !== "connected") {
        return fail(
          `Instagram account is ${acc.status}${acc.status_reason ? ` — ${acc.status_reason}` : ""}.`,
        );
      }
      const { sendInstagramMessage } = await import("@/lib/instagram/send.server");
      const res = await sendInstagramMessage({
        senderId: acc.page_id ?? acc.ig_user_id!,
        accessTokenCipher: acc.access_token_ciphertext,
        recipientId: recipient,
        text,
        media,
      });
      providerMessageId = res.messageId;
    }

    await admin
      .from("messages")
      .update({
        status: "sent",
        provider_message_id: providerMessageId || null,
        external_message_id: providerMessageId || null,
        to_address: recipient,
        failed_reason: null,
        metadata: clearDeliveryError(deliveryMetadata(msg.metadata)),
      })
      .eq("id", msg.id);

    return { delivered: true, status: "sent", providerMessageId };
  } catch (err) {
    return fail(redactSecrets((err as Error).message ?? "Delivery failed"));
  }
}

/**
 * Push a reaction (or its removal, with an empty emoji) to the message's
 * external channel. `useReactToMessage` already writes `metadata.reactions`
 * locally so the UI updates instantly — this is what actually makes that
 * reaction show up on the customer's app; without it, reacting in WACRM only
 * ever changed our own copy of the message.
 *
 * Channel coverage:
 *  - WhatsApp Cloud: native `reaction` message type (`buildSendBody`'s
 *    "reaction" case).
 *  - Telegram: Bot API `setMessageReaction` (Bot API 7.0+).
 *  - Messenger / Instagram: Meta's Send API has no endpoint for a Page/IG
 *    business account to send a message reaction — only end users can react,
 *    from their own client. There is nothing to call, so these stay a local
 *    (CRM-only) reaction, same as before this fix; see the report sent to
 *    the user for the explicit callout.
 */
export async function deliverReaction(args: {
  messageId: string;
  emoji: string;
}): Promise<DeliverResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const { data: msgRaw } = await admin
    .from("messages")
    .select("id, workspace_id, conversation_id, external_message_id, provider_message_id")
    .eq("id", args.messageId)
    .maybeSingle();
  const msg = msgRaw as {
    id: string;
    workspace_id: string;
    conversation_id: string | null;
    external_message_id: string | null;
    provider_message_id: string | null;
  } | null;
  const targetExternalId = msg?.external_message_id ?? msg?.provider_message_id ?? null;
  if (!msg || !msg.conversation_id || !targetExternalId) {
    return { delivered: false, status: "skipped" };
  }

  const { data: convRaw } = await admin
    .from("conversations")
    .select(
      "id, workspace_id, channel, contact_id, channel_account_id, external_conversation_id, metadata",
    )
    .eq("id", msg.conversation_id)
    .maybeSingle();
  const conv = convRaw as ConversationRow | null;
  if (!conv || conv.workspace_id !== msg.workspace_id) {
    return { delivered: false, status: "skipped" };
  }

  if (conv.channel === "telegram") {
    const chatId = ((conv.metadata ?? {}) as Record<string, unknown>)["chat_id"];
    const messageId = Number(targetExternalId);
    if (typeof chatId !== "string" && typeof chatId !== "number") {
      return { delivered: false, status: "skipped" };
    }
    if (!Number.isFinite(messageId)) return { delivered: false, status: "skipped" };

    // Non-WhatsApp channels keep their owning account in
    // `conversations.metadata.account_id`, not `channel_account_id` (that
    // column is WhatsApp-only — see thread-dedup.server.ts).
    const telegramAccountId = ((conv.metadata ?? {}) as Record<string, unknown>)["account_id"];
    if (typeof telegramAccountId !== "string" || !telegramAccountId) {
      return { delivered: false, status: "skipped" };
    }

    const { data: accRaw } = await admin
      .from("telegram_accounts")
      .select("bot_token_ciphertext, workspace_id")
      .eq("id", telegramAccountId)
      .maybeSingle();
    const acc = accRaw as { bot_token_ciphertext?: string; workspace_id?: string } | null;
    if (!acc || acc.workspace_id !== conv.workspace_id || !acc.bot_token_ciphertext) {
      return { delivered: false, status: "skipped" };
    }

    try {
      const { callTelegram } = await import("@/lib/telegram/send.server");
      await callTelegram(acc.bot_token_ciphertext, "setMessageReaction", {
        chat_id: chatId,
        message_id: messageId,
        reaction: args.emoji ? [{ type: "emoji", emoji: args.emoji }] : [],
      });
      return { delivered: true, status: "sent" };
    } catch (err) {
      return {
        delivered: false,
        status: "failed",
        error: (err as Error)?.message ?? "Reaction delivery failed",
      };
    }
  }

  if (conv.channel !== "whatsapp" && conv.channel !== "whatsapp_cloud") {
    return { delivered: false, status: "skipped" };
  }

  const metaAccount = ((conv.metadata ?? {}) as Record<string, unknown>)["account_id"];
  const waAccountId =
    (conv as unknown as { channel_account_id?: string | null }).channel_account_id ??
    (typeof metaAccount === "string" ? metaAccount : null);
  if (!waAccountId) return { delivered: false, status: "skipped" };

  let to = resolveRecipient(conv);
  if (!to && conv.contact_id) {
    const { data: identRaw } = await admin
      .from("channel_identities")
      .select("external_id")
      .eq("contact_id", conv.contact_id)
      .eq("channel", "whatsapp")
      .maybeSingle();
    to = (identRaw as { external_id?: string } | null)?.external_id ?? null;
    if (!to) {
      const { data: contactRaw } = await admin
        .from("contacts")
        .select("phone")
        .eq("id", conv.contact_id)
        .maybeSingle();
      to = (contactRaw as { phone?: string | null } | null)?.phone ?? null;
    }
  }
  if (!to) return { delivered: false, status: "failed", error: "No recipient on file." };
  const cleanTo = to.replace(/[^\d+]/g, "");

  try {
    const { loadChannelAccount, loadCredentials, getProvider } =
      await import("@/lib/messaging/registry.server");
    const account = await loadChannelAccount(waAccountId);
    const credentials = loadCredentials(account);
    const impl = getProvider(account.provider);
    const res = await impl.send(
      {
        to: cleanTo,
        type: "reaction",
        reaction: { messageId: targetExternalId, emoji: args.emoji },
      } as never,
      {
        account,
        credentials,
        correlationId: `inbox-reaction-${msg.id}`,
        log: async () => {},
      } as never,
    );
    return { delivered: true, status: "sent", providerMessageId: res.externalMessageId };
  } catch (err) {
    return {
      delivered: false,
      status: "failed",
      error: (err as Error)?.message ?? "Reaction delivery failed",
    };
  }
}

/**
 * Deliver every still-queued outbound message in a conversation.
 *
 * The composer delivers inline, but a dropped network call can leave a row
 * stuck at `queued` forever. This lets the client resume those safely — each
 * message is re-checked server-side and only delivered while still queued.
 */
export async function deliverQueuedMessages(args: {
  conversationId: string;
  userId: string;
  limit?: number;
}): Promise<{ attempted: number; sent: number; failed: number }> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const { data: rows } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("direction", "outbound")
    .eq("status", "queued")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(args.limit ?? 20);

  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await deliverInboxMessage({ messageId: id, userId: args.userId });
    if (result.status === "sent") sent += 1;
    else if (result.status === "failed") failed += 1;
  }
  return { attempted: ids.length, sent, failed };
}
