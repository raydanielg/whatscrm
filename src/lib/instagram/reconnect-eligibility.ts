/**
 * When to offer Reconnect on a linked Instagram account.
 *
 * Deliberately derives from signals that already exist — the account row's
 * status and the inbound health report's `page_subscription` check — rather
 * than introducing a second capability model that could disagree with the
 * health panel sitting directly above the account list.
 */
import type { ChannelHealthReport } from "@/lib/messaging/meta-health.functions";

/** The subset of an `instagram_accounts` row this decision needs. */
export interface ReconnectCandidate {
  id: string;
  status: string;
  last_verified_at: string | null;
}

export type ReconnectReason =
  "account_error" | "missing_subscription" | "never_verified" | "stale_verification";

/**
 * A connected account whose subscription has not been confirmed in this long is
 * treated as stale. Accounts linked before the reconnect path existed have no
 * verification at all, which is the `never_verified` case.
 */
export const STALE_VERIFICATION_MS = 30 * 24 * 60 * 60 * 1000;

const SUBSCRIPTION_CHECK_ID = "page_subscription";

/** Statuses that mean the account cannot be trusted to receive DMs. */
const BROKEN_STATUSES = new Set(["error", "suspended"]);

/**
 * The reason to offer Reconnect, or `null` when the account looks healthy.
 *
 * `health` is optional: the health report is a separate, lazily-run query, and
 * the account row alone is enough to spot a broken or never-verified account.
 */
export function reconnectReason(
  account: ReconnectCandidate,
  health?: ChannelHealthReport | null,
  now: number = Date.now(),
): ReconnectReason | null {
  if (BROKEN_STATUSES.has(account.status)) return "account_error";

  // A disconnected account is disconnected on purpose — relinking is Add
  // Account's job, not Reconnect's.
  if (account.status !== "connected") return null;

  const subscription = health?.accounts
    .find((a) => a.accountId === account.id)
    ?.checks.find((c) => c.id === SUBSCRIPTION_CHECK_ID);
  if (subscription && subscription.status !== "ok" && subscription.status !== "unknown") {
    return "missing_subscription";
  }

  if (!account.last_verified_at) return "never_verified";

  const verifiedAt = Date.parse(account.last_verified_at);
  if (Number.isNaN(verifiedAt)) return "never_verified";
  if (now - verifiedAt > STALE_VERIFICATION_MS) return "stale_verification";

  return null;
}

/** One-line explanation shown next to the Reconnect button. */
export const RECONNECT_HINT: Record<ReconnectReason, string> = {
  account_error: "Reconnect re-arms this account's Page webhook subscription.",
  missing_subscription:
    "This Page is not subscribed for messages — Reconnect re-arms the subscription.",
  never_verified:
    "This account was linked before subscriptions were verified. Reconnect once to confirm it.",
  stale_verification: "Not verified recently — Reconnect to confirm messages can still arrive.",
};
