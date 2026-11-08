/**
 * One logical submit at a time.
 *
 * `disabled={submitting}` is not enough on its own: `setSubmitting(true)` only
 * takes effect at the next render, so two clicks dispatched in the same tick
 * (a double-click, a stuck trackpad, Enter held on a focused button) both enter
 * the handler and both reach the server. For a campaign that means two enqueue
 * calls and two sets of queue rows.
 *
 * The guard here is a plain mutable flag, set synchronously before the first
 * `await`, so the second caller is rejected before it can start any work. The
 * React state that drives the button's disabled/spinner look stays as it is —
 * this is the correctness layer underneath it.
 */

export interface SingleFlight {
  /**
   * Run `fn` unless a run is already in progress.
   *
   * Returns `{ ran: false }` for a call that was suppressed, so the caller can
   * tell "nothing happened" from "it returned undefined".
   */
  run<T>(fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
  /** True while a run is in progress. */
  readonly busy: boolean;
}

/**
 * The flag is released in `finally`, so a failed action can be retried
 * immediately — a guard that survived failure would strand the button.
 */
export function createSingleFlight(): SingleFlight {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run<T>(fn: () => Promise<T>) {
      if (busy) return { ran: false as const };
      busy = true;
      try {
        return { ran: true as const, value: await fn() };
      } finally {
        busy = false;
      }
    },
  };
}
