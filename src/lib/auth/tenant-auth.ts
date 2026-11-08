import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Validates that the caller is a member of the requested workspace/organization.
 * 
 * While RLS protects the database, this middleware prevents server-function
 * logic from running against a tenant the user doesn't belong to. This blocks
 * ID enumeration and side-effects in functions that don't only do DB reads.
 */
export const requireTenantAccess = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const request = getRequest();
    const headers = request?.headers;
    
    // We expect the client to send these headers via attachSupabaseAuthFresh
    const orgId = headers?.get("x-wacrm-org-id");
    const workspaceId = headers?.get("x-wacrm-workspace-id");

    if (!orgId && !workspaceId) {
      return next({
        context: {
          activeOrgId: null as string | null,
          activeWorkspaceId: null as string | null,
        },
      });
    }

    const targetId = workspaceId || orgId;
    
    // Verify membership using the authenticated Supabase client from context.
    // This leverages RLS on the membership tables.
    const { data: membership, error } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", targetId!)
      .maybeSingle();

    if (error || !membership) {
      const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
      await recordServerAuditEvent({
        eventType: "tenant.access_denied",
        severity: "critical",
        workspaceId: targetId,
        actorId: context.userId,
        data: {
          requested_org: orgId,
          requested_workspace: workspaceId,
          error: error?.message,
        },
      });

      throw new Response("Forbidden: You do not have access to this tenant", { 
        status: 403 
      });
    }

    return next({
      context: {
        activeOrgId: orgId as string | null,
        activeWorkspaceId: workspaceId as string | null,
      },
    });
  });
