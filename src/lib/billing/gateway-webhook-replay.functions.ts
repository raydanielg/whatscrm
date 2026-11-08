/**
 * Super-admin webhook replay RPCs (thin wrappers).
 *
 * `previewGatewayWebhookReplay` lists what would run; `replayGatewayWebhooks`
 * actually re-runs the stored payloads. Both are restricted to super admins.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["failed", "misconfigured", "invalid_signature"]);

const filterSchema = z.object({
  provider_id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  statuses: z.array(statusEnum).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const replaySchema = filterSchema.extend({
  delivery_ids: z.array(z.string().uuid()).optional(),
});

export const previewGatewayWebhookReplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertReplayAdmin } = await import("./gateway-webhook-replay.guard.server");
    await assertReplayAdmin(context.supabase, context.userId);
    const { collectReplayCandidates } = await import("./gateway-webhook-replay.server");
    const { candidates } = await collectReplayCandidates({
      providerId: data.provider_id,
      from: data.from,
      to: data.to,
      ...(data.statuses ? { statuses: data.statuses } : {}),
      ...(data.limit ? { limit: data.limit } : {}),
    });
    return {
      candidates,
      replayable: candidates.filter((c) => c.replayable).length,
      total: candidates.length,
    };
  });

export const replayGatewayWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => replaySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertReplayAdmin } = await import("./gateway-webhook-replay.guard.server");
    await assertReplayAdmin(context.supabase, context.userId);
    const { replayDeliveries } = await import("./gateway-webhook-replay.server");
    return replayDeliveries(
      {
        providerId: data.provider_id,
        from: data.from,
        to: data.to,
        ...(data.statuses ? { statuses: data.statuses } : {}),
        ...(data.limit ? { limit: data.limit } : {}),
      },
      {
        id: context.userId,
        email: (context.claims as { email?: string } | null)?.email ?? null,
      },
      data.delivery_ids ? { deliveryIds: data.delivery_ids } : {},
    );
  });
