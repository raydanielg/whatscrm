import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWorkspaceRole } from "@/lib/bi/bi.functions";

export type WorkspaceRole = "owner" | "admin" | "manager" | "agent" | "viewer" | null;

/**
 * Returns the current user's role in the given workspace and permission helpers.
 * Personal (private) dashboards & schedules → any member.
 * Workspace/public dashboards & manage schedules → admin/owner/manager.
 */
export function useWorkspaceRole(workspaceId: string) {
  const fn = useServerFn(getMyWorkspaceRole);
  const { data, isLoading } = useQuery({
    queryKey: ["workspace.role", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fn({ data: { workspaceId } }),
    staleTime: 60_000,
  });
  const role = (data?.role as WorkspaceRole) ?? null;
  const isAdmin = role === "owner" || role === "admin" || role === "manager";
  return {
    role,
    isLoading,
    isAdmin,
    canManageOrgDashboards: isAdmin,
    canManageSchedules: isAdmin,
    canPublishDashboards: role === "owner" || role === "admin",
  };
}
