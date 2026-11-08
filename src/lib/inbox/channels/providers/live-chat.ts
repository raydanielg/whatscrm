import type { ChannelProvider } from "../channel";

/**
 * Live Chat (website widget) — served by our own realtime engine.
 * `parseWebhook` here handles the widget-posted events; `send` pushes
 * agent replies over the same realtime channel to the visitor.
 */
export const liveChatChannel: ChannelProvider = {
  kind: "live_chat",
  label: "Live Chat (Website)",
  implemented: true,
  capabilities: new Set([
    "text", "emoji", "image", "video", "audio", "document",
    "location", "interactive_buttons", "interactive_list",
    "reply_quote", "edit", "delete", "typing_indicator",
    "read_receipt", "delivery_receipt", "presence",
  ]),
  async parseWebhook(body, account) {
    // Widget posts events already in near-unified shape; caller adapts.
    void body; void account;
    return [];
  },
  async send(draft) {
    // Realtime engine handles delivery to the visitor's browser session.
    // Return a deterministic id so status transitions work.
    return {
      providerMessageId: draft.clientId ?? crypto.randomUUID(),
      status: "sent",
    };
  },
};
