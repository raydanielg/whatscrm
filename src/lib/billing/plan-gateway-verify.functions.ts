/**
 * Super-admin "verify plan ↔ gateway mappings" RPC (thin wrapper).
 *
 * Re-checks every gateway link of a plan against the gateway's live API and
 * persists the outcome. Restricted to platform staff; the action is written to
 * the platform audit trail.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  plan_id: z.string().uuid(),
  refresh: z.boolean().optional(),
});

export const verifyPlanGatewayLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertReplayAdmin } = await import("./gateway-webhook-replay.guard.server");
    await assertReplayAdmin(context.supabase, context.userId);

    const { verifyPlanGatewayMappings } = await import("./plan-gateway-verify.server");
    const result = await verifyPlanGatewayMappings(context.supabase, {
      plan_id: data.plan_id,
      refresh: data.refresh ?? true,
    });

    const { recordGatewayAudit } = await import("./gateway-audit.server");
    await recordGatewayAudit({
      action: "gateway.links_verified",
      providerId: result.results.map((r) => r.providerId).join(",") || "none",
      actorId: context.userId,
      actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      summary: `Verified ${result.results.length} gateway link(s) for plan ${result.planCode}`,
      changes: { plan_code: result.planCode, summary: result.summary },
    });

    return result;
  });
