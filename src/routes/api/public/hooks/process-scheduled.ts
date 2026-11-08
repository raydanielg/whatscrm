/**
 * Public cron endpoint that dispatches due scheduled messages.
 *
 * Reads `scheduled_messages` rows whose `scheduled_for <= now()` and pushes
 * each into the message outbox for the workspace's default WhatsApp channel.
 * Invoked every minute by pg_cron using the stable published URL.
 */

import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/process-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { processDueScheduled } = await import("@/lib/messaging/scheduler.server");
          const result = await processDueScheduled(100);
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
