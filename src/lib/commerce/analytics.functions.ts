import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const filterSchema = z.object({
  workspaceId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  channel: z.string().optional(),
  compare: z.boolean().optional().default(true),
});

export type CommerceAnalyticsFilter = z.infer<typeof filterSchema>;

type OrderRow = {
  id: string;
  total: number | string;
  subtotal: number | string;
  discount: number | string;
  status: string;
  payment_status: string;
  channel: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  currency: string;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
  cancelled_at: string | null;
};

async function loadWindow(
  supabase: any,
  workspaceId: string,
  from: string,
  to: string,
  channel?: string,
) {
  let ordersQ = supabase
    .from('commerce_orders')
    .select(
      'id,total,subtotal,discount,status,payment_status,channel,contact_id,conversation_id,currency,created_at,paid_at,refunded_at,cancelled_at',
    )
    .eq('workspace_id', workspaceId)
    .gte('created_at', from)
    .lte('created_at', to);
  if (channel && channel !== 'all') ordersQ = ordersQ.eq('channel', channel);

  const [ordersRes, itemsRes, cartsRes, linksRes, promosRes] = await Promise.all([
    ordersQ,
    supabase
      .from('commerce_order_items')
      .select(
        'id,name,product_id,quantity,total,unit_price,order_id,commerce_orders!inner(workspace_id,channel,created_at,payment_status)',
      )
      .eq('commerce_orders.workspace_id', workspaceId)
      .gte('commerce_orders.created_at', from)
      .lte('commerce_orders.created_at', to),
    supabase
      .from('commerce_carts')
      .select('id,status,total,coupon_code,created_at,updated_at,contact_id')
      .eq('workspace_id', workspaceId)
      .gte('created_at', from)
      .lte('created_at', to),
    supabase
      .from('commerce_payment_links')
      .select('id,amount,status,paid_amount,refunded_amount,created_at')
      .eq('workspace_id', workspaceId)
      .gte('created_at', from)
      .lte('created_at', to),
    supabase
      .from('commerce_promotion_redemptions')
      .select('id,code_used,amount_off_cents,currency,promotion_id,created_at,order_id')
      .eq('workspace_id', workspaceId)
      .gte('created_at', from)
      .lte('created_at', to),
  ]);

  const orders: OrderRow[] = (ordersRes.data ?? []) as any;
  const items: any[] = itemsRes.data ?? [];
  const carts: any[] = cartsRes.data ?? [];
  const links: any[] = linksRes.data ?? [];
  const promos: any[] = promosRes.data ?? [];

  // Enrich items with product category
  const productIds = Array.from(
    new Set(items.map((i) => i.product_id).filter(Boolean)),
  ) as string[];
  const catByProduct: Record<string, string> = {};
  if (productIds.length) {
    const { data: prods } = await supabase
      .from('products')
      .select('id,category,category_id,product_categories(name)')
      .in('id', productIds);
    (prods ?? []).forEach((p: any) => {
      catByProduct[p.id] = p.product_categories?.name ?? p.category ?? 'Uncategorized';
    });
  }

  // Contacts for top customers
  const contactIds = Array.from(
    new Set(orders.map((o) => o.contact_id).filter(Boolean)),
  ) as string[];
  const contactMap: Record<string, string> = {};
  if (contactIds.length) {
    const { data: cs } = await supabase
      .from('contacts')
      .select('id,name,display_name')
      .in('id', contactIds);
    (cs ?? []).forEach((c: any) => {
      contactMap[c.id] = c.display_name ?? c.name ?? 'Customer';
    });
  }

  // Assigned agents from conversations
  const convIds = Array.from(
    new Set(orders.map((o) => o.conversation_id).filter(Boolean)),
  ) as string[];
  const agentByConv: Record<string, string | null> = {};
  const agentIds = new Set<string>();
  if (convIds.length) {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id,assigned_to')
      .in('id', convIds);
    (convs ?? []).forEach((c: any) => {
      agentByConv[c.id] = c.assigned_to;
      if (c.assigned_to) agentIds.add(c.assigned_to);
    });
  }
  const agentMap: Record<string, string> = {};
  if (agentIds.size) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id,full_name,email')
      .in('id', Array.from(agentIds));
    (profs ?? []).forEach((p: any) => {
      agentMap[p.id] = p.full_name ?? p.email ?? 'Agent';
    });
  }

  return { orders, items, carts, links, promos, catByProduct, contactMap, agentByConv, agentMap };
}

function computeMetrics(w: Awaited<ReturnType<typeof loadWindow>>) {
  const { orders, items, carts, links, promos, catByProduct, contactMap, agentByConv, agentMap } = w;

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  const refundedOrders = orders.filter(
    (o) => o.payment_status === 'refunded' || o.refunded_at,
  );
  const cancelledOrders = orders.filter((o) => o.cancelled_at || o.status === 'cancelled');

  const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const totalOrders = orders.length;
  const aov = paidOrders.length ? totalRevenue / paidOrders.length : 0;

  // Abandoned carts: status active/abandoned and not converted to order
  const abandoned = carts.filter((c) => c.status !== 'converted' && c.status !== 'checked_out');
  const abandonmentRate = carts.length ? (abandoned.length / carts.length) * 100 : 0;

  // Checkout conversion = paid orders / carts created
  const conversionRate = carts.length ? (paidOrders.length / carts.length) * 100 : 0;

  // Payment success = paid links / (paid + failed + expired). Fallback to paid/all links.
  const linkAttempts = links.filter((l) =>
    ['paid', 'failed', 'expired', 'cancelled', 'active'].includes(l.status),
  );
  const linkPaid = links.filter((l) => l.status === 'paid').length;
  const paymentSuccessRate = linkAttempts.length ? (linkPaid / linkAttempts.length) * 100 : 0;

  // Refund rate
  const refundRate = paidOrders.length
    ? (refundedOrders.length / (paidOrders.length + refundedOrders.length)) * 100
    : 0;

  // Daily series
  const byDay: Record<string, { date: string; revenue: number; orders: number; refunds: number }> = {};
  orders.forEach((o) => {
    const day = (o.paid_at ?? o.created_at).slice(0, 10);
    byDay[day] ??= { date: day, revenue: 0, orders: 0, refunds: 0 };
    byDay[day].orders += 1;
    if (o.payment_status === 'paid') byDay[day].revenue += Number(o.total ?? 0);
    if (o.refunded_at) byDay[day].refunds += 1;
  });
  const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

  // Top products
  const byProduct: Record<string, { name: string; qty: number; revenue: number }> = {};
  items.forEach((it) => {
    const key = it.name ?? 'Unknown';
    byProduct[key] ??= { name: key, qty: 0, revenue: 0 };
    byProduct[key].qty += Number(it.quantity ?? 0);
    byProduct[key].revenue += Number(it.total ?? 0);
  });
  const topProducts = Object.values(byProduct)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top categories
  const byCategory: Record<string, { name: string; qty: number; revenue: number }> = {};
  items.forEach((it) => {
    const cat = (it.product_id && catByProduct[it.product_id]) || 'Uncategorized';
    byCategory[cat] ??= { name: cat, qty: 0, revenue: 0 };
    byCategory[cat].qty += Number(it.quantity ?? 0);
    byCategory[cat].revenue += Number(it.total ?? 0);
  });
  const topCategories = Object.values(byCategory)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top customers
  const byCustomer: Record<string, { id: string; name: string; orders: number; revenue: number }> = {};
  paidOrders.forEach((o) => {
    if (!o.contact_id) return;
    byCustomer[o.contact_id] ??= {
      id: o.contact_id,
      name: contactMap[o.contact_id] ?? 'Customer',
      orders: 0,
      revenue: 0,
    };
    byCustomer[o.contact_id].orders += 1;
    byCustomer[o.contact_id].revenue += Number(o.total ?? 0);
  });
  const topCustomers = Object.values(byCustomer)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Revenue by channel
  const chan: Record<string, { channel: string; orders: number; revenue: number }> = {};
  orders.forEach((o) => {
    const c = o.channel ?? 'direct';
    chan[c] ??= { channel: c, orders: 0, revenue: 0 };
    chan[c].orders += 1;
    if (o.payment_status === 'paid') chan[c].revenue += Number(o.total ?? 0);
  });
  const byChannel = Object.values(chan).sort((a, b) => b.revenue - a.revenue);

  // Revenue by agent
  const ag: Record<string, { agent: string; orders: number; revenue: number }> = {};
  orders.forEach((o) => {
    const aid = o.conversation_id ? agentByConv[o.conversation_id] : null;
    const key = aid ?? 'unassigned';
    const name = aid ? agentMap[aid] ?? 'Agent' : 'Unassigned';
    ag[key] ??= { agent: name, orders: 0, revenue: 0 };
    ag[key].orders += 1;
    if (o.payment_status === 'paid') ag[key].revenue += Number(o.total ?? 0);
  });
  const byAgent = Object.values(ag).sort((a, b) => b.revenue - a.revenue);

  // Coupon usage
  const coup: Record<string, { code: string; uses: number; discount: number }> = {};
  promos.forEach((p) => {
    const code = p.code_used ?? 'AUTO';
    coup[code] ??= { code, uses: 0, discount: 0 };
    coup[code].uses += 1;
    coup[code].discount += Number(p.amount_off_cents ?? 0) / 100;
  });
  const coupons = Object.values(coup).sort((a, b) => b.uses - a.uses);

  return {
    totals: {
      revenue: totalRevenue,
      orders: totalOrders,
      paidOrders: paidOrders.length,
      aov,
      conversionRate,
      abandonedCarts: abandoned.length,
      abandonmentRate,
      paymentSuccessRate,
      refundRate,
      refundedOrders: refundedOrders.length,
      cancelledOrders: cancelledOrders.length,
      couponUses: promos.length,
      couponDiscount: promos.reduce((s, p) => s + Number(p.amount_off_cents ?? 0) / 100, 0),
    },
    daily,
    topProducts,
    topCategories,
    topCustomers,
    byChannel,
    byAgent,
    coupons,
  };
}

export type CommerceAnalyticsResult = {
  current: ReturnType<typeof computeMetrics>;
  previous: ReturnType<typeof computeMetrics> | null;
  range: { from: string; to: string };
};

export const getCommerceAnalyticsReport = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: CommerceAnalyticsFilter) => filterSchema.parse(d))
  .handler(async ({ data, context }): Promise<CommerceAnalyticsResult> => {
    const { supabase } = context;
    const current = await loadWindow(supabase, data.workspaceId, data.from, data.to, data.channel);
    let previous: Awaited<ReturnType<typeof loadWindow>> | null = null;
    if (data.compare) {
      const spanMs = new Date(data.to).getTime() - new Date(data.from).getTime();
      const prevTo = new Date(new Date(data.from).getTime() - 1).toISOString();
      const prevFrom = new Date(new Date(data.from).getTime() - spanMs - 1).toISOString();
      previous = await loadWindow(supabase, data.workspaceId, prevFrom, prevTo, data.channel);
    }
    return {
      current: computeMetrics(current),
      previous: previous ? computeMetrics(previous) : null,
      range: { from: data.from, to: data.to },
    };
  });
