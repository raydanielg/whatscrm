import type { ChannelProvider } from "../channel";

/** Facebook Messenger via Meta Graph API. */
export const messengerChannel: ChannelProvider = {
  kind: "messenger",
  label: "Facebook Messenger",
  implemented: false,
  capabilities: new Set([
    "text", "emoji", "image", "video", "audio", "document",
    "interactive_buttons", "interactive_list", "reaction",
    "reply_quote", "typing_indicator", "read_receipt", "delivery_receipt",
  ]),
  extractAccountRouting(body: unknown) {
    const b = body as { entry?: Array<{ id?: string }> };
    const pageId = b?.entry?.[0]?.id;
    return pageId ? { externalAccountId: pageId } : null;
  },
  async parseWebhook() { return []; },
  async send() { throw new Error("messenger: not configured"); },
};
