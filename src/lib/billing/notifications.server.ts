/**
 * Billing Notifications — event-driven dispatch queue.
 *
 * `subscribeBillingNotifications()` is called once at server startup; it
 * wires the in-process event bus so that critical billing events enqueue a
 * `billing_notifications` row for the org owner. A separate worker drains
 * the queue (delivered via email / WhatsApp / in-app).
 *
 * Every enqueue uses a deterministic `dedupe_key` so the same event can't
 * spam the owner (e.g. quota.approaching per meter per period).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { on, type BillingEvent, type BillingEventType } from "./events";
import { sbAny } from "@/lib/supabase/untyped";

interface NotifyRow {
  organization_id: string;
  kind: string;
  scheduled_for?: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  related_invoice_id?: string | null;
  related_subscription_id?: string | null;
  dedupe_key: string;
}

/** Map notification kind -> boolean config column. */
const KIND_CONFIG_FLAG: Record<string, string> = {
  "subscription.trial_ending": "notify_trial_ending",
  "invoice.payment_failed": "notify_payment_failed",
  "payment.succeeded": "notify_payment_succeeded",
  "invoice.issued": "notify_invoice_generated",
  "invoice.due": "notify_invoice_due",
  "subscription.renewed": "notify_subscription_renewed",
  "subscription.expired": "notify_subscription_expired",
  "usage.limit_reached": "notify_usage_limit_reached",
  "quota.approaching": "notify_quota_warning",
  "quota.exceeded": "notify_usage_limit_reached",
  "upgrade.recommended": "notify_upgrade_recommendation",
};

/** Enqueue a notification (idempotent via dedupe_key). Respects per-org toggles. */
export async function enqueueNotification(supabase: SupabaseClient, row: NotifyRow): Promise<void> {
  const flag = KIND_CONFIG_FLAG[row.kind];
  if (flag) {
    const { data: cfg } = await supabase
      .from("billing_automation_config")
      .select(flag)
      .eq("organization_id", row.organization_id)
      .maybeSingle();
    if (cfg && (cfg as unknown as Record<string, unknown>)[flag] === false) return;
  }
  // The (organization_id, dedupe_key) unique index treats NULLs as distinct,
  // so an upsert without a key never dedupes — insert those plainly.
  const dedupeKey = (row as { dedupe_key?: string | null }).dedupe_key;
  if (dedupeKey == null) {
    await sbAny(supabase).from("billing_notifications").insert(row);
    return;
  }
  await sbAny(supabase).from("billing_notifications").upsert(row, { onConflict: "organization_id,dedupe_key" });
}


/**
 * Wire the event bus to notifications. Call once from your server bootstrap
 * (idempotent — repeated calls simply add duplicate handlers, so guard with
 * a module-level flag).
 */
let wired = false;
export function subscribeBillingNotifications(supabase: SupabaseClient): void {
  if (wired) return;
  wired = true;

  const mapping: Array<[BillingEventType, (evt: BillingEvent<any>) => NotifyRow]> = [
    ["invoice.issued", (e) => ({
      organization_id: e.organization_id,
      kind: "invoice.issued",
      subject: `New invoice issued`,
      body: `A new invoice for ${formatMoney(e.data.total_cents, e.data.currency)} is now available.`,
      payload: e.data,
      related_invoice_id: e.data.invoice_id ?? null,
      dedupe_key: `invoice.issued:${e.data.invoice_id}`,
    })],
    ["invoice.paid", (e) => ({
      organization_id: e.organization_id,
      kind: "invoice.paid",
      subject: `Payment received`,
      body: `Thanks — your invoice has been paid in full.`,
      payload: e.data,
      related_invoice_id: e.data.invoice_id ?? null,
      dedupe_key: `invoice.paid:${e.data.invoice_id}`,
    })],
    ["invoice.payment_failed", (e) => ({
      organization_id: e.organization_id,
      kind: "invoice.payment_failed",
      subject: `Payment failed — action required`,
      body: `We couldn't collect payment for your latest invoice. Please update your payment method.`,
      payload: e.data,
      related_invoice_id: e.data.invoice_id ?? null,
      dedupe_key: `invoice.payment_failed:${e.data.invoice_id}:${todayKey()}`,
    })],
    ["subscription.canceled", (e) => ({
      organization_id: e.organization_id,
      kind: "subscription.canceled",
      subject: `Subscription canceled`,
      body: `Your subscription has been canceled. You'll retain access until the end of your billing period.`,
      payload: e.data,
      dedupe_key: `subscription.canceled:${e.organization_id}:${todayKey()}`,
    })],
    ["subscription.trial_ending", (e) => ({
      organization_id: e.organization_id,
      kind: "subscription.trial_ending",
      subject: `Your trial is ending soon`,
      body: `Add a payment method to keep your workspace active.`,
      payload: e.data,
      dedupe_key: `subscription.trial_ending:${e.organization_id}:${todayKey()}`,
    })],
    ["quota.approaching", (e) => ({
      organization_id: e.organization_id,
      kind: "quota.approaching",
      subject: `You're approaching a plan limit`,
      body: `Usage for "${e.data.meter_code}" is above 80% for this period.`,
      payload: e.data,
      dedupe_key: `quota.approaching:${e.data.meter_code}:${todayKey()}`,
    })],
    ["quota.exceeded", (e) => ({
      organization_id: e.organization_id,
      kind: "quota.exceeded",
      subject: `Plan limit reached`,
      body: `You've reached your plan limit for "${e.data.meter_code}". Upgrade to keep going.`,
      payload: e.data,
      dedupe_key: `quota.exceeded:${e.data.meter_code}:${todayKey()}`,
    })],
    ["payment.attempt.succeeded", (e) => ({
      organization_id: e.organization_id,
      kind: "payment.succeeded",
      subject: `Payment received`,
      body: `Your payment of ${formatMoney(e.data.amount_cents ?? 0, e.data.currency ?? null)} was processed successfully.`,
      payload: e.data,
      related_invoice_id: e.data.invoice_id ?? null,
      dedupe_key: `payment.succeeded:${e.data.attempt_id ?? e.data.invoice_id}:${todayKey()}`,
    })],
    ["invoice.due", (e) => ({
      organization_id: e.organization_id,
      kind: "invoice.due",
      subject: `Invoice due soon`,
      body: `Invoice ${e.data.number ?? ""} is due on ${e.data.due_date ?? "soon"}. Please review and pay.`,
      payload: e.data,
      related_invoice_id: e.data.invoice_id ?? null,
      dedupe_key: `invoice.due:${e.data.invoice_id}:${todayKey()}`,
    })],
    ["subscription.renewed", (e) => ({
      organization_id: e.organization_id,
      kind: "subscription.renewed",
      subject: `Subscription renewed`,
      body: `Your subscription has been renewed for another period.`,
      payload: e.data,
      related_subscription_id: e.data.subscription_id ?? null,
      dedupe_key: `subscription.renewed:${e.data.subscription_id}:${todayKey()}`,
    })],
    ["subscription.expired", (e) => ({
      organization_id: e.organization_id,
      kind: "subscription.expired",
      subject: `Subscription expired`,
      body: `Your subscription has expired. Reactivate to restore full access.`,
      payload: e.data,
      related_subscription_id: e.data.subscription_id ?? null,
      dedupe_key: `subscription.expired:${e.data.subscription_id}:${todayKey()}`,
    })],
    ["usage.limit_reached", (e) => ({
      organization_id: e.organization_id,
      kind: "usage.limit_reached",
      subject: `Usage limit reached`,
      body: `You've hit 100% of your allowance for "${e.data.meter_code}".`,
      payload: e.data,
      dedupe_key: `usage.limit_reached:${e.data.meter_code}:${todayKey()}`,
    })],
    ["upgrade.recommended", (e) => ({
      organization_id: e.organization_id,
      kind: "upgrade.recommended",
      subject: `Consider upgrading your plan`,
      body: `Based on recent usage, upgrading to ${e.data.suggested_plan ?? "a higher plan"} would save you money and unlock more capacity.`,
      payload: e.data,
      dedupe_key: `upgrade.recommended:${e.organization_id}:${todayKey().slice(0, 7)}`,
    })],
  ];


  for (const [type, build] of mapping) {
    on(type, async (evt) => {
      try {
        await enqueueNotification(supabase, build(evt as BillingEvent<any>));
      } catch (err) {
        console.error(`[billing.notifications] enqueue failed for ${type}:`, err);
      }
    });
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The notification builders are synchronous, so there is no tenant currency to
 * await here. A payment confirmation must not name the wrong currency, so an
 * event that carries none is rendered as a bare amount rather than being
 * labelled in dollars it may not be in.
 */
function formatMoney(cents: number, currency: string | null | undefined): string {
  const amount = cents / 100;
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
