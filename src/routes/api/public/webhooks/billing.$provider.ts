/**
 * Public billing webhook endpoint — `/api/public/webhooks/billing/:provider`.
 *
 * Auth: bypasses platform auth (that's the `/api/public/*` contract). Every
 * handler verifies the provider's webhook signature via the adapter before
 * doing anything with the payload. Failed verification returns 401 with no
 * side effects.
 *
 * Idempotency: the (provider, provider_event_id) unique index on
 * `billing_events` deduplicates redelivered webhooks.
 *
 * Health: every delivery (success, duplicate, signature failure, processing
 * error) is logged to `payment_gateway_webhook_deliveries` with latency so
 * the super-admin gateway panel can show delivery health.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/billing/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const providerId = params.provider;
        const startedAt = Date.now();
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature") ?? request.headers.get("paddle-signature");

        const { recordGatewayWebhookDelivery, webhookRequestContext } = await import(
          "@/lib/billing/gateway-webhook-log.server"
        );
        const reqCtx = webhookRequestContext(request);
        const log = (extra: {
          status: "processed" | "duplicate" | "failed" | "invalid_signature" | "misconfigured";
          httpStatus?: number;
          signatureVerified?: boolean;
          eventId?: string | null;
          eventType?: string | null;
          errorMessage?: string | null;
        }) =>
          recordGatewayWebhookDelivery({
            providerId,
            latencyMs: Date.now() - startedAt,
            ...reqCtx,
            ...extra,
          });


        let event: { id: string; type: string; data: unknown; provider: string } | null = null;

        try {
          const { getBillingProvider } = await import("@/lib/billing/providers");
          const provider = getBillingProvider(providerId as any);
          const secret = process.env[`${providerId.toUpperCase()}_WEBHOOK_SECRET`] ?? "";
          if (!secret) {
            await log({
              status: "misconfigured",
              httpStatus: 500,
              errorMessage: "webhook secret not configured",
            });
            return new Response("webhook secret not configured", { status: 500 });
          }

          try {
            event = (await provider.verifyWebhook({ raw_body: rawBody, signature, secret })) as any;
          } catch (verifyErr) {
            await log({
              status: "invalid_signature",
              httpStatus: 401,
              signatureVerified: false,
              errorMessage: String((verifyErr as Error).message ?? verifyErr),
            });
            return new Response("invalid signature", { status: 401 });
          }

          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          // Idempotency: skip if already processed.
          const seen = await supabaseAdmin
            .from("billing_events")
            .select("id, processed_at")
            .eq("provider", providerId)
            .eq("provider_event_id", event!.id)
            .maybeSingle();
          if (seen.data?.processed_at) {
            await log({
              status: "duplicate",
              httpStatus: 200,
              signatureVerified: true,
              eventId: event!.id,
              eventType: event!.type,
            });
            return Response.json({ ok: true, dedup: true });
          }

          const inserted = await supabaseAdmin
            .from("billing_events")
            .insert({
              provider: providerId,
              event_type: event!.type,
              provider_event_id: event!.id,
              payload: event!.data as any,
            })
            .select("id")
            .single();

          try {
            const { routeProviderEvent } = await import("@/lib/billing/webhook-router.server");
            const result = await routeProviderEvent(supabaseAdmin, event as any);
            await supabaseAdmin
              .from("billing_events")
              .update({
                processed_at: new Date().toISOString(),
                ...(result?.handled ? {} : { error: `ignored: ${result?.reason ?? "unhandled"}` }),
              })
              .eq("id", inserted.data!.id);
          } catch (err) {
            await supabaseAdmin
              .from("billing_events")
              .update({ error: String((err as Error).message ?? err) })
              .eq("id", inserted.data!.id);
            throw err;
          }

          await log({
            status: "processed",
            httpStatus: 200,
            signatureVerified: true,
            eventId: event!.id,
            eventType: event!.type,
          });
          return Response.json({ ok: true });
        } catch (err) {
          console.error("[billing webhook] error:", err);
          await log({
            status: "failed",
            httpStatus: 400,
            signatureVerified: !!event,
            eventId: event?.id ?? null,
            eventType: event?.type ?? null,
            errorMessage: String((err as Error).message ?? err),
          });
          return new Response(String((err as Error).message ?? err), { status: 400 });
        }
      },
    },
  },
});
