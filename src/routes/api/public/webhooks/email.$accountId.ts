/**
 * Public inbound-email webhook — one URL per connected email account.
 *
 *   POST /api/public/webhooks/email/$accountId?token=<webhook_secret>
 *
 * Point a Postmark inbound stream (JSON) or a Mailgun route (form post) here.
 * The per-account secret is compared timing-safe against
 * `email_accounts.webhook_secret`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/email/$accountId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const rawBody = await request.text();
        const { handleEmailWebhook } = await import("@/lib/email/webhook.server");
        return await handleEmailWebhook(params.accountId, request, rawBody);
      },
    },
  },
});
