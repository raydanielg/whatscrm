import type { ChannelProvider } from "../channel";

/** SMS via Twilio / MessageBird / Vonage. Text-only + MMS media. */
export const smsChannel: ChannelProvider = {
  kind: "sms",
  label: "SMS",
  implemented: false,
  capabilities: new Set(["text", "image", "delivery_receipt"]),
  async parseWebhook() { return []; },
  async send() { throw new Error("sms: not configured"); },
};
