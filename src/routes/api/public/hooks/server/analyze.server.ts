import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";

export async function fetchPendingConversations(workspaceId?: string, limit = 25) {
  let query = (supabaseAdmin as any)
    .from("conversation_intelligence")
    .select("conversation_id,workspace_id")
    .eq("needs_reanalysis", true)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw new Error(`Fetch failed: ${error.message}`);
  return (data ?? []) as Array<{ conversation_id: string; workspace_id: string }>;
}
