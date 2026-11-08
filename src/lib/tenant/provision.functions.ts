import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

/** Repairs and returns the signed-in user's first usable organization. */
export const ensureMyOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (userError) throw new Error(userError.message);

    const { data: organizationId, error } = await sbAny(supabaseAdmin).rpc(
      "ensure_personal_organization",
      { _user_id: context.userId, _email: userResult.user?.email ?? undefined },
    );
    if (error) throw new Error(error.message);
    if (!organizationId) throw new Error("Could not prepare your organization");
    return { organizationId };
  });