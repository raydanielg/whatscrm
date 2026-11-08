/**
 * Connected-account sync validation.
 *
 * Every consumer of the inbox reads `channel_accounts` rows that were written
 * by a provider integration, a migration, or (historically) by hand. A row
 * whose `provider` value is outside the supported registry cannot be routed:
 * it has no channel, no composer capabilities and no filter bucket. Letting
 * such a row into inbox state means it silently disappears from the selector
 * while still being counted as "connected".
 *
 * `normalizeChannelAccounts` is the single validation gate between the sync
 * query and inbox state: it accepts whatever the account query returned
 * (array, `{ accounts }` envelope, `null`, or garbage), validates each row's
 * provider, and returns routable accounts (with a canonical lowercase
 * `provider` plus its resolved `channel`) separately from invalid rows and
 * their human-readable reason.
 */

import {
  parseProvider,
  type KnownProvider,
} from "@/lib/inbox/channel-capabilities";
import type { InboxChannel } from "@/hooks/use-conversations";

/** An account row that passed provider validation. */
export type SyncedChannelAccount<T> = Omit<T, "provider"> & {
  /** Canonical (trimmed, lowercased) provider value from the registry. */
  provider: KnownProvider;
  /** Inbox channel this account routes onto. */
  channel: InboxChannel;
};

/** An account row rejected by provider validation. */
export type InvalidChannelAccount<T> = {
  row: T;
  /** The raw, unusable provider value as stored. */
  provider: string;
  reason: string;
};

export type ChannelAccountSyncResult<T> = {
  /** Rows safe to put into inbox state. */
  accounts: Array<SyncedChannelAccount<T>>;
  /** Rows that must be surfaced as an error instead of being routed. */
  invalid: Array<InvalidChannelAccount<T>>;
};

/** Unwrap the account-query payload into a plain row array. */
export function toAccountRows<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const inner = (payload as { accounts?: unknown }).accounts;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

/**
 * Merge the three account sources (WhatsApp `channel_accounts`, provider
 * tables, widget chatbots) into one render-safe list.
 *
 * Each source is a separate query that settles at its own pace and is cached
 * per workspace. Without this gate the selector can briefly show a *partial*
 * merge that still contains the previous workspace's rows, or the same account
 * twice when two sources project the same id. Rows from another workspace are
 * dropped and ids are de-duplicated (first source wins).
 */
export function mergeAccountSources<T extends { id?: unknown; workspace_id?: unknown }>(
  workspaceId: string | undefined,
  ...payloads: unknown[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const payload of payloads) {
    for (const row of toAccountRows<T>(payload)) {
      if (!row || typeof row !== "object") continue;
      const id = typeof row.id === "string" ? row.id : null;
      if (!id || seen.has(id)) continue;
      const ws = typeof row.workspace_id === "string" ? row.workspace_id : null;
      if (workspaceId && ws && ws !== workspaceId) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}


/**
 * Validate a connected-account sync payload.
 *
 * Rows that are not objects, or whose `provider` is missing/unknown, never
 * reach the `accounts` bucket — they are reported in `invalid` so the UI can
 * show an explicit "unsupported channel type" error.
 */
export function normalizeChannelAccounts<T extends { provider: string }>(
  payload: unknown,
): ChannelAccountSyncResult<T> {
  const accounts: Array<SyncedChannelAccount<T>> = [];
  const invalid: Array<InvalidChannelAccount<T>> = [];

  for (const row of toAccountRows<T>(payload)) {
    if (!row || typeof row !== "object") continue;
    const parsed = parseProvider((row as { provider?: unknown }).provider);
    if (parsed.ok) {
      accounts.push({
        ...(row as object),
        provider: parsed.provider,
        channel: parsed.channel,
      } as SyncedChannelAccount<T>);
    } else {
      invalid.push({ row, provider: parsed.provider, reason: parsed.reason });
    }
  }

  return { accounts, invalid };
}
