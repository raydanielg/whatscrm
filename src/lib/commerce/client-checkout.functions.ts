/**
 * Customer-portal-scoped checkout server functions.
 *
 * Resolves the current signed-in customer via their contact record and
 * exposes the full cart / checkout lifecycle: add, update, remove, coupons,
 * shipping, taxes, place order, wishlist and saved carts. Uses supabaseAdmin
 * because portal users are not workspace_members but must operate on their
 * own contact scope only — every query is filtered by that contact.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { evaluateCartPromotions, allocateLineDiscounts, type AppliedPromoAudit } from './promo-runtime';
import { sbAny } from "@/lib/supabase/untyped";

const uuid = z.string().uuid();

type Ctx = { contactId: string; workspaceId: string; email: string; name: string | null; phone: string | null };

async function admin() {
  const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');
  return supabaseAdmin;
}

async function resolveContact(email: string): Promise<Ctx> {
  const sb = await admin();
  const { data } = await sbAny(sb).from('contacts')
    .select('id, workspace_id, email, name, first_name, last_name, phone')
    .ilike('email', email).is('deleted_at', null).limit(1).maybeSingle();
  if (!data) throw new Error('No customer profile linked to this account');
  const row = data as { id: string; workspace_id: string; email: string | null; name: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  return {
    contactId: row.id, workspaceId: row.workspace_id, email: row.email ?? email,
    name: row.name ?? ([row.first_name, row.last_name].filter(Boolean).join(' ') || null),
    phone: row.phone,
  };
}

async function recalc(cartId: string) {
  const sb = await admin();
  const { data: cart } = await sbAny(sb).from('commerce_carts').select('*').eq('id', cartId).maybeSingle();
  if (!cart) throw new Error('Cart not found');
  const { data: items } = await sbAny(sb).from('commerce_cart_items').select('*').eq('cart_id', cartId);
  const lineItems = (items ?? []) as Array<{ product_id: string | null; quantity: number; unit_price: number; total: number }>;
  const subtotal = lineItems.reduce((a, i) => a + Number(i.total ?? 0), 0);

  const c = cart as { workspace_id: string; contact_id: string | null; coupon_code: string | null; promo_code: string | null; metadata: Record<string, unknown> | null };
  const meta = (c.metadata && typeof c.metadata === 'object' ? c.metadata : {}) as Record<string, unknown>;
  let shipping = Number((meta.shipping_price as number | undefined) ?? 0);
  const taxPct = Number((meta.tax_rate_percent as number | undefined) ?? 0);

  const promoCode = c.promo_code ?? c.coupon_code ?? null;
  const promoResult = await evaluateCartPromotions(sb, {
    workspaceId: c.workspace_id, contactId: c.contact_id,
    code: promoCode, lines: lineItems, shipping,
  });
  let discount = promoResult.discount;
  const appliedPromotions: AppliedPromoAudit[] = promoResult.applied;
  if (promoResult.free_shipping) shipping = 0;

  if (discount === 0 && c.coupon_code && appliedPromotions.length === 0) {
    const { data: coupon } = await sbAny(sb).from('coupons').select('*').eq('code', c.coupon_code).eq('is_active', true).maybeSingle();
    if (coupon) {
      const cp = coupon as { discount_type: string; percent_off: number | null; amount_off_cents: number | null };
      if (cp.discount_type === 'percent' && cp.percent_off) discount = Math.round(subtotal * Number(cp.percent_off) / 100 * 100) / 100;
      else if (cp.amount_off_cents) discount = Number(cp.amount_off_cents) / 100;
    }
  }

  discount = Math.min(discount, subtotal);
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * taxPct / 100 * 100) / 100;
  const total = Math.max(0, taxable + tax + shipping);
  await sbAny(sb).from('commerce_carts').update({
    subtotal, tax, discount, shipping, total,
    applied_promotions: appliedPromotions as any,
  } as any).eq('id', cartId);
  return { subtotal, tax, discount, shipping, total, applied_promotions: appliedPromotions };
}

async function ensureActiveCart(ctx: Ctx) {
  const sb = await admin();
  const { data } = await sbAny(sb).from('commerce_carts').select('*')
    .eq('workspace_id', ctx.workspaceId).eq('contact_id', ctx.contactId).eq('status', 'active').limit(1);
  if (data && data.length) return data[0] as Record<string, unknown>;
  const { data: created, error } = await sbAny(sb).from('commerce_carts').insert({
    workspace_id: ctx.workspaceId, contact_id: ctx.contactId, channel: 'portal',
  } as never).select('*').single();
  if (error) throw error;
  return created as Record<string, unknown>;
}

// -------- exposed portal fns --------

export const myGetCart = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const cart = await ensureActiveCart(c);
    const sb = await admin();
    const { data: items } = await sbAny(sb).from('commerce_cart_items').select('*').eq('cart_id', (cart as { id: string }).id).order('created_at');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { cart: cart as any, items: items ?? [], contact: c };
  });

export const myAddToCart = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { productId: string; quantity?: number }) =>
    z.object({ productId: uuid, quantity: z.number().int().positive().max(999).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const cart = await ensureActiveCart(c);
    const cartId = (cart as { id: string }).id;
    const sb = await admin();
    const { data: product } = await sbAny(sb).from('products').select('id, name, sku, price, sale_price').eq('id', data.productId).maybeSingle();
    if (!product) throw new Error('Product not found');
    const p = product as { id: string; name: string; sku: string | null; price: number | null; sale_price: number | null };
    const price = Number(p.sale_price ?? p.price ?? 0);
    const qty = data.quantity ?? 1;
    const { data: existing } = await sbAny(sb).from('commerce_cart_items').select('id, quantity, unit_price').eq('cart_id', cartId).eq('product_id', p.id).maybeSingle();
    if (existing) {
      const e = existing as { id: string; quantity: number; unit_price: number };
      const newQty = e.quantity + qty;
      await sbAny(sb).from('commerce_cart_items').update({ quantity: newQty, total: Math.round(newQty * Number(e.unit_price) * 100) / 100 }).eq('id', e.id);
    } else {
      await sbAny(sb).from('commerce_cart_items').insert({ cart_id: cartId, product_id: p.id, name: p.name, sku: p.sku, quantity: qty, unit_price: price, total: Math.round(qty * price * 100) / 100 } as never);
    }
    return { cartId, totals: await recalc(cartId) };
  });

export const myUpdateCartItem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string; quantity: number }) =>
    z.object({ itemId: uuid, quantity: z.number().int().min(0).max(999) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: item } = await sbAny(sb).from('commerce_cart_items').select('id, cart_id, unit_price, cart:commerce_carts!inner(contact_id)').eq('id', data.itemId).maybeSingle();
    if (!item) throw new Error('Item not found');
    const it = item as unknown as { id: string; cart_id: string; unit_price: number; cart: { contact_id: string | null } };
    if (it.cart.contact_id !== c.contactId) throw new Error('Forbidden');
    if (data.quantity === 0) await sbAny(sb).from('commerce_cart_items').delete().eq('id', it.id);
    else await sbAny(sb).from('commerce_cart_items').update({ quantity: data.quantity, total: Math.round(data.quantity * Number(it.unit_price) * 100) / 100 }).eq('id', it.id);
    return recalc(it.cart_id);
  });

export const myRemoveCartItem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string }) => z.object({ itemId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: item } = await sbAny(sb).from('commerce_cart_items').select('id, cart_id, cart:commerce_carts!inner(contact_id)').eq('id', data.itemId).maybeSingle();
    if (!item) return { ok: true };
    const it = item as unknown as { id: string; cart_id: string; cart: { contact_id: string | null } };
    if (it.cart.contact_id !== c.contactId) throw new Error('Forbidden');
    await sbAny(sb).from('commerce_cart_items').delete().eq('id', it.id);
    await recalc(it.cart_id);
    return { ok: true };
  });

export const myApplyCoupon = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; code: string }) =>
    z.object({ cartId: uuid, code: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('contact_id').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    const code = data.code.toUpperCase();
    const { data: coupon } = await sbAny(sb).from('coupons').select('*').eq('code', code).eq('is_active', true).maybeSingle();
    if (!coupon) throw new Error('Invalid or expired coupon');
    const cp = coupon as { redeem_by: string | null; max_redemptions: number | null; times_redeemed: number };
    if (cp.redeem_by && new Date(cp.redeem_by) < new Date()) throw new Error('Coupon expired');
    if (cp.max_redemptions && cp.times_redeemed >= cp.max_redemptions) throw new Error('Coupon fully redeemed');
    await sbAny(sb).from('commerce_carts').update({ coupon_code: code }).eq('id', data.cartId);
    return recalc(data.cartId);
  });

export const myRemoveCoupon = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string }) => z.object({ cartId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('contact_id').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    await sbAny(sb).from('commerce_carts').update({ coupon_code: null }).eq('id', data.cartId);
    return recalc(data.cartId);
  });

// unified promo codes
export const myApplyPromoCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; code: string }) =>
    z.object({ cartId: uuid, code: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('contact_id').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    const code = data.code.trim().toUpperCase();
    await sbAny(sb).from('commerce_carts').update({ promo_code: code } as any).eq('id', data.cartId);
    const totals = await recalc(data.cartId);
    if (!totals.applied_promotions.some((p) => p.code === code)) {
      await sbAny(sb).from('commerce_carts').update({ promo_code: null } as any).eq('id', data.cartId);
      await recalc(data.cartId);
      throw new Error('Promo code is not valid for this cart');
    }
    return totals;
  });

export const myRemovePromoCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string }) => z.object({ cartId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('contact_id').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    await sbAny(sb).from('commerce_carts').update({ promo_code: null } as any).eq('id', data.cartId);
    return recalc(data.cartId);
  });

export const myListShipping = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { country?: string }) => z.object({ country: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: zones } = await sbAny(sb).from('commerce_shipping_zones').select('id, countries')
      .eq('workspace_id', c.workspaceId).eq('is_active', true);
    const ids = ((zones ?? []) as Array<{ id: string; countries: string[] | null }>)
      .filter((z) => !data.country || (z.countries ?? []).length === 0 || (z.countries ?? []).includes(data.country))
      .map((z) => z.id);
    if (!ids.length) return [];
    const { data: rates } = await sbAny(sb).from('commerce_shipping_rates').select('*').in('zone_id', ids).eq('is_active', true).order('price');
    return rates ?? [];
  });

export const mySelectShipping = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; rateId: string }) =>
    z.object({ cartId: uuid, rateId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('metadata, contact_id').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    const { data: rate } = await sbAny(sb).from('commerce_shipping_rates').select('*').eq('id', data.rateId).maybeSingle();
    if (!rate) throw new Error('Shipping rate not found');
    const r = rate as { id: string; name: string; price: number };
    const prev = ((cart as { metadata: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>;
    const meta = { ...prev, shipping_rate_id: r.id, shipping_name: r.name, shipping_price: Number(r.price) };
    await sbAny(sb).from('commerce_carts').update({ metadata: meta, shipping: Number(r.price) }).eq('id', data.cartId);
    return recalc(data.cartId);
  });

export const myApplyTax = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; country?: string; region?: string }) =>
    z.object({ cartId: uuid, country: z.string().optional(), region: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('metadata, contact_id').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    let q = sbAny(sb).from('tax_rates').select('*').eq('is_active', true);
    if (data.country) q = q.eq('country', data.country);
    if (data.region) q = q.eq('region', data.region);
    const { data: rates } = await q.limit(1);
    const pct = rates && rates.length ? Number((rates[0] as { rate_percent: number }).rate_percent) : 0;
    const prev = ((cart as { metadata: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>;
    const meta = { ...prev, tax_rate_percent: pct, tax_rate_id: rates?.[0] ? (rates[0] as { id: string }).id : null };
    await sbAny(sb).from('commerce_carts').update({ metadata: meta }).eq('id', data.cartId);
    return recalc(data.cartId);
  });

// addresses
export const myListAddresses = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data } = await sbAny(sb).from('addresses').select('*')
      .eq('workspace_id', c.workspaceId).eq('entity_type', 'contact').eq('entity_id', c.contactId)
      .order('is_primary', { ascending: false });
    return data ?? [];
  });

export const mySaveAddress = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    addressType: 'shipping' | 'billing'; street1: string; street2?: string; city: string;
    region?: string; postal_code: string; country: string; label?: string; is_primary?: boolean;
  }) => z.object({
    addressType: z.enum(['shipping', 'billing']),
    street1: z.string().min(1), street2: z.string().optional(),
    city: z.string().min(1), region: z.string().optional(),
    postal_code: z.string().min(1), country: z.string().min(2),
    label: z.string().optional(), is_primary: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: row, error } = await sbAny(sb).from('addresses').insert({
      workspace_id: c.workspaceId, entity_type: 'contact', entity_id: c.contactId,
      address_type: data.addressType, street1: data.street1, street2: data.street2 ?? null,
      city: data.city, region: data.region ?? null, postal_code: data.postal_code,
      country: data.country, label: data.label ?? null, is_primary: !!data.is_primary,
    } as never).select('*').single();
    if (error) throw error;
    return row;
  });

// wishlist
export const myListWishlist = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data } = await sbAny(sb).from('commerce_wishlists')
      .select('id, product_id, notes, created_at, product:products(id, name, price, sale_price, sku, image_url)')
      .eq('workspace_id', c.workspaceId).eq('contact_id', c.contactId)
      .order('created_at', { ascending: false });
    return data ?? [];
  });

export const myToggleWishlist = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { productId: string }) => z.object({ productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: existing } = await sbAny(sb).from('commerce_wishlists').select('id')
      .eq('workspace_id', c.workspaceId).eq('contact_id', c.contactId).eq('product_id', data.productId).maybeSingle();
    if (existing) {
      await sbAny(sb).from('commerce_wishlists').delete().eq('id', (existing as { id: string }).id);
      return { added: false };
    }
    await sbAny(sb).from('commerce_wishlists').insert({ workspace_id: c.workspaceId, contact_id: c.contactId, product_id: data.productId } as never);
    return { added: true };
  });

// saved carts
export const mySaveCartForLater = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; name?: string }) =>
    z.object({ cartId: uuid, name: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('*').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    const { data: items } = await sbAny(sb).from('commerce_cart_items').select('*').eq('cart_id', data.cartId);
    const { data: row, error } = await sbAny(sb).from('commerce_saved_carts').insert({
      workspace_id: c.workspaceId, contact_id: c.contactId,
      name: data.name ?? `Saved ${new Date().toLocaleDateString()}`,
      cart_snapshot: { cart, items: items ?? [] },
    } as never).select('*').single();
    if (error) throw error;
    return row;
  });

export const myListSavedCarts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data } = await sbAny(sb).from('commerce_saved_carts').select('*')
      .eq('workspace_id', c.workspaceId).eq('contact_id', c.contactId).order('created_at', { ascending: false });
    return data ?? [];
  });

// place order
async function nextOrderNumber(workspaceId: string): Promise<string> {
  const sb = await admin();
  const { count } = await sbAny(sb).from('commerce_orders').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
  return `ORD-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(6, '0')}`;
}

const addrSchema = z.object({
  street1: z.string().min(1), street2: z.string().optional(),
  city: z.string().min(1), region: z.string().optional(),
  postal_code: z.string().min(1), country: z.string().min(2), name: z.string().optional(),
});

export const myPlaceOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    cartId: string;
    shippingAddress: z.infer<typeof addrSchema>;
    billingAddress?: z.infer<typeof addrSchema>;
    paymentMethod: 'card' | 'cod' | 'bank_transfer' | 'wallet' | 'payment_link';
    notes?: string;
  }) => z.object({
    cartId: uuid,
    shippingAddress: addrSchema,
    billingAddress: addrSchema.optional(),
    paymentMethod: z.enum(['card', 'cod', 'bank_transfer', 'wallet', 'payment_link']),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const totals = await recalc(data.cartId);
    const { data: cart } = await sbAny(sb).from('commerce_carts').select('*').eq('id', data.cartId).maybeSingle();
    if (!cart || (cart as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Forbidden');
    const { data: items } = await sbAny(sb).from('commerce_cart_items').select('*').eq('cart_id', data.cartId);
    if (!items || items.length === 0) throw new Error('Cart is empty');
    const cc = cart as { workspace_id: string; currency: string; channel: string | null; conversation_id: string | null; id: string };
    const orderNumber = await nextOrderNumber(cc.workspace_id);
    const appliedPromotions = (totals.applied_promotions ?? []) as AppliedPromoAudit[];
    const { data: order, error } = await sbAny(sb).from('commerce_orders').insert({
      workspace_id: cc.workspace_id, order_number: orderNumber, contact_id: c.contactId,
      cart_id: cc.id, channel: cc.channel ?? 'portal', conversation_id: cc.conversation_id,
      status: 'pending', payment_status: 'unpaid', currency: cc.currency,
      subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount,
      shipping: totals.shipping, total: totals.total,
      shipping_address: data.shippingAddress, billing_address: data.billingAddress ?? data.shippingAddress,
      notes: data.notes ?? null, metadata: { payment_method: data.paymentMethod },
      applied_promotions: appliedPromotions as any,
      placed_at: new Date().toISOString(),
    } as never).select('*').single();
    if (error) throw error;
    const oid = (order as { id: string }).id;
    const itemsTyped = items as Array<{ product_id: string | null; name: string; sku: string | null; quantity: number; unit_price: number; total: number; metadata: unknown }>;
    const lineDiscountsCents = allocateLineDiscounts(itemsTyped, totals.discount);
    await sbAny(sb).from('commerce_order_items').insert(itemsTyped.map((it, idx) => ({
      order_id: oid, product_id: it.product_id, name: it.name, sku: it.sku,
      quantity: it.quantity, unit_price: it.unit_price, total: it.total,
      metadata: { ...((it.metadata ?? {}) as Record<string, unknown>), discount_cents: lineDiscountsCents[idx] ?? 0 } as never,
    })) as never);
    await sbAny(sb).from('commerce_order_events').insert({
      order_id: oid, workspace_id: cc.workspace_id, event_type: 'placed',
      metadata: { channel: cc.channel, payment_method: data.paymentMethod, applied_promotions: appliedPromotions },
    } as never);

    if (appliedPromotions.length > 0) {
      const rows = appliedPromotions.map((r) => ({
        workspace_id: cc.workspace_id, order_id: oid, contact_id: c.contactId,
        promotion_id: r.promotion_id, amount_off_cents: r.amount_off_cents,
        code_used: r.code ?? null, currency: cc.currency,
      }));
      await sbAny(sb).from('commerce_promotion_redemptions').insert(rows as never);
      for (const r of appliedPromotions) {
        const { data: row } = await sbAny(sb).from('commerce_promotions').select('times_redeemed').eq('id', r.promotion_id).maybeSingle();
        await sbAny(sb).from('commerce_promotions').update({ times_redeemed: ((row as { times_redeemed: number } | null)?.times_redeemed ?? 0) + 1 }).eq('id', r.promotion_id);
      }
    }

    await sbAny(sb).from('commerce_carts').update({ status: 'converted' }).eq('id', cc.id);
    return { orderId: oid, orderNumber, total: totals.total };
  });

export const myGetOrder = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { orderId: string }) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await resolveContact(context.claims?.email ?? '');
    const sb = await admin();
    const { data: order } = await sbAny(sb).from('commerce_orders').select('*').eq('id', data.orderId).maybeSingle();
    if (!order || (order as { contact_id: string | null }).contact_id !== c.contactId) throw new Error('Order not found');
    const { data: items } = await sbAny(sb).from('commerce_order_items').select('*').eq('order_id', data.orderId);
    return { order, items: items ?? [] };
  });
