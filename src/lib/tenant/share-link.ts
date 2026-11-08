/**
 * Share / deep-link URL generation for tenant-scoped resources.
 *
 * The app mirrors the active organization into the URL as `?org=<uuid>`
 * (see `org-url-sync.tsx`). Copying the address bar therefore produces a link
 * carrying whatever org happened to be active — which is *not* necessarily the
 * organization that owns the resource. Recipients then hit
 * "Previously selected organization is no longer available" or a read-only
 * builder.
 *
 * Rule enforced here: a share link carries `?org=` only when we can prove it
 * is the organization owning the resource. Otherwise the parameter is omitted
 * entirely, and the app resolves the tenant from the recipient's own session.
 */

import { isUuid } from "@/lib/tenant/active-tenant";
import { supabase } from "@/integrations/supabase/client";

// SSR-only fallback; the browser always uses window.location.origin.
const ORIGIN_FALLBACK = "https://wrapcoders.bid";

function origin(): string {
  return typeof window === "undefined" ? ORIGIN_FALLBACK : window.location.origin;
}

/**
 * Build an absolute share URL for `path`, attaching `?org=` only when
 * `orgId` is a valid uuid. Any pre-existing `org` param in `path` is dropped
 * so a stale value can never survive into a shared link.
 */
export function buildTenantShareUrl(path: string, orgId?: string | null): string {
  const url = new URL(path, origin());
  url.searchParams.delete("org");
  if (orgId && isUuid(orgId)) url.searchParams.set("org", orgId);
  return url.toString();
}

/** Organization that owns a workspace, or null when unknown / not readable. */
export async function resolveWorkspaceOrgId(
  workspaceId: string | null | undefined,
): Promise<string | null> {
  if (!workspaceId || !isUuid(workspaceId)) return null;
  const { data, error } = await supabase
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data?.organization_id) return null;
  return isUuid(data.organization_id) ? data.organization_id : null;
}

/**
 * Deep link to a workflow that resolves for whoever opens it: scoped to the
 * organization that actually owns the workflow's workspace, or org-free when
 * that cannot be determined.
 */
export async function buildWorkflowShareUrl(
  workflowId: string,
  workspaceId: string | null | undefined,
): Promise<string> {
  const orgId = await resolveWorkspaceOrgId(workspaceId);
  return buildTenantShareUrl(`/automations/${workflowId}`, orgId);
}
