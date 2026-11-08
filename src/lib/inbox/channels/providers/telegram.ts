import type { ChannelProvider } from "../channel";
import type { OutboundDraft, ChannelAccountRef, SendResult } from "../../types";

/**
 * Telegram Bot API channel.
 *
 * Accounts live in `telegram_accounts` (one row per bot, token encrypted at
 * rest). Inbound updates arrive at `/api/public/webhooks/telegram/<accountId>`
 * and are normalized by `src/lib/telegram/webhook.server.ts`, which writes
 * straight into the omnichannel inbox tables.
 */
export const telegramChannel: ChannelProvider = {
  kind: "telegram",
  label: "Telegram",
  implemented: true,
  capabilities: new Set([
    "text", "emoji", "image", "video", "audio", "voice_note", "document",
    "location", "contact_card", "interactive_buttons", "reaction",
    "reply_quote", "forward", "edit", "delete",
  ]),
  extractAccountRouting() {
    // Telegram updates carry no bot id — routing is done by the per-account
    // webhook path plus the `X-Telegram-Bot-Api-Secret-Token` header.
    return null;
  },
  async parseWebhook() {
    // Ingestion is owned by src/lib/telegram/webhook.server.ts, which persists
    // directly; nothing is handed back through the registry seam.
    return [];
  },
  async send(draft: OutboundDraft, account: ChannelAccountRef): Promise<SendResult> {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data } = await supabaseAdmin
      .from("telegram_accounts" as never)
      .select("bot_token_ciphertext, status, status_reason")
      .eq("id", account.id)
      .maybeSingle();
    const row = data as unknown as {
      bot_token_ciphertext?: string;
      status?: string;
      status_reason?: string | null;
    } | null;
    const cipher = row?.bot_token_ciphertext;
    if (!cipher) throw new Error("telegram: bot token missing for this account");
    if (row?.status && row.status !== "connected") {
      throw new Error(
        `telegram: bot is not connected (${row.status})${row.status_reason ? ` — ${row.status_reason}` : ""}. Reconnect or verify the bot in Settings → Telegram.`,
      );
    }

    const { sendTelegramMessage } = await import("@/lib/telegram/send.server");
    const media = draft.media?.url
      ? {
          url: draft.media.url,
          kind:
            draft.type === "image"
              ? ("photo" as const)
              : draft.type === "video"
                ? ("video" as const)
                : draft.type === "audio"
                  ? ("audio" as const)
                  : ("document" as const),
        }
      : null;

    try {
      const res = await sendTelegramMessage({
        botTokenCipher: cipher,
        chatId: draft.to,
        text: draft.text ?? null,
        media,
      });
      return { providerMessageId: res.messageId, status: "sent" };
    } catch (err) {
      const { TelegramApiError } = await import("@/lib/telegram/send.server");
      if (err instanceof TelegramApiError && err.isAuthError) {
        await supabaseAdmin
          .from("telegram_accounts" as never)
          .update({
            status: "token_invalid",
            status_reason: err.message.slice(0, 500),
          } as never)
          .eq("id", account.id);
      }
      throw err;
    }
  },
};
