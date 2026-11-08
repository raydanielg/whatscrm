/**
 * Single-flight guard for a submit handler.
 *
 * A disabled button is not enough on its own: the flag it reads comes from
 * React state, which only updates on the next render, so two clicks dispatched
 * in the same frame both pass the check and start the action twice. This flips
 * synchronously — before the first `await` — so the second caller is rejected
 * immediately.
 *
 * The flag clears in `finally`, so a failed submit stays retryable.
 */
export interface SubmitGuard {
  readonly inFlight: boolean;
  run<T>(fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
}

export function createSubmitGuard(): SubmitGuard {
  let inFlight = false;
  return {
    get inFlight() {
      return inFlight;
    },
    async run<T>(fn: () => Promise<T>) {
      if (inFlight) return { ran: false as const };
      inFlight = true;
      try {
        return { ran: true as const, value: await fn() };
      } finally {
        inFlight = false;
      }
    },
  };
}
