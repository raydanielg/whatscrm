/**
 * Reconnect flow for a linked Instagram account.
 *
 * Wraps the existing `reconnectInstagramAccount` server function, which re-arms
 * the backing Page's webhook subscription and writes the account's new status.
 * The hook adds only what the UI needs: a per-account pending flag, a guard
 * against firing the same reconnect twice, and invalidation of both the account
 * list and the inbound health report — the two places a stale "Connected" badge
 * would otherwise survive a successful reconnect.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { instagramHealthKey } from "@/hooks/use-meta-health";
import { reconnectInstagramAccount } from "@/lib/instagram/accounts.functions";

/**
 * Server errors reach the client as a message string. Surface that message, but
 * never a raw object — a serialized provider response could carry a token.
 */
export function safeReconnectError(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  if (typeof message === "string" && message.trim().length > 0) return message.trim();
  return "Reconnect failed. Run the inbound health checks for details.";
}

export function useInstagramReconnect(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const reconnect = useServerFn(reconnectInstagramAccount);

  // A ref, not state: the second click of a double-click lands in the same tick
  // as the first, before any re-render could disable the button.
  const inFlight = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);

  const mutation = useMutation({
    mutationFn: (accountId: string) => reconnect({ data: { accountId } }),
    onSuccess: async (result) => {
      // The server only answers ok when Meta accepted the subscription, so the
      // account may be shown as healthy solely on the strength of this.
      if (result?.ok) {
        toast.success("Instagram account reconnected", {
          description: "The Page webhook subscription was re-armed.",
        });
      } else {
        toast.warning("Reconnect finished without confirmation", {
          description: "Run the inbound health checks to see the current state.",
        });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["instagram-accounts", workspaceId] }),
        qc.invalidateQueries({ queryKey: instagramHealthKey(workspaceId) }),
      ]);
    },
    onError: (error: unknown) => {
      toast.error("Reconnect failed", { description: safeReconnectError(error) });
      // The server marks the row as errored on failure; refetch so the card
      // keeps showing that error state rather than a stale badge.
      void qc.invalidateQueries({ queryKey: ["instagram-accounts", workspaceId] });
    },
  });

  const { mutateAsync } = mutation;

  const start = useCallback(
    (accountId: string) => {
      if (inFlight.current.has(accountId)) return;
      inFlight.current.add(accountId);
      setPendingIds((ids) => [...ids, accountId]);

      void mutateAsync(accountId)
        .catch(() => {
          /* surfaced by onError */
        })
        .finally(() => {
          inFlight.current.delete(accountId);
          setPendingIds((ids) => ids.filter((id) => id !== accountId));
        });
    },
    [mutateAsync],
  );

  const isReconnecting = useCallback(
    (accountId: string) => pendingIds.includes(accountId),
    [pendingIds],
  );

  return { reconnectAccount: start, isReconnecting, isAnyReconnecting: pendingIds.length > 0 };
}
