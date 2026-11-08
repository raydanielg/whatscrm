/**
 * WhatsApp Cloud API media compatibility helpers.
 *
 * Meta only accepts a narrow list of mime types per media kind. Anything else
 * (e.g. `image/webp` screenshots or `audio/webm` browser voice notes) is
 * rejected by the Graph API with a generic "media upload error", which used to
 * surface in the Inbox as a hard failure.
 *
 * Rather than dropping the message we downgrade unsupported files to a
 * `document` send — WhatsApp accepts arbitrary files as documents — so the
 * recipient still receives the attachment.
 */

export type WaMediaKind = "image" | "video" | "audio" | "document" | "sticker";

/** Mime types Meta documents as accepted for each media kind. */
export const WA_SUPPORTED_MEDIA: Record<Exclude<WaMediaKind, "document">, string[]> = {
  image: ["image/jpeg", "image/png"],
  video: ["video/mp4", "video/3gp", "video/3gpp"],
  audio: ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/ogg"],
  sticker: ["image/webp"],
};

const EXT_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/svg+xml": "svg",
  "audio/webm": "webm",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function normalizeMime(mime: string | null | undefined): string {
  return (mime ?? "").toLowerCase().split(";")[0]!.trim();
}

/** Coarse media kind for a mime type, before compatibility checks. */
export function rawMediaKind(mime: string | null | undefined): WaMediaKind {
  const m = normalizeMime(mime);
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

export interface ResolvedWaMedia {
  kind: WaMediaKind;
  mimeType: string | undefined;
  /** Filename to send with a document — WhatsApp shows it to the recipient. */
  filename?: string;
  /** True when the original kind was downgraded to `document`. */
  downgraded: boolean;
}

/**
 * Pick a WhatsApp-safe media kind for an attachment.
 *
 * Unsupported mime types fall back to `document` with a best-effort filename
 * so the file keeps a usable extension on the recipient's device.
 */
export function resolveWhatsAppMedia(args: {
  mimeType: string | null | undefined;
  filename?: string | null;
  /** True when the row is a sticker send (message_type = 'sticker'). */
  asSticker?: boolean;
}): ResolvedWaMedia {
  const mime = normalizeMime(args.mimeType);

  if (args.asSticker) {
    if (mime && WA_SUPPORTED_MEDIA.sticker.includes(mime)) {
      return { kind: "sticker", mimeType: mime, downgraded: false };
    }
    // Not a sticker-safe webp — send as a document rather than fail outright.
    return {
      kind: "document",
      mimeType: mime || undefined,
      filename: safeName(args.filename, mime),
      downgraded: true,
    };
  }

  const kind = rawMediaKind(mime);

  if (kind === "document") {
    return {
      kind: "document",
      mimeType: mime || undefined,
      filename: safeName(args.filename, mime),
      downgraded: false,
    };
  }

  const allowed = WA_SUPPORTED_MEDIA[kind] ?? [];
  if (mime && allowed.includes(mime)) {
    return { kind, mimeType: mime, downgraded: false };
  }

  // Unsupported for its native kind — send as a document instead of failing.
  return {
    kind: "document",
    mimeType: mime || undefined,
    filename: safeName(args.filename, mime),
    downgraded: true,
  };
}

function safeName(filename: string | null | undefined, mime: string): string | undefined {
  const name = (filename ?? "").trim();
  if (name) return name.slice(0, 120);
  const ext = EXT_BY_MIME[mime] ?? mime.split("/")[1] ?? "bin";
  return `attachment.${ext}`;
}
