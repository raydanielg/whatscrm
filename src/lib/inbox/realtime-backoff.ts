/**
 * Exponential backoff with full jitter for realtime resubscription.
 *
 * Supabase realtime channels can drop on transient network blips (sleep/wake,
 * flaky wifi, proxy timeouts). Retrying instantly hammers the socket and can
 * get the client rate-limited; retrying on a fixed timer leaves updates stale
 * for too long. This computes an exponential delay capped at `maxDelayMs`, then
 * applies "full jitter" so many tabs/clients recovering from the same outage
 * don't reconnect in lockstep.
 */
export type BackoffOptions = {
  /** Delay used for the first retry, before exponential growth. */
  baseDelayMs?: number;
  /** Upper bound for the computed delay (before jitter). */
  maxDelayMs?: number;
  /** Growth factor per attempt. */
  factor?: number;
  /** Fraction of the delay that is randomized (0 = none, 1 = full jitter). */
  jitter?: number;
  /** Injectable RNG for deterministic tests. */
  random?: () => number;
};

export const DEFAULT_BACKOFF: Required<Omit<BackoffOptions, "random">> = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: 0.5,
};

/**
 * @param attempt 1-based retry attempt number.
 * @returns milliseconds to wait before the next resubscribe.
 */
export function computeBackoffDelay(
  attempt: number,
  options: BackoffOptions = {},
): number {
  const {
    baseDelayMs = DEFAULT_BACKOFF.baseDelayMs,
    maxDelayMs = DEFAULT_BACKOFF.maxDelayMs,
    factor = DEFAULT_BACKOFF.factor,
    jitter = DEFAULT_BACKOFF.jitter,
    random = Math.random,
  } = options;

  const safeAttempt = Math.max(1, Math.floor(attempt));
  const raw = baseDelayMs * Math.pow(factor, safeAttempt - 1);
  const capped = Math.min(maxDelayMs, raw);
  const jitterRatio = Math.min(1, Math.max(0, jitter));
  // Full-jitter style: keep (1 - jitter) deterministic, randomize the rest so
  // the delay never collapses to 0 but is still spread across clients.
  const fixed = capped * (1 - jitterRatio);
  const spread = capped * jitterRatio * random();
  return Math.round(fixed + spread);
}

type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

/**
 * Small stateful controller: schedules one pending reconnect at a time,
 * escalating the delay for each consecutive failure and resetting once a
 * subscription succeeds.
 */
export function createReconnectController(
  onReconnect: (attempt: number) => void,
  options: BackoffOptions & { scheduler?: Scheduler } = {},
) {
  const scheduler: Scheduler = options.scheduler ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
  };
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
  };

  return {
    /** Number of consecutive failures observed so far. */
    get attempts() {
      return attempt;
    },
    /** Whether a reconnect is currently pending. */
    get pending() {
      return timer !== null;
    },
    /** Schedule a retry. No-op when one is already pending. */
    schedule(): number | null {
      if (timer) return null;
      attempt += 1;
      const delay = computeBackoffDelay(attempt, options);
      timer = scheduler.setTimeout(() => {
        timer = null;
        onReconnect(attempt);
      }, delay);
      return delay;
    },
    /** Retry immediately (e.g. the browser just came back online). */
    scheduleImmediate() {
      cancel();
      attempt += 1;
      const a = attempt;
      timer = scheduler.setTimeout(() => {
        timer = null;
        onReconnect(a);
      }, 0);
    },
    /** Called after a successful subscription. */
    reset() {
      cancel();
      attempt = 0;
    },
    cancel,
  };
}

export type ReconnectController = ReturnType<typeof createReconnectController>;
