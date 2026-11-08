/**
 * Public webhook endpoint for Meta Messenger (Facebook Pages).
 *
 *   GET  /api/public/webhooks/messenger   — hub.verify_token challenge
 *   POST /api/public/webhooks/messenger   — signed inbound envelope
 *
 * Under /api/public/* so the auth wall doesn't intercept Meta's callbacks.
 * Signature verification (X-Hub-Signature-256 vs META_APP_SECRET) runs
 * before any DB work.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/messenger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { verifyMessengerWebhook } = await import("@/lib/messenger/webhook.server");
        return await verifyMessengerWebhook(url);
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleMessengerWebhook } = await import("@/lib/messenger/webhook.server");
        return await handleMessengerWebhook(request, rawBody);
      },
    },
  },
});
