import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { normalizeCurrencyCode } from "@/lib/currency/format";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";

const wsSchema = z.object({ workspaceId: z.string().uuid() });

/** Overview KPIs for the Commerce dashboard. */
export const getCommerceOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => wsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [orders, paid, pending, links] = await Promise.all([
      sbAny(supabase).from('commerce_orders').select('id, total, status, payment_status, created_at')
        .eq('workspace_id', data.workspaceId).gte('created_at', monthStart),
      sbAny(supabase).from('commerce_orders').select('total').eq('workspace_id', data.workspaceId)
        .eq('payment_status', 'paid').gte('paid_at', monthStart),
      sbAny(supabase).from('commerce_orders').select('id').eq('workspace_id', data.workspaceId)
        .eq('payment_status', 'unpaid'),
      sbAny(supabase).from('commerce_payment_links').select('id, status').eq('workspace_id', data.workspaceId),
    ]);

    const revenue = (paid.data ?? []).reduce((a, r) => a + Number(r.total ?? 0), 0);
    const activeLinks = (links.data ?? []).filter((l) => l.status === 'active').length;

    return {
      ordersThisMonth: orders.data?.length ?? 0,
      revenueThisMonth: revenue,
      pendingOrders: pending.data?.length ?? 0,
      activePaymentLinks: activeLinks,
      recentOrders: orders.data ?? [],
    };
  });

export const listOrders = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; status?: string; search?: string }) =>
    z.object({ workspaceId: z.string().uuid(), status: z.string().optional(), search: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase).from('commerce_orders').select('*')
      .eq('workspace_id', data.workspaceId).order('created_at', { ascending: false }).limit(200);
    if (data.status) q = q.eq('status', data.status);
    if (data.search) q = q.ilike('order_number', `%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getOrder = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: order }, { data: items }, { data: events }, { data: links }] = await Promise.all([
      sbAny(context.supabase).from('commerce_orders').select('*').eq('id', data.orderId).maybeSingle(),
      sbAny(context.supabase).from('commerce_order_items').select('*').eq('order_id', data.orderId),
      sbAny(context.supabase).from('commerce_order_events').select('*').eq('order_id', data.orderId).order('created_at', { ascending: false }),
      sbAny(context.supabase).from('commerce_payment_links').select('*').eq('order_id', data.orderId).order('created_at', { ascending: false }),
    ]);
    return { order, items: items ?? [], events: events ?? [], paymentLinks: links ?? [] };
  });

const orderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().min(1),
  sku: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export const createOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      contactId: z.string().uuid().optional(),
      channel: z.string().optional(),
      conversationId: z.string().uuid().optional(),
      // Absent → resolved from the workspace below, never a hard-coded USD.
      currency: z.string().optional(),
      items: z.array(orderItemSchema).min(1),
      tax: z.number().nonnegative().default(0),
      discount: z.number().nonnegative().default(0),
      shipping: z.number().nonnegative().default(0),
      shippingAddress: z.any().optional(),
      billingAddress: z.any().optional(),
      notes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const currency = normalizeCurrencyCode(data.currency) ?? (await resolveWorkspaceCurrency(data.workspaceId));
    const subtotal = data.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
    const total = subtotal + data.tax + data.shipping - data.discount;
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error } = await sbAny(context.supabase).from('commerce_orders').insert({
      workspace_id: data.workspaceId,
      order_number: orderNumber,
      contact_id: data.contactId,
      channel: data.channel,
      conversation_id: data.conversationId,
      currency,
      subtotal, tax: data.tax, discount: data.discount, shipping: data.shipping, total,
      shipping_address: data.shippingAddress,
      billing_address: data.billingAddress,
      notes: data.notes,
      status: 'pending',
      payment_status: 'unpaid',
      placed_at: new Date().toISOString(),
    }).select().single();
    if (error || !order) throw error ?? new Error('Failed to create order');

    const items = data.items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      name: i.name, sku: i.sku,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    await sbAny(context.supabase).from('commerce_order_items').insert(items);
    await sbAny(context.supabase).from('commerce_order_events').insert({
      order_id: order.id, workspace_id: data.workspaceId,
      event_type: 'created', actor_id: context.userId,
      description: `Order ${orderNumber} created`,
    });

    return order;
  });

export const ORDER_STATUSES = [
  'pending', 'confirmed', 'processing', 'packed', 'shipped',
  'delivered', 'cancelled', 'returned', 'refunded',
] as const;

export const updateOrderStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      status: z.enum(ORDER_STATUSES).optional(),
      paymentStatus: z.enum(['unpaid', 'paid', 'partially_paid', 'refunded']).optional(),
      fulfillmentStatus: z.enum(['unfulfilled', 'processing', 'packed', 'shipped', 'delivered', 'returned']).optional(),
      trackingNumber: z.string().optional(),
      trackingUrl: z.string().url().optional(),
      shippingProvider: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === 'shipped') patch.shipped_at = now;
      if (data.status === 'delivered') { patch.delivered_at = now; patch.fulfilled_at = now; }
      if (data.status === 'cancelled') patch.cancelled_at = now;
      if (data.status === 'returned') patch.returned_at = now;
      if (data.status === 'refunded') patch.refunded_at = now;
    }
    if (data.paymentStatus) {
      patch.payment_status = data.paymentStatus;
      if (data.paymentStatus === 'paid') patch.paid_at = now;
    }
    if (data.fulfillmentStatus) {
      patch.fulfillment_status = data.fulfillmentStatus;
      if (data.fulfillmentStatus === 'delivered') patch.fulfilled_at = now;
    }
    if (data.trackingNumber !== undefined) patch.tracking_number = data.trackingNumber;
    if (data.trackingUrl !== undefined) patch.tracking_url = data.trackingUrl;
    if (data.shippingProvider !== undefined) patch.shipping_provider = data.shippingProvider;

    const { error } = await sbAny(context.supabase).from('commerce_orders').update(patch as never).eq('id', data.orderId);
    if (error) throw error;

    await sbAny(context.supabase).from('commerce_order_events').insert({
      order_id: data.orderId, workspace_id: data.workspaceId,
      event_type: data.status ? `status:${data.status}` : 'updated',
      actor_id: context.userId,
      description: data.status ? `Order marked as ${data.status}` : `Updated: ${Object.keys(patch).join(', ')}`,
      metadata: patch as never,
    });
    return { ok: true };
  });

export const addOrderNote = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      note: z.string().trim().min(1).max(2000),
      isCustomerVisible: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('commerce_order_events').insert({
      order_id: data.orderId, workspace_id: data.workspaceId,
      event_type: 'note', actor_id: context.userId,
      description: data.note,
      metadata: { customer_visible: data.isCustomerVisible } as never,
    });
    if (error) throw error;
    return { ok: true };
  });

export const getOrderContact = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { contactId: string }) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await sbAny(context.supabase).from('contacts')
      .select('id, first_name, last_name, display_name, email, phone, avatar_url, lifecycle_stage, company_id')
      .eq('id', data.contactId).maybeSingle();
    return c;
  });

export const listOrderInvoices = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order } = await sbAny(context.supabase).from('commerce_orders')
      .select('order_number, workspace_id').eq('id', data.orderId).maybeSingle();
    if (!order) return [];
    const { data: rows } = await sbAny(context.supabase).from('invoices')
      .select('id, invoice_number, status, total, currency, issue_date, due_date, paid_at, public_token')
      .eq('workspace_id', order.workspace_id)
      .or(`notes.ilike.%${sanitizeSearchTerm(order.order_number)}%,external_ref.eq.${data.orderId}`)
      .order('created_at', { ascending: false });
    return rows ?? [];
  });

export const createPaymentLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      orderId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      amount: z.number().positive(),
      currency: z.string().optional(),
      description: z.string().optional(),
      provider: z.enum(['stripe', 'paddle', 'manual']).default('stripe'),
      expiresInDays: z.number().int().positive().max(365).default(30),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const currency = normalizeCurrencyCode(data.currency) ?? (await resolveWorkspaceCurrency(data.workspaceId));
    const token = crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 8);
    const expiresAt = new Date(Date.now() + data.expiresInDays * 86400_000).toISOString();
    const url = `/pay/${token}`;

    const { data: link, error } = await sbAny(context.supabase).from('commerce_payment_links').insert({
      workspace_id: data.workspaceId,
      order_id: data.orderId,
      contact_id: data.contactId,
      token, provider: data.provider,
      amount: data.amount, currency,
      description: data.description, url,
      status: 'active', expires_at: expiresAt,
    }).select().single();
    if (error) throw error;
    return link;
  });

export const listPaymentLinks = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => wsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase).from('commerce_payment_links')
      .select('*').eq('workspace_id', data.workspaceId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return rows ?? [];
  });

export const voidPaymentLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { linkId: string }) => z.object({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('commerce_payment_links')
      .update({ status: 'void' }).eq('id', data.linkId);
    if (error) throw error;
    return { ok: true };
  });

export const markPaymentLinkPaid = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { linkId: string }) => z.object({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: link } = await sbAny(context.supabase).from('commerce_payment_links')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', data.linkId).select().single();
    if (link?.order_id) {
      await sbAny(context.supabase).from('commerce_orders').update({
        payment_status: 'paid', paid_at: new Date().toISOString(),
      }).eq('id', link.order_id);
      await sbAny(context.supabase).from('commerce_order_events').insert({
        order_id: link.order_id, workspace_id: link.workspace_id,
        event_type: 'paid', actor_id: context.userId,
        description: `Payment received via link (${link.provider})`,
      });
    }
    return { ok: true };
  });
