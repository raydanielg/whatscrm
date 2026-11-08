/**
 * Quota Manager — enforce plan limits at write time.
 *
 * `assertQuota()` is the gate that other engines call before performing
 * quota-consuming work (send a message, generate AI reply, etc.). It refuses
 * to proceed when `hard_limit` is exceeded and emits `quota.exceeded`.
 *
 * `refreshQuotaPeriod()` rolls forward to the next period based on the
 * subscription's current_period_end.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emit } from "./events";
import { capabilityView, checkQuota } from "./feature-limits";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveOrganizationCurrency } from "@/lib/currency/resolve.server";

export interface QuotaGateResult {
  allowed: boolean;
  meter_code: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  approaching: boolean;
}

/** Read-only check against the plan (used by UI / pre-checks). */
export async function inspectQuota(
  supabase: SupabaseClient,
  organization_id: string,
  meter_code: string,
  requested = 1,
): Promise<QuotaGateResult> {
  const [subRes, quotaRes] = await Promise.all([
    sbAny(supabase).from("subscriptions").select("plan_id, plans(features, limits, currency)").eq("organization_id", organization_id).maybeSingle(),
    sbAny(supabase).from("tenant_quotas").select("used, included, hard_limit").eq("organization_id", organization_id).eq("meter_code", meter_code).lte("period_start", new Date().toISOString()).gt("period_end", new Date().toISOString()).maybeSingle(),
  ]);
  const view = capabilityView((subRes.data as any)?.plans ?? null);
  const usedNumber = Number(quotaRes.data?.used ?? 0);
  const check = checkQuota(view, meter_code, usedNumber, requested);
  return { allowed: check.allowed, meter_code, used: check.used, limit: check.limit, remaining: check.remaining, approaching: check.approaching };
}

/** Increment a quota's `used` counter and check the hard limit. Idempotent by upsert. */
export async function assertAndIncrementQuota(
  supabase: SupabaseClient,
  organization_id: string,
  meter_code: string,
  amount = 1,
): Promise<QuotaGateResult> {
  const now = new Date().toISOString();
  const q = await supabase
    .from("tenant_quotas")
    .select("id, used, included, hard_limit, period_end")
    .eq("organization_id", organization_id)
    .eq("meter_code", meter_code)
    .lte("period_start", now)
    .gt("period_end", now)
    .maybeSingle();

  if (!q.data) {
    // No quota row means no plan constraint; still record for reporting.
    return { allowed: true, meter_code, used: 0, limit: null, remaining: null, approaching: false };
  }
  const projected = Number(q.data.used) + amount;
  const hard = q.data.hard_limit == null ? null : Number(q.data.hard_limit);
  if (hard != null && projected > hard) {
    await emit({ type: "quota.exceeded", organization_id, data: { meter_code, used: q.data.used, hard_limit: hard } });
    return {
      allowed: false,
      meter_code,
      used: Number(q.data.used),
      limit: hard,
      remaining: Math.max(0, hard - Number(q.data.used)),
      approaching: true,
    };
  }
  await sbAny(supabase).from("tenant_quotas").update({ used: projected, updated_at: now }).eq("id", q.data.id);
  const included = Number(q.data.included);
  const approaching = included > 0 && projected / included >= 0.8;
  if (approaching) {
    await emit({ type: "quota.approaching", organization_id, data: { meter_code, used: projected, included } });
  }
  return {
    allowed: true,
    meter_code,
    used: projected,
    limit: hard ?? included,
    remaining: hard != null ? Math.max(0, hard - projected) : Math.max(0, included - projected),
    approaching,
  };
}

/** Roll a quota's period forward. Call at subscription renewal. */
export async function refreshQuotaPeriod(
  supabase: SupabaseClient,
  organization_id: string,
  new_period_start: string,
  new_period_end: string,
): Promise<void> {
  // Refresh existing rows for this org — reset used to 0 and shift window.
  await supabase
    .from("tenant_quotas")
    .update({ used: 0, period_start: new_period_start, period_end: new_period_end, updated_at: new Date().toISOString() })
    .eq("organization_id", organization_id);
}

/** Seed quotas for a subscription from the plan.limits + usage_meters catalog. */
export async function seedQuotasForSubscription(
  supabase: SupabaseClient,
  organization_id: string,
  plan_id: string,
  period_start: string,
  period_end: string,
): Promise<void> {
  const [planRes, metersRes] = await Promise.all([
    sbAny(supabase).from("plans").select("limits, currency").eq("id", plan_id).single(),
    sbAny(supabase).from("usage_meters").select("code, unit_amount_cents, currency"),
  ]);
  if (planRes.error || !planRes.data) throw planRes.error ?? new Error("plan not found");
  const limits = (planRes.data.limits ?? {}) as Record<string, number | null | string>;
  // Overage pricing is written to `tenant_quotas`, so a wrong default here is
  // persisted. Resolved once, outside the map, since the map is synchronous.
  const orgCurrency = await resolveOrganizationCurrency(organization_id);
  const rows = Object.entries(limits).map(([meter_code, v]) => {
    const included = v === null || v === "unlimited" ? 0 : Number(v);
    const meter = (metersRes.data ?? []).find((m: any) => m.code === meter_code);
    return {
      organization_id,
      meter_code,
      period_start,
      period_end,
      used: 0,
      included,
      hard_limit: v === null || v === "unlimited" ? null : included, // soft-cap: same as included by default
      overage_unit_price_cents: meter?.unit_amount_cents ?? null,
      currency: (meter?.currency as string) ?? planRes.data.currency ?? orgCurrency,
    };
  });
  if (!rows.length) return;
  await sbAny(supabase).from("tenant_quotas").upsert(rows, { onConflict: "organization_id,meter_code,period_start" });
}
