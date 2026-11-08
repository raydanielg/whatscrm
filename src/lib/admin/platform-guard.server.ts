/**
 * Shared platform-role guards (server-only).
 *
 * Platform roles live in `public.user_roles` (enum `app_role`: superadmin,
 * support). RLS lets a user read their own rows, so the guards run against the
 * caller's user-scoped client (never the service-role client).
 *
 * Load inside server handlers:
 *   const { assertPlatformStaff } = await import("@/lib/admin/platform-guard.server");
 */
import { sbAny } from "@/lib/supabase/untyped";

export type PlatformRole = "superadmin" | "support";

/** Allows superadmin or support. Returns the strongest role held. */
export async function assertPlatformStaff(
  supabase: unknown,
  userId: string,
): Promise<PlatformRole> {
  const { data, error } = await sbAny(supabase)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (roles.length === 0) throw new Error("Forbidden: platform staff only");
  return roles.includes("superadmin") ? "superadmin" : "support";
}

/** Allows superadmin only (via the `is_super_admin` RPC). */
export async function assertSuperAdmin(supabase: unknown, userId: string): Promise<void> {
  const { data, error } = await sbAny(supabase).rpc("is_super_admin", { _user_id: userId });
  if (error) throw new Error("Unable to verify platform role");
  if (!data) throw new Error("Forbidden: super admins only");
}
