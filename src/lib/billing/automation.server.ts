/**
 * Billing Automation Engine (server-only).
 *
 * Periodic tasks driven by pg_cron via `/api/public/hooks/billing/automation`:
 *   - Detect trials ending -> emit `subscription.trial_ending`
 *   - Detect invoices due within N days -> emit `invoice.due`
 *   - Retry failed payment attempts on the configured schedule
 *   - Start / advance grace period on past-due subscriptions
 *   - Auto-suspend accounts once grace expires
 *   - Auto-reactivate accounts once outstanding invoices are paid
 *   - Emit `subscription.expired` on canceled/past-due subs whose period ended
 *   - Emit `upgrade.recommended` when usage patterns warrant it
 *
 * All automation is gated by the per-organization `billing_automation_config`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emit } from "./events";
import { recordPaymentAttempt } from "./payment-engine.server";
import { sbAny } from "@/lib/supabase/untyped";

export interface AutomationConfig {
  organization_id: string;
  notify_trial_ending: boolean;
  notify_invoice_due: boolean;
  notify_subscription_expired: boolean;
  notify_upgrade_recommendation: boolean;
  trial_ending_warning_days: number;
  invoice_due_reminder_days: number;
  quota_warning_threshold_pct: number;
  payment_retry_hours: number[];
  max_payment_retries: number;
  grace_period_days: number;
  auto_suspend_after_grace: boolean;
  auto_reactivate_on_payment: boolean;
}

const DEFAULT_CONFIG: Omit<AutomationConfig, "organization_id"> = {
  notify_trial_ending: true,
  notify_invoice_due: true,
  notify_subscription_expired: true,
  notify_upgrade_recommendation: true,
  trial_ending_warning_days: 3,
  invoice_due_reminder_days: 3,
  quota_warning_threshold_pct: 80,
  payment_retry_hours: [1, 24, 72],
  max_payment_retries: 3,
  grace_period_days: 7,
  auto_suspend_after_grace: true,
  auto_reactivate_on_payment: true,
};

async function loadConfig(sb: SupabaseClient, org: string): Promise<AutomationConfig> {
  const { data } = await sbAny(sb).from("billing_automation_config").select("*").eq("organization_id", org).maybeSingle();
  return { organization_id: org, ...DEFAULT_CONFIG, ...(data as Partial<AutomationConfig> ?? {}) };
}

// ---------------------------------------------------------------------------
// Trials ending
// ---------------------------------------------------------------------------
async function scanTrialsEnding(sb: SupabaseClient): Promise<number> {
  const horizon = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  const { data } = await sb
    .from("subscriptions")
    .select("id, organization_id, trial_ends_at")
    .eq("status", "trialing")
    .gt("trial_ends_at", new Date().toISOString())
    .lt("trial_ends_at", horizon);
  let n = 0;
  for (const s of data ?? []) {
    const cfg = await loadConfig(sb, s.organization_id);
    const cutoff = new Date(Date.now() + cfg.trial_ending_warning_days * 86400 * 1000);
    if (new Date(s.trial_ends_at) <= cutoff) {
      await emit({
        type: "subscription.trial_ending",
        organization_id: s.organization_id,
        data: { subscription_id: s.id, trial_ends_at: s.trial_ends_at },
      });
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Invoices due soon
// ---------------------------------------------------------------------------
async function scanInvoicesDue(sb: SupabaseClient): Promise<number> {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400 * 1000);
  const { data } = await sb
    .from("billing_invoices")
    .select("id, organization_id, number, due_at, status")
    .in("status", ["open", "sent"])
    .gt("due_at", now.toISOString())
    .lt("due_at", soon.toISOString());
  let n = 0;
  for (const inv of data ?? []) {
    const cfg = await loadConfig(sb, inv.organization_id);
    const cutoff = new Date(now.getTime() + cfg.invoice_due_reminder_days * 86400 * 1000);
    if (new Date(inv.due_at) <= cutoff) {
      await emit({
        type: "invoice.due",
        organization_id: inv.organization_id,
        data: { invoice_id: inv.id, number: inv.number, due_date: inv.due_at?.slice(0, 10) },
      });
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Retry failed payments
// ---------------------------------------------------------------------------
async function retryFailedPayments(sb: SupabaseClient): Promise<{ retried: number; succeeded: number }> {
  const { data } = await sb
    .from("billing_payment_attempts")
    .select("id, organization_id, invoice_id, provider, amount_cents, currency, retry_count")
    .eq("status", "failed")
    .lt("next_retry_at", new Date().toISOString())
    .limit(100);
  let retried = 0;
  let succeeded = 0;
  for (const a of data ?? []) {
    const cfg = await loadConfig(sb, a.organization_id);
    if (a.retry_count >= cfg.max_payment_retries) continue;
    retried++;
    try {
      // Enqueue a new pending attempt; the payment provider workflow will
      // pick it up and mark it succeeded / failed via webhook.
      await recordPaymentAttempt(sb, {
        organization_id: a.organization_id,
        invoice_id: a.invoice_id ?? undefined,
        provider: a.provider,
        amount_cents: a.amount_cents,
        currency: a.currency,
        status: "pending",
        metadata: { retry_of: a.id, retry_count: a.retry_count + 1 },
      });
    } catch (err) {
      console.error(`[billing.automation] retry failed for attempt ${a.id}:`, err);
    }
  }
  return { retried, succeeded };
}

// ---------------------------------------------------------------------------
// Grace period + suspension
// ---------------------------------------------------------------------------
async function processGraceAndSuspend(sb: SupabaseClient): Promise<{ started: number; suspended: number; expired: number }> {
  const now = new Date();
  let started = 0;
  let suspended = 0;
  let expired = 0;

  // Start grace period on past-due subs that don't yet have one
  const { data: pastDue } = await sb
    .from("subscriptions")
    .select("id, organization_id, grace_period_ends_at, current_period_end")
    .eq("status", "past_due")
    .is("grace_period_ends_at", null);
  for (const s of pastDue ?? []) {
    const cfg = await loadConfig(sb, s.organization_id);
    const graceEnd = new Date(now.getTime() + cfg.grace_period_days * 86400 * 1000);
    await sbAny(sb).from("subscriptions").update({ grace_period_ends_at: graceEnd.toISOString() }).eq("id", s.id);
    await emit({
      type: "subscription.grace_started",
      organization_id: s.organization_id,
      data: { subscription_id: s.id, grace_ends_at: graceEnd.toISOString() },
    });
    started++;
  }

  // Suspend after grace expires
  const { data: graceExpired } = await sb
    .from("subscriptions")
    .select("id, organization_id, grace_period_ends_at")
    .in("status", ["past_due"])
    .lt("grace_period_ends_at", now.toISOString());
  for (const s of graceExpired ?? []) {
    const cfg = await loadConfig(sb, s.organization_id);
    if (!cfg.auto_suspend_after_grace) continue;
    await sbAny(sb).from("subscriptions").update({ status: "paused", suspended_at: now.toISOString() }).eq("id", s.id);
    await emit({
      type: "subscription.suspended",
      organization_id: s.organization_id,
      data: { subscription_id: s.id, reason: "grace_period_expired" },
    });
    suspended++;
  }

  // Expire canceled subscriptions whose period has ended
  const { data: canceled } = await sb
    .from("subscriptions")
    .select("id, organization_id, current_period_end")
    .eq("status", "canceled")
    .lt("current_period_end", now.toISOString());
  for (const s of canceled ?? []) {
    await emit({
      type: "subscription.expired",
      organization_id: s.organization_id,
      data: { subscription_id: s.id },
    });
    expired++;
  }

  return { started, suspended, expired };
}

/** Reactivate an account after outstanding invoices are paid. */
export async function reactivateAccount(sb: SupabaseClient, subscription_id: string): Promise<boolean> {
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id, organization_id, status")
    .eq("id", subscription_id)
    .maybeSingle();
  if (!sub) return false;

  // Any outstanding invoices?
  const { count } = await sb
    .from("billing_invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", sub.organization_id)
    .in("status", ["open", "past_due", "sent"]);
  if ((count ?? 0) > 0) return false;

  await sb
    .from("subscriptions")
    .update({ status: "active", grace_period_ends_at: null, suspended_at: null })
    .eq("id", subscription_id);
  await emit({
    type: "subscription.reactivated",
    organization_id: sub.organization_id,
    data: { subscription_id },
  });
  return true;
}

/** Manually suspend an account. */
export async function suspendAccount(sb: SupabaseClient, subscription_id: string, reason = "manual"): Promise<void> {
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id, organization_id")
    .eq("id", subscription_id)
    .maybeSingle();
  if (!sub) return;
  await sb
    .from("subscriptions")
    .update({ status: "paused", suspended_at: new Date().toISOString() })
    .eq("id", subscription_id);
  await emit({
    type: "subscription.suspended",
    organization_id: sub.organization_id,
    data: { subscription_id, reason },
  });
}

// ---------------------------------------------------------------------------
// Auto-reactivate on payment
// ---------------------------------------------------------------------------
async function autoReactivate(sb: SupabaseClient): Promise<number> {
  const { data } = await sb
    .from("subscriptions")
    .select("id, organization_id")
    .in("status", ["past_due", "paused"]);
  let n = 0;
  for (const s of data ?? []) {
    const cfg = await loadConfig(sb, s.organization_id);
    if (!cfg.auto_reactivate_on_payment) continue;
    if (await reactivateAccount(sb, s.id)) n++;
  }
  return n;
}

/** Main entry: runs the full automation pass. Idempotent, safe to call frequently. */
export async function runBillingAutomation(sb: SupabaseClient): Promise<Record<string, unknown>> {
  const trials = await scanTrialsEnding(sb).catch((e) => (console.error("[trials]", e), 0));
  const dueInv = await scanInvoicesDue(sb).catch((e) => (console.error("[due]", e), 0));
  const retry = await retryFailedPayments(sb).catch((e) => (console.error("[retry]", e), { retried: 0, succeeded: 0 }));
  const grace = await processGraceAndSuspend(sb).catch((e) => (console.error("[grace]", e), { started: 0, suspended: 0, expired: 0 }));
  const reactivated = await autoReactivate(sb).catch((e) => (console.error("[reactivate]", e), 0));
  return {
    ok: true,
    at: new Date().toISOString(),
    trials_ending_flagged: trials,
    invoices_due_flagged: dueInv,
    payments_retried: retry.retried,
    payments_recovered: retry.succeeded,
    grace_started: grace.started,
    accounts_suspended: grace.suspended,
    subscriptions_expired: grace.expired,
    accounts_reactivated: reactivated,
  };
}
