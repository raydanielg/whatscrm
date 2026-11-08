import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export interface MessengerThreadInput {
  workspaceId: string;
  accountId: string;
  pageId: string;
  customerPsid: string;
  contactId: string;
  graphThreadId?: string;
  inbound: boolean;
  preview?: string | null;
  reopen?: boolean;
  source: string;
}

export function messengerThreadKey(pageId: string, customerPsid: string): string {
  return `psid:${pageId}:${customerPsid}`;
}

/** Share one identity between Graph sync and real-time deliveries. Adopt legacy
 * t_... rows in place so existing message history and conversation links survive.
 */
export async function ensureMessengerThread(admin: Admin, input: MessengerThreadInput) {
  const key = messengerThreadKey(input.pageId, input.customerPsid);
  const baseQuery = () => admin.from("conversations")
    .select("id, external_conversation_id, metadata")
    .eq("workspace_id", input.workspaceId)
    .eq("channel", "messenger");
  const { data: canonical, error: lookupError } = await baseQuery()
    .eq("external_conversation_id", key).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  if (!canonical) {
    // page_id scopes the participant to the owning Page. Never adopt another
    // connected Page's thread merely because it happens to share a CRM contact.
    let legacyQuery = baseQuery().eq("metadata->>page_id", input.pageId);
    legacyQuery = input.graphThreadId
      ? legacyQuery.eq("external_conversation_id", input.graphThreadId)
      : legacyQuery.eq("contact_id", input.contactId).like("external_conversation_id", "t_%");
    const { data: legacy, error } = await legacyQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (legacy) {
      const { error: adoptionError } = await admin.from("conversations").update({
        external_conversation_id: key,
        metadata: { ...(legacy.metadata ?? {}), graph_thread_id: input.graphThreadId ?? legacy.external_conversation_id },
      }).eq("id", legacy.id).eq("external_conversation_id", legacy.external_conversation_id);
      // A simultaneous webhook may already have created/adopted the canonical
      // row. ensureInboxThread converges on it using the existing unique key.
      if (adoptionError && adoptionError.code !== "23505") throw new Error(adoptionError.message);
    }
  }

  return ensureInboxThread(admin, {
    workspaceId: input.workspaceId,
    channel: "messenger",
    externalConversationId: key,
    accountId: input.accountId,
    contactId: input.contactId,
    inbound: input.inbound,
    preview: input.preview,
    reopen: input.reopen,
    metadata: {
      source: input.source,
      page_id: input.pageId,
      chat_id: input.customerPsid,
      psid: input.customerPsid,
      ...(input.graphThreadId ? { graph_thread_id: input.graphThreadId } : {}),
    },
  });
}
