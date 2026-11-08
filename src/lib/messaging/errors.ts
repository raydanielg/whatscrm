/**
 * Error taxonomy + retry policy for the messaging layer.
 *
 * Every provider error is wrapped in `ProviderError` so the queue worker
 * can make retry decisions without knowing the provider.
 */

export type ErrorKind =
  | "auth"          // 401/403 — do not retry, mark account
  | "rate_limit"    // 429 — retry with backoff
  | "server"        // 5xx — retry
  | "network"       // fetch failed — retry
  | "validation"    // 400 payload invalid — do not retry
  | "not_found"     // 404 — do not retry
  | "recipient"     // recipient invalid/opted-out — do not retry
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ErrorKind;
  readonly code?: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly raw?: unknown;

  constructor(kind: ErrorKind, message: string, opts: {
    code?: string;
    status?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    raw?: unknown;
  } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? (kind === "rate_limit" || kind === "server" || kind === "network");
    this.retryAfterMs = opts.retryAfterMs;
    this.raw = opts.raw;
  }
}

/**
 * Exponential backoff with jitter. Used by the outbox worker to schedule
 * `next_attempt_at` after a failure.
 */
export function computeBackoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, 15 * 60_000);
  const base = 2_000; // 2s
  const cap = 15 * 60_000; // 15m
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * (exp / 2));
  return exp + jitter;
}

export function classifyHttpError(status: number, body?: unknown): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  const _ = body;
  return "unknown";
}
