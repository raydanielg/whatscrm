/**
 * React hook wrapper around the centralized realtime subscription manager.
 *
 * Callers pass a stable `key` plus one or more postgres_changes bindings and
 * receive idempotent, ref-counted subscriptions with guaranteed cleanup.
 *
 *   useRealtimeSubscription({
 *     key: workspaceId ? `labels:${workspaceId}` : null,
 *     bindings: [{ event: "*", table: "conversation_labels",
 *                  filter: `workspace_id=eq.${workspaceId}` }],
 *     onChange: () => qc.invalidateQueries({ queryKey: ["labels", workspaceId] }),
 *   });
 *
 * Pass `key: null` to disable the subscription (e.g. before workspace is
 * loaded). The hook re-subscribes when `key` or `bindings` (by identity)
 * change; wrap `bindings` in `useMemo` to avoid unnecessary churn.
 */

import { useEffect, useRef } from "react";
import {
  subscribeToChanges,
  type PostgresBinding,
  type PostgresChangePayload,
} from "@/lib/realtime/subscription-manager";

export interface UseRealtimeSubscriptionOptions {
  key: string | null | undefined;
  bindings: PostgresBinding[];
  onChange: (payload: PostgresChangePayload, binding: PostgresBinding) => void;
  onStatus?: (status: string) => void;
}

export function useRealtimeSubscription(opts: UseRealtimeSubscriptionOptions) {
  const { key, bindings, onChange, onStatus } = opts;

  // Latest-ref pattern: subscriber identity is stable across renders so we
  // don't tear down the channel every time the callback closes over new
  // props. The manager calls through `handlerRef.current` on each event.
  const handlerRef = useRef(onChange);
  const statusRef = useRef(onStatus);
  handlerRef.current = onChange;
  statusRef.current = onStatus;

  // Serialize bindings so we can tell whether the subscription intent
  // changed without demanding referential stability from callers.
  const bindingsKey = JSON.stringify(bindings);

  useEffect(() => {
    if (!key) return;
    const off = subscribeToChanges({
      key,
      bindings,
      onChange: (payload, binding) => handlerRef.current(payload, binding),
      onStatus: (status) => statusRef.current?.(status),
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bindingsKey]);
}
