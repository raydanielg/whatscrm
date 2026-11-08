/**
 * Shared retry + error-surfacing policy for background inbox synchronisation
 * (conversation list, unread badges, per-channel counts).
 *
 * Design contract:
 *  - Normal operation stays completely silent: no spinners, no toasts, no
 *    banners while a background refetch succeeds (or while retries are still
 *    in flight and cached data is on screen).
 *  - Transient failures are retried automatically with exponential backoff +
 *    jitter. Only once every automatic attempt has failed does the user see a
 *    single, clear, actionable message.
 *  - Permanent failures (auth / permission / bad request) are never retried —
 *    retrying them just burns requests and delays the real message.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Attempts after the initial request before we give up and tell the user. */
export const BACKGROUND_SYNC_RETRIES = 3;

type MaybePostgrestError = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
  name?: string | null;
};

/**
 * Permanent errors: retrying cannot succeed, so surface them immediately.
 * Covers PostgREST/Supabase permission + validation codes and HTTP 4xx
 * (excluding 408 timeout and 429 rate-limit, which are worth retrying).
 */
export function isPermanentSyncError(error: unknown): boolean {
  const e = (error ?? {}) as MaybePostgrestError;
  const code = String(e.code ?? "");
  if (
    code === "42501" || // insufficient_privilege (RLS)
    code === "PGRST301" || // JWT expired
    code === "PGRST302" || // anonymous access disallowed
    code === "22P02" || // invalid input syntax
    code.startsWith("PGRST1") // malformed request / schema mismatch
  ) {
    return true;
  }
  const status = typeof e.status === "number" ? e.status : null;
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return true;
  }
  return false;
}

/** `retry` option for background inbox queries. */
export function backgroundSyncRetry(failureCount: number, error: unknown): boolean {
  if (isPermanentSyncError(error)) return false;
  return failureCount < BACKGROUND_SYNC_RETRIES;
}

/** Exponential backoff (1s → 2s → 4s, capped at 8s) with a little jitter. */
export function backgroundSyncRetryDelay(attemptIndex: number): number {
  const base = Math.min(1000 * 2 ** attemptIndex, 8000);
  return base + Math.floor(Math.random() * 250);
}

/** Query options spread into any background inbox query. */
export const backgroundSyncQueryOptions = {
  retry: backgroundSyncRetry,
  retryDelay: backgroundSyncRetryDelay,
  // Sync failures are informational — never blow up a route error boundary.
  throwOnError: false,
} as const;

function describe(error: unknown): string | undefined {
  if (error instanceof Error && error.message) return error.message;
  const e = (error ?? {}) as MaybePostgrestError;
  return e.message ?? undefined;
}

/**
 * Surface a single persistent toast when a background sync has exhausted its
 * automatic retries, and dismiss it as soon as the next attempt succeeds.
 *
 * Stays silent while the query is merely retrying, so a blip on the network
 * never interrupts the user.
 */
export function useBackgroundSyncNotice(opts: {
  /** Short subject used in the message, e.g. "conversations". */
  label: string;
  /** Only true once React Query has stopped retrying. */
  isError: boolean;
  error: unknown;
  /** Whether stale-but-usable data is still rendered. */
  hasCachedData: boolean;
  /** Suppress until a scope (workspace) is known. */
  enabled?: boolean;
  /** Manual retry, wired to the toast action. */
  onRetry?: () => void;
}) {
  const { label, isError, error, hasCachedData, enabled = true, onRetry } = opts;
  const toastIdRef = useRef<string | number | null>(null);
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;

  useEffect(() => {
    if (!enabled) return;
    if (isError) {
      if (toastIdRef.current != null) return;
      const permanent = isPermanentSyncError(error);
      const message = permanent
        ? `Can't sync ${label} — you may not have access anymore.`
        : hasCachedData
          ? `Showing older ${label} — automatic sync failed after several tries.`
          : `Couldn't load ${label} — automatic sync failed after several tries.`;
      toastIdRef.current = toast.error(message, {
        description: describe(error),
        duration: Infinity,
        action: retryRef.current
          ? { label: "Try again", onClick: () => retryRef.current?.() }
          : undefined,
      });
    } else if (toastIdRef.current != null) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, [enabled, isError, error, hasCachedData, label]);

  useEffect(
    () => () => {
      if (toastIdRef.current != null) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    },
    [],
  );
}
