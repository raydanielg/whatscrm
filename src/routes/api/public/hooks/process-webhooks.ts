/**
 * Public cron endpoint that drains the webhook processing queue.
 *
 *   POST /api/public/hooks/process-webhooks
 *
 * The endpoint is idempotent and safe to invoke concurrently — the underlying
 * `webhook_events_claim_batch` uses `FOR UPDATE SKIP LOCKED`, so multiple
 * workers cooperate without stepping on each other.
 *
 * Auth: private `x-cron-token` header matching INTERNAL_CRON_TOKEN.
 */

import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/process-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
const { drainWebhookEvents } = await import("@/lib/messaging/webhook.server");
        const workerId = `web-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
        const stats = await drainWebhookEvents(workerId, 50);
        return new Response(JSON.stringify(stats), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
