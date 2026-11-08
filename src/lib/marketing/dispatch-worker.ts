/**
 * The parts of the campaign dispatcher that have rules worth testing on their
 * own: claiming, releasing a claim, and deciding when a campaign is finished.
 *
 * The route handler keeps the I/O loop; these keep the invariants.
 */

import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** The `campaign_dispatch_queue` row shape the worker uses. */
export interface DispatchQueueRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string | null;
  contact_id: string | null;
  variant_id: string | null;
  template_id: string | null;
  phone_number: string | null;
  media_url: string | null;
  template_variables: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  status: string;
}

/** How long a `processing` row may hold its lock before it counts as abandoned. */
export const STALE_LOCK_MS = 5 * 60_000;

/**
 * Claim a batch atomically.
 *
 * The whole claim is one statement inside `claim_campaign_dispatch_batch`
 * (UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING), so a row
 * that another worker is claiming is skipped rather than returned to both.
 * There is deliberately no SELECT-then-UPDATE fallback here: a fallback would
 * reintroduce exactly the race the function exists to remove.
 */
export async function claimDispatchBatch(
  admin: Any,
  workerId: string,
  limit: number,
  staleAfterMs: number = STALE_LOCK_MS,
): Promise<{ rows: DispatchQueueRow[]; error: string | null }> {
  const { data, error } = await sbAny(admin).rpc(
    "claim_campaign_dispatch_batch" as never,
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_stale_after: `${Math.round(staleAfterMs / 1000)} seconds`,
    } as never,
  );
  if (error) {
    const message = (error as { message?: string }).message ?? String(error);
    // The dispatcher has no safe fallback: claiming any other way races. Say so
    // plainly, because a missing function means nothing is being sent at all.
    if (/claim_campaign_dispatch_batch|does not exist|schema cache/i.test(message)) {
      return {
        rows: [],
        error: `Dispatch claim function unavailable (${message}). Apply the 20260929120000_campaign_dispatch_claim migration — campaigns cannot be dispatched until it exists.`,
      };
    }
    return { rows: [], error: message };
  }
  return { rows: (data ?? []) as DispatchQueueRow[], error: null };
}

export interface ReleaseOptions {
  /** What the released rows become. */
  status: "pending" | "skipped";
  /** How far in the future a released `pending` row becomes due again. */
  delayMs?: number;
  /**
   * Give back the attempt the claim consumed. True only when the row was not
   * actually handed to the provider — deferred by throttling, or belonging to
   * a campaign that is not runnable right now. A row that reached the provider
   * must keep its attempt, because we cannot know whether the message went out.
   */
  refundAttempt?: boolean;
}

/** Put claimed-but-unprocessed rows back, clearing the lock. */
export async function releaseClaim(
  admin: Any,
  rows: readonly DispatchQueueRow[],
  options: ReleaseOptions,
): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  const patch: Record<string, unknown> = {
    status: options.status,
    locked_at: null,
    locked_by: null,
    run_at: new Date(Date.now() + (options.delayMs ?? 0)).toISOString(),
  };
  if (options.refundAttempt) {
    // Rows in one claim share an attempt count only by coincidence, so the
    // refund is applied per row rather than as one blanket value.
    await Promise.all(
      rows.map((row) =>
        admin
          .from("campaign_dispatch_queue")
          .update({ ...patch, attempts: Math.max(0, Number(row.attempts ?? 1) - 1) })
          .eq("id", row.id),
      ),
    );
    return;
  }
  await admin.from("campaign_dispatch_queue").update(patch).in("id", ids);
}

export interface FailureDisposition {
  /** True when this row is done: no further attempt will be made. */
  terminal: boolean;
  /** When the row becomes due again. Meaningless when terminal. */
  retryAt: Date;
}

/**
 * Decide what a failed send does next.
 *
 * Two kinds of failure, two behaviours. A configuration failure — no approved
 * template, a disconnected sender, unmapped variables — will fail identically
 * for every recipient and on every retry, so retrying it only burns attempts
 * and delays the operator finding out. It terminates immediately. Everything
 * else (a provider blip, a timeout) is retried with a growing backoff until
 * `max_attempts` is spent.
 *
 * `attempts` is the count AFTER the claim's increment, i.e. attempts spent
 * including the one that just failed.
 */
export function failureDisposition(args: {
  isConfiguration: boolean;
  attempts: number;
  maxAttempts: number;
  now?: number;
}): FailureDisposition {
  const attempts = Math.max(1, args.attempts);
  const terminal = args.isConfiguration || attempts >= args.maxAttempts;
  return {
    terminal,
    retryAt: new Date((args.now ?? Date.now()) + 30_000 * attempts),
  };
}

export interface QueueOutcome {
  /** Rows that reached the provider successfully. */
  sent: number;
  /** Rows that exhausted their attempts or hit a configuration failure. */
  failed: number;
  /** Rows still `pending` or `processing` — work that has not finished. */
  open: number;
}

export interface CampaignStatusDecision {
  status: "running" | "completed" | "failed";
  completedAt: string | null;
}

/**
 * Decide a campaign's status from its queue outcomes.
 *
 * The rule that matters: a campaign is never `completed` while any row is
 * still `pending` or `processing`. The old dispatcher marked a campaign
 * complete as soon as the current batch drained, so a campaign with retryable
 * rows waiting on their backoff reported "completed" and then kept sending.
 *
 * - every row sent .............. completed
 * - some sent, some failed ...... completed (the run is over; counters carry
 *                                 the detail, and failures are retryable from
 *                                 the campaign page)
 * - every row failed ............ failed
 * - nothing queued / all skipped  completed, immediately and with no sends
 * - anything still open ......... running
 *
 * A paused campaign never reaches this function: its rows are released before
 * any outcome is recorded.
 */
export function finalCampaignStatus(outcome: QueueOutcome): CampaignStatusDecision {
  if (outcome.open > 0) return { status: "running", completedAt: null };
  const completedAt = new Date().toISOString();
  if (outcome.failed > 0 && outcome.sent === 0) return { status: "failed", completedAt };
  return { status: "completed", completedAt };
}
