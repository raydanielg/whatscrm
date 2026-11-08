/**
 * Super-admin test webhook RPC (thin wrapper).
 *
 * Triggers a synthetic, unsigned delivery against the platform's own billing
 * webhook endpoint and returns the recorded delivery row.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ provider_id: z.string().min(1) });

export const sendGatewayTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertReplayAdmin } = await import("./gateway-webhook-replay.guard.server");
    await assertReplayAdmin(context.supabase, context.userId);

    const request = getRequest();
    const origin =
      request.headers.get("origin") ??
      (request.url ? new URL(request.url).origin : "http://localhost:8080");

    const { sendTestWebhook } = await import("./gateway-webhook-test.server");
    return sendTestWebhook(data.provider_id, origin, {
      id: context.userId,
      email: (context.claims as { email?: string } | null)?.email ?? null,
    });
  });
