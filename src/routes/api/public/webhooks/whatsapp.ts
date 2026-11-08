/**
 * Public webhook endpoint for the Meta WhatsApp Cloud API.
 *
 *   GET  /api/public/webhooks/whatsapp   — subscription challenge (hub.verify_token)
 *   POST /api/public/webhooks/whatsapp   — inbound envelope (message / status)
 *
 * Every request is validated inside the handler:
 *   - GET: `verify_token` must match a `channel_accounts.verify_token` for the
 *     WhatsApp Cloud provider.
 *   - POST: `X-Hub-Signature-256` HMAC(app_secret, raw_body) must be valid.
 *
 * The route is under `/api/public/*` so it bypasses the auth wall on
 * published sites. Provider must be able to reach this URL directly.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { handleVerify } = await import("@/lib/messaging/webhook.server");
        return await handleVerify("whatsapp_cloud", url);
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleWebhook } = await import("@/lib/messaging/webhook.server");
        const response = await handleWebhook("whatsapp_cloud", {
          headers: request.headers,
          rawBody,
          url: new URL(request.url),
        });
        // Only ingest Flow submissions once the envelope passed signature
        // verification and was accepted by the core webhook engine.
        if (response.status === 200) {
          try {
            const { processWhatsAppFormSubmissions } = await import(
              "@/lib/messaging/whatsapp-forms.server"
            );
            await processWhatsAppFormSubmissions(rawBody);
          } catch (err) {
            // Never let form ingestion failures block the ack — Meta retries
            // on non-2xx and we've already committed the envelope.
            // eslint-disable-next-line no-console
            console.error("[whatsapp webhook] form submission ingest failed", err);
          }
        }
        return response;
      },
    },
  },
});
