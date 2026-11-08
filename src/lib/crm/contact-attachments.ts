import { supabase } from "@/integrations/supabase/client";
import type { AttachmentFileRef } from "@/components/app/files/attachment-item";

export type ContactAttachment = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  file: AttachmentFileRef;
  created_at: string;
  source: "crm" | "conversation";
};

/**
 * Contact files = explicit CRM attachments + media exchanged in the contact's
 * conversations. Errors are thrown so callers can surface a retryable error state.
 */
export async function fetchContactAttachments(
  workspaceId: string,
  contactId: string,
  limit = 50,
): Promise<ContactAttachment[]> {
  const items: ContactAttachment[] = [];

  const { data: crmRows, error: crmError } = await supabase
    .from("attachments")
    .select(
      `id, created_at, file:files!attachments_file_id_fkey(id, name, size_bytes, mime_type, bucket, path, is_public)`,
    )
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "contact")
    .eq("entity_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (crmError) throw crmError;

  for (const row of (crmRows ?? []) as Array<Record<string, any>>) {
    const f = (row.file ?? {}) as Record<string, any>;
    items.push({
      id: String(row.id),
      file_name: (f.name as string) ?? "File",
      file_size: (f.size_bytes as number | null) ?? null,
      mime_type: (f.mime_type as string | null) ?? null,
      file: {
        name: (f.name as string | null) ?? null,
        mime_type: (f.mime_type as string | null) ?? null,
        size_bytes: (f.size_bytes as number | null) ?? null,
        bucket: (f.bucket as string | null) ?? null,
        path: (f.path as string | null) ?? null,
        is_public: (f.is_public as boolean | null) ?? null,
      },
      created_at: String(row.created_at),
      source: "crm",
    });
  }

  // Media shared in this contact's conversations.
  const conversationIds = await fetchContactConversationIds(workspaceId, contactId);
  if (conversationIds.length) {
    const seenMessageIds = new Set<string>();
    const { data: mediaRows, error: mediaError } = await supabase
      .from("message_attachments")
      .select(
        "id, message_id, created_at, file_name, mime_type, size_bytes, storage_bucket, storage_path, url, visibility, is_deleted, messages!inner(conversation_id, deleted_at)",
      )
      .eq("workspace_id", workspaceId)
      .in("messages.conversation_id", conversationIds)
      .is("messages.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (mediaError) throw mediaError;

    for (const row of (mediaRows ?? []) as Array<Record<string, any>>) {
      if (row.message_id) seenMessageIds.add(String(row.message_id));
      if (row.is_deleted) continue;
      items.push({
        id: `msg:${String(row.id)}`,
        file_name: (row.file_name as string) ?? "File",
        file_size: (row.size_bytes as number | null) ?? null,
        mime_type: (row.mime_type as string | null) ?? null,
        file: {
          name: (row.file_name as string | null) ?? null,
          mime_type: (row.mime_type as string | null) ?? null,
          size_bytes: (row.size_bytes as number | null) ?? null,
          bucket: (row.storage_bucket as string | null) ?? null,
          path: (row.storage_path as string | null) ?? null,
          is_public: row.visibility === "public",
          url: (row.url as string | null) ?? null,
        },
        created_at: String(row.created_at),
        source: "conversation",
      });
    }

    // Older / inbound media messages may have no message_attachments row -
    // read them straight off the message (metadata.media_path in the private
    // "attachments" bucket, or a provider-hosted media_url).
    const { data: msgRows, error: msgError } = await supabase
      .from("messages")
      .select("id, created_at, message_type, media_url, media_type, media_size, metadata")
      .eq("workspace_id", workspaceId)
      .in("conversation_id", conversationIds)
      .in("message_type", ["image", "video", "audio", "document"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (msgError) throw msgError;

    for (const row of (msgRows ?? []) as Array<Record<string, any>>) {
      const id = String(row.id);
      if (seenMessageIds.has(id)) continue;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const mediaPath = typeof meta.media_path === "string" ? meta.media_path : null;
      const mediaUrl = (row.media_url as string | null) ?? null;
      if (!mediaPath && !mediaUrl) continue;
      const mime = (row.media_type as string | null) ?? null;
      const fileName =
        (typeof meta.media_name === "string" && meta.media_name) ||
        (mediaPath ? mediaPath.split("/").pop() : null) ||
        `${String(row.message_type)} attachment`;
      items.push({
        id: `msgmedia:${id}`,
        file_name: fileName,
        file_size: (row.media_size as number | null) ?? null,
        mime_type: mime,
        file: {
          name: fileName,
          mime_type: mime ?? (row.message_type === "image" ? "image/*" : null),
          size_bytes: (row.media_size as number | null) ?? null,
          bucket: mediaPath ? "attachments" : null,
          path: mediaPath,
          is_public: false,
          url: mediaUrl,
        },
        created_at: String(row.created_at),
        source: "conversation",
      });
    }
  }

  return items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}

/** Ids of the contact's conversations (RLS-scoped), shared by profile hooks. */
export async function fetchContactConversationIds(
  workspaceId: string,
  contactId: string,
  limit = 200,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((c: { id: string }) => c.id);
}
