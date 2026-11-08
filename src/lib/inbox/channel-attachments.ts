/**
 * Per-channel attachment rules for the Inbox composer and outbound delivery.
 *
 * One map, used on both sides: the composer hides attachment options a channel
 * cannot deliver and rejects bad files before upload; `outbound.server.ts`
 * re-checks the persisted row so a bad send fails with a clear reason instead
 * of a vague provider error. Keep this file free of server/client-only imports.
 *
 * Limits reflect what each provider accepts for media sent by public URL (the
 * only way this app sends media), see docs/inbox-channel-attachments.md.
 */

export type AttachmentKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "voice_note"
  | "location"
  | "contact"
  | "product"
  | "sticker"
  | "poll"
  | "event";

/** File-backed kinds. `voice_note` is validated as `audio`. */
export type FileKind = "image" | "video" | "audio" | "document" | "sticker";

export interface ChannelAttachmentRules {
  label: string;
  kinds: readonly AttachmentKind[];
  /** Accepted mime types per file kind. An empty list means "any type". */
  mime: Partial<Record<FileKind, readonly string[]>>;
  /** Max bytes per file kind. */
  maxBytes: Partial<Record<FileKind, number>>;
  /**
   * Max bytes for an *animated* sticker, when different from `maxBytes.sticker`
   * (WhatsApp: 100 KB static / 500 KB animated).
   */
  maxBytesAnimatedSticker?: number;
  /**
   * True when a text caption is delivered together with media. Messenger and
   * Instagram drop the text of a media message, so captions must be sent as a
   * separate text message there.
   */
  captionWithMedia: boolean;
  /** Native WhatsApp catalog product messages (interactive product/product_list). */
  nativeProducts: boolean;
}

const MB = 1024 * 1024;

const TEXT_ONLY = (label: string): ChannelAttachmentRules => ({
  label,
  kinds: [],
  mime: {},
  maxBytes: {},
  captionWithMedia: false,
  nativeProducts: false,
});

export const CHANNEL_ATTACHMENT_RULES: Record<string, ChannelAttachmentRules> = {
  whatsapp: {
    label: "WhatsApp",
    kinds: [
      "image",
      "video",
      "audio",
      "document",
      "voice_note",
      "location",
      "contact",
      "product",
      "sticker",
      "event",
    ],
    mime: {
      image: ["image/jpeg", "image/png"],
      video: ["video/mp4", "video/3gp", "video/3gpp"],
      audio: ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/ogg"],
      document: [],
      sticker: ["image/webp"],
    },
    maxBytes: {
      image: 5 * MB,
      video: 16 * MB,
      audio: 16 * MB,
      document: 100 * MB,
      sticker: 100 * 1024, // static webp sticker limit
    },
    maxBytesAnimatedSticker: 500 * 1024,
    captionWithMedia: true,
    nativeProducts: true,
  },
  telegram: {
    label: "Telegram",
    kinds: [
      "image",
      "video",
      "audio",
      "document",
      "voice_note",
      "location",
      "contact",
      "product",
      "sticker",
      "poll",
      "event",
    ],
    mime: {
      image: ["image/jpeg", "image/png", "image/webp"],
      video: ["video/mp4"],
      audio: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/ogg", "audio/x-m4a", "audio/aac"],
      document: [],
      sticker: ["image/webp"],
    },
    // Bot API limits for files sent by URL: photos 5 MB, everything else 20 MB.
    maxBytes: {
      image: 5 * MB,
      video: 20 * MB,
      audio: 20 * MB,
      document: 20 * MB,
      sticker: 512 * 1024,
    },
    captionWithMedia: true,
    nativeProducts: false,
  },
  messenger: {
    label: "Messenger",
    kinds: ["image", "video", "audio", "document", "product", "event"],
    mime: {
      image: ["image/jpeg", "image/png", "image/gif"],
      video: ["video/mp4", "video/quicktime", "video/webm"],
      audio: [
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/aac",
        "audio/wav",
        "audio/ogg",
        "audio/x-m4a",
      ],
      document: [],
    },
    maxBytes: { image: 8 * MB, video: 25 * MB, audio: 25 * MB, document: 25 * MB },
    captionWithMedia: false,
    nativeProducts: false,
  },
  instagram: {
    label: "Instagram",
    // Instagram DMs accept image, video and audio only — no files/documents.
    kinds: ["image", "video", "audio", "voice_note", "product"],
    mime: {
      image: ["image/jpeg", "image/png", "image/gif"],
      video: ["video/mp4", "video/quicktime", "video/webm", "video/ogg"],
      audio: ["audio/aac", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/mpeg"],
    },
    maxBytes: { image: 8 * MB, video: 25 * MB, audio: 25 * MB },
    captionWithMedia: false,
    nativeProducts: false,
  },
  email: {
    label: "Email",
    kinds: ["image", "video", "audio", "document", "product", "event"],
    mime: { image: [], video: [], audio: [], document: [] },
    // Resend caps a whole message at 40 MB; leave room for encoding overhead.
    maxBytes: { image: 25 * MB, video: 25 * MB, audio: 25 * MB, document: 25 * MB },
    captionWithMedia: true,
    nativeProducts: false,
  },
  webchat: {
    label: "Live Chat",
    // The widget renders any media row from the inbox (images inline, others as files).
    kinds: ["image", "video", "audio", "document", "product", "event"],
    mime: { image: [], video: [], audio: [], document: [] },
    maxBytes: { image: 25 * MB, video: 25 * MB, audio: 25 * MB, document: 25 * MB },
    captionWithMedia: true,
    nativeProducts: false,
  },
  sms: TEXT_ONLY("SMS"),
  facebook: TEXT_ONLY("Facebook comments"),
  youtube: TEXT_ONLY("YouTube comments"),
  linkedin: TEXT_ONLY("LinkedIn comments"),
  tiktok: TEXT_ONLY("TikTok comments"),
  voice: TEXT_ONLY("Voice"),
  other: TEXT_ONLY("this channel"),
};

/** Map raw `conversations.channel` values (e.g. `whatsapp_cloud`) onto a rules key. */
export function attachmentChannelKey(channel: string | null | undefined): string {
  const c = (channel ?? "").toLowerCase();
  if (!c) return "other";
  if (c.includes("whatsapp")) return "whatsapp";
  if (CHANNEL_ATTACHMENT_RULES[c]) return c;
  if (c.includes("livechat") || c.includes("live_chat")) return "webchat";
  return "other";
}

export function attachmentRules(channel: string | null | undefined): ChannelAttachmentRules {
  return CHANNEL_ATTACHMENT_RULES[attachmentChannelKey(channel)]!;
}

export function channelAllows(channel: string | null | undefined, kind: AttachmentKind): boolean {
  return attachmentRules(channel).kinds.includes(kind);
}

function normalizeMime(mime: string | null | undefined): string {
  return (mime ?? "").toLowerCase().split(";")[0]!.trim();
}

export function fileKindOf(mime: string | null | undefined): FileKind {
  const m = normalizeMime(mime);
  if (m === "image" || m.startsWith("image/")) return "image";
  if (m === "video" || m.startsWith("video/")) return "video";
  if (m === "audio" || m.startsWith("audio/")) return "audio";
  return "document";
}

/** `accept` attribute for a file input limited to the given kinds. */
export function acceptFor(channel: string | null | undefined, kinds: readonly FileKind[]): string {
  const rules = attachmentRules(channel);
  const parts: string[] = [];
  for (const k of kinds) {
    if (!rules.kinds.includes(k)) continue;
    const list = rules.mime[k];
    if (!list) continue;
    if (list.length === 0) {
      if (k === "document") return ""; // any file
      parts.push(`${k}/*`);
    } else parts.push(...list);
  }
  return Array.from(new Set(parts)).join(",");
}

function formatBytes(n: number): string {
  return n >= MB ? `${Math.round(n / MB)} MB` : `${Math.round(n / 1024)} KB`;
}

export type AttachmentCheck =
  { ok: true; kind: FileKind; downgraded: boolean } | { ok: false; reason: string };

/**
 * Decide how a file goes out on a channel, or why it cannot.
 *
 * An image/video/audio whose exact type the channel rejects is sent as a
 * document where the channel accepts documents (matches the WhatsApp
 * downgrade in `whatsapp-media-support.ts`).
 *
 * Pass `wantKind: "sticker"` to validate a webp file as a sticker instead of
 * a plain image (stickers have their own, stricter, size limits and are only
 * offered on channels whose `kinds` include `sticker`). `animated` refines
 * the WhatsApp static/animated sticker size limit.
 */
export function checkAttachment(
  channel: string | null | undefined,
  file: { mime: string | null | undefined; size?: number | null },
  wantKind?: "sticker",
  opts?: { animated?: boolean },
): AttachmentCheck {
  const rules = attachmentRules(channel);
  const mime = normalizeMime(file.mime);
  const size = typeof file.size === "number" && file.size > 0 ? file.size : null;

  if (wantKind === "sticker") {
    if (!rules.kinds.includes("sticker")) {
      return { ok: false, reason: `${rules.label} does not accept stickers.` };
    }
    const list = rules.mime.sticker ?? [];
    if (!(list.length === 0 || (!!mime && list.includes(mime)))) {
      return {
        ok: false,
        reason: `${rules.label} stickers must be ${list.join(", ") || "a supported image type"}.`,
      };
    }
    const max =
      opts?.animated && rules.maxBytesAnimatedSticker
        ? rules.maxBytesAnimatedSticker
        : rules.maxBytes.sticker;
    if (size && max && size > max) {
      return {
        ok: false,
        reason: `Sticker is ${formatBytes(size)}; ${rules.label} allows up to ${formatBytes(max)} for ${opts?.animated ? "animated" : "static"} stickers.`,
      };
    }
    return { ok: true, kind: "sticker", downgraded: false };
  }

  const wanted = fileKindOf(mime);

  const typeOk = (k: FileKind) => {
    if (!rules.kinds.includes(k)) return false;
    const list = rules.mime[k];
    if (!list) return false;
    return list.length === 0 || (!!mime && list.includes(mime));
  };

  let kind: FileKind | null = typeOk(wanted) ? wanted : null;
  let downgraded = false;
  if (!kind && wanted !== "document" && typeOk("document")) {
    kind = "document";
    downgraded = true;
  }
  if (!kind) {
    if (rules.kinds.length === 0) {
      return { ok: false, reason: `${rules.label} supports text messages only.` };
    }
    const what =
      wanted === "document" ? "files/documents" : `${wanted} files of type ${mime || "unknown"}`;
    const allowed = (rules.mime[wanted] ?? []).join(", ");
    return {
      ok: false,
      reason: `${rules.label} does not accept ${what}.${allowed ? ` Allowed: ${allowed}.` : ""}`,
    };
  }
  const max = rules.maxBytes[kind];
  if (size && max && size > max) {
    return {
      ok: false,
      reason: `File is ${formatBytes(size)}; ${rules.label} allows up to ${formatBytes(max)} for ${kind === "document" ? "files" : `${kind}s`}.`,
    };
  }
  return { ok: true, kind, downgraded };
}

/**
 * Detect an animated WEBP from its first bytes (RIFF/WEBP header + VP8X
 * chunk with the animation flag set). Pure and synchronous so it can be
 * unit tested without touching the DOM File API.
 */
export function isAnimatedWebp(head: Uint8Array): boolean {
  if (head.length < 21) return false;
  const ascii = (i: number, len: number) =>
    String.fromCharCode(...Array.from(head.slice(i, i + len)));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return false;
  if (ascii(12, 4) !== "VP8X") return false;
  const flags = head[20] ?? 0;
  return (flags & 0x02) !== 0; // ANIM bit
}

/**
 * Server-side check for a persisted outbound row. Returns a human-readable
 * failure reason, or null when the row is deliverable on the channel.
 */
export function outboundAttachmentProblem(
  channel: string | null | undefined,
  msg: {
    message_type: string | null;
    media_url: string | null;
    media_type: string | null;
    media_size?: number | null;
    metadata?: unknown;
  },
): string | null {
  const rules = attachmentRules(channel);
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  if (msg.message_type === "location" && !rules.kinds.includes("location")) {
    return `${rules.label} cannot receive location pins. Send the address as text instead.`;
  }
  if (msg.message_type === "interactive") {
    const inter = meta["interactive"] as { type?: string } | undefined;
    if ((inter?.type === "product" || inter?.type === "product_list") && !rules.nativeProducts) {
      return `${rules.label} cannot show WhatsApp catalog products. Send a product card instead.`;
    }
  }
  if (msg.message_type === "poll" && !rules.kinds.includes("poll")) {
    return `${rules.label} cannot send polls. Polls can only be sent on Telegram.`;
  }
  if (msg.message_type === "sticker") {
    const check = checkAttachment(
      channel,
      { mime: msg.media_type, size: msg.media_size ?? null },
      "sticker",
    );
    if (!check.ok) return check.reason;
  } else if (msg.media_url) {
    const check = checkAttachment(channel, { mime: msg.media_type, size: msg.media_size ?? null });
    if (!check.ok) return check.reason;
  }
  return null;
}
