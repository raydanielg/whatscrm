/**
 * Public webhook endpoint for TikTok Business Messaging (DIRECT_MESSAGE).
 *
 *   POST /api/public/webhooks/tiktok — signed im_receive_msg / im_send_msg
 *
 * `Tiktok-Signature` (HMAC-SHA256 with TIKTOK_BUSINESS_APP_SECRET) is checked
 * before any DB work.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/tiktok")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleTikTokDmWebhook } = await import("@/lib/tiktok-dm/webhook.server");
        return await handleTikTokDmWebhook(request, rawBody);
      },
    },
  },
});
