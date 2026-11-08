/**
 * WhatsApp QR (Web/Business App unofficial bridge).
 *
 * Wire this to whichever bridge (Baileys / venom / vendor) you deploy.
 * Scaffolded here so the omnichannel core treats it as a first-class channel.
 */

import type { ChannelProvider } from "../channel";

export const whatsappQrChannel: ChannelProvider = {
  kind: "whatsapp_qr",
  label: "WhatsApp (QR)",
  implemented: false, // flip to true once a bridge is deployed
  capabilities: new Set([
    "text", "emoji", "image", "video", "audio", "voice_note", "document",
    "location", "contact_card", "reaction", "reply_quote", "forward",
    "delete", "typing_indicator", "read_receipt", "delivery_receipt",
  ]),
  async parseWebhook() { return []; },
  async send() { throw new Error("whatsapp_qr: bridge not configured"); },
};
