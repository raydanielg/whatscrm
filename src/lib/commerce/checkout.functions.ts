import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { evaluateCartPromotions, allocateLineDiscounts, type AppliedPromoAudit } from './promo-runtime';
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Checkout & Cart server functions. Works across all supported communication
 * channels: caller supplies channel + optional conversation_id so the cart/
 * order is bound to the originating chat (WhatsApp, Messenger, Live Chat,
 * Email, SMS, Portal, etc.). All money math is authoritative on the server.
 */

const uuid = z.string().uuid();

// ------------- helpers -------------
async function recalcCart(supabase: any, cartId: string) {
  const { data: cart } = await sbAny(supabase).from('commerce_carts').select('*').eq('id', cartId).maybeSingle();
  if (!cart) throw new Error('Cart not found');
  const { data: items } = await sbAny(supabase).from('commerce_cart_items').select('*').eq('cart_id', cartId);
  const lineItems = (items ?? []) as Array<{ product_id: string | null; quantity: number; unit_price: number; total: number }>;
  const subtotal = lineItems.reduce((a, i) => a + Number(i.total ?? 0), 0);

  const meta = cart.metadata ?? {};
  let shipping = Number(meta.shipping_price ?? cart.shipping ?? 0);
  const taxRatePct = Number(meta.tax_rate_percent ?? 0);

  // Unified promotion engine (auto-apply + optional manual code)
  const promoCode: string | null = cart.promo_code ?? cart.coupon_code ?? null;
  const promoResult = await evaluateCartPromotions(supabase, {
    workspaceId: cart.workspace_id,
    contactId: cart.contact_id,
    code: promoCode,
    lines: lineItems,
    shipping,
  });
  let discount = promoResult.discount;
  const appliedPromotions: AppliedPromoAudit[] = promoResult.applied;
  if (promoResult.free_shipping) shipping = 0;

  // Legacy coupons table fallback — only if no unified promo matched the code
  if (discount === 0 && cart.coupon_code && appliedPromotions.length === 0) {
    const { data: coupon } = await supabase
      .from('coupons').select('*').eq('code', cart.coupon_code).eq('is_active', true).maybeSingle();
    if (coupon) {
      if (coupon.discount_type === 'percent' && coupon.percent_off) {
        discount = Math.round((subtotal * Number(coupon.percent_off)) / 100 * 100) / 100;
      } else if (coupon.amount_off_cents) {
        discount = Number(coupon.amount_off_cents) / 100;
      }
    }
  }

  discount = Math.min(discount, subtotal);
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * (taxRatePct / 100) * 100) / 100;
  const total = Math.max(0, taxable + tax + shipping);

  await sbAny(supabase).from('commerce_carts').update({
    subtotal, tax, discount, shipping, total,
    applied_promotions: appliedPromotions as any,
  }).eq('id', cartId);

  return { subtotal, tax, discount, shipping, total, applied_promotions: appliedPromotions };
}

async function getOrCreateActiveCart(
  supabase: any,
  workspaceId: string,
  opts: { contactId?: string; channel?: string; conversationId?: string },
) {
  let q = sbAny(supabase).from('commerce_carts').select('*')
    .eq('workspace_id', workspaceId).eq('status', 'active').limit(1);
  if (opts.contactId) q = q.eq('contact_id', opts.contactId);
  else if (opts.conversationId) q = q.eq('conversation_id', opts.conversationId);
  const { data } = await q;
  if (data && data.length) return data[0];

  const { data: created, error } = await sbAny(supabase).from('commerce_carts').insert({
    workspace_id: workspaceId,
    contact_id: opts.contactId ?? null,
    channel: opts.channel ?? 'portal',
    conversation_id: opts.conversationId ?? null,
  }).select('*').single();
  if (error) throw error;
  return created;
}

// ------------- cart -------------
export const getCart = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId?: string; conversationId?: string; channel?: string }) =>
    z.object({
      workspaceId: uuid,
      contactId: uuid.optional(),
      conversationId: uuid.optional(),
      channel: z.string().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const cart = await getOrCreateActiveCart(context.supabase, data.workspaceId, {
      contactId: data.contactId, channel: data.channel, conversationId: data.conversationId,
    });
    const { data: items } = await context.supabase
      .from('commerce_cart_items').select('*').eq('cart_id', cart.id).order('created_at');
    return { cart, items: items ?? [] };
  });

export const addToCart = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    workspaceId: string; productId: string; quantity?: number;
    contactId?: string; conversationId?: string; channel?: string;
  }) => z.object({
    workspaceId: uuid, productId: uuid, quantity: z.number().int().positive().max(999).optional(),
    contactId: uuid.optional(), conversationId: uuid.optional(), channel: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const cart = await getOrCreateActiveCart(context.supabase, data.workspaceId, {
      contactId: data.contactId, channel: data.channel, conversationId: data.conversationId,
    });
    const qty = data.quantity ?? 1;
    const { data: product } = await context.supabase
      .from('products').select('id, name, sku, price, sale_price')
      .eq('id', data.productId).maybeSingle();
    if (!product) throw new Error('Product not found');
    const price = Number(product.sale_price ?? product.price ?? 0);

    const { data: existing } = await context.supabase
      .from('commerce_cart_items').select('*').eq('cart_id', cart.id).eq('product_id', data.productId).maybeSingle();
    if (existing) {
      const newQty = existing.quantity + qty;
      await sbAny(context.supabase).from('commerce_cart_items').update({
        quantity: newQty, total: Math.round(newQty * Number(existing.unit_price) * 100) / 100,
      }).eq('id', existing.id);
    } else {
      await sbAny(context.supabase).from('commerce_cart_items').insert({
        cart_id: cart.id, product_id: product.id, name: product.name, sku: product.sku,
        quantity: qty, unit_price: price, total: Math.round(qty * price * 100) / 100,
      });
    }
    const totals = await recalcCart(context.supabase, cart.id);
    return { cartId: cart.id, ...totals };
  });

export const updateCartItem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string; quantity: number }) =>
    z.object({ itemId: uuid, quantity: z.number().int().min(0).max(999) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from('commerce_cart_items').select('*').eq('id', data.itemId).maybeSingle();
    if (!item) throw new Error('Item not found');
    if (data.quantity === 0) {
      await sbAny(context.supabase).from('commerce_cart_items').delete().eq('id', data.itemId);
    } else {
      await sbAny(context.supabase).from('commerce_cart_items').update({
        quantity: data.quantity,
        total: Math.round(data.quantity * Number(item.unit_price) * 100) / 100,
      }).eq('id', data.itemId);
    }
    return recalcCart(context.supabase, item.cart_id);
  });

export const removeCartItem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { itemId: string }) => z.object({ itemId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from('commerce_cart_items').select('cart_id').eq('id', data.itemId).maybeSingle();
    if (!item) return { ok: true };
    await sbAny(context.supabase).from('commerce_cart_items').delete().eq('id', data.itemId);
    await recalcCart(context.supabase, item.cart_id);
    return { ok: true };
  });

// ------------- coupons -------------
export const applyCoupon = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; code: string }) =>
    z.object({ cartId: uuid, code: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.toUpperCase();
    const { data: coupon } = await context.supabase
      .from('coupons').select('*').eq('code', code).eq('is_active', true).maybeSingle();
    if (!coupon) throw new Error('Invalid or expired coupon');
    if (coupon.redeem_by && new Date(coupon.redeem_by) < new Date()) throw new Error('Coupon expired');
    if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) throw new Error('Coupon fully redeemed');
    await sbAny(context.supabase).from('commerce_carts').update({ coupon_code: code }).eq('id', data.cartId);
    return recalcCart(context.supabase, data.cartId);
  });

export const removeCoupon = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string }) => z.object({ cartId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await sbAny(context.supabase).from('commerce_carts').update({ coupon_code: null }).eq('id', data.cartId);
    return recalcCart(context.supabase, data.cartId);
  });

// ------------- promo codes (unified engine) -------------
export const applyPromoCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; code: string }) =>
    z.object({ cartId: uuid, code: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.trim().toUpperCase();
    await sbAny(context.supabase).from('commerce_carts').update({ promo_code: code } as any).eq('id', data.cartId);
    const totals = await recalcCart(context.supabase, data.cartId);
    if (!totals.applied_promotions.some((p) => p.code === code)) {
      // roll back — code did not evaluate to any active promotion
      await sbAny(context.supabase).from('commerce_carts').update({ promo_code: null } as any).eq('id', data.cartId);
      await recalcCart(context.supabase, data.cartId);
      throw new Error('Promo code is not valid for this cart');
    }
    return totals;
  });

export const removePromoCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string }) => z.object({ cartId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await sbAny(context.supabase).from('commerce_carts').update({ promo_code: null } as any).eq('id', data.cartId);
    return recalcCart(context.supabase, data.cartId);
  });

// ------------- shipping -------------
export const listShippingRates = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; country?: string }) =>
    z.object({ workspaceId: uuid, country: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: zones } = await context.supabase
      .from('commerce_shipping_zones').select('id, countries').eq('workspace_id', data.workspaceId).eq('is_active', true);
    const zoneIds = (zones ?? [])
      .filter((z: any) => !data.country || (z.countries ?? []).includes(data.country) || (z.countries ?? []).length === 0)
      .map((z: any) => z.id);
    if (!zoneIds.length) return [];
    const { data: rates } = await context.supabase
      .from('commerce_shipping_rates').select('*').in('zone_id', zoneIds).eq('is_active', true).order('price');
    return rates ?? [];
  });

export const selectShipping = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; rateId: string }) =>
    z.object({ cartId: uuid, rateId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rate } = await context.supabase
      .from('commerce_shipping_rates').select('*').eq('id', data.rateId).maybeSingle();
    if (!rate) throw new Error('Shipping rate not found');
    const { data: cart } = await context.supabase
      .from('commerce_carts').select('metadata').eq('id', data.cartId).maybeSingle();
    const prev = (cart?.metadata && typeof cart.metadata === 'object' ? cart.metadata : {}) as Record<string, unknown>;
    const meta = { ...prev, shipping_rate_id: rate.id, shipping_name: rate.name, shipping_price: Number(rate.price) };
    await sbAny(context.supabase).from('commerce_carts').update({ metadata: meta, shipping: Number(rate.price) }).eq('id', data.cartId);
    return recalcCart(context.supabase, data.cartId);
  });

// ------------- taxes -------------
export const applyTaxByRegion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; country?: string; region?: string }) =>
    z.object({ cartId: uuid, country: z.string().optional(), region: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase).from('tax_rates').select('*').eq('is_active', true);
    if (data.country) q = q.eq('country', data.country);
    if (data.region) q = q.eq('region', data.region);
    const { data: rates } = await q.limit(1);
    const pct = rates && rates[0] ? Number(rates[0].rate_percent) : 0;
    const { data: cart } = await sbAny(context.supabase).from('commerce_carts').select('metadata').eq('id', data.cartId).maybeSingle();
    const prev = (cart?.metadata && typeof cart.metadata === 'object' ? cart.metadata : {}) as Record<string, unknown>;
    const meta = { ...prev, tax_rate_percent: pct, tax_rate_id: rates?.[0]?.id ?? null };
    await sbAny(context.supabase).from('commerce_carts').update({ metadata: meta }).eq('id', data.cartId);
    return recalcCart(context.supabase, data.cartId);
  });

// ------------- addresses -------------
export const listAddresses = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId: string }) =>
    z.object({ workspaceId: uuid, contactId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await sbAny(context.supabase).from('addresses').select('*')
      .eq('workspace_id', data.workspaceId).eq('entity_type', 'contact').eq('entity_id', data.contactId)
      .order('is_primary', { ascending: false });
    return rows ?? [];
  });

export const saveAddress = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    workspaceId: string; contactId: string; addressType: 'shipping' | 'billing';
    street1: string; street2?: string; city: string; region?: string;
    postal_code: string; country: string; label?: string; is_primary?: boolean;
  }) => z.object({
    workspaceId: uuid, contactId: uuid,
    addressType: z.enum(['shipping', 'billing']),
    street1: z.string().min(1), street2: z.string().optional(),
    city: z.string().min(1), region: z.string().optional(),
    postal_code: z.string().min(1), country: z.string().min(2),
    label: z.string().optional(), is_primary: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase).from('addresses').insert({
      workspace_id: data.workspaceId, entity_type: 'contact', entity_id: data.contactId,
      address_type: data.addressType, street1: data.street1, street2: data.street2 ?? null,
      city: data.city, region: data.region ?? null, postal_code: data.postal_code,
      country: data.country, label: data.label ?? null, is_primary: !!data.is_primary,
    }).select('*').single();
    if (error) throw error;
    return row;
  });

// ------------- wishlist -------------
export const listWishlist = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId: string }) =>
    z.object({ workspaceId: uuid, contactId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from('commerce_wishlists')
      .select('id, product_id, notes, created_at, product:products(id, name, price, sale_price, sku, image_url)')
      .eq('workspace_id', data.workspaceId).eq('contact_id', data.contactId)
      .order('created_at', { ascending: false });
    return rows ?? [];
  });

export const toggleWishlist = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId: string; productId: string }) =>
    z.object({ workspaceId: uuid, contactId: uuid, productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await sbAny(context.supabase).from('commerce_wishlists').select('id')
      .eq('workspace_id', data.workspaceId).eq('contact_id', data.contactId).eq('product_id', data.productId).maybeSingle();
    if (existing) {
      await sbAny(context.supabase).from('commerce_wishlists').delete().eq('id', existing.id);
      return { added: false };
    }
    await sbAny(context.supabase).from('commerce_wishlists').insert({
      workspace_id: data.workspaceId, contact_id: data.contactId, product_id: data.productId,
    });
    return { added: true };
  });

// ------------- saved carts -------------
export const saveCartForLater = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { cartId: string; name?: string }) =>
    z.object({ cartId: uuid, name: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cart } = await sbAny(context.supabase).from('commerce_carts').select('*').eq('id', data.cartId).maybeSingle();
    if (!cart) throw new Error('Cart not found');
    const { data: items } = await sbAny(context.supabase).from('commerce_cart_items').select('*').eq('cart_id', data.cartId);
    const { data: row, error } = await sbAny(context.supabase).from('commerce_saved_carts').insert({
      workspace_id: cart.workspace_id, contact_id: cart.contact_id,
      name: data.name ?? `Saved ${new Date().toLocaleDateString()}`,
      cart_snapshot: { cart, items: items ?? [] },
    }).select('*').single();
    if (error) throw error;
    return row;
  });

export const listSavedCarts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId: string }) =>
    z.object({ workspaceId: uuid, contactId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await sbAny(context.supabase).from('commerce_saved_carts').select('*')
      .eq('workspace_id', data.workspaceId).eq('contact_id', data.contactId)
      .order('created_at', { ascending: false });
    return rows ?? [];
  });

// ------------- checkout / place order -------------
async function nextOrderNumber(supabase: any, workspaceId: string): Promise<string> {
  const { count } = await sbAny(supabase).from('commerce_orders').select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  return `ORD-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(6, '0')}`;
}

export const placeOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    cartId: string;
    // Guest checkout: pass guest details when no contactId on cart
    guest?: { name: string; email: string; phone?: string };
    shippingAddress: {
      street1: string; street2?: string; city: string; region?: string;
      postal_code: string; country: string; name?: string;
    };
    billingAddress?: {
      street1: string; street2?: string; city: string; region?: string;
      postal_code: string; country: string; name?: string;
    };
    paymentMethod: 'card' | 'cod' | 'bank_transfer' | 'wallet' | 'payment_link';
    notes?: string;
  }) => z.object({
    cartId: uuid,
    guest: z.object({
      name: z.string().min(1), email: z.string().email(), phone: z.string().optional(),
    }).optional(),
    shippingAddress: z.object({
      street1: z.string().min(1), street2: z.string().optional(),
      city: z.string().min(1), region: z.string().optional(),
      postal_code: z.string().min(1), country: z.string().min(2), name: z.string().optional(),
    }),
    billingAddress: z.object({
      street1: z.string().min(1), street2: z.string().optional(),
      city: z.string().min(1), region: z.string().optional(),
      postal_code: z.string().min(1), country: z.string().min(2), name: z.string().optional(),
    }).optional(),
    paymentMethod: z.enum(['card', 'cod', 'bank_transfer', 'wallet', 'payment_link']),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const totals = await recalcCart(context.supabase, data.cartId);
    const { data: cart } = await sbAny(context.supabase).from('commerce_carts').select('*').eq('id', data.cartId).maybeSingle();
    if (!cart) throw new Error('Cart not found');
    const { data: items } = await sbAny(context.supabase).from('commerce_cart_items').select('*').eq('cart_id', data.cartId);
    if (!items || items.length === 0) throw new Error('Cart is empty');

    // Resolve contact — reuse or upsert-lite for guest
    let contactId: string | null = cart.contact_id;
    if (!contactId && data.guest) {
      const { data: existing } = await sbAny(context.supabase).from('contacts')
        .select('id').eq('workspace_id', cart.workspace_id).eq('email', data.guest.email).maybeSingle();
      if (existing) contactId = existing.id;
      else {
        const { data: created, error } = await sbAny(context.supabase).from('contacts').insert({
          workspace_id: cart.workspace_id, name: data.guest.name,
          email: data.guest.email, phone: data.guest.phone ?? null,
          source: 'guest_checkout',
        }).select('id').single();
        if (error) throw error;
        contactId = created.id;
      }
    }

    const orderNumber = await nextOrderNumber(context.supabase, cart.workspace_id);
    const appliedPromotions = (totals.applied_promotions ?? []) as AppliedPromoAudit[];
    const { data: order, error: orderErr } = await sbAny(context.supabase).from('commerce_orders').insert({
      workspace_id: cart.workspace_id,
      order_number: orderNumber,
      contact_id: contactId,
      cart_id: cart.id,
      channel: cart.channel ?? 'portal',
      conversation_id: cart.conversation_id,
      status: 'pending',
      payment_status: data.paymentMethod === 'cod' ? 'unpaid' : 'unpaid',
      currency: cart.currency,
      subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount,
      shipping: totals.shipping, total: totals.total,
      shipping_address: data.shippingAddress,
      billing_address: data.billingAddress ?? data.shippingAddress,
      notes: data.notes ?? null,
      metadata: { payment_method: data.paymentMethod, guest: !!data.guest },
      applied_promotions: appliedPromotions as any,
      placed_at: new Date().toISOString(),
    } as any).select('*').single();
    if (orderErr) throw orderErr;

    // items — allocate discount pro-rata into item metadata
    const lineDiscountsCents = allocateLineDiscounts(items, totals.discount);
    const orderItems = items.map((i, idx) => ({
      order_id: order.id, product_id: i.product_id, name: i.name, sku: i.sku,
      quantity: i.quantity, unit_price: i.unit_price, total: i.total,
      metadata: { ...((i.metadata ?? {}) as Record<string, unknown>), discount_cents: lineDiscountsCents[idx] ?? 0 },
    }));
    await sbAny(context.supabase).from('commerce_order_items').insert(orderItems);

    // event
    await sbAny(context.supabase).from('commerce_order_events').insert({
      order_id: order.id, workspace_id: cart.workspace_id, event_type: 'placed',
      metadata: {
        channel: cart.channel, payment_method: data.paymentMethod,
        applied_promotions: appliedPromotions,
      },
    });

    // record promotion redemptions for audit + usage counters
    if (appliedPromotions.length > 0) {
      const rows = appliedPromotions.map((r) => ({
        workspace_id: cart.workspace_id, order_id: order.id,
        contact_id: contactId, promotion_id: r.promotion_id,
        amount_off_cents: r.amount_off_cents, code_used: r.code ?? null,
        currency: cart.currency,
      }));
      await sbAny(context.supabase).from('commerce_promotion_redemptions').insert(rows);
      for (const r of appliedPromotions) {
        const { data: row } = await sbAny(context.supabase).from('commerce_promotions')
          .select('times_redeemed').eq('id', r.promotion_id).maybeSingle();
        await sbAny(context.supabase).from('commerce_promotions')
          .update({ times_redeemed: (row?.times_redeemed ?? 0) + 1 })
          .eq('id', r.promotion_id);
      }
    }

    // close cart
    await sbAny(context.supabase).from('commerce_carts').update({ status: 'converted' }).eq('id', cart.id);

    return { orderId: order.id, orderNumber: order.order_number, total: order.total };
  });

export const getOrderConfirmation = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { orderId: string }) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: order }, { data: items }] = await Promise.all([
      sbAny(context.supabase).from('commerce_orders').select('*').eq('id', data.orderId).maybeSingle(),
      sbAny(context.supabase).from('commerce_order_items').select('*').eq('order_id', data.orderId),
    ]);
    if (!order) throw new Error('Order not found');
    return { order, items: items ?? [] };
  });
