/**
 * Coupon Engine — validate + apply promotional codes.
 * Pure logic; persistence & increments happen in the invoice engine.
 */

export interface CouponRow {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  amount_off_cents?: number | null;
  percent_off?: number | null;
  currency: string;
  duration: "once" | "forever" | "repeating";
  duration_in_months?: number | null;
  max_redemptions?: number | null;
  times_redeemed: number;
  redeem_by?: string | null;
  applies_to_plan_ids: string[];
  is_active: boolean;
}

export interface CouponApplyContext {
  plan_id: string;
  currency: string;
  subtotal_cents: number;
  billing_cycle_index?: number; // 0 = first invoice
}

export type CouponValidation =
  | { ok: true; coupon: CouponRow }
  | { ok: false; reason: string };

export function validateCoupon(coupon: CouponRow | null, ctx: CouponApplyContext): CouponValidation {
  if (!coupon) return { ok: false, reason: "not_found" };
  if (!coupon.is_active) return { ok: false, reason: "inactive" };
  if (coupon.redeem_by && new Date(coupon.redeem_by) < new Date()) return { ok: false, reason: "expired" };
  if (coupon.max_redemptions != null && coupon.times_redeemed >= coupon.max_redemptions)
    return { ok: false, reason: "exhausted" };
  if (coupon.applies_to_plan_ids.length && !coupon.applies_to_plan_ids.includes(ctx.plan_id))
    return { ok: false, reason: "plan_mismatch" };
  if (coupon.currency && coupon.currency !== ctx.currency) return { ok: false, reason: "currency_mismatch" };
  if (coupon.duration === "repeating" && coupon.duration_in_months != null) {
    if ((ctx.billing_cycle_index ?? 0) >= coupon.duration_in_months) return { ok: false, reason: "duration_over" };
  }
  return { ok: true, coupon };
}

export function computeDiscount(coupon: CouponRow, ctx: CouponApplyContext): number {
  if (coupon.discount_type === "amount") {
    return Math.min(ctx.subtotal_cents, Math.max(0, coupon.amount_off_cents ?? 0));
  }
  const pct = Math.max(0, Math.min(100, Number(coupon.percent_off ?? 0)));
  return Math.round((ctx.subtotal_cents * pct) / 100);
}
