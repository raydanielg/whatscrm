/**
 * Conversation page merge guards.
 *
 * `useConversations` is an infinite query keyed by the *whole* param object,
 * so switching channel/account swaps to a different cache entry. React Query
 * can hand back a previously cached (or partially refetched) page set for a
 * key while the network request for the new selection is still in flight —
 * and realtime `setQueriesData` writers mutate every `["conversations", ws]`
 * entry at once, so a page array can legitimately contain rows that no longer
 * belong to the active selection.
 *
 * Rendering those rows is what makes a thread open with stale data after a
 * channel switch. `mergeConversationPages` is the single gate between the
 * query cache and the rendered list: it tolerates malformed pages, drops rows
 * outside the current workspace/channel/account scope, and de-duplicates by
 * id so a row that appears in two pages renders once.
 */
import { liveChatBotId } from "@/hooks/use-livechat-accounts";
import { parseExternalAccountId } from "@/lib/inbox/external-account-ids";

export type MergeableConversation = {
  id: string;
  workspace_id?: string | null;
  channel?: string | null;
  channel_account_id?: string | null;
  last_message_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type InboxSelection = {
  workspaceId?: string | null;
  /** Empty/undefined means "all channels". */
  channels?: readonly string[];
  /** `null` means "all accounts". */
  accountId?: string | null;
  /**
   * When set, re-sort the merged rows by `last_message_at` so in-place cache
   * writes can never leave the list in a stale order.
   */
  sortByRecency?: "asc" | "desc" | null;
};


function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Does this cached row still belong to the active inbox selection?
 * Mirrors the server-side filters applied in `useConversations`.
 */
export function conversationMatchesSelection(
  row: MergeableConversation,
  selection: InboxSelection,
): boolean {
  if (!row || typeof row !== "object" || typeof row.id !== "string") return false;

  // Cross-tenant guard: never render another workspace's cached rows.
  if (selection.workspaceId && row.workspace_id && row.workspace_id !== selection.workspaceId) {
    return false;
  }

  const channels = selection.channels ?? [];
  if (channels.length > 0 && (!row.channel || !channels.includes(row.channel))) {
    return false;
  }

  const accountId = selection.accountId;
  if (!accountId) return true;

  const botId = liveChatBotId(accountId);
  if (botId) return metaString(row.metadata, "chatbot_id") === botId;

  const external = parseExternalAccountId(accountId);
  if (external) {
    return row.channel === external.channel && metaString(row.metadata, "account_id") === external.rowId;
  }

  return row.channel_account_id === accountId;
}

/**
 * Flatten infinite-query pages into a render-safe, scoped, de-duplicated list.
 * Non-array pages (legacy/corrupt cache entries) are skipped rather than
 * spread, which previously surfaced as "x is not iterable" crashes.
 */
export function mergeConversationPages<T extends MergeableConversation>(
  pages: unknown,
  selection: InboxSelection = {},
): T[] {
  if (!Array.isArray(pages)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    if (!Array.isArray(page)) continue;
    for (const row of page) {
      if (!row || typeof row !== "object") continue;
      const candidate = row as T;
      if (typeof candidate.id !== "string" || seen.has(candidate.id)) continue;
      if (!conversationMatchesSelection(candidate, selection)) continue;
      seen.add(candidate.id);
      out.push(candidate);
    }
  }
  return selection.sortByRecency
    ? sortByRecency(out, selection.sortByRecency === "asc")
    : out;
}

/**
 * Re-apply the server's recency ordering client-side.
 *
 * Realtime writers and optimistic mutations patch rows *in place* inside the
 * cached pages (bumping `last_message_at`) without re-ordering them, so a
 * silent background refetch could otherwise leave a freshly bumped thread
 * sitting in its old slot until the user reloaded. Sorting at the merge gate
 * guarantees the rendered order always matches the sort the query asked for.
 */
export function sortByRecency<T extends MergeableConversation>(
  rows: T[],
  ascending: boolean,
): T[] {
  const ts = (row: T) => {
    const value = row.last_message_at ?? null;
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isNaN(parsed) ? (ascending ? Infinity : -Infinity) : parsed;
  };
  return [...rows].sort((a, b) => {
    const diff = ts(a) - ts(b);
    if (diff !== 0) return ascending ? diff : -diff;
    // Stable, deterministic tiebreak mirroring the keyset pagination order.
    return ascending ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
  });
}

