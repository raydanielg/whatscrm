/**
 * Organization-role enforcement helpers for server functions.
 *
 * Membership alone is NOT authorization: every organization member (including
 * `member`, `billing` and `guest`) can read their membership row, so a plain
 * "is the caller a member of this org?" check lets a low-privilege user mint or
 * revoke API keys and rewrite CORS/IP rules. Mutating developer-platform
 * endpoints must additionally assert an elevated org role.
 *
 * Pure helper module (no server-only imports) so it can be imported at module
 * scope from `*.functions.ts` without leaking anything into client bundles.
 */

export type OrgRole = "owner" | "admin" | "member" | "billing" | "guest";

/** Roles allowed to administer the developer platform (keys, security config). */
export const ORG_ADMIN_ROLES: OrgRole[] = ["owner", "admin"];

export class ForbiddenRoleError extends Error {
  status = 403 as const;
  constructor(required: readonly OrgRole[], have: OrgRole | null) {
    super(
      `Insufficient organization role: requires ${required.join(" or ")}, caller has ${have ?? "none"}`,
    );
    this.name = "ForbiddenRoleError";
  }
}

/**
 * Read the caller's role in `orgId` under their own RLS. Returns `null` when
 * the caller is not a member (or the row is invisible to them).
 */
export async function getOrgRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
): Promise<OrgRole | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return null;
  return ((data?.role as OrgRole | undefined) ?? null);
}

/**
 * Throw {@link ForbiddenRoleError} unless the caller holds one of `allowed`
 * in `orgId`. Call this BEFORE any write in a server function handler.
 */
export async function assertOrgRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  allowed: readonly OrgRole[] = ORG_ADMIN_ROLES,
): Promise<OrgRole> {
  const role = await getOrgRole(supabase, userId, orgId);
  if (!role || !allowed.includes(role)) throw new ForbiddenRoleError(allowed, role);
  return role;
}
