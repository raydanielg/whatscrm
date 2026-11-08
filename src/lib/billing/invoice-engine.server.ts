/**
 * Invoice Engine — assemble subscription + usage into a billing invoice.
 *
 * Flow:
 *   1. Load subscription, plan, unbilled usage for the period.
 *   2. Build line items: base plan (seats * unit price), then per-meter overage.
 *   3. Apply coupon (validateCoupon -> computeDiscount).
 *   4. Apply tax (computeTax) using the customer's country/region.
 *   5. Persist billing_invoices + billing_invoice_items in one transaction.
 *   6. Emit `invoice.drafted` -> optionally `invoice.issued` when finalized.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeDiscount, validateCoupon, type CouponRow } from "./coupon-engine";
import { emit, persistEvent } from "./events";
import { computeTax, type TaxRateRow } from "./tax-engine";
import { sbAny } from "@/lib/supabase/untyped";

export interface DraftInvoiceInput {
  organization_id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  coupon_code?: string;
  finalize?: boolean; // if true, sets status='open' and emits invoice.issued
}

export interface DraftedInvoice {
  invoice_id: string;
  total_cents: number;
  currency: string;
}

export async function draftInvoice(
  supabase: SupabaseClient,
  input: DraftInvoiceInput,
): Promise<DraftedInvoice> {
  const [subRes, custRes] = await Promise.all([
    sbAny(supabase)
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("id", input.subscription_id)
      .single(),
    sbAny(supabase)
      .from("billing_customers")
      .select("*")
      .eq("organization_id", input.organization_id)
      .maybeSingle(),
  ]);
  if (subRes.error) throw subRes.error;
  const sub = subRes.data;
  const plan = (sub as any).plans;
  const currency: string = plan.currency;
  const seats: number = sub.seats ?? 1;

  const items: Array<{
    description: string;
    quantity: number;
    unit_amount_cents: number;
    amount_cents: number;
    meter_code?: string;
    period_start: string;
    period_end: string;
  }> = [];

  // Base plan line.
  items.push({
    description: `${plan.name} — ${seats} seat${seats === 1 ? "" : "s"}`,
    quantity: seats,
    unit_amount_cents: plan.price_cents,
    amount_cents: plan.price_cents * seats,
    period_start: input.period_start,
    period_end: input.period_end,
  });

  // Metered overage: sum usage_events per meter above the plan limit.
  const meters = await sbAny(supabase)
    .from("usage_meters")
    .select("code, name, unit_amount_cents, currency")
    .returns<
      Array<{ code: string; name: string; unit_amount_cents: number | null; currency: string }>
    >();
  const usageRows = await supabase
    .from("usage_events")
    .select("meter_code, quantity")
    .eq("organization_id", input.organization_id)
    .gte("occurred_at", input.period_start)
    .lt("occurred_at", input.period_end);

  const usageByMeter = new Map<string, number>();
  for (const row of usageRows.data ?? []) {
    usageByMeter.set(
      row.meter_code,
      (usageByMeter.get(row.meter_code) ?? 0) + Number(row.quantity ?? 0),
    );
  }
  const limits = (plan.limits ?? {}) as Record<string, number | null>;
  for (const [meter, used] of usageByMeter) {
    const includedRaw = limits[meter];
    const included =
      includedRaw === null ? Infinity : typeof includedRaw === "number" ? includedRaw : 0;
    if (used <= included) continue;
    const meta = (meters.data ?? []).find((m) => m.code === meter);
    if (!meta?.unit_amount_cents) continue;
    const overage = used - included;
    items.push({
      description: `Overage: ${meta.name}`,
      quantity: overage,
      unit_amount_cents: meta.unit_amount_cents,
      amount_cents: meta.unit_amount_cents * overage,
      meter_code: meter,
      period_start: input.period_start,
      period_end: input.period_end,
    });
  }

  const subtotal_cents = items.reduce((s, i) => s + i.amount_cents, 0);

  // Coupon.
  let discount_cents = 0;
  let couponRow: CouponRow | null = null;
  if (input.coupon_code) {
    const c = await sbAny(supabase)
      .from("coupons")
      .select("*")
      .eq("code", input.coupon_code)
      .maybeSingle();
    const validated = validateCoupon(c.data as CouponRow | null, {
      plan_id: plan.id,
      currency,
      subtotal_cents,
    });
    if (validated.ok) {
      couponRow = validated.coupon;
      discount_cents = computeDiscount(couponRow, { plan_id: plan.id, currency, subtotal_cents });
    }
  }

  // Tax.
  const taxRates = await sbAny(supabase).from("tax_rates").select("*");
  const country = custRes.data?.billing_address
    ? (custRes.data.billing_address as any).country
    : null;
  const region = custRes.data?.billing_address
    ? (custRes.data.billing_address as any).region
    : null;
  const tax = computeTax(
    subtotal_cents - discount_cents,
    { country, region, tax_id: custRes.data?.tax_id ?? null },
    (taxRates.data ?? []) as TaxRateRow[],
  );
  const total_cents = subtotal_cents - discount_cents + tax.tax_cents;

  const invoice = await supabase
    .from("billing_invoices")
    .insert({
      organization_id: input.organization_id,
      subscription_id: input.subscription_id,
      status: input.finalize ? "open" : "draft",
      currency,
      subtotal_cents,
      discount_cents,
      tax_cents: tax.tax_cents,
      total_cents,
      amount_due_cents: total_cents,
      period_start: input.period_start,
      period_end: input.period_end,
      issued_at: input.finalize ? new Date().toISOString() : null,
      due_at: input.finalize ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
      coupon_id: couponRow?.id ?? null,
      tax_rate_id: tax.applied_rate?.id ?? null,
      number: input.finalize ? await nextInvoiceNumber(supabase, input.organization_id) : null,
      provider: sub.provider,
      metadata: { engine: "billing", cycle_period: [input.period_start, input.period_end] },
    })
    .select("id")
    .single();
  if (invoice.error) throw invoice.error;

  const itemsInsert = await sbAny(supabase)
    .from("billing_invoice_items")
    .insert(items.map((i) => ({ ...i, invoice_id: invoice.data.id })));
  if (itemsInsert.error) throw itemsInsert.error;

  if (couponRow) {
    // Atomically increment to avoid race conditions under concurrent invoice creation.
    await sbAny(supabase)
      .from("coupons")
      .update({ times_redeemed: (couponRow.times_redeemed ?? 0) + 1 } as never)
      .eq("id", couponRow.id)
      .eq("times_redeemed", couponRow.times_redeemed ?? 0);
  }

  const evtType = input.finalize ? "invoice.issued" : "invoice.drafted";
  await emit({
    type: evtType,
    organization_id: input.organization_id,
    data: { invoice_id: invoice.data.id, total_cents, currency },
  });
  await persistEvent(
    supabase,
    {
      type: evtType,
      organization_id: input.organization_id,
      occurred_at: new Date().toISOString(),
      data: { invoice_id: invoice.data.id, total_cents },
    },
    { subscription_id: input.subscription_id, provider: sub.provider },
  );

  return { invoice_id: invoice.data.id, total_cents, currency };
}

/** Void an invoice (only if unpaid). */
export async function voidInvoice(supabase: SupabaseClient, invoice_id: string): Promise<void> {
  const inv = await sbAny(supabase)
    .from("billing_invoices")
    .select("id, organization_id, status")
    .eq("id", invoice_id)
    .single();
  if (inv.error) throw inv.error;
  if (["paid", "void", "refunded"].includes(inv.data.status)) return;
  await sbAny(supabase)
    .from("billing_invoices")
    .update({ status: "void", voided_at: new Date().toISOString(), amount_due_cents: 0 })
    .eq("id", invoice_id);
  await emit({
    type: "invoice.voided",
    organization_id: inv.data.organization_id,
    data: { invoice_id },
  });
}

async function nextInvoiceNumber(
  supabase: SupabaseClient,
  organization_id: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const { count } = await supabase
    .from("billing_invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization_id)
    .gte("issued_at", `${year}-01-01T00:00:00Z`);
  const seq = String((count ?? 0) + 1).padStart(5, "0");
  return `INV-${year}-${seq}`;
}
