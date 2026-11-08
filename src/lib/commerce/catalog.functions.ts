import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";

const ws = z.object({ workspaceId: z.string().uuid() });

// ============ BRANDS ============
export const listBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await sbAny(context.supabase)
      .from("commerce_brands")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("name");
    if (!rows?.length) return [];
    const ids = rows.map((r) => r.id);
    const { data: prods } = await sbAny(context.supabase)
      .from("products")
      .select("brand_id")
      .eq("workspace_id", data.workspaceId)
      .in("brand_id", ids);
    const counts = new Map<string, number>();
    (prods ?? []).forEach((p) => {
      if (!p.brand_id) return;
      counts.set(p.brand_id, (counts.get(p.brand_id) ?? 0) + 1);
    });
    return rows.map((r) => ({ ...r, product_count: counts.get(r.id) ?? 0 }));
  });

export const upsertBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id?: string;
      workspaceId: string;
      name: string;
      description?: string;
      website?: string;
      logo_url?: string;
      is_active?: boolean;
    }) =>
      z
        .object({
          id: z.string().uuid().optional(),
          workspaceId: z.string().uuid(),
          name: z.string().min(1).max(120),
          description: z.string().max(1000).optional(),
          website: z.string().url().optional().or(z.literal("")),
          logo_url: z.string().url().optional().or(z.literal("")),
          is_active: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      website: data.website || null,
      logo_url: data.logo_url || null,
      is_active: data.is_active ?? true,
      slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    };
    if (data.id) {
      const { data: updated, error } = await sbAny(context.supabase)
        .from("commerce_brands")
        .update(row)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    }
    const { data: inserted, error } = await sbAny(context.supabase)
      .from("commerce_brands")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return inserted;
  });

export const toggleBrandActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; isActive: boolean; workspaceId: string }) =>
    z
      .object({ id: z.string().uuid(), isActive: z.boolean(), workspaceId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("commerce_brands")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; workspaceId: string; reassignTo?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        workspaceId: z.string().uuid(),
        reassignTo: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Reassign or unlink products first (products.brand_id is nullable).
    const { error: reErr } = await sbAny(context.supabase)
      .from("products")
      .update({ brand_id: data.reassignTo ?? null })
      .eq("workspace_id", data.workspaceId)
      .eq("brand_id", data.id);
    if (reErr) throw reErr;
    const { error } = await sbAny(context.supabase)
      .from("commerce_brands")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ INVENTORY ============
export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; lowStockOnly?: boolean }) =>
    z.object({ workspaceId: z.string().uuid(), lowStockOnly: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await sbAny(context.supabase)
      .from("commerce_inventory")
      .select("*, products(id,name,sku,low_stock_threshold)")
      .eq("workspace_id", data.workspaceId);
    let list = rows ?? [];
    if (data.lowStockOnly) {
      list = list.filter((r: any) => {
        const threshold = r.products?.low_stock_threshold ?? r.reorder_point ?? 0;
        return r.quantity_on_hand - r.quantity_reserved <= threshold;
      });
    }
    return list;
  });

export const adjustInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      workspaceId: string;
      productId: string;
      location?: string;
      delta: number;
      movementType: string;
      note?: string;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          productId: z.string().uuid(),
          location: z.string().default("default"),
          delta: z.number().int(),
          movementType: z.enum(["receive", "adjust", "sale", "return", "transfer"]),
          note: z.string().max(500).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Upsert inventory row
    const { data: existing } = await sbAny(supabase)
      .from("commerce_inventory")
      .select("*")
      .eq("product_id", data.productId)
      .eq("location", data.location)
      .maybeSingle();

    if (existing) {
      await sbAny(supabase)
        .from("commerce_inventory")
        .update({
          quantity_on_hand: (existing.quantity_on_hand ?? 0) + data.delta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await sbAny(supabase).from("commerce_inventory").insert({
        workspace_id: data.workspaceId,
        product_id: data.productId,
        location: data.location,
        quantity_on_hand: data.delta,
      });
    }

    await sbAny(supabase)
      .from("commerce_inventory_movements")
      .insert({
        workspace_id: data.workspaceId,
        product_id: data.productId,
        location: data.location,
        movement_type: data.movementType,
        quantity_delta: data.delta,
        note: data.note ?? null,
        created_by: userId,
      });

    return { ok: true };
  });

export const listInventoryMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; productId: string; location?: string; limit?: number }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        productId: z.string().uuid(),
        location: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("commerce_inventory_movements")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("product_id", data.productId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.location) q = q.eq("location", data.location);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const setReorderPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; reorderPoint: number | null; reorderQuantity: number | null }) =>
    z
      .object({
        id: z.string().uuid(),
        reorderPoint: z.number().int().min(0).nullable(),
        reorderQuantity: z.number().int().min(0).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("commerce_inventory")
      .update({
        reorder_point: data.reorderPoint,
        reorder_quantity: data.reorderQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ SHIPPING ============
export const listShippingZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: zones } = await sbAny(context.supabase)
      .from("commerce_shipping_zones")
      .select("*, commerce_shipping_rates(*)")
      .eq("workspace_id", data.workspaceId)
      .order("name");
    return zones ?? [];
  });

export const upsertShippingZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id?: string;
      workspaceId: string;
      name: string;
      countries: string[];
      is_active?: boolean;
    }) =>
      z
        .object({
          id: z.string().uuid().optional(),
          workspaceId: z.string().uuid(),
          name: z.string().min(1).max(120),
          countries: z.array(z.string().length(2)).default([]),
          is_active: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      name: data.name,
      countries: data.countries,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { data: u, error } = await sbAny(context.supabase)
        .from("commerce_shipping_zones")
        .update(row)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return u;
    }
    const { data: i, error } = await sbAny(context.supabase)
      .from("commerce_shipping_zones")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return i;
  });

export const upsertShippingRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id?: string;
      workspaceId: string;
      zoneId: string;
      name: string;
      rate_type: string;
      price: number;
      currency?: string;
      min_order_total?: number;
      max_order_total?: number;
      estimated_days_min?: number;
      estimated_days_max?: number;
    }) =>
      z
        .object({
          id: z.string().uuid().optional(),
          workspaceId: z.string().uuid(),
          zoneId: z.string().uuid(),
          name: z.string().min(1).max(120),
          rate_type: z.enum(["flat", "weight", "price", "free"]),
          price: z.number().min(0),
          // No default: an omitted currency is resolved from the workspace in the
          // handler, because this value is written to the shipping-rate row.
          currency: z.string().length(3).optional(),
          min_order_total: z.number().optional(),
          max_order_total: z.number().optional(),
          estimated_days_min: z.number().int().optional(),
          estimated_days_max: z.number().int().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      zone_id: data.zoneId,
      name: data.name,
      rate_type: data.rate_type,
      price: data.price,
      currency: data.currency ?? (await resolveWorkspaceCurrency(data.workspaceId)),
      min_order_total: data.min_order_total ?? null,
      max_order_total: data.max_order_total ?? null,
      estimated_days_min: data.estimated_days_min ?? null,
      estimated_days_max: data.estimated_days_max ?? null,
    };
    if (data.id) {
      const { data: u, error } = await sbAny(context.supabase)
        .from("commerce_shipping_rates")
        .update(row)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return u;
    }
    const { data: i, error } = await sbAny(context.supabase)
      .from("commerce_shipping_rates")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return i;
  });

export const deleteShippingZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string }) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await sbAny(context.supabase)
      .from("commerce_shipping_rates")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("zone_id", data.id);
    const { error } = await sbAny(context.supabase)
      .from("commerce_shipping_zones")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteShippingRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string }) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("commerce_shipping_rates")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const toggleShippingZoneActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string; is_active: boolean }) =>
    z
      .object({ workspaceId: z.string().uuid(), id: z.string().uuid(), is_active: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("commerce_shipping_zones")
      .update({ is_active: data.is_active })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const toggleShippingRateActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; id: string; is_active: boolean }) =>
    z
      .object({ workspaceId: z.string().uuid(), id: z.string().uuid(), is_active: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("commerce_shipping_rates")
      .update({ is_active: data.is_active })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ ANALYTICS ============
export const getCommerceAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; days?: number }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { supabase } = context;

    const [ordersRes, itemsRes, linksRes] = await Promise.all([
      sbAny(supabase)
        .from("commerce_orders")
        .select("id,total,status,payment_status,channel,created_at,paid_at,currency")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since),
      sbAny(supabase)
        .from("commerce_order_items")
        .select("id,name,quantity,total,order_id,commerce_orders!inner(workspace_id,created_at)")
        .eq("commerce_orders.workspace_id", data.workspaceId)
        .gte("commerce_orders.created_at", since),
      sbAny(supabase)
        .from("commerce_payment_links")
        .select("id,amount,status,created_at")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", since),
    ]);

    const orders = ordersRes.data ?? [];
    const items = itemsRes.data ?? [];
    const links = linksRes.data ?? [];

    // Daily revenue
    const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
    orders.forEach((o: any) => {
      const day = (o.paid_at ?? o.created_at).slice(0, 10);
      byDay[day] ??= { date: day, revenue: 0, orders: 0 };
      byDay[day].orders += 1;
      if (o.payment_status === "paid") byDay[day].revenue += Number(o.total ?? 0);
    });

    // Top products
    const byProduct: Record<string, { name: string; qty: number; revenue: number }> = {};
    items.forEach((it: any) => {
      const key = it.name ?? "Unknown";
      byProduct[key] ??= { name: key, qty: 0, revenue: 0 };
      byProduct[key].qty += Number(it.quantity ?? 0);
      byProduct[key].revenue += Number(it.total ?? 0);
    });

    // Channel breakdown
    const byChannel: Record<string, number> = {};
    orders.forEach((o: any) => {
      const c = o.channel ?? "direct";
      byChannel[c] = (byChannel[c] ?? 0) + 1;
    });

    const totalRevenue = orders
      .filter((o: any) => o.payment_status === "paid")
      .reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
    const paidCount = orders.filter((o: any) => o.payment_status === "paid").length;
    const aov = paidCount > 0 ? totalRevenue / paidCount : 0;

    return {
      totalRevenue,
      totalOrders: orders.length,
      paidOrders: paidCount,
      averageOrderValue: aov,
      conversionRate:
        links.length > 0
          ? (links.filter((l: any) => l.status === "paid").length / links.length) * 100
          : 0,
      daily: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: Object.values(byProduct)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      byChannel: Object.entries(byChannel).map(([channel, count]) => ({ channel, count })),
    };
  });
