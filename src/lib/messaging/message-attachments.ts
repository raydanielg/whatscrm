import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Persist a `message_attachments` row for media sent from the app.
 *
 * Storing the bucket + path (not just the signed `media_url`, which expires)
 * is what makes an attachment resolvable everywhere else in the app: the CRM
 * contact "Files" list, omnichannel search, exports and the media lightbox all
 * read from `message_attachments`.
 */
export async function recordMessageAttachment(input: {
  workspaceId: string;
  messageId: string;
  storagePath?: string | null;
  storageBucket?: string | null;
  url?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  uploadedBy?: string | null;
}): Promise<void> {
  const storagePath = input.storagePath ?? null;
  const url = input.url ?? null;
  if (!storagePath && !url) return;

  const { error } = await sbAny(supabase).from("message_attachments").insert({
    workspace_id: input.workspaceId,
    message_id: input.messageId,
    storage_bucket: input.storageBucket ?? "attachments",
    storage_path: storagePath,
    url,
    file_name: input.fileName ?? null,
    mime_type: input.mimeType ?? null,
    size_bytes: input.sizeBytes ?? null,
    duration_seconds: input.durationSeconds ?? null,
    uploaded_by: input.uploadedBy ?? null,
  } as never);
  if (error) throw error;
}
