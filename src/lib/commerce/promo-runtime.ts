/**
 * Shared cart-promotion runtime used by both admin and portal checkout
 * server functions. Given a supabase client and cart id, computes the
 * discount from `commerce_promotions` (unified engine), applies auto-apply
 * rules, honors a manual promo code, and returns the money-form values
 * plus an audit trail suitable for persisting on the cart/order.
 *
 * Money in `commerce_promotions` is in cents; cart totals are money units.
 */
import { evaluatePromotion, type CartLine, type EvalContext, type EvalResult } from './promotions.functions';
import { sbAny } from "@/lib/supabase/untyped";

type SB = any;

export type AppliedPromoAudit = {
  promotion_id: string;
  name: string;
  code: string | null;
  discount_type: string;
  amount_off_cents: number;
  free_shipping: boolean;
};

export type CartPromoResult = {
  discount: number;          // money
  free_shipping: boolean;
  applied: AppliedPromoAudit[];
};

export async function evaluateCartPromotions(
  sb: SB,
  opts: {
    workspaceId: string;
    contactId: string | null;
    code: string | null;
    lines: { product_id: string | null; quantity: number; unit_price: number }[];
    shipping: number; // money
  },
): Promise<CartPromoResult> {
  const productIds = opts.lines.map((l) => l.product_id).filter((x): x is string => !!x);
  let catMap: Record<string, { category_id: string | null; brand_id: string | null }> = {};
  if (productIds.length) {
    const { data: prods } = await sbAny(sb).from('products')
      .select('id, category_id, brand_id').in('id', productIds);
    for (const p of (prods ?? []) as Array<{ id: string; category_id: string | null; brand_id: string | null }>) {
      catMap[p.id] = { category_id: p.category_id, brand_id: p.brand_id };
    }
  }

  const evalLines: CartLine[] = opts.lines
    .filter((l) => !!l.product_id)
    .map((l) => ({
      product_id: l.product_id as string,
      quantity: l.quantity,
      unit_price_cents: Math.round(Number(l.unit_price) * 100),
      category_id: catMap[l.product_id as string]?.category_id ?? null,
      brand_id: catMap[l.product_id as string]?.brand_id ?? null,
    }));

  const subtotal_cents = evalLines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const shipping_cents = Math.round(Number(opts.shipping) * 100);

  const { data: rows } = await sbAny(sb).from('commerce_promotions').select('*')
    .eq('workspace_id', opts.workspaceId).eq('is_active', true)
    .order('priority', { ascending: false });

  const codeUp = opts.code?.trim().toUpperCase();
  const candidates = ((rows ?? []) as any[]).filter((p) => {
    const isAuto = p.auto_apply || p.promo_type === 'automatic';
    const isCoupon = p.promo_type === 'coupon' && codeUp && p.code?.toUpperCase() === codeUp;
    return isAuto || isCoupon;
  });

  let customerCounts: Record<string, number> = {};
  if (opts.contactId && candidates.length) {
    const { data: reds } = await sbAny(sb).from('commerce_promotion_redemptions')
      .select('promotion_id').eq('workspace_id', opts.workspaceId).eq('contact_id', opts.contactId);
    for (const r of (reds ?? []) as { promotion_id: string }[]) {
      customerCounts[r.promotion_id] = (customerCounts[r.promotion_id] ?? 0) + 1;
    }
  }

  const ctx: EvalContext = {
    lines: evalLines, subtotal_cents, shipping_cents,
    contact_id: opts.contactId ?? null,
    customer_redemptions_by_promo: customerCounts,
  };

  const applied: AppliedPromoAudit[] = [];
  let freeShipping = false;
  let stackClosed = false;
  for (const p of candidates) {
    if (stackClosed) break;
    const res = evaluatePromotion(p as any, ctx) as EvalResult | { skip: string };
    if ('skip' in res) continue;
    applied.push({
      promotion_id: res.promotion_id, name: res.name, code: res.code,
      discount_type: res.discount_type, amount_off_cents: res.amount_off_cents,
      free_shipping: res.free_shipping,
    });
    if (res.free_shipping) freeShipping = true;
    if (!p.is_stackable) stackClosed = true;
  }

  const total_off_cents = applied.reduce((s, r) => s + (r.free_shipping ? 0 : r.amount_off_cents), 0);
  return {
    discount: Math.round(total_off_cents) / 100,
    free_shipping: freeShipping,
    applied,
  };
}

/** Allocate a total discount across order items proportional to line subtotal. */
export function allocateLineDiscounts(
  items: { id?: string; total: number }[],
  totalDiscount: number,
): number[] {
  const subtotal = items.reduce((s, i) => s + Number(i.total ?? 0), 0);
  if (subtotal <= 0 || totalDiscount <= 0) return items.map(() => 0);
  let remainingCents = Math.round(totalDiscount * 100);
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i === items.length - 1) { out.push(remainingCents); break; }
    const share = Math.round((Number(items[i].total) / subtotal) * (totalDiscount * 100));
    out.push(share);
    remainingCents -= share;
  }
  return out;
}
