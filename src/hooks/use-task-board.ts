import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export type TaskBoardStatus = "open" | "in_progress" | "completed" | "cancelled";
export type TaskBoardPriority = "low" | "normal" | "high" | "urgent";

export type TaskBoardRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskBoardStatus;
  priority: TaskBoardPriority;
  due_at: string | null;
  entity_type: "contact" | "company" | "lead" | "deal" | "conversation" | null;
  entity_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  custom_fields: Record<string, unknown>;
};

export type TaskInput = {
  title: string;
  description: string | null;
  status: TaskBoardStatus;
  priority: TaskBoardPriority;
  due_at: string | null;
  assigned_to: string | null;
  custom_fields: Record<string, unknown>;
};

const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;
const boardKey = (workspaceId: string | null | undefined) => ["task-board", workspaceId] as const;

/**
 * Any task change can affect the board, the inbox task badges and a conversation's
 * task list, so refresh all of them together.
 */
function invalidateTaskCaches(qc: ReturnType<typeof useQueryClient>, workspaceId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: boardKey(workspaceId) });
  qc.invalidateQueries({ queryKey: ["conversation-open-task-counts"] });
  qc.invalidateQueries({ queryKey: ["conversation-tasks"] });
  qc.invalidateQueries({ queryKey: ["dash", "task-summary", workspaceId] });
}

export function useTaskBoard(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: boardKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<TaskBoardRow[]> => {
      const { data, error } = await anyFrom("tasks")
        .select("id,title,description,status,priority,due_at,entity_type,entity_id,created_by,assigned_to,custom_fields")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TaskBoardRow[];
    },
  });
}

/** Moves a card to another column; optimistic, rolled back on failure. */
export function useMoveTask(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  const key = boardKey(workspaceId);
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskBoardStatus }) => {
      const { error } = await anyFrom("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TaskBoardRow[]>(key);
      qc.setQueryData<TaskBoardRow[]>(key, (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, status } : r)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      invalidateTaskCaches(qc, workspaceId);
    },
  });
}

/** Creates a standalone task (no linked customer or conversation). */
export function useCreateTask(workspaceId: string | null | undefined, userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      if (!workspaceId || !userId) throw new Error("Not signed in to a workspace");
      const { error } = await anyFrom("tasks").insert({
        workspace_id: workspaceId,
        created_by: userId,
        owner_id: userId,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTaskCaches(qc, workspaceId),
  });
}

/** Edits title, details, status, priority, due date and assignee. */
export function useUpdateTask(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TaskInput }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("tasks").update(input).eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => invalidateTaskCaches(qc, workspaceId),
  });
}

/** Soft delete, matching the rest of the app (deleted_at, not a hard delete). */
export function useDeleteTask(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  const key = boardKey(workspaceId);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data, error } = await anyFrom("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Task was not deleted. Check your permission and try again.");
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<TaskBoardRow[]>(key, (rows) => rows?.filter((row) => row.id !== id));
      invalidateTaskCaches(qc, workspaceId);
    },
  });
}
