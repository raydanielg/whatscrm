/**
 * Revenue Dashboard engine — compute MRR, ARR, churn, gross/net revenue.
 *
 * `computeRevenueSnapshot()` produces a daily row for `billing_revenue_snapshots`.
 * Meant to be called from a scheduled job (pg_cron -> /api/public/hooks/billing/rollup).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveOrganizationCurrency } from "@/lib/currency/resolve.server";

export interface RevenueSnapshot {
  snapshot_date: string; // YYYY-MM-DD
  mrr_cents: number;
  arr_cents: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  new_subscriptions: number;
  churned_subscriptions: number;
  churn_rate: number;
  gross_revenue_cents: number;
  refunds_cents: number;
  net_revenue_cents: number;
  currency: string;
}

const MONTHLY_FACTOR: Record<string, number> = {
  day: 30,
  week: 4.33,
  month: 1,
  quarter: 1 / 3,
  year: 1 / 12,
};

export async function computeRevenueSnapshot(
  supabase: SupabaseClient,
  opts: { snapshot_date?: string; currency?: string; organization_id?: string | null } = {},
): Promise<RevenueSnapshot> {
  const date = opts.snapshot_date ?? new Date().toISOString().slice(0, 10);
  const currency = opts.currency ?? (await resolveOrganizationCurrency(opts.organization_id));
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59Z`;
  const monthStart = `${date.slice(0, 7)}-01T00:00:00Z`;

  const subQuery = supabase
    .from("subscriptions")
    .select("id, status, seats, created_at, canceled_at, plans!inner(price_cents, currency, interval)")
    .eq("plans.currency", currency);
  if (opts.organization_id) subQuery.eq("organization_id", opts.organization_id);
  const subsRes = await subQuery;
  if (subsRes.error) throw subsRes.error;
  const subs = (subsRes.data ?? []) as any[];

  let mrr_cents = 0;
  let active = 0;
  let trialing = 0;
  let newCount = 0;
  let churned = 0;
  for (const s of subs) {
    const factor = MONTHLY_FACTOR[s.plans.interval as string] ?? 1;
    const monthly = Math.round(s.plans.price_cents * (s.seats ?? 1) * factor);
    if (s.status === "active") { active++; mrr_cents += monthly; }
    else if (s.status === "trialing") trialing++;
    if (s.created_at && s.created_at >= dayStart && s.created_at <= dayEnd) newCount++;
    if (s.canceled_at && s.canceled_at >= dayStart && s.canceled_at <= dayEnd) churned++;
  }

  const invQuery = supabase
    .from("billing_invoices")
    .select("total_cents, amount_paid_cents, status, paid_at, currency")
    .eq("currency", currency)
    .gte("paid_at", dayStart)
    .lte("paid_at", dayEnd);
  if (opts.organization_id) invQuery.eq("organization_id", opts.organization_id);
  const invRes = await invQuery;
  const gross = (invRes.data ?? []).reduce((s: number, i: any) => s + (i.amount_paid_cents ?? 0), 0);

  const refundsQuery = supabase
    .from("billing_payment_attempts")
    .select("refunded_amount_cents, refunded_at, currency")
    .eq("status", "refunded")
    .eq("currency", currency)
    .gte("refunded_at", dayStart)
    .lte("refunded_at", dayEnd);
  if (opts.organization_id) refundsQuery.eq("organization_id", opts.organization_id);
  const refRes = await refundsQuery;
  const refunds = (refRes.data ?? []).reduce((s: number, r: any) => s + (r.refunded_amount_cents ?? 0), 0);

  // Simple monthly churn rate = churned / active_at_start.
  const churn_rate = active + churned === 0 ? 0 : Number((churned / (active + churned)).toFixed(4));

  return {
    snapshot_date: date,
    mrr_cents,
    arr_cents: mrr_cents * 12,
    active_subscriptions: active,
    trialing_subscriptions: trialing,
    new_subscriptions: newCount,
    churned_subscriptions: churned,
    churn_rate,
    gross_revenue_cents: gross,
    refunds_cents: refunds,
    net_revenue_cents: gross - refunds,
    currency,
  };
}

export async function persistRevenueSnapshot(
  supabase: SupabaseClient,
  snapshot: RevenueSnapshot,
  organization_id: string | null = null,
): Promise<void> {
  const row = { ...snapshot, organization_id };
  if (organization_id !== null) {
    await sbAny(supabase).from("billing_revenue_snapshots").upsert(row, {
      onConflict: "organization_id,snapshot_date,currency",
    });
    return;
  }
  // Platform-wide snapshot (organization_id NULL): the unique index treats
  // NULLs as distinct, so ON CONFLICT never fires. Select-then-write instead.
  const { data: existing } = await sbAny(supabase)
    .from("billing_revenue_snapshots")
    .select("id")
    .is("organization_id", null)
    .eq("snapshot_date", snapshot.snapshot_date)
    .eq("currency", snapshot.currency)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await sbAny(supabase).from("billing_revenue_snapshots").update(row).eq("id", existing.id);
  } else {
    await sbAny(supabase).from("billing_revenue_snapshots").insert(row);
  }
}
