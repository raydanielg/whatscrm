/**
 * Write-permission guard for the workflow builder.
 *
 * RLS lets viewers *read* a workflow they can't change, so the builder must
 * decide locally whether editing controls are live — otherwise a viewer edits
 * happily and every save silently fails.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Workspace roles allowed to modify automations. */
const WRITER_ROLES = new Set(["owner", "admin", "manager"]);

export const WORKFLOW_READONLY_ROLE_REASON =
  "Your role in this workspace has view-only access to workflows. Ask an owner or admin for edit rights.";

export type WorkflowPermissions = {
  /** True once we know the user may write. Never optimistic. */
  canEdit: boolean;
  role: string | null;
  isLoading: boolean;
};

export function useWorkflowPermissions(workspaceId: string | null | undefined): WorkflowPermissions {
  const { data, isLoading } = useQuery({
    queryKey: ["workflow-permissions", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    queryFn: async () => {
      // getSession() reads local storage; getUser() is a network round-trip
      // that flakes on cold starts and silently downgrades users to read-only.
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId || !workspaceId) return { role: null as string | null, status: null as string | null };
      const { data: member, error } = await supabase
        .from("workspace_members")
        .select("role, status")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return { role: member?.role ?? null, status: member?.status ?? null };
    },
  });

  const role = data?.role ?? null;
  const active = data?.status === "active";

  return {
    // While the role is unknown the builder stays read-only: suppressing a few
    // hundred ms of autosave is cheaper than letting a viewer lose edits.
    canEdit: Boolean(workspaceId) && active && role != null && WRITER_ROLES.has(role),
    role,
    isLoading: Boolean(workspaceId) && isLoading,
  };
}
