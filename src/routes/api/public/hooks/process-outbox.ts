/**
 * Public cron endpoint that drains the message outbox.
 *
 * Invoked every minute by pg_cron (or an external scheduler) using the
 * stable published URL. The caller supplies the private `x-cron-token`
 * header matching INTERNAL_CRON_TOKEN, and this endpoint only reads/writes rows
 * scoped by the outbox worker itself.
 *
 * Security:
 *  - No user data is returned.
 *  - Requires the `x-cron-token` header to match INTERNAL_CRON_TOKEN;
 *    all other calls are rejected.
 */

import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/process-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { drainOutbox } = await import("@/lib/messaging/queue.server");
          const result = await drainOutbox(`cron:${Date.now()}`, 50);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: String(err) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
