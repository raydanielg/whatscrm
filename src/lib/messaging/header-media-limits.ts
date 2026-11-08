/**
 * Shared validation rules for WhatsApp template header media.
 * Imported by both the client UI and the server function so the limits
 * can never drift apart.
 */

export type HeaderMediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export const HEADER_MEDIA_RULES: Record<
  HeaderMediaFormat,
  { mimes: string[]; maxBytes: number; maxDurationSeconds?: number; maxPages?: number }
> = {
  IMAGE: {
    mimes: ["image/jpeg", "image/png"],
    maxBytes: 5 * 1024 * 1024, // 5 MB (Meta limit for image headers)
  },
  VIDEO: {
    mimes: ["video/mp4", "video/3gpp"],
    maxBytes: 16 * 1024 * 1024, // 16 MB
    maxDurationSeconds: 60,
  },
  DOCUMENT: {
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ],
    maxBytes: 16 * 1024 * 1024, // 16 MB
    maxPages: 100, // Meta rejects PDF headers with more than 100 pages
  },
};

export const ALL_HEADER_MIMES: string[] = Object.values(HEADER_MEDIA_RULES).flatMap((r) => r.mimes);

export const MAX_HEADER_BYTES = Math.max(...Object.values(HEADER_MEDIA_RULES).map((r) => r.maxBytes));

export function formatForMime(mime: string): HeaderMediaFormat | null {
  for (const [format, rule] of Object.entries(HEADER_MEDIA_RULES)) {
    if (rule.mimes.includes(mime)) return format as HeaderMediaFormat;
  }
  return null;
}

export function acceptAttribute(format: HeaderMediaFormat): string {
  return HEADER_MEDIA_RULES[format].mimes.join(",");
}

export function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Validates mime type + byte size for a given header format.
 * Returns an error message, or null when valid.
 */
export function validateHeaderMedia(
  format: HeaderMediaFormat,
  input: { mimeType: string; size: number },
): string | null {
  const rule = HEADER_MEDIA_RULES[format];
  if (!rule) return "Unsupported header format";
  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  if (!rule.mimes.includes(mime)) {
    return `Unsupported file type "${input.mimeType || "unknown"}" — allowed: ${rule.mimes.join(", ")}`;
  }
  if (input.size <= 0) return "The file is empty";
  if (input.size > rule.maxBytes) {
    return `File is too large (${humanBytes(input.size)}) — max ${humanBytes(rule.maxBytes)} for ${format.toLowerCase()} headers`;
  }
  return null;
}

/** Reads the duration of a video/audio file in the browser (seconds). */
export async function readMediaDuration(file: File): Promise<number | null> {
  if (typeof window === "undefined" || !file.type.startsWith("video/")) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
    // Safety net so a stuck decode never blocks the upload flow.
    setTimeout(() => done(null), 8000);
  });
}

/** Validates video duration against the format limit. Returns an error or null. */
export function validateDuration(format: HeaderMediaFormat, seconds: number | null): string | null {
  const max = HEADER_MEDIA_RULES[format]?.maxDurationSeconds;
  if (!max || seconds == null) return null;
  if (seconds > max) {
    return `Video is too long (${Math.round(seconds)}s) — max ${max}s for video headers`;
  }
  return null;
}

/**
 * Counts pages in a PDF from its raw bytes. Works in the browser and on the
 * server (no PDF library, no DOM). Returns null when the structure cannot be
 * read confidently (e.g. cross-reference streams that compress page objects),
 * in which case page validation is skipped rather than guessed.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  let text = "";
  // Decode as latin1 so byte offsets map 1:1 to characters.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (!text.startsWith("%PDF-")) return null;

  // Preferred: the page tree root declares an authoritative /Count.
  const counts: number[] = [];
  const pagesRe = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g;
  for (const match of text.matchAll(pagesRe)) counts.push(Number(match[1]));
  if (counts.length > 0) return Math.max(...counts);

  // Fallback: count individual page objects.
  const pageObjects = text.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  return pageObjects > 0 ? pageObjects : null;
}

/** Validates a document page count against the format limit. */
export function validatePageCount(format: HeaderMediaFormat, pages: number | null): string | null {
  const max = HEADER_MEDIA_RULES[format]?.maxPages;
  if (!max || pages == null) return null;
  if (pages > max) {
    return `Document has too many pages (${pages}) — max ${max} pages for document headers`;
  }
  return null;
}

/** Reads the page count of a selected PDF file in the browser. */
export async function readPdfPageCount(file: File): Promise<number | null> {
  if (file.type.split(";")[0].trim().toLowerCase() !== "application/pdf") return null;
  try {
    return countPdfPages(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}
