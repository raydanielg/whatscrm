/**
 * Shared realtime → cache fan-out for conversation activity.
 *
 * Realtime events (new message, status/assignment change, widget session)
 * affect far more than the Inbox list: the contact timeline, activity feeds,
 * notification badges, handoff queue, SLA views and dashboard tiles are all
 * derived from the same rows. Previously each realtime handler invalidated
 * only the three Inbox keys, so every other surface stayed stale until its own
 * refetch interval fired.
 *
 * `createConversationInvalidator` centralises that fan-out and coalesces
 * bursts (a webhook batch can emit dozens of events in a few ms) into a single
 * invalidation pass, so "instant" never means "hammer the database".
 */
import type { QueryClient } from "@tanstack/react-query";

/** Keys that are workspace-scoped: ["<root>", workspaceId, ...]. */
const WORKSPACE_SCOPED_ROOTS = [
  "conversations",
  "conversation",
  "conversation-counts",
  "conversation-channel-unread",
  "conversation-stats",
  "timeline",
  "inbox-search",
  "inbox-contact-search",
  "notifications",
  "sla-dashboard",
] as const;

/** Keys that are not workspace-scoped and are invalidated by root only. */
const GLOBAL_ROOTS = [
  "conversation-activity",
  "handoff",
  "dash",
] as const;

export type ConversationInvalidator = {
  /**
   * Schedule a coalesced invalidation pass.
   *
   * `signature` identifies the underlying row revision (e.g.
   * `msg-u:<id>:delivered`). Repeats of the same signature inside the dedupe
   * window are dropped, so a webhook that re-sends the same status — or two
   * channels delivering the same INSERT — never causes a second refresh.
   * Returns `true` when the event was accepted.
   */
  schedule: (conversationId?: string | null, signature?: string | null) => boolean;
  /** Cancel any pending pass (call on unmount / workspace switch). */
  cancel: () => void;
};

/**
 * Small TTL set used to drop repeated realtime payloads. Realtime redelivers
 * on reconnect and the same row can arrive on more than one subscription, so
 * without this the Inbox re-sorts and re-counts for events that changed
 * nothing — visible as unread/order flicker.
 */
export function createEventDeduper({
  ttlMs = 15_000,
  max = 500,
}: { ttlMs?: number; max?: number } = {}) {
  const seen = new Map<string, number>();
  return {
    /** `true` when this signature is new (and should be processed). */
    accept(signature: string, now: number = Date.now()): boolean {
      const prev = seen.get(signature);
      if (prev !== undefined && now - prev < ttlMs) {
        seen.set(signature, prev); // keep original timestamp, don't extend
        return false;
      }
      seen.set(signature, now);
      if (seen.size > max) {
        // Drop the oldest insertions first (Map preserves insertion order).
        for (const key of seen.keys()) {
          seen.delete(key);
          if (seen.size <= max) break;
        }
      }
      return true;
    },
    clear() {
      seen.clear();
    },
    get size() {
      return seen.size;
    },
  };
}

export function createConversationInvalidator(
  qc: QueryClient,
  workspaceId: string,
  {
    delayMs = 120,
    maxDelayMs = 600,
    dedupeTtlMs = 15_000,
  }: { delayMs?: number; maxDelayMs?: number; dedupeTtlMs?: number } = {},
): ConversationInvalidator {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let burstStartedAt = 0;
  let pendingEvents = 0;
  const pendingConversations = new Set<string>();
  const deduper = createEventDeduper({ ttlMs: dedupeTtlMs });

  const flush = () => {
    timer = undefined;
    burstStartedAt = 0;
    // Nothing survived de-duplication — skip the fan-out entirely so the UI
    // never re-renders for a redundant event.
    if (pendingEvents === 0) {
      pendingConversations.clear();
      return;
    }
    pendingEvents = 0;
    const conversationIds = [...pendingConversations];
    pendingConversations.clear();

    for (const root of WORKSPACE_SCOPED_ROOTS) {
      void qc.invalidateQueries({ queryKey: [root, workspaceId] });
    }
    for (const root of GLOBAL_ROOTS) {
      void qc.invalidateQueries({ queryKey: [root] });
    }
    for (const conversationId of conversationIds) {
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      void qc.invalidateQueries({
        queryKey: ["conversation-activity", conversationId],
      });
    }
  };

  return {
    schedule(conversationId, signature) {
      if (signature && !deduper.accept(signature)) return false;
      if (conversationId) pendingConversations.add(conversationId);
      pendingEvents += 1;

      const now = Date.now();
      if (!timer) {
        burstStartedAt = now;
        timer = setTimeout(flush, delayMs);
        return true;
      }
      // Trailing debounce with a hard ceiling: a continuous burst keeps
      // extending the window (one pass instead of one per 120ms) but can never
      // starve the UI for longer than maxDelayMs.
      const elapsed = now - burstStartedAt;
      if (elapsed + delayMs <= maxDelayMs) {
        clearTimeout(timer);
        timer = setTimeout(flush, delayMs);
      }
      return true;
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      burstStartedAt = 0;
      pendingEvents = 0;
      pendingConversations.clear();
      deduper.clear();
    },
  };
}
