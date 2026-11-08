/**
 * Resolve the workspace the caller is actually looking at.
 *
 * The Security, Compliance, Backup and Release-Readiness functions used to pick
 * `workspace_members  LIMIT 1` — an arbitrary membership row. For anyone with
 * more than one workspace (for example an org-less signup workspace next to the
 * real one) they silently read the wrong workspace, so a page could show "0
 * audit events" for a workspace with plenty while the header showed another.
 *
 * The client attaches `x-wacrm-workspace-id` to every server-function call
 * (see lib/auth/serverfn-auth.ts). That header is only a hint: it is honoured
 * only if the caller is really a member of that workspace, and never trusted on
 * its own. If it is missing or invalid we fall back deterministically, preferring
 * a workspace that belongs to an organization.
 *
 * Server-only. Import it dynamically from inside a handler.
 */
import { getRequest } from "@tanstack/react-start/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveActiveWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  let requested: string | null = null;
  try {
    requested = getRequest()?.headers.get("x-wacrm-workspace-id") ?? null;
  } catch {
    requested = null; // no request context (tests, scripts)
  }

  if (requested && UUID.test(requested)) {
    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", requested)
      .maybeSingle();
    if (data?.workspace_id) return data.workspace_id as string;
  }

  const { data: rows } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(organization_id, created_at)")
    .eq("user_id", userId)
    .limit(50);
  const list = (rows ?? []) as Array<{
    workspace_id: string;
    workspaces: { organization_id: string | null; created_at: string } | null;
  }>;
  if (list.length === 0) return null;
  list.sort((a, b) => {
    const ao = a.workspaces?.organization_id ? 0 : 1;
    const bo = b.workspaces?.organization_id ? 0 : 1;
    if (ao !== bo) return ao - bo; // org-linked workspaces first
    return (a.workspaces?.created_at ?? "").localeCompare(b.workspaces?.created_at ?? "");
  });
  return list[0].workspace_id;
}
