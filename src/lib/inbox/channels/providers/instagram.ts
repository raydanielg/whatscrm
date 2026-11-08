import type { ChannelProvider } from "../channel";

/** Instagram DM via Meta Graph API. Same webhook envelope as Messenger. */
export const instagramChannel: ChannelProvider = {
  kind: "instagram",
  label: "Instagram Direct",
  implemented: false,
  capabilities: new Set([
    "text", "emoji", "image", "video", "audio", "voice_note",
    "reaction", "reply_quote", "typing_indicator", "read_receipt",
  ]),
  extractAccountRouting(body: unknown) {
    const b = body as { entry?: Array<{ id?: string }> };
    const pageId = b?.entry?.[0]?.id;
    return pageId ? { externalAccountId: pageId } : null;
  },
  async parseWebhook() { return []; },
  async send() { throw new Error("instagram: not configured"); },
};
