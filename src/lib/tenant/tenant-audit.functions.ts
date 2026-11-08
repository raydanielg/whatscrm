import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TenantAccessOutcome =
  | "not_found"
  | "no_membership"
  /** A guard probe failed transiently; access was allowed rather than denied. */
  | "lookup_failed"
  | "tenant_realigned"
  | "redirected";


export type TenantAccessLogInput = {
  outcome: TenantAccessOutcome;
  resourceType: string;
  resourceId: string;
  /** Workspace that owns the resource, when it could be resolved. */
  ownerWorkspaceId?: string | null;
  /** Workspace that was active in the browser when the guard ran. */
  activeWorkspaceId?: string | null;
  /** `?org=` value carried by the link, when present. */
  urlOrgId?: string | null;
  /** Which guard probe produced the outcome (`workflow_lookup`, `membership_probe`, `none`). */
  probe?: string | null;
  /** Client-generated correlation id shared with the breadcrumb trail. */
  requestId?: string | null;
  path?: string | null;
  /** Recent client breadcrumbs so the server log carries the full trail. */
  breadcrumbs?: { at: string; kind: string; message: string }[];
};

/**
 * Records an org/workspace mismatch on the server so incidents are debuggable
 * after the fact (the browser state that caused them is otherwise gone).
 * Best-effort: never throws back into the guard.
 */
export const logTenantAccessEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TenantAccessLogInput) => input)
  .handler(async ({ data, context }) => {
    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    const { buildTenantAuditEvent } = await import("./tenant-audit-event");

    const event = buildTenantAuditEvent(data, context.userId);

    console.warn(
      `[tenant-guard] ${data.outcome} ${data.resourceType}:${data.resourceId}`,
      {
        actor: context.userId,
        owner_workspace_id: data.ownerWorkspaceId ?? null,
        active_workspace_id: data.activeWorkspaceId ?? null,
        url_org_id: data.urlOrgId ?? null,
        probe_type: data.probe ?? "none",
        request_id: data.requestId ?? null,
        path: data.path ?? null,
      },
    );

    await recordServerAuditEvent(event);


    return { ok: true } as const;
  });
