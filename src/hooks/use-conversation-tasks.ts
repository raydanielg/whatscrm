import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export type ConversationTask = {
  id: string;
  title: string;
  status: "open" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
};

export function useConversationTasks(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ["conversation-tasks", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<ConversationTask[]> => {
      const { data, error } = await (sbAny(supabase).from("tasks") as any)
        .select("id,title,status,priority,due_at")
        .eq("entity_type", "conversation")
        .eq("entity_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationTask[];
    },
  });
}

/**
 * Open-task counts for many conversations in one query, so the inbox list
 * does not issue one request per row. Returns conversationId -> open count.
 */
export function useOpenTaskCounts(conversationIds: string[]) {
  const key = [...conversationIds].sort().join(",");
  return useQuery({
    queryKey: ["conversation-open-task-counts", key],
    enabled: conversationIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await (sbAny(supabase).from("tasks") as any)
        .select("entity_id")
        .eq("entity_type", "conversation")
        .in("entity_id", conversationIds)
        .in("status", ["open", "in_progress"])
        .is("deleted_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { entity_id: string }[]) {
        counts[row.entity_id] = (counts[row.entity_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}
