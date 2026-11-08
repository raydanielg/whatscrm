import type { NotificationRow } from "@/hooks/use-notifications";
import { setActiveTenantSelection } from "@/hooks/use-organization";
import { readActiveOrgId, readActiveWorkspaceId } from "@/lib/tenant/active-tenant";

/** Resolve old generic reminder links as well as new record-specific links. */
export function notificationActionUrl(notification: Pick<NotificationRow, "action_url" | "data" | "organization_id">): string | null {
  const data = notification.data ?? {};
  const taskId = typeof data.task_id === "string" ? data.task_id : null;
  const projectTaskId = typeof data.pm_task_id === "string" ? data.pm_task_id : null;
  const projectId = typeof data.project_id === "string" ? data.project_id : null;
  const ticketId = typeof data.ticket_id === "string" ? data.ticket_id : null;
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : null;
  const campaignId = typeof data.campaign_id === "string" ? data.campaign_id : null;
  const workflowId = typeof data.workflow_id === "string" ? data.workflow_id : null;
  const original = notification.action_url;
  const path = projectTaskId && projectId
    ? `/projects/${encodeURIComponent(projectId)}`
    : taskId
      ? "/tasks"
      : original ?? (ticketId
        ? `/helpdesk/${encodeURIComponent(ticketId)}`
        : conversationId
          ? "/inbox"
          : campaignId
            ? `/campaigns/${encodeURIComponent(campaignId)}`
            : workflowId
              ? `/automations/${encodeURIComponent(workflowId)}`
              : null);
  if (!path) return null;
  if (/^https:\/\//i.test(path)) {
    try { return new URL(path).href; } catch { return null; }
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const url = new URL(path, "https://wacrm.local");
  if (url.origin !== "https://wacrm.local") return null;
  if (projectTaskId && projectId) url.searchParams.set("taskId", projectTaskId);
  else if (taskId) url.searchParams.set("taskId", taskId);
  if (conversationId && url.pathname === "/inbox") url.searchParams.set("conversationId", conversationId);
  if (notification.organization_id) url.searchParams.set("org", notification.organization_id);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Adopt the destination tenant before routing; the authenticated loader uses the stored selection. */
export function selectNotificationTenant(
  notification: Pick<NotificationRow, "organization_id" | "data">,
  organizations: ReadonlyArray<{ id: string }>,
  workspaces: ReadonlyArray<{ id: string; organization_id: string | null }>,
): void {
  const orgId = notification.organization_id;
  if (!orgId || !organizations.some((org) => org.id === orgId)) return;
  const requestedWorkspace = notification.data?.workspace_id;
  const workspace = typeof requestedWorkspace === "string"
    ? workspaces.find((item) => item.id === requestedWorkspace && item.organization_id === orgId)
    : undefined;
  const nextWorkspaceId = workspace?.id ?? workspaces.find((item) => item.organization_id === orgId)?.id ?? null;
  if (readActiveOrgId() !== orgId || readActiveWorkspaceId() !== nextWorkspaceId) {
    setActiveTenantSelection(orgId, nextWorkspaceId);
  }
}
