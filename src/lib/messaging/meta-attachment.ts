import type { Database } from "@/integrations/supabase/types";

type MessageType = Database["public"]["Enums"]["message_type"];

/** Meta's attachment kinds are not MIME types (and `media` is not a DB enum). */
export function metaAttachmentType(kind?: string | null, mime?: string | null): MessageType {
  const value = (mime || kind || "").toLowerCase();
  if (value === "image" || value.startsWith("image/")) return "image";
  if (value === "video" || value.startsWith("video/")) return "video";
  if (value === "audio" || value.startsWith("audio/")) return "audio";
  return "document";
}

export interface MetaAttachment {
  type?: string;
  mime_type?: string;
  payload?: { url?: string };
  image_data?: { url?: string };
  video_data?: { url?: string };
  file_url?: string;
  name?: string;
}

/** Normalize both webhook attachments and Graph history attachments. */
export function normalizeMetaAttachment(attachment?: MetaAttachment | null) {
  const url = attachment?.payload?.url ?? attachment?.image_data?.url ??
    attachment?.video_data?.url ?? attachment?.file_url ?? null;
  const kind = attachment?.type ?? (attachment?.image_data ? "image" : attachment?.video_data ? "video" : null);
  const messageType = url ? metaAttachmentType(kind, attachment?.mime_type) : "text";
  return {
    mediaUrl: url,
    // Keep MIME values when Meta supplies them. The UI uses message_type to
    // choose the renderer; inventing a specific encoding here would be wrong.
    mediaType: attachment?.mime_type ?? kind,
    messageType,
  } as const;
}
