import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sbAny } from "@/lib/supabase/untyped";

const wsInput = z.object({ workspaceId: z.string().uuid() });

const promoSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  promo_type: z.enum(['coupon', 'automatic']).default('coupon'),
  discount_type: z.enum(['percent', 'fixed', 'free_shipping', 'bxgy', 'bundle']),
  percent_off: z.number().min(0).max(100).optional().nullable(),
  amount_off_cents: z.number().int().min(0).optional().nullable(),
  currency: z.string().length(3).default('USD'),
  min_order_cents: z.number().int().min(0).optional().nullable(),
  max_discount_cents: z.number().int().min(0).optional().nullable(),
  buy_qty: z.number().int().min(1).optional().nullable(),
  get_qty: z.number().int().min(1).optional().nullable(),
  get_discount_percent: z.number().min(0).max(100).optional().nullable(),
  get_product_ids: z.array(z.string().uuid()).default([]),
  bundle_product_ids: z.array(z.string().uuid()).default([]),
  bundle_price_cents: z.number().int().min(0).optional().nullable(),
  applies_to: z.enum(['all', 'products', 'categories', 'brands']).default('all'),
  target_ids: z.array(z.string().uuid()).default([]),
  customer_scope: z.enum(['all', 'specific', 'segments']).default('all'),
  customer_ids: z.array(z.string().uuid()).default([]),
  segment_ids: z.array(z.string().uuid()).default([]),
  campaign_id: z.string().uuid().optional().nullable(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  usage_limit: z.number().int().min(1).optional().nullable(),
  usage_limit_per_customer: z.number().int().min(1).optional().nullable(),
  is_active: z.boolean().default(true),
  is_stackable: z.boolean().default(false),
  priority: z.number().int().default(0),
  rules: z.record(z.string(), z.any()).default({}),
  auto_apply: z.boolean().default(false),
});

/** List all promotions in a workspace. */
export const listPromotions = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => wsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from('commerce_promotions')
      .select('*')
      .eq('workspace_id', data.workspaceId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Get single promotion with recent redemptions. */
export const getPromotion = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string }) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [promo, redemptions] = await Promise.all([
      sbAny(context.supabase).from('commerce_promotions').select('*')
        .eq('workspace_id', data.workspaceId).eq('id', data.id).maybeSingle(),
      sbAny(context.supabase).from('commerce_promotion_redemptions').select('*')
        .eq('workspace_id', data.workspaceId).eq('promotion_id', data.id)
        .order('created_at', { ascending: false }).limit(100),
    ]);
    if (promo.error) throw new Error(promo.error.message);
    return { promotion: promo.data, redemptions: redemptions.data ?? [] };
  });

/** Create or update a promotion. */
export const upsertPromotion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => promoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId, id, ...rest } = data;
    const payload = {
      ...rest,
      workspace_id: workspaceId,
      code: rest.code ? rest.code.trim().toUpperCase() : null,
      created_by: context.userId,
    };
    if (id) {
      const { data: row, error } = await context.supabase
        .from('commerce_promotions').update(payload).eq('id', id)
        .eq('workspace_id', workspaceId).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from('commerce_promotions').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Toggle active state. */
export const setPromotionActive = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string; is_active: boolean }) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('commerce_promotions')
      .update({ is_active: data.is_active })
      .eq('id', data.id).eq('workspace_id', data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete a promotion. */
export const deletePromotion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string }) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('commerce_promotions')
      .delete().eq('id', data.id).eq('workspace_id', data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Duplicate a promotion (creates an inactive draft copy). */
export const duplicatePromotion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string }) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: srcErr } = await context.supabase
      .from('commerce_promotions').select('*')
      .eq('id', data.id).eq('workspace_id', data.workspaceId).single();
    if (srcErr) throw new Error(srcErr.message);
    const { id, created_at, updated_at, times_redeemed, code, name, ...rest } = src as any;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const payload = {
      ...rest,
      name: `${name} (Copy)`,
      code: code ? `${code}-${suffix}` : null,
      is_active: false,
      times_redeemed: 0,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from('commerce_promotions').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Bulk update active state / delete. */
export const bulkPromotionAction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; ids: string[]; action: 'activate' | 'deactivate' | 'delete' }) =>
    z.object({
      workspaceId: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(200),
      action: z.enum(['activate', 'deactivate', 'delete']),
    }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.action === 'delete') {
      const { error } = await sbAny(context.supabase).from('commerce_promotions')
        .delete().in('id', data.ids).eq('workspace_id', data.workspaceId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sbAny(context.supabase).from('commerce_promotions')
        .update({ is_active: data.action === 'activate' })
        .in('id', data.ids).eq('workspace_id', data.workspaceId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.ids.length };
  });

/** Core promotion evaluation shared by client + server. */
type PromoRow = {
  id: string; code: string | null; name: string; discount_type: string;
  percent_off: number | null; amount_off_cents: number | null;
  min_order_cents: number | null; max_discount_cents: number | null;
  buy_qty: number | null; get_qty: number | null; get_discount_percent: number | null;
  get_product_ids: string[]; bundle_product_ids: string[]; bundle_price_cents: number | null;
  applies_to: string; target_ids: string[];
  customer_scope: string; customer_ids: string[]; segment_ids: string[];
  starts_at: string | null; ends_at: string | null;
  usage_limit: number | null; usage_limit_per_customer: number | null;
  times_redeemed: number; is_active: boolean; is_stackable: boolean; priority: number;
  promo_type: string; auto_apply: boolean;
};

export type CartLine = {
  product_id: string; quantity: number; unit_price_cents: number;
  category_id?: string | null; brand_id?: string | null;
};

export type EvalContext = {
  lines: CartLine[]; subtotal_cents: number; shipping_cents: number;
  contact_id?: string | null; customer_redemptions_by_promo?: Record<string, number>;
};

export type EvalResult = {
  promotion_id: string; name: string; code: string | null;
  discount_type: string; amount_off_cents: number; free_shipping: boolean;
  reason?: string;
};

export function evaluatePromotion(p: PromoRow, ctx: EvalContext): EvalResult | { skip: string } {
  const now = Date.now();
  if (!p.is_active) return { skip: 'inactive' };
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { skip: 'not_started' };
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return { skip: 'expired' };
  if (p.usage_limit != null && p.times_redeemed >= p.usage_limit) return { skip: 'limit_reached' };
  if (p.usage_limit_per_customer != null && ctx.contact_id) {
    const used = ctx.customer_redemptions_by_promo?.[p.id] ?? 0;
    if (used >= p.usage_limit_per_customer) return { skip: 'customer_limit' };
  }
  if (p.customer_scope === 'specific') {
    if (!ctx.contact_id || !p.customer_ids.includes(ctx.contact_id)) return { skip: 'customer_scope' };
  }
  if (p.min_order_cents != null && ctx.subtotal_cents < p.min_order_cents) return { skip: 'min_order' };

  const eligibleLines = ctx.lines.filter((l) => {
    if (p.applies_to === 'all') return true;
    if (p.applies_to === 'products') return p.target_ids.includes(l.product_id);
    if (p.applies_to === 'categories') return !!l.category_id && p.target_ids.includes(l.category_id);
    if (p.applies_to === 'brands') return !!l.brand_id && p.target_ids.includes(l.brand_id);
    return false;
  });
  const eligibleSubtotal = eligibleLines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  if (eligibleLines.length === 0 && p.applies_to !== 'all') return { skip: 'no_eligible_items' };

  let amount = 0; let freeShipping = false;

  switch (p.discount_type) {
    case 'percent': {
      const pct = Number(p.percent_off ?? 0) / 100;
      amount = Math.round(eligibleSubtotal * pct);
      break;
    }
    case 'fixed': {
      amount = Math.min(p.amount_off_cents ?? 0, eligibleSubtotal);
      break;
    }
    case 'free_shipping': {
      amount = ctx.shipping_cents;
      freeShipping = true;
      break;
    }
    case 'bxgy': {
      const buy = p.buy_qty ?? 1; const get = p.get_qty ?? 1;
      const pct = Number(p.get_discount_percent ?? 100) / 100;
      const pool = eligibleLines
        .filter((l) => p.get_product_ids.length === 0 || p.get_product_ids.includes(l.product_id))
        .flatMap((l) => Array(l.quantity).fill(l.unit_price_cents) as number[])
        .sort((a, b) => a - b);
      const groups = Math.floor(pool.length / (buy + get));
      const discountedUnits = groups * get;
      amount = pool.slice(0, discountedUnits).reduce((s, price) => s + Math.round(price * pct), 0);
      break;
    }
    case 'bundle': {
      const need = p.bundle_product_ids;
      if (need.length === 0 || p.bundle_price_cents == null) { amount = 0; break; }
      const countByProduct: Record<string, number> = {};
      const priceByProduct: Record<string, number> = {};
      for (const l of ctx.lines) {
        countByProduct[l.product_id] = (countByProduct[l.product_id] ?? 0) + l.quantity;
        priceByProduct[l.product_id] = l.unit_price_cents;
      }
      const bundles = Math.min(...need.map((pid) => countByProduct[pid] ?? 0));
      if (!isFinite(bundles) || bundles <= 0) { amount = 0; break; }
      const originalPerBundle = need.reduce((s, pid) => s + (priceByProduct[pid] ?? 0), 0);
      amount = Math.max(0, (originalPerBundle - p.bundle_price_cents) * bundles);
      break;
    }
  }

  if (p.max_discount_cents != null) amount = Math.min(amount, p.max_discount_cents);
  amount = Math.max(0, Math.round(amount));

  if (amount <= 0 && !freeShipping) return { skip: 'no_discount' };

  return {
    promotion_id: p.id, name: p.name, code: p.code,
    discount_type: p.discount_type, amount_off_cents: amount, free_shipping: freeShipping,
  };
}

/** Validate a coupon code or auto-apply promotions against a cart. */
export const validatePromotions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      code: z.string().optional().nullable(),
      contactId: z.string().uuid().optional().nullable(),
      lines: z.array(z.object({
        product_id: z.string().uuid(), quantity: z.number().int().min(1),
        unit_price_cents: z.number().int().min(0),
        category_id: z.string().uuid().optional().nullable(),
        brand_id: z.string().uuid().optional().nullable(),
      })),
      shipping_cents: z.number().int().min(0).default(0),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const subtotal = data.lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
    const query = sbAny(context.supabase).from('commerce_promotions').select('*')
      .eq('workspace_id', data.workspaceId).eq('is_active', true)
      .order('priority', { ascending: false });
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const candidates = (rows ?? []).filter((p) => {
      if (data.code) return p.promo_type === 'coupon' && p.code?.toUpperCase() === data.code.trim().toUpperCase();
      return p.auto_apply || p.promo_type === 'automatic';
    });

    let customerCounts: Record<string, number> = {};
    if (data.contactId && candidates.length) {
      const { data: reds } = await context.supabase
        .from('commerce_promotion_redemptions')
        .select('promotion_id')
        .eq('workspace_id', data.workspaceId)
        .eq('contact_id', data.contactId);
      for (const r of reds ?? []) customerCounts[r.promotion_id] = (customerCounts[r.promotion_id] ?? 0) + 1;
    }

    const ctx: EvalContext = {
      lines: data.lines, subtotal_cents: subtotal,
      shipping_cents: data.shipping_cents, contact_id: data.contactId ?? null,
      customer_redemptions_by_promo: customerCounts,
    };

    const applied: EvalResult[] = [];
    const skipped: { name: string; code: string | null; reason: string }[] = [];
    let stackClosed = false;
    for (const p of candidates as PromoRow[]) {
      if (stackClosed) break;
      const res = evaluatePromotion(p, ctx);
      if ('skip' in res) { skipped.push({ name: p.name, code: p.code, reason: res.skip }); continue; }
      applied.push(res);
      if (!p.is_stackable) stackClosed = true;
    }

    const total_off = applied.reduce((s, r) => s + r.amount_off_cents, 0);
    const free_shipping = applied.some((r) => r.free_shipping);
    return { applied, skipped, total_off_cents: total_off, free_shipping, subtotal_cents: subtotal };
  });

/** Record redemptions after an order is placed. */
export const recordRedemptions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      orderId: z.string().uuid(),
      contactId: z.string().uuid().optional().nullable(),
      redemptions: z.array(z.object({
        promotion_id: z.string().uuid(),
        amount_off_cents: z.number().int().min(0),
        code_used: z.string().optional().nullable(),
        currency: z.string().length(3).default('USD'),
      })),
    }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.redemptions.length === 0) return { ok: true, count: 0 };
    const rows = data.redemptions.map((r) => ({
      workspace_id: data.workspaceId, order_id: data.orderId,
      contact_id: data.contactId ?? null, promotion_id: r.promotion_id,
      amount_off_cents: r.amount_off_cents, code_used: r.code_used ?? null, currency: r.currency,
    }));
    const { error } = await sbAny(context.supabase).from('commerce_promotion_redemptions').insert(rows);
    if (error) throw new Error(error.message);
    for (const r of data.redemptions) {
      const { data: row } = await sbAny(context.supabase).from('commerce_promotions')
        .select('times_redeemed').eq('id', r.promotion_id).maybeSingle();
      await sbAny(context.supabase).from('commerce_promotions')
        .update({ times_redeemed: (row?.times_redeemed ?? 0) + 1 })
        .eq('id', r.promotion_id);
    }
    return { ok: true, count: rows.length };
  });

/** Analytics summary for promotions dashboard. */
export const getPromotionsAnalytics = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => wsInput.parse(d))
  .handler(async ({ data, context }) => {
    const [promos, reds] = await Promise.all([
      sbAny(context.supabase).from('commerce_promotions').select('id, is_active, promo_type, auto_apply, ends_at, times_redeemed')
        .eq('workspace_id', data.workspaceId),
      sbAny(context.supabase).from('commerce_promotion_redemptions').select('amount_off_cents, created_at, promotion_id')
        .eq('workspace_id', data.workspaceId).gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString()),
    ]);
    const list = promos.data ?? []; const rlist = reds.data ?? [];
    const now = Date.now();
    return {
      total: list.length,
      active: list.filter((p) => p.is_active && (!p.ends_at || new Date(p.ends_at).getTime() > now)).length,
      automatic: list.filter((p) => p.auto_apply || p.promo_type === 'automatic').length,
      redemptions30d: rlist.length,
      revenue_saved_30d: rlist.reduce((s, r) => s + Number(r.amount_off_cents ?? 0), 0),
    };
  });

/** Detailed redemption history: aggregates by promotion, by customer, plus a timeline of redemptions with order revenue. */
export const getRedemptionHistory = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; promotionId?: string; days?: number }) =>
    z.object({
      workspaceId: z.string().uuid(),
      promotionId: z.string().uuid().optional(),
      days: z.number().int().min(1).max(365).default(90),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();

    let q = context.supabase
      .from('commerce_promotion_redemptions')
      .select('id, promotion_id, order_id, contact_id, code_used, amount_off_cents, currency, created_at')
      .eq('workspace_id', data.workspaceId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (data.promotionId) q = q.eq('promotion_id', data.promotionId);
    const { data: reds, error } = await q;
    if (error) throw new Error(error.message);
    const redemptions = reds ?? [];

    const promoIds = Array.from(new Set(redemptions.map((r) => r.promotion_id)));
    const orderIds = Array.from(new Set(redemptions.map((r) => r.order_id).filter(Boolean) as string[]));
    const contactIds = Array.from(new Set(redemptions.map((r) => r.contact_id).filter(Boolean) as string[]));

    const [promosRes, ordersRes, contactsRes] = await Promise.all([
      promoIds.length
        ? sbAny(context.supabase).from('commerce_promotions')
            .select('id, code, name, discount_type, promo_type, times_redeemed')
            .eq('workspace_id', data.workspaceId).in('id', promoIds)
        : Promise.resolve({ data: [], error: null } as any),
      orderIds.length
        ? sbAny(context.supabase).from('commerce_orders')
            .select('id, order_number, total, subtotal, discount, currency, status, payment_status, placed_at, created_at, contact_id')
            .eq('workspace_id', data.workspaceId).in('id', orderIds)
        : Promise.resolve({ data: [], error: null } as any),
      contactIds.length
        ? sbAny(context.supabase).from('contacts')
            .select('id, name, email, phone')
            .eq('workspace_id', data.workspaceId).in('id', contactIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    const promoMap = new Map<string, any>((promosRes.data ?? []).map((p: any) => [p.id, p]));
    const orderMap = new Map<string, any>((ordersRes.data ?? []).map((o: any) => [o.id, o]));
    const contactMap = new Map<string, any>((contactsRes.data ?? []).map((c: any) => [c.id, c]));

    // Timeline rows
    const timeline = redemptions.map((r) => {
      const order = r.order_id ? orderMap.get(r.order_id) : null;
      const promo = promoMap.get(r.promotion_id) ?? null;
      const contact = r.contact_id ? contactMap.get(r.contact_id) : null;
      return {
        id: r.id,
        created_at: r.created_at,
        promotion_id: r.promotion_id,
        promotion_name: promo?.name ?? '(deleted)',
        promotion_code: promo?.code ?? null,
        discount_type: promo?.discount_type ?? null,
        code_used: r.code_used,
        amount_off_cents: Number(r.amount_off_cents ?? 0),
        currency: r.currency,
        order_id: r.order_id,
        order_number: order?.order_number ?? null,
        order_total_cents: order ? Math.round(Number(order.total) * 100) : null,
        order_subtotal_cents: order ? Math.round(Number(order.subtotal) * 100) : null,
        order_status: order?.status ?? null,
        payment_status: order?.payment_status ?? null,
        contact_id: r.contact_id,
        contact_name: contact?.name ?? null,
        contact_email: contact?.email ?? null,
        contact_phone: contact?.phone ?? null,
      };
    });

    // Aggregate by promotion
    const byPromoMap = new Map<string, {
      promotion_id: string; name: string; code: string | null; discount_type: string | null;
      redemptions: number; unique_customers: Set<string>;
      discount_cents: number; revenue_cents: number; last_used_at: string | null;
    }>();
    for (const t of timeline) {
      const key = t.promotion_id;
      let a = byPromoMap.get(key);
      if (!a) {
        a = {
          promotion_id: key, name: t.promotion_name, code: t.promotion_code,
          discount_type: t.discount_type,
          redemptions: 0, unique_customers: new Set(),
          discount_cents: 0, revenue_cents: 0, last_used_at: null,
        };
        byPromoMap.set(key, a);
      }
      a.redemptions += 1;
      if (t.contact_id) a.unique_customers.add(t.contact_id);
      a.discount_cents += t.amount_off_cents;
      a.revenue_cents += t.order_total_cents ?? 0;
      if (!a.last_used_at || t.created_at > a.last_used_at) a.last_used_at = t.created_at;
    }
    const byPromotion = Array.from(byPromoMap.values())
      .map((a) => ({ ...a, unique_customers: a.unique_customers.size }))
      .sort((x, y) => y.redemptions - x.redemptions);

    // Aggregate by customer
    const byCustMap = new Map<string, {
      contact_id: string | null; name: string | null; email: string | null; phone: string | null;
      redemptions: number; discount_cents: number; revenue_cents: number;
      promotions: Set<string>; last_used_at: string | null;
    }>();
    for (const t of timeline) {
      const key = t.contact_id ?? '__anon__';
      let a = byCustMap.get(key);
      if (!a) {
        a = {
          contact_id: t.contact_id, name: t.contact_name, email: t.contact_email, phone: t.contact_phone,
          redemptions: 0, discount_cents: 0, revenue_cents: 0,
          promotions: new Set(), last_used_at: null,
        };
        byCustMap.set(key, a);
      }
      a.redemptions += 1;
      a.discount_cents += t.amount_off_cents;
      a.revenue_cents += t.order_total_cents ?? 0;
      a.promotions.add(t.promotion_id);
      if (!a.last_used_at || t.created_at > a.last_used_at) a.last_used_at = t.created_at;
    }
    const byCustomer = Array.from(byCustMap.values())
      .map((a) => ({ ...a, promotions_used: a.promotions.size, promotions: undefined }))
      .sort((x, y) => y.revenue_cents - x.revenue_cents);

    // Daily series
    const dailyMap = new Map<string, { date: string; redemptions: number; discount_cents: number; revenue_cents: number }>();
    for (const t of timeline) {
      const day = t.created_at.slice(0, 10);
      let d = dailyMap.get(day);
      if (!d) { d = { date: day, redemptions: 0, discount_cents: 0, revenue_cents: 0 }; dailyMap.set(day, d); }
      d.redemptions += 1;
      d.discount_cents += t.amount_off_cents;
      d.revenue_cents += t.order_total_cents ?? 0;
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const totals = {
      redemptions: timeline.length,
      unique_customers: new Set(timeline.map((t) => t.contact_id).filter(Boolean)).size,
      unique_promotions: byPromotion.length,
      discount_cents: timeline.reduce((s, t) => s + t.amount_off_cents, 0),
      revenue_cents: timeline.reduce((s, t) => s + (t.order_total_cents ?? 0), 0),
    };

    return { totals, byPromotion, byCustomer, daily, timeline };
  });
