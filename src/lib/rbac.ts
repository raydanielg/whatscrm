import { redirect } from "@tanstack/react-router";
import { getMyPlatformRole, getMyWorkspaceMembership, getMyOrgRole } from "./rbac.functions";
import { readActiveWorkspaceId, readActiveOrgId } from "./tenant/active-tenant";

export type PlatformRole = "superadmin" | "support";
export type WorkspaceRole = "owner" | "admin" | "manager" | "agent" | "viewer";


/**
 * Route-level gate. Use inside `createFileRoute({ beforeLoad })`. Throws a
 * TanStack `redirect` to `/403` when the signed-in user lacks any of the
 * allowed platform roles, so the route bundle NEVER renders for unauthorized
 * users. Runs after the `_authenticated` gate, so a session is guaranteed.
 *
 * Example:
 * ```ts
 * export const Route = createFileRoute("/_authenticated/_super-admin")({
 *   beforeLoad: requirePlatformRole("superadmin"),
 *   component: SuperAdminLayout,
 * });
 * ```
 */
export function requirePlatformRole(...allowed: PlatformRole[]) {
  return async ({ location }: { location: { href: string } }) => {
    let role: PlatformRole | null = null;
    try {
      const res = await getMyPlatformRole();
      role = res.role;
    } catch {
      role = null;
    }
    if (!role || !allowed.includes(role)) {
      throw redirect({
        to: "/403",
        replace: true,
        search: {
          scope: "platform",
          required: allowed.join(","),
          have: role ?? "",
          from: location.href,
        },
      });
    }
    return { platformRole: role };
  };
}

/**
 * Workspace-scoped gate. Reads the active workspace id from localStorage
 * (set by `useCurrentWorkspace` / workspace switcher), then checks the
 * caller's membership row under RLS. Suspended or missing memberships and
 * roles outside `allowed` are redirected to `/403`.
 *
 * Because it depends on `window.localStorage`, this gate only runs on the
 * client — which is fine: every route it protects lives under
 * `_authenticated` (`ssr: false`).
 */
export function requireWorkspaceRole(...allowed: WorkspaceRole[]) {
  return async ({ location }: { location: { href: string } }) => {
    const workspaceId = readActiveWorkspaceId();
    if (!workspaceId) {
      throw redirect({ to: "/dashboard", replace: true });
    }
    let role: WorkspaceRole | null = null;
    let status: "active" | "suspended" | null = null;
    try {
      const res = await getMyWorkspaceMembership({ data: { workspaceId } });
      role = res.role;
      status = res.status;
    } catch {
      role = null;
    }
    if (!role || status === "suspended" || !allowed.includes(role)) {
      throw redirect({
        to: "/403",
        replace: true,
        search: {
          scope: "workspace",
          required: allowed.join(","),
          have: role ?? "",
          status: status ?? "",
          from: location.href,
        },
      });
    }
    return { workspaceRole: role, workspaceId };
  };
}


export type OrgRoleName = "owner" | "admin" | "member" | "billing" | "guest";

/**
 * Organization-scoped gate for developer-platform routes (Developer Center,
 * API Security, API keys, webhooks, OAuth apps). Reads the active organization
 * from localStorage, falls back to the caller's earliest membership, and
 * redirects to `/403` unless the caller holds one of `allowed`.
 *
 * Client-only, like `requireWorkspaceRole` — every route it protects lives
 * under `_authenticated` (`ssr: false`). Server functions re-check the role
 * independently (`assertOrgRole`), so this gate is UX, not the only defense.
 */
export function requireOrgRole(...allowed: OrgRoleName[]) {
  return async ({ location }: { location: { href: string } }) => {
    const organizationId = readActiveOrgId();
    let role: OrgRoleName | null = null;
    try {
      const res = await getMyOrgRole({ data: { organizationId } });
      role = res.role;
    } catch {
      role = null;
    }
    if (!role || !allowed.includes(role)) {
      throw redirect({
        to: "/403",
        replace: true,
        search: {
          scope: "organization",
          required: allowed.join(","),
          have: role ?? "",
          from: location.href,
        },
      });
    }
    return { orgRole: role };
  };
}
