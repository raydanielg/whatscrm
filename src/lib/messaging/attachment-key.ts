/**
 * Client-side validation for the `attachments` storage bucket key format.
 *
 * The bucket's RLS policy requires the object path to match:
 *   `<workspaceId>/<conversationId>/<filename>`
 * where the first segment is the caller's workspace id (checked via
 * `public.is_workspace_member(first_segment)`).
 *
 * Any deviation (wrong segment count, non-UUID ids, path traversal,
 * empty/oversized filename, disallowed chars) is rejected before the
 * network call so users get a clear error instead of an opaque
 * "new row violates row-level security policy".
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chars we allow in the filename segment. */
const FILENAME_RE = /^[A-Za-z0-9._-]+$/;

const MAX_FILENAME_LEN = 200;
const MAX_EXT_LEN = 16;

export class AttachmentKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentKeyError";
  }
}

/** Sanitize a raw filename/extension into RLS-safe characters. */
export function sanitizeExt(ext: string | undefined | null): string {
  const cleaned = (ext ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned) return "bin";
  return cleaned.slice(0, MAX_EXT_LEN);
}

/**
 * Build a storage key that provably satisfies the bucket RLS policy.
 * Throws `AttachmentKeyError` if the inputs cannot produce a valid key.
 */
export function buildAttachmentKey(params: {
  workspaceId: string;
  conversationId: string;
  filename?: string;
}): string {
  const { workspaceId, conversationId, filename } = params;
  if (!workspaceId || !UUID_RE.test(workspaceId)) {
    throw new AttachmentKeyError("Invalid workspace id for attachment upload");
  }
  if (!conversationId || !UUID_RE.test(conversationId)) {
    throw new AttachmentKeyError(
      "Invalid conversation id for attachment upload"
    );
  }
  const rawExt = filename?.includes(".")
    ? filename.split(".").pop()
    : undefined;
  const ext = sanitizeExt(rawExt);
  const name = `${crypto.randomUUID()}.${ext}`;
  const key = `${workspaceId}/${conversationId}/${name}`;
  assertAttachmentKey(key);
  return key;
}

/**
 * Validate that a storage key matches the bucket RLS path format.
 * Returns the parsed segments; throws `AttachmentKeyError` on mismatch.
 */
export function assertAttachmentKey(key: string): {
  workspaceId: string;
  conversationId: string;
  filename: string;
} {
  if (typeof key !== "string" || !key) {
    throw new AttachmentKeyError("Attachment key is empty");
  }
  if (key.includes("..") || key.startsWith("/") || key.includes("//")) {
    throw new AttachmentKeyError("Attachment key contains invalid path segments");
  }
  const parts = key.split("/");
  if (parts.length !== 3) {
    throw new AttachmentKeyError(
      "Attachment key must be `<workspaceId>/<conversationId>/<filename>`"
    );
  }
  const [workspaceId, conversationId, filename] = parts;
  if (!UUID_RE.test(workspaceId)) {
    throw new AttachmentKeyError("Attachment key: workspace segment is not a UUID");
  }
  if (!UUID_RE.test(conversationId)) {
    throw new AttachmentKeyError(
      "Attachment key: conversation segment is not a UUID"
    );
  }
  if (
    !filename ||
    filename.length > MAX_FILENAME_LEN ||
    !FILENAME_RE.test(filename)
  ) {
    throw new AttachmentKeyError("Attachment key: filename segment is invalid");
  }
  return { workspaceId, conversationId, filename };
}

export function isValidAttachmentKey(key: string): boolean {
  try {
    assertAttachmentKey(key);
    return true;
  } catch {
    return false;
  }
}
