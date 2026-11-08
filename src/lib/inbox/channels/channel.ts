/**
 * ChannelProvider — the contract every channel implements.
 *
 * Adding a new channel = one file that implements this interface + one line
 * in `registry.ts`. Nothing else changes.
 */

import type {
  ChannelAccountRef,
  ChannelCapability,
  ChannelKind,
  InboundEvent,
  OutboundDraft,
  SendResult,
} from "../types";

export interface WebhookVerification {
  ok: boolean;
  challengeResponse?: string; // e.g. Meta hub.challenge echo
  reason?: string;
}

export interface ChannelProvider {
  /** Stable identifier — must match `ChannelKind`. */
  readonly kind: ChannelKind;

  /** Human label for UI. */
  readonly label: string;

  /** What this channel can carry. Used by composer to enable/disable UI. */
  readonly capabilities: ReadonlySet<ChannelCapability>;

  /** Is the implementation wired up? `false` for future/stub channels. */
  readonly implemented: boolean;

  /** GET verification (e.g. Meta hub challenge). */
  verifyWebhook?(query: Record<string, string>): WebhookVerification;

  /** Verify signature on POST webhook body (raw). */
  verifySignature?(rawBody: string, headers: Record<string, string>, secret?: string): boolean;

  /** Normalize a provider webhook payload to zero-or-more inbound events. */
  parseWebhook(body: unknown, account: ChannelAccountRef): Promise<InboundEvent[]>;

  /** Route incoming webhook body to a `channel_accounts` row lookup key. */
  extractAccountRouting?(body: unknown): {
    externalAccountId?: string;
    hint?: Record<string, string>;
  } | null;

  /** Send an outbound draft. Providers translate to their wire format here. */
  send(draft: OutboundDraft, account: ChannelAccountRef): Promise<SendResult>;

  /** Optional: mark inbound as read on the remote side. */
  markRead?(providerMessageId: string, account: ChannelAccountRef): Promise<void>;

  /** Optional: emit typing indicator to remote side. */
  sendTyping?(to: string, account: ChannelAccountRef): Promise<void>;

  /** Optional: fetch remote profile for a channel identity. */
  fetchProfile?(externalId: string, account: ChannelAccountRef): Promise<{
    displayName?: string;
    avatarUrl?: string;
    metadata?: Record<string, unknown>;
  } | null>;

  /** Optional: download media referenced by providerMediaId to a Blob/URL. */
  downloadMedia?(providerMediaId: string, account: ChannelAccountRef): Promise<{
    url?: string;
    bytes?: ArrayBuffer;
    mimeType?: string;
    filename?: string;
  }>;
}

/** Convenience factory for "future channel" stubs. */
export function stubChannel(
  kind: ChannelKind,
  label: string,
  capabilities: ChannelCapability[] = ["text"],
): ChannelProvider {
  return {
    kind,
    label,
    capabilities: new Set(capabilities),
    implemented: false,
    async parseWebhook() {
      throw new Error(`[${kind}] not implemented yet`);
    },
    async send() {
      throw new Error(`[${kind}] not implemented yet`);
    },
  };
}
