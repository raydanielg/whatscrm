import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";

/**
 * Inbox query namespaces that are scoped to a single workspace/user.
 * When either identity changes, every cached entry below is dropped so no
 * conversation, thread, count or typing indicator from the previous tenant
 * can flash into the UI.
 */
const INBOX_QUERY_KEYS = [
  "conversations",
  "conversation-counts",
  "conversation-channel-unread",
  "messages",
  "typing",
  "handoff-queue",
  "conversation-notes",
  "conversation-labels",
] as const;

export type InboxCacheResetOptions = {
  /** Called right after the cache is cleared (e.g. to drop the selected thread). */
  onReset?: () => void;
};

/**
 * Clears all Inbox-scoped React Query caches immediately when the active
 * workspace or the signed-in user changes.
 *
 * `removeQueries` (not `invalidateQueries`) is intentional: invalidation keeps
 * the stale data rendered while refetching, which is exactly the "old messages
 * still visible after switching" symptom.
 */
export function useInboxCacheReset(options: InboxCacheResetOptions = {}) {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id ?? null;
  const userId = user?.id ?? null;

  const onResetRef = useRef(options.onReset);
  onResetRef.current = options.onReset;

  const identityRef = useRef<string | null>(null);

  useEffect(() => {
    const identity = `${userId ?? "anon"}:${workspaceId ?? "none"}`;
    if (identityRef.current === identity) return;
    const isFirstRun = identityRef.current === null;
    identityRef.current = identity;
    if (isFirstRun) return;

    for (const key of INBOX_QUERY_KEYS) {
      qc.removeQueries({ queryKey: [key] });
    }
    onResetRef.current?.();
  }, [qc, workspaceId, userId]);
}
