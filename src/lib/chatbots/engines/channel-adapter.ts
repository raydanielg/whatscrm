/**
 * ChannelAdapter — normalizes inbound/outbound payloads per channel.
 *
 * Every channel (WhatsApp, Instagram, Messenger, Telegram, Live Chat, Email,
 * SMS, Web) delivers a slightly different payload shape. The adapter exposes:
 *   • parse(raw)  → InboundEvent
 *   • format(res) → channel-specific outbound payload
 *
 * The chatbot engine only sees the canonical InboundEvent / TurnResult; new
 * channels are added by registering another Adapter.
 */
import type { ChatbotChannel, JsonValue } from "../chatbots.functions";
import type { TurnResult } from "./types";

export interface InboundEvent {
  channel: ChatbotChannel;
  externalId: string;      // provider-side conversation/thread id
  senderId: string;        // provider-side user id (phone, IG id, )
  text: string;
  locale?: string;
  attachments?: Array<{ url: string; mime: string; kind: "image" | "audio" | "video" | "document" }>;
  meta?: Record<string, JsonValue>;
}

export interface OutboundPayload {
  channel: ChatbotChannel;
  text: string;
  quickReplies?: string[];
  buttons?: Array<{ label: string; url?: string; payload?: string }>;
  meta?: Record<string, JsonValue>;
}

export interface ChannelAdapter {
  parse: (raw: unknown) => InboundEvent | null;
  format: (result: TurnResult, channel: ChatbotChannel) => OutboundPayload;
}

// ---------- Adapters ----------

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? v as Record<string, unknown> : {});
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const whatsapp: ChannelAdapter = {
  parse: (raw) => {
    const r = asRecord(raw);
    const change = ((asRecord((asRecord(r).entry as unknown[])?.[0]).changes) as unknown[])?.[0];
    const value = asRecord(asRecord(change).value);
    const msg = asRecord((value.messages as unknown[])?.[0]);
    if (!msg.id) return null;
    return {
      channel: "whatsapp",
      externalId: asString(msg.from),
      senderId: asString(msg.from),
      text: asString(asRecord(msg.text).body) || asString(asRecord(msg.button).text),
      meta: { message_id: asString(msg.id) },
    };
  },
  format: (r) => ({ channel: "whatsapp", text: r.reply, quickReplies: r.suggestions }),
};

const instagram: ChannelAdapter = {
  parse: (raw) => {
    const entry = asRecord((asRecord(raw).entry as unknown[])?.[0]);
    const messaging = asRecord((entry.messaging as unknown[])?.[0]);
    const sender = asRecord(messaging.sender);
    const message = asRecord(messaging.message);
    if (!sender.id) return null;
    return {
      channel: "instagram",
      externalId: asString(sender.id),
      senderId: asString(sender.id),
      text: asString(message.text),
      meta: { mid: asString(message.mid) },
    };
  },
  format: (r) => ({ channel: "instagram", text: r.reply, quickReplies: r.suggestions }),
};

const messenger: ChannelAdapter = {
  parse: (raw) => {
    const entry = asRecord((asRecord(raw).entry as unknown[])?.[0]);
    const messaging = asRecord((entry.messaging as unknown[])?.[0]);
    const sender = asRecord(messaging.sender);
    const message = asRecord(messaging.message);
    if (!sender.id) return null;
    return {
      channel: "messenger",
      externalId: asString(sender.id),
      senderId: asString(sender.id),
      text: asString(message.text),
      meta: { mid: asString(message.mid) },
    };
  },
  format: (r) => ({ channel: "messenger", text: r.reply, quickReplies: r.suggestions }),
};

const telegram: ChannelAdapter = {
  parse: (raw) => {
    const r = asRecord(raw);
    const msg = asRecord(r.message);
    const chat = asRecord(msg.chat);
    if (!chat.id) return null;
    return {
      channel: "telegram",
      externalId: String(chat.id),
      senderId: String(asRecord(msg.from).id ?? chat.id),
      text: asString(msg.text),
      locale: asString(asRecord(msg.from).language_code),
    };
  },
  format: (r) => ({ channel: "telegram", text: r.reply, quickReplies: r.suggestions }),
};

const livechat: ChannelAdapter = {
  parse: (raw) => {
    const r = asRecord(raw);
    return {
      channel: "livechat",
      externalId: asString(r.session_id),
      senderId: asString(r.visitor_id) || asString(r.session_id),
      text: asString(r.text),
      locale: asString(r.locale),
    };
  },
  format: (r) => ({ channel: "livechat", text: r.reply, quickReplies: r.suggestions }),
};

const email: ChannelAdapter = {
  parse: (raw) => {
    const r = asRecord(raw);
    if (!r.from) return null;
    return {
      channel: "email",
      externalId: asString(r.thread_id) || asString(r.message_id),
      senderId: asString(r.from),
      text: asString(r.text) || asString(r.html),
      meta: { subject: asString(r.subject) },
    };
  },
  format: (r) => ({ channel: "email", text: r.reply }),
};

const sms: ChannelAdapter = {
  parse: (raw) => {
    const r = asRecord(raw);
    if (!r.From) return null;
    return {
      channel: "sms",
      externalId: asString(r.From),
      senderId: asString(r.From),
      text: asString(r.Body),
    };
  },
  format: (r) => ({ channel: "sms", text: r.reply }),
};

const web: ChannelAdapter = {
  parse: (raw) => {
    const r = asRecord(raw);
    return {
      channel: "web",
      externalId: asString(r.session_id) || "web",
      senderId: asString(r.visitor_id) || "web",
      text: asString(r.text),
    };
  },
  format: (r) => ({ channel: "web", text: r.reply, quickReplies: r.suggestions }),
};

export const CHANNEL_ADAPTERS: Record<ChatbotChannel, ChannelAdapter> = {
  whatsapp, instagram, messenger, telegram, livechat, email, sms, web,
};

export const ChannelAdapterRegistry = {
  get(channel: ChatbotChannel): ChannelAdapter {
    return CHANNEL_ADAPTERS[channel] ?? web;
  },
  parse(channel: ChatbotChannel, raw: unknown): InboundEvent | null {
    return ChannelAdapterRegistry.get(channel).parse(raw);
  },
  format(channel: ChatbotChannel, result: TurnResult): OutboundPayload {
    return ChannelAdapterRegistry.get(channel).format(result, channel);
  },
};
