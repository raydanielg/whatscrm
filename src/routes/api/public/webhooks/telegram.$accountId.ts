/**
 * Public Telegram webhook endpoint — one URL per connected bot.
 *
 *   POST /api/public/webhooks/telegram/$accountId
 *
 * Security: Telegram echoes the per-account `secret_token` registered with
 * `setWebhook` in the `X-Telegram-Bot-Api-Secret-Token` header; the handler
 * compares it (timing-safe) against `telegram_accounts.webhook_secret`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/telegram/$accountId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const rawBody = await request.text();
        const { handleTelegramWebhook } = await import("@/lib/telegram/webhook.server");
        return await handleTelegramWebhook(params.accountId, request, rawBody);
      },
    },
  },
});
