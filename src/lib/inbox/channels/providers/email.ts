import type { ChannelProvider } from "../channel";

/**
 * Email channel — inbound via IMAP/SES/Postmark webhooks; outbound via
 * Resend/SES/SMTP. Threads collapse to a single conversation per (mailbox,
 * external subject/message-id thread).
 */
export const emailChannel: ChannelProvider = {
  kind: "email",
  label: "Email",
  implemented: false,
  capabilities: new Set([
    "text", "image", "video", "audio", "document",
    "reply_quote", "forward", "threads",
  ]),
  async parseWebhook() { return []; },
  async send() { throw new Error("email: not configured"); },
};
