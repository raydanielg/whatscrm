import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Authoritative platform-role lookup. Backed by `public.user_roles` under RLS,
 * so the caller can only ever see their own row. Used by `beforeLoad` gates to
 * make sure a signed-in user actually has `superadmin` / `support` before any
 * admin-panel bundle renders.
 */
export const getMyPlatformRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["superadmin", "support"])
      .maybeSingle();
    if (error) return { role: null as "superadmin" | "support" | null };
    return { role: (data?.role as "superadmin" | "support" | null) ?? null };
  });

/**
 * Authoritative workspace-role lookup for the current user. RLS scopes the
 * query to memberships the caller can actually see; `null` means not a member.
 */
export const getMyWorkspaceMembership = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ({ workspaceId: String(d.workspaceId) }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("workspace_members")
      .select("role,status")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = (row?.role as "owner" | "admin" | "manager" | "agent" | "viewer" | undefined) ?? null;
    const status = (row?.status as "active" | "suspended" | undefined) ?? null;
    return { role, status };
  });

/**
 * Authoritative organization-role lookup for the current user. RLS scopes the
 * query to memberships the caller can actually see; `null` means not a member.
 * When `organizationId` is omitted, the caller's earliest membership is used.
 */
export const getMyOrgRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string | null } | undefined) => ({
    organizationId: d?.organizationId ? String(d.organizationId) : null,
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("organization_members")
      .select("role,organization_id")
      .eq("user_id", context.userId);
    query = data.organizationId
      ? query.eq("organization_id", data.organizationId)
      : query.order("joined_at", { ascending: true }).limit(1);
    const { data: row } = await query.maybeSingle();
    return {
      role: (row?.role as "owner" | "admin" | "member" | "billing" | "guest" | undefined) ?? null,
      organizationId: (row?.organization_id as string | undefined) ?? null,
    };
  });
