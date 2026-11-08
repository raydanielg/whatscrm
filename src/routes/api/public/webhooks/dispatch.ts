/**
 * Cron-triggered webhook dispatch worker.
 *
 * Auth: shared secret in `x-cron-secret` header (env: WEBHOOK_DISPATCH_SECRET).
 * Drains up to N pending deliveries per invocation. Idempotent.
 *
 * Wire pg_cron (external) or a scheduler to POST here every 30-60 seconds:
 *   curl -X POST https://<host>/api/public/webhooks/dispatch \
 *     -H "x-cron-secret: $WEBHOOK_DISPATCH_SECRET"
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WEBHOOK_DISPATCH_SECRET ?? "";
        if (!secret) return new Response("dispatch secret not configured", { status: 500 });
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (provided.length !== secret.length) return new Response("unauthorized", { status: 401 });
        let ok = 0;
        for (let i = 0; i < provided.length; i++) ok |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
        if (ok !== 0) return new Response("unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { drainQueue } = await import("@/lib/webhooks/dispatch.server");
        const counts = await drainQueue(supabaseAdmin, 25);
        return Response.json({ ok: true, ...counts });
      },
    },
  },
});
