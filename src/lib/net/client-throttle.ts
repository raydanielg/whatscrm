/**
 * Client-side network throttle for outgoing app requests.
 *
 * Symptom this solves: when a page mounts, dozens of Supabase REST calls and
 * server-function RPCs fire at once. Browsers cap concurrent HTTP/2 streams
 * per origin; past that cap the server refuses streams and the browser
 * reports `ERR_HTTP2_SERVER_REFUSED_STREAM` / `ERR_CONNECTION_CLOSED`, which
 * surfaces in app code as an opaque `TypeError: Failed to fetch`.
 *
 * Two mitigations live here:
 *   1. a semaphore that caps in-flight requests, so bursts queue instead of
 *      being refused;
 *   2. a bounded retry with jittered backoff for *transient* network errors
 *      only (never for HTTP responses — those are the app's business).
 */

const MAX_CONCURRENT = 6;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 250;

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

const TRANSIENT_PATTERNS = [
  "failed to fetch",
  "network error",
  "load failed",
  "connection closed",
  "refused stream",
  "err_http2",
  "err_connection",
  "err_network",
  "socket hang up",
];

/** True when the error looks like a transport-level blip worth retrying. */
export function isTransientNetworkError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "");
    // Aborted requests are intentional — never retry them.
    if (name === "AbortError") return false;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => lower.includes(p));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = BASE_DELAY_MS * 2 ** attempt;
  return base + Math.random() * base * 0.5;
}

/** True when the browser reports it is offline. */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Concurrency-limited `fetch` with transient-error retry.
 * Drop-in replacement for the global `fetch`.
 */
export const throttledFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await acquire();
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === MAX_RETRIES) throw error;
      if (isOffline()) throw error;
    } finally {
      release();
    }
    await delay(backoffMs(attempt));
  }
  throw lastError;
};

/** Retry policy usable as React Query's `retry` option. */
export function retryTransient(failureCount: number, error: unknown): boolean {
  if (isTransientNetworkError(error)) return failureCount < 3;
  return failureCount < 1;
}

/** Backoff schedule matching the fetch retry, capped at 4s. */
export function retryDelayTransient(attemptIndex: number): number {
  return Math.min(4000, backoffMs(attemptIndex));
}
