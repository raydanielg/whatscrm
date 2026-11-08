/**
 * Per-channel composer capabilities.
 *
 * The omnichannel composer renders one UI for every channel, but each network
 * supports a different subset of message types. This map is the single source
 * of truth used to enable/disable composer affordances so agents never compose
 * something the channel will reject.
 */

import type { InboxChannel } from "@/hooks/use-conversations";

export type ComposerCapability =
  | "text"
  | "emoji"
  | "media"
  | "document"
  | "location"
  | "contact_card"
  | "voice_note"
  | "templates"
  | "schedule";

export const CHANNEL_LABELS: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  telegram: "Telegram",
  email: "Email",
  sms: "SMS",
  webchat: "Live Chat",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  voice: "Voice",
  other: "Other",
};

/** Channels surfaced as quick filters in the conversation list, in order. */
export const FILTERABLE_CHANNELS: InboxChannel[] = [
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
  "email",
  "sms",
  "webchat",
  "facebook",
  "youtube",
  "linkedin",
  "tiktok",
];

const ALL: ComposerCapability[] = [
  "text", "emoji", "media", "document", "location",
  "contact_card", "voice_note", "templates", "schedule",
];

export const CHANNEL_COMPOSER_CAPABILITIES: Record<InboxChannel, ComposerCapability[]> = {
  whatsapp: ALL,
  telegram: ["text", "emoji", "media", "document", "location", "contact_card", "voice_note", "templates", "schedule"],
  messenger: ["text", "emoji", "media", "document", "templates", "schedule"],
  instagram: ["text", "emoji", "media", "voice_note", "templates", "schedule"],
  email: ["text", "emoji", "media", "document", "templates", "schedule"],
  sms: ["text", "templates", "schedule"],
  webchat: ["text", "emoji", "media", "document", "templates"],
  // Public comment replies: text only.
  facebook: ["text", "emoji"],
  youtube: ["text", "emoji"],
  linkedin: ["text", "emoji"],
  tiktok: ["text", "emoji"],
  voice: ["text"],
  other: ALL,
};

export function channelCan(channel: InboxChannel | undefined | null, cap: ComposerCapability): boolean {
  if (!channel) return true;
  return (CHANNEL_COMPOSER_CAPABILITIES[channel] ?? ALL).includes(cap);
}

export function channelLabel(channel?: string | null): string {
  return CHANNEL_LABELS[(channel ?? "other") as InboxChannel] ?? (channel ?? "Other");
}

/**
 * Normalize a `channel_accounts.provider` value (e.g. "whatsapp_cloud",
 * "whatsapp_qr", "webchat") onto the `InboxChannel` used by the filters.
 */
export function providerToChannel(provider: string): InboxChannel {
  const p = provider.toLowerCase();
  // Keyword matching (not prefixes) so vendor-prefixed values such as
  // "meta_whatsapp", "twilio_whatsapp" or "360dialog_whatsapp" resolve too.
  if (p.includes("whatsapp") || p.includes("dialog360") || p.includes("360dialog")) return "whatsapp";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("facebook_comment")) return "facebook";
  if (p.includes("youtube")) return "youtube";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("messenger") || p.includes("facebook")) return "messenger";
  if (p.includes("telegram")) return "telegram";
  if (
    p.includes("email") || p.includes("smtp") || p.includes("imap") || p.includes("mail") ||
    ["sendgrid", "resend", "postmark", "ses", "smtp2go"].includes(p)
  ) return "email";
  if (p.includes("webchat") || p.startsWith("live")) return "webchat";
  if (p.includes("sms") || ["messagebird", "vonage", "sinch", "plivo"].includes(p)) return "sms";
  if (p.includes("voice") || p.includes("call")) return "voice";
  if (p.includes("twilio")) return "sms";
  return "other";
}

/**
 * Same as {@link providerToChannel}, but returns `null` for unknown/empty
 * providers instead of falling back to "other". Use where an unrecognised
 * provider should be skipped rather than bucketed.
 */
export function providerToChannelOrNull(provider?: string | null): InboxChannel | null {
  if (!provider) return null;
  const ch = providerToChannel(provider);
  return ch === "other" && provider.toLowerCase() !== "other" ? null : ch;
}

/* ------------------------------------------------------------------ *
 * Provider registry — strict typing + validation
 * ------------------------------------------------------------------ */

/**
 * Every `channel_accounts.provider` value the app knows how to route.
 * Anything outside this list is treated as invalid data (a bad migration,
 * a hand-edited row, or a provider added to the DB but not to the app) and
 * MUST surface a visible error instead of silently disappearing from the UI.
 */
export const KNOWN_PROVIDERS = [
  "whatsapp_cloud",
  "whatsapp_qr",
  "meta_whatsapp",
  "360dialog_whatsapp",
  "dialog360",
  "twilio_whatsapp",
  "meta_messenger",
  "messenger",
  "facebook",
  "meta_instagram",
  "instagram",
  "telegram",
  "telegram_bot",
  "email",
  "email_smtp",
  "smtp",
  "imap",
  "gmail",
  "outlook_mail",
  "sendgrid",
  "mailgun",
  "resend",
  "postmark",
  "ses",
  "smtp2go",
  "sms",
  "twilio_sms",
  "twilio",
  "messagebird",
  "vonage",
  "sinch",
  "plivo",
  "webchat",
  "livechat",
  "live_chat",
  "voice",
  "twilio_voice",
  "call",
  "facebook_comments",
  "youtube",
  "linkedin",
  "tiktok",
] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

const KNOWN_PROVIDER_SET: ReadonlySet<string> = new Set(KNOWN_PROVIDERS);

/** Type guard for a stored provider string the app can route. */
export function isKnownProvider(value: unknown): value is KnownProvider {
  return typeof value === "string" && KNOWN_PROVIDER_SET.has(value.trim().toLowerCase());
}

export type ProviderParseResult =
  | { ok: true; provider: KnownProvider; channel: InboxChannel }
  | { ok: false; provider: string; channel: InboxChannel | null; reason: string };

/**
 * Validate + normalize a stored provider value.
 *
 * Returns a discriminated result so callers can render a clear error state
 * for unknown providers rather than bucketing them into "other" (which makes
 * the account invisible in every channel filter).
 */
export function parseProvider(value: unknown): ProviderParseResult {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      provider: typeof value === "string" ? value : String(value ?? ""),
      channel: null,
      reason: "Provider is missing or empty.",
    };
  }
  const raw = value.trim();
  const p = raw.toLowerCase();
  if (KNOWN_PROVIDER_SET.has(p)) {
    return { ok: true, provider: p as KnownProvider, channel: providerToChannel(p) };
  }
  const guessed = providerToChannelOrNull(p);
  return {
    ok: false,
    provider: raw,
    channel: guessed,
    reason: guessed
      ? `Unknown provider "${raw}" — it looks like a ${channelLabel(guessed)} account but is not supported yet.`
      : `Unknown provider "${raw}" — this channel type is not supported.`,
  };
}

/** Split a list of account-like records into routable and invalid buckets. */
export function partitionByProvider<T extends { provider: string }>(
  rows: readonly T[],
): { valid: T[]; invalid: Array<{ row: T; reason: string }> } {
  const valid: T[] = [];
  const invalid: Array<{ row: T; reason: string }> = [];
  for (const row of rows) {
    const parsed = parseProvider(row.provider);
    if (parsed.ok) valid.push(row);
    else invalid.push({ row, reason: parsed.reason });
  }
  return { valid, invalid };
}

/** True when the channel is one of the quick filters in the conversation list. */
export function isFilterableChannel(value: unknown): value is InboxChannel {
  return typeof value === "string" && FILTERABLE_CHANNELS.includes(value as InboxChannel);
}

/**
 * Where a user goes to connect an account for a channel. Used by the inbox
 * selector so an empty channel offers a direct "Connect" action instead of a
 * dead end. Channels without a dedicated panel fall back to the marketplace.
 */
export function channelSetupPath(channel: InboxChannel): {
  to: string;
  params?: Record<string, string>;
} {
  switch (channel) {
    case "whatsapp":
      return { to: "/api-config/$section", params: { section: "whatsapp" } };
    case "messenger":
      return { to: "/api-config/$section", params: { section: "messenger" } };
    case "instagram":
      return { to: "/api-config/$section", params: { section: "instagram" } };
    case "telegram":
      return { to: "/api-config/$section", params: { section: "telegram" } };
    case "webchat":
      return { to: "/chatbots" };
    case "facebook":
      return { to: "/api-config/$section", params: { section: "facebook-comments" } };
    case "youtube":
    case "linkedin":
    case "tiktok":
    case "email":
    case "sms":
      return { to: "/api-config/$section", params: { section: channel } };
    default:
      // Channels without a dedicated setup panel (e.g. voice).
      return { to: "/integrations/marketplace" };
  }
}
