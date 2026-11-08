/**
 * Public webhook endpoint for Meta Instagram Messaging.
 *
 *   GET  /api/public/webhooks/instagram   — hub.verify_token challenge
 *   POST /api/public/webhooks/instagram   — signed inbound envelope
 *
 * Under /api/public/* to bypass the auth wall on published sites. The handler
 * verifies X-Hub-Signature-256 (HMAC-SHA256 of the raw body) against
 * META_APP_SECRET before doing any work.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/instagram")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { verifyInstagramWebhook } = await import("@/lib/instagram/webhook.server");
        return await verifyInstagramWebhook(url);
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleInstagramWebhook } = await import("@/lib/instagram/webhook.server");
        return await handleInstagramWebhook(request, rawBody);
      },
    },
  },
});
