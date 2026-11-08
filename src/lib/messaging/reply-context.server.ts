import { sbAny } from "@/lib/supabase/untyped";

/** Resolve a provider quote only within its owning workspace and conversation. */
export async function findReplyTarget(
  db: unknown,
  workspaceId: string,
  conversationId: string,
  providerMessageId?: string | null,
): Promise<string | null> {
  if (!providerMessageId) return null;
  for (const column of ["external_message_id", "provider_message_id"] as const) {
    const { data, error } = await sbAny(db)
      .from("messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .eq(column, providerMessageId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[reply-context] Could not resolve quoted message", error.message);
      return null;
    }
    if (data?.id) return data.id as string;
  }
  return null;
}

/** Provider replies require the quoted row's external id, never its local UUID. */
export async function findProviderReplyId(
  db: unknown,
  workspaceId: string,
  conversationId: string,
  replyToId?: string | null,
): Promise<string | null> {
  if (!replyToId) return null;
  const { data, error } = await sbAny(db)
    .from("messages")
    .select("external_message_id, provider_message_id")
    .eq("id", replyToId)
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) {
    console.warn("[reply-context] Could not load quoted message", error.message);
    return null;
  }
  return data?.external_message_id ?? data?.provider_message_id ?? null;
}
