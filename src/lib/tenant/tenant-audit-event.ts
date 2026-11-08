/**
 * Pure mapping from a tenant guard report to the `security_events` row.
 *
 * Extracted from the server function so the audit contract (the exact field
 * names support and the Security Issues page query on — `workspace_id`,
 * `user_id`, `probe_type`, `request_id`) is testable without a live request.
 */
import type { TenantAccessLogInput } from "./tenant-audit.functions";

export type TenantAuditEvent = {
  eventType: string;
  severity: "info" | "warning";
  workspaceId: string | null;
  actorId: string;
  resourceType: string;
  resourceId: string;
  data: Record<string, unknown>;
};

export function buildTenantAuditEvent(
  input: TenantAccessLogInput,
  userId: string,
): TenantAuditEvent {
  const workspaceId = input.ownerWorkspaceId ?? input.activeWorkspaceId ?? null;

  return {
    eventType: `tenant.${input.outcome}`,
    severity: input.outcome === "tenant_realigned" ? "info" : "warning",
    workspaceId,
    actorId: userId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    data: {
      outcome: input.outcome,
      // Identity comes from the verified bearer token, never from the client.
      user_id: userId,
      workspace_id: workspaceId,
      owner_workspace_id: input.ownerWorkspaceId ?? null,
      active_workspace_id: input.activeWorkspaceId ?? null,
      url_org_id: input.urlOrgId ?? null,
      probe_type: input.probe ?? "none",
      request_id: input.requestId ?? null,
      path: input.path ?? null,
      breadcrumbs: (input.breadcrumbs ?? []).slice(-15),
    },
  };
}
