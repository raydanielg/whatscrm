/**
 * Server-side helpers for the Super Admin surface.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAccess } from "@/lib/auth/tenant-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return data[0].role as "superadmin" | "support";
}

export const getPlatformKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);

    const { getAdminKpisInternal } = await import("./server/admin.server");
    return getAdminKpisInternal();
  });
