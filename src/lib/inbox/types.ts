/**
 * Omnichannel Inbox — channel-neutral types.
 *
 * One Customer → One Timeline → Many Channels → One Inbox.
 *
 * Every channel provider (WhatsApp Cloud, WhatsApp QR, Instagram, Messenger,
 * Telegram, Email, Live Chat, SMS, Discord, Slack, Teams, Apple/Google
 * Business Messages, LINE, Viber, WeChat) implements `ChannelProvider` and
 * emits/consumes these types. All UI, hooks, engines, and DB rows speak
 * this shape. Nothing else knows about a specific channel's wire format.
 */

export type ChannelKind =
  // Active
  | "whatsapp_cloud"
  | "whatsapp_qr"
  | "instagram"
  | "messenger"
  | "telegram"
  | "email"
  | "live_chat"
  | "sms"
  // Future
  | "discord"
  | "slack"
  | "teams"
  | "apple_business"
  | "google_business"
  | "line"
  | "viber"
  | "wechat";

export type ChannelCapability =
  | "text"
  | "emoji"
  | "image"
  | "video"
  | "audio"
  | "voice_note"
  | "document"
  | "location"
  | "contact_card"
  | "interactive_buttons"
  | "interactive_list"
  | "template"
  | "reaction"
  | "reply_quote"
  | "forward"
  | "edit"
  | "delete"
  | "typing_indicator"
  | "read_receipt"
  | "delivery_receipt"
  | "presence"
  | "threads";

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "deleted";

export type NormalizedMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "template"
  | "interactive"
  | "reaction"
  | "system"
  | "unknown";

/** A stable, cross-channel identity for one human. */
export interface UnifiedCustomerRef {
  customerId: string;         // internal uuid
  workspaceId: string;
  displayName?: string;
  avatarUrl?: string;
}

/** A per-channel handle owned by a customer (phone, IG PSID, email, etc.). */
export interface ChannelIdentity {
  id: string;
  customerId: string;
  channel: ChannelKind;
  externalId: string;         // provider-scoped user id
  displayName?: string;
  avatarUrl?: string;
  verified?: boolean;
  metadata?: Record<string, unknown>;
}

/** Channel-neutral, normalized message shape stored in `messages`. */
export interface UnifiedMessage {
  id: string;
  workspaceId: string;
  conversationId: string;
  channel: ChannelKind;
  channelAccountId: string;
  direction: MessageDirection;
  type: NormalizedMessageType;
  status: MessageStatus;
  senderRef: string;          // externalId of sender
  text?: string;
  media?: {
    url?: string;
    storagePath?: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    durationMs?: number;
    waveform?: number[];
  };
  location?: { lat: number; lng: number; name?: string; address?: string };
  contact?: Array<{ name: string; phones?: string[]; emails?: string[] }>;
  interactive?: Record<string, unknown>;
  reaction?: { toMessageId: string; emoji: string };
  quotedMessageId?: string;
  forwardedFromId?: string;
  editedAt?: string;
  deletedAt?: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/** Outbound draft — channel-neutral. */
export interface OutboundDraft {
  conversationId: string;
  channel: ChannelKind;
  channelAccountId: string;
  to: string;                 // channel-scoped externalId
  type: NormalizedMessageType;
  text?: string;
  media?: UnifiedMessage["media"];
  location?: UnifiedMessage["location"];
  contact?: UnifiedMessage["contact"];
  interactive?: UnifiedMessage["interactive"];
  template?: { name: string; language: string; components?: unknown[] };
  reaction?: UnifiedMessage["reaction"];
  quotedMessageId?: string;
  clientId?: string;          // optimistic id
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}

/** Result of a provider send. */
export interface SendResult {
  providerMessageId: string;
  status: MessageStatus;
  raw?: unknown;
}

/** Result of normalizing an inbound webhook payload. */
export interface InboundEvent {
  channel: ChannelKind;
  channelAccountId: string;
  kind: "message" | "status" | "reaction" | "typing" | "presence" | "delete" | "edit";
  message?: UnifiedMessage;
  statusUpdate?: {
    providerMessageId: string;
    status: MessageStatus;
    timestamp: string;
    errorCode?: string;
    errorMessage?: string;
  };
  identity?: ChannelIdentity;
  raw?: unknown;
}

/** Channel account credentials/config resolved at runtime. */
export interface ChannelAccountRef {
  id: string;
  workspaceId: string;
  channel: ChannelKind;
  externalAccountId: string;  // phone_number_id, IG page id, bot id, mailbox id
  displayName?: string;
  metadata?: Record<string, unknown>;
}
