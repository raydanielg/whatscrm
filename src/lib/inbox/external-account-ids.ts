/**
 * Synthetic inbox account ids for channels that do NOT live in
 * `channel_accounts`.
 *
 * Only WhatsApp is stored in `channel_accounts`. Telegram, Messenger,
 * Instagram, Email and SMS each have their own provider table
 * (`telegram_accounts`, `messenger_accounts`, `instagram_accounts`,
 * `email_accounts`, `sms_accounts`), and Live Chat "accounts" are
 * widget-enabled chatbots. To let one selector drive them all, those rows are
 * projected into the inbox with a prefixed id (`telegram:<uuid>`) that can
 * never collide with a real `channel_accounts.id`.
 *
 * Conversations for these channels are linked through
 * `conversations.metadata->>account_id` (the provider-table row id), because
 * `conversations.channel_account_id` has a FK to `channel_accounts` and would
 * reject a provider-table id.
 */

import type { InboxChannel } from "@/hooks/use-conversations";

export const EXTERNAL_ACCOUNT_CHANNELS = [
  "telegram",
  "messenger",
  "instagram",
  "email",
  "sms",
  "facebook",
  "youtube",
  "linkedin",
  "tiktok",
] as const;
export type ExternalAccountChannel = (typeof EXTERNAL_ACCOUNT_CHANNELS)[number];

export function isExternalAccountChannel(c: string): c is ExternalAccountChannel {
  return (EXTERNAL_ACCOUNT_CHANNELS as readonly string[]).includes(c);
}


/** `telegram:<uuid>` */
export function externalAccountId(channel: ExternalAccountChannel, rowId: string): string {
  return `${channel}:${rowId}`;
}

/** Parse a synthetic id back into its channel + provider-table row id. */
export function parseExternalAccountId(
  id?: string | null,
): { channel: ExternalAccountChannel; rowId: string } | null {
  if (!id) return null;
  const idx = id.indexOf(":");
  if (idx <= 0) return null;
  const channel = id.slice(0, idx);
  const rowId = id.slice(idx + 1);
  if (!rowId || !isExternalAccountChannel(channel)) return null;
  return { channel, rowId };
}

/**
 * Attribute an unread row to a synthetic account id when the conversation
 * belongs to one of the provider-table channels.
 */
export function externalAccountKeyForConversation(
  channel: InboxChannel | string | null | undefined,
  metadataAccountId: string | null | undefined,
): string | null {
  if (!channel || !metadataAccountId) return null;
  return isExternalAccountChannel(channel) ? externalAccountId(channel, metadataAccountId) : null;
}
