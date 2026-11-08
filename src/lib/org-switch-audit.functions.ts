import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Records an organization switch to the shared `audit_logs` table so
 * administrators can troubleshoot cross-tenant issues (who switched, when,
 * from/to which org, and whether the client-side cache purge succeeded).
 *
 * Uses `action = 'access'` (the closest option in the audit_action enum)
 * with a stable `resource_type = 'organization_switch'` so log filters can
 * pinpoint this event.
 */
export const logOrganizationSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        fromOrgId: z.string().uuid().nullable(),
        toOrgId: z.string().uuid(),
        fromOrgName: z.string().max(200).nullable().optional(),
        toOrgName: z.string().max(200).nullable().optional(),
        outcome: z.enum(["success", "failure", "timeout"]),
        purgeSucceeded: z.boolean(),
        purgeError: z.string().max(500).nullable().optional(),
        durationMs: z.number().int().min(0).max(600_000).nullable().optional(),
        reason: z.string().max(500).nullable().optional(),
        userAgent: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // audit_logs has no INSERT policy, so write via the guarded service-role
    // client. The actor comes from the auth middleware; the target org is only
    // attached when the caller's own (RLS-scoped) client can see it, so a
    // client cannot attribute log rows to an organization it doesn't belong to.
    const { data: visibleOrg } = await sbAny(supabase)
      .from("organizations")
      .select("id")
      .eq("id", data.toOrgId)
      .maybeSingle();
    const verifiedOrgId: string | null = visibleOrg?.id ?? null;

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin).from("audit_logs").insert({
      organization_id: verifiedOrgId,
      actor_id: userId,
      action: "access",
      resource_type: "organization_switch",
      resource_id: data.toOrgId,
      user_agent: data.userAgent ?? null,
      changes: {
        from: { id: data.fromOrgId, name: data.fromOrgName ?? null },
        to: { id: data.toOrgId, name: data.toOrgName ?? null },
      },
      metadata: {
        outcome: data.outcome,
        purge_succeeded: data.purgeSucceeded,
        purge_error: data.purgeError ?? null,
        duration_ms: data.durationMs ?? null,
        reason: data.reason ?? null,
        ...(verifiedOrgId ? {} : { requested_org_id: data.toOrgId, org_unverified: true }),
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (error) {
      // Never fail the switch on logging errors — return the message so the
      // caller can surface it in devtools while the UI continues.
      console.error("[audit_logs] org switch insert failed", error.message);
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });
