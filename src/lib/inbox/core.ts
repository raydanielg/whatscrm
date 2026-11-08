/**
 * Inbox Core — the single orchestrator that composes the engines and the
 * channel registry into one API for UI, hooks, and server functions.
 *
 * UI never talks to channels. UI talks to Inbox Core.
 * Inbox Core → { ChannelRegistry, ConversationEngine, IdentityEngine,
 *                RealtimeEngine, NotificationEngine, AssignmentEngine,
 *                SearchEngine, AIEngine }.
 *
 * Adding a new channel does NOT change this file.
 */

import { getChannel, listChannels, listImplementedChannels } from "./channels/registry";
import type { ChannelProvider } from "./channels/channel";
import type {
  ChannelKind,
  InboundEvent,
  OutboundDraft,
  SendResult,
  ChannelAccountRef,
} from "./types";

export interface InboxCore {
  channels: {
    get(kind: ChannelKind): ChannelProvider;
    list(): ChannelProvider[];
    listImplemented(): ChannelProvider[];
    supports(kind: ChannelKind, cap: string): boolean;
  };
  ingress: {
    /** Normalize a webhook body into unified inbound events. */
    parse(kind: ChannelKind, body: unknown, account: ChannelAccountRef): Promise<InboundEvent[]>;
  };
  egress: {
    /** Send a channel-neutral draft through the appropriate provider. */
    send(draft: OutboundDraft, account: ChannelAccountRef): Promise<SendResult>;
    markRead(kind: ChannelKind, providerMessageId: string, account: ChannelAccountRef): Promise<void>;
    sendTyping(kind: ChannelKind, to: string, account: ChannelAccountRef): Promise<void>;
  };
}

export const inboxCore: InboxCore = {
  channels: {
    get: getChannel,
    list: listChannels,
    listImplemented: listImplementedChannels,
    supports: (kind, cap) => getChannel(kind).capabilities.has(cap as never),
  },
  ingress: {
    parse: (kind, body, account) => getChannel(kind).parseWebhook(body, account),
  },
  egress: {
    send: (draft, account) => getChannel(draft.channel).send(draft, account),
    markRead: async (kind, id, account) => {
      const c = getChannel(kind);
      if (c.markRead) await c.markRead(id, account);
    },
    sendTyping: async (kind, to, account) => {
      const c = getChannel(kind);
      if (c.sendTyping) await c.sendTyping(to, account);
    },
  },
};

export * from "./types";
export type { ChannelProvider } from "./channels/channel";
