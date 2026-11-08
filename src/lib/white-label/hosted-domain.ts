import { supabase } from "@/integrations/supabase/client";

/** Public, limited branding for a verified custom hostname. */
export type HostedDomainBrand = {
  workspace_id: string;
  brand_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  meta_title: string | null;
  meta_description: string | null;
  login_background_url: string | null;
  login_headline: string | null;
  login_subheadline: string | null;
  login_layout: "centered" | "split" | "minimal" | null;
};

export class HostedDomainAccessError extends Error {
  constructor() {
    super("Your account does not have access to the workspace for this domain");
    this.name = "HostedDomainAccessError";
  }
}

export class HostedDomainResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedDomainResolutionError";
  }
}

// The SaaS application hosts are tenant-neutral. Treating one of them as a
// white-label domain pins `readActiveOrgId()` to that domain's workspace and
// makes every explicit organization switch appear to revert immediately.
const PLATFORM_HOSTNAMES = new Set([
  "wrapcoders.bid",
  "www.wrapcoders.bid",
  "wrapcoders.bid",
]);

export async function getHostedDomainBrand(hostname: string): Promise<HostedDomainBrand | null> {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host === "127.0.0.1" || PLATFORM_HOSTNAMES.has(host))
    return null;
  const { data, error } = await supabase.rpc("get_public_white_label", { _domain: host });
  if (error)
    throw new HostedDomainResolutionError("Could not verify the workspace for this domain");
  return (data?.[0] as HostedDomainBrand | undefined) ?? null;
}

/** A verified hostname only selects a workspace when the signed-in user is a member. */
export async function resolveHostedWorkspace(hostname: string): Promise<{
  workspaceId: string;
  organizationId: string | null;
} | null> {
  const brand = await getHostedDomainBrand(hostname);
  if (!brand) return null;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new HostedDomainAccessError();
  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", brand.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new HostedDomainAccessError();
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("organization_id")
    .eq("id", brand.workspace_id)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) throw new HostedDomainAccessError();
  return { workspaceId: brand.workspace_id, organizationId: workspace.organization_id };
}
