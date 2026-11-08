/**
 * Persistence for the WhatsApp template header media selection.
 *
 * Meta returns an opaque `header_handle` for uploaded header media. The handle
 * is stored on the template itself, but the human context around it (original
 * file name, mime type, thumbnail) only exists in the browser session that did
 * the upload. Without persistence, reopening a template shows a bare
 * "File already uploaded" line and an in-progress create draft loses the
 * upload entirely.
 *
 * We keep that context in localStorage, keyed per workspace + template (or the
 * pending create draft), and reconcile it against the handle stored on the
 * template when rehydrating.
 */

export type HeaderMediaDraft = {
  handle: string;
  fileName: string;
  mimeType: string;
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  /** Small inline thumbnail (images only) so the preview survives a reload. */
  previewDataUrl?: string;
  savedAt: number;
};

const PREFIX = "wacrm:wa-header-media:";
/** Keep well below the ~5MB localStorage budget shared with the rest of the app. */
const MAX_PREVIEW_BYTES = 400_000;
/** Drop stale create-drafts so abandoned uploads don't resurface weeks later. */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export function headerMediaDraftKey(workspaceId: string, templateId: string | undefined, accountId: string) {
  return `${PREFIX}${workspaceId}:${templateId ?? `new:${accountId}`}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadHeaderMediaDraft(key: string): HeaderMediaDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HeaderMediaDraft>;
    if (!parsed || typeof parsed.handle !== "string" || !parsed.handle) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      store.removeItem(key);
      return null;
    }
    return {
      handle: parsed.handle,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : "Uploaded file",
      mimeType: typeof parsed.mimeType === "string" ? parsed.mimeType : "",
      format: parsed.format === "VIDEO" || parsed.format === "DOCUMENT" ? parsed.format : "IMAGE",
      ...(typeof parsed.previewDataUrl === "string" ? { previewDataUrl: parsed.previewDataUrl } : {}),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveHeaderMediaDraft(key: string, draft: Omit<HeaderMediaDraft, "savedAt">) {
  const store = storage();
  if (!store) return;
  const payload: HeaderMediaDraft = { ...draft, savedAt: Date.now() };
  if (payload.previewDataUrl && payload.previewDataUrl.length > MAX_PREVIEW_BYTES) {
    delete payload.previewDataUrl;
  }
  try {
    store.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota exceeded — retry without the thumbnail, which is the bulky part.
    try {
      const { previewDataUrl: _drop, ...lean } = payload;
      store.setItem(key, JSON.stringify(lean));
    } catch {
      /* persistence is best-effort */
    }
  }
}

export function clearHeaderMediaDraft(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Read a file as a data URL for the persisted thumbnail. Only worth doing for
 * images: video/document previews are either large or non-visual.
 */
export async function readPreviewDataUrl(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/") || file.size > MAX_PREVIEW_BYTES) return undefined;
  try {
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  } catch {
    return undefined;
  }
}
