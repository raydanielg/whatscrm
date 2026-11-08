import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sbAny } from "@/lib/supabase/untyped";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";
import { nextStorePage, paginateStore, storeCurrency } from "./pagination";
import { buildRetailerId } from "./product-source";

/**
 * E-commerce store connectors (Shopify / WooCommerce / WordPress).
 * All outbound calls happen server-side so store credentials never reach the browser.
 */

type Creds = Record<string, string>;

const idInput = z.object({ connectionId: z.string().uuid(), workspaceId: z.string().uuid() });

function base(url: string) {
  return url.replace(/\/+$/, '');
}

function authHeaders(platform: string, creds: Creds): Record<string, string> {
  if (platform === 'shopify') {
    return { 'X-Shopify-Access-Token': creds.access_token ?? '', 'Content-Type': 'application/json' };
  }
  if (platform === 'woocommerce') {
    const token = btoa(`${creds.consumer_key ?? ''}:${creds.consumer_secret ?? ''}`);
    return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
  }
  if (platform === 'wordpress') {
    const token = btoa(`${creds.username ?? ''}:${creds.app_password ?? ''}`);
    return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
  }
  const out: Record<string, string> = { 'Content-Type': 'application/json' };
  if (creds.api_key) out.Authorization = `Bearer ${creds.api_key}`;
  return out;
}

function pingUrl(platform: string, url: string) {
  const b = base(url);
  if (platform === 'shopify') return `${b}/admin/api/2024-10/shop.json`;
  if (platform === 'woocommerce') return `${b}/wp-json/wc/v3/system_status`;
  if (platform === 'wordpress') return `${b}/wp-json/wp/v2/users/me`;
  return b;
}

function productsUrl(platform: string, url: string, page: number, limit: number) {
  const b = base(url);
  if (platform === 'shopify') return `${b}/admin/api/2024-10/products.json?limit=${limit}`;
  if (platform === 'woocommerce') return `${b}/wp-json/wc/v3/products?per_page=${limit}&page=${page}`;
  if (platform === 'wordpress') return `${b}/wp-json/wp/v2/product?per_page=${limit}&page=${page}`;
  return `${b}/products`;
}

function ordersUrl(platform: string, url: string, limit: number) {
  const b = base(url);
  if (platform === 'shopify') return `${b}/admin/api/2024-10/orders.json?status=any&limit=${limit}`;
  if (platform === 'woocommerce') return `${b}/wp-json/wc/v3/orders?per_page=${limit}`;
  return '';
}

async function callStorePage(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Store responded ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return { payload: JSON.parse(text), headers: res.headers };
  } catch {
    throw new Error('Store returned a non-JSON response. Check the store URL and that the REST API is enabled.');
  }
}

async function callStore(url: string, headers: Record<string, string>) {
  return (await callStorePage(url, headers)).payload;
}

type NormalizedProduct = {
  external_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number;
  image_url: string | null;
  images: string[];
  is_active: boolean;
  stock: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProducts(platform: string, payload: any): NormalizedProduct[] {
  if (platform === 'shopify') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (payload?.products ?? []).map((p: any) => {
      const v = p.variants?.[0] ?? {};
      return {
        external_id: String(p.id),
        name: p.title ?? 'Untitled',
        description: typeof p.body_html === 'string' ? p.body_html.replace(/<[^>]*>/g, '').slice(0, 2000) : null,
        sku: v.sku || null,
        price: Number(v.price ?? 0) || 0,
        image_url: p.image?.src ?? null,
        images: (p.images ?? []).map((image: { src?: string }) => image.src).filter(Boolean),
        is_active: p.status === 'active',
        stock: v.inventory_quantity ?? null,
      };
    });
  }
  if (platform === 'woocommerce') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(payload) ? payload : []).map((p: any) => ({
      external_id: String(p.id),
      name: p.name ?? 'Untitled',
      description: typeof p.short_description === 'string' ? p.short_description.replace(/<[^>]*>/g, '').slice(0, 2000) : null,
      sku: p.sku || null,
      price: Number(p.price ?? 0) || 0,
      image_url: p.images?.[0]?.src ?? null,
      images: (p.images ?? []).map((image: { src?: string }) => image.src).filter(Boolean),
      is_active: p.status === 'publish',
      stock: typeof p.stock_quantity === 'number' ? p.stock_quantity : null,
    }));
  }
  // wordpress / custom
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(payload) ? payload : []).map((p: any) => ({
    external_id: String(p.id),
    name: p.title?.rendered ?? p.name ?? 'Untitled',
    description: typeof p.excerpt?.rendered === 'string' ? p.excerpt.rendered.replace(/<[^>]*>/g, '').slice(0, 2000) : null,
    sku: null,
    price: Number(p.price ?? 0) || 0,
    image_url: null,
    images: [],
    is_active: p.status ? p.status === 'publish' : true,
    stock: null,
  }));
}

async function loadConnection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  connectionId: string,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from('ecommerce_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Store connection not found');
  return data;
}

export const testStoreConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { connectionId: string; workspaceId: string }) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const conn = await loadConnection(supabase, data.connectionId, data.workspaceId);
    try {
      const payload = await callStore(
        pingUrl(conn.platform, conn.store_url),
        authHeaders(conn.platform, conn.credentials ?? {}),
      );
      await supabase
        .from('ecommerce_connections')
        .update({ status: 'connected', last_error: null })
        .eq('id', conn.id);
      const shopName =
        payload?.shop?.name ??
        payload?.name ??
        payload?.settings?.title ??
        conn.name;
      return { ok: true as const, message: `Connected to ${shopName}` };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connection failed';
      await supabase
        .from('ecommerce_connections')
        .update({ status: 'error', last_error: message })
        .eq('id', conn.id);
      return { ok: false as const, message };
    }
  });

export const syncStoreProducts = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { connectionId: string; workspaceId: string }) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const conn = await loadConnection(supabase, data.connectionId, data.workspaceId);

    const { data: log } = await supabase
      .from('ecommerce_sync_logs')
      .insert({
        connection_id: conn.id,
        workspace_id: data.workspaceId,
        resource: 'products',
        direction: 'pull',
        status: 'running',
      })
      .select()
      .single();

    await sbAny(supabase).from('ecommerce_connections').update({ status: 'syncing' }).eq('id', conn.id);

    let processed = 0;
    let failed = 0;
    // Counted separately from `processed` so a sync that fetches 426 and writes
    // 400 cannot report itself as complete. `pagesFetched` is what proves the
    // loop actually walked past page 1.
    let fetched = 0;
    let pagesFetched = 0;
    try {
      const headers = authHeaders(conn.platform, conn.credentials ?? {});
      const fallbackCurrency = await resolveWorkspaceCurrency(data.workspaceId);
      const info = conn.platform === 'shopify' || conn.platform === 'woocommerce'
        ? await callStore(pingUrl(conn.platform, conn.store_url), headers) : null;
      const currency = storeCurrency(conn.platform, info, fallbackCurrency);
      // Use max allowed per_page (100 is WooCommerce's limit; Shopify allows 250)
      const pageSize = conn.platform === 'shopify' ? 250 : 100;
      let pageUrl: string | null = productsUrl(conn.platform, conn.store_url, 1, pageSize);
      const seen = new Set<string>();
      while (pageUrl) {
        if (seen.has(pageUrl) || seen.size >= 500) throw new Error('Store pagination did not finish; check the sync history before retrying.');
        seen.add(pageUrl);
        const page = await callStorePage(pageUrl, headers);
        const items = normalizeProducts(conn.platform, page.payload);
        fetched += items.length;
        pagesFetched += 1;

      for (const item of items) {
        // Store-scoped identity: Woo product ids repeat across stores, so the
        // connection id has to be part of the key or store B overwrites store A.
        const retailerId = buildRetailerId(conn.platform, conn.id, item.external_id);
        const row = {
          workspace_id: data.workspaceId,
          name: item.name,
          description: item.description,
          sku: item.sku,
          price: item.price,
          image_url: item.image_url,
          images: item.images,
          currency,
          is_active: item.is_active,
          status: item.is_active ? 'active' : 'draft',
          stock_quantity: item.stock,
          track_inventory: item.stock !== null,
          retailer_id: retailerId,
          metadata: { store_name: conn.name, source: conn.platform, connection_id: conn.id, external_id: item.external_id },
        };
        const { data: existing, error: lookupError } = await supabase
          .from('products')
          .select('id')
          .eq('workspace_id', data.workspaceId)
          .eq('metadata->>connection_id', conn.id)
          .eq('metadata->>external_id', item.external_id)
          .maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        const res = existing
          ? await sbAny(supabase).from('products').update(row).eq('id', existing.id)
          : await sbAny(supabase).from('products').insert(row);
        if (res.error) failed += 1;
        else processed += 1;
      }
        pageUrl = nextStorePage(pageUrl, page.headers, items.length, conn.platform);
      }

      await supabase
        .from('ecommerce_connections')
        .update({
          status: 'connected',
          last_error: failed ? `${failed} products could not be saved. See sync history.` : null,
          last_sync_at: new Date().toISOString(),
          products_synced: processed,
        })
        .eq('id', conn.id);
      if (log?.id) {
        await supabase
          .from('ecommerce_sync_logs')
          .update({
            status: failed ? 'partial' : 'success',
            items_processed: processed,
            items_failed: failed,
            finished_at: new Date().toISOString(),
            message:
              `Fetched ${fetched} products across ${pagesFetched} page${pagesFetched === 1 ? '' : 's'}; ` +
              `imported ${processed}${failed ? `, ${failed} failed` : ''}`,
          })
          .eq('id', log.id);
      }
      return { ok: true as const, processed, failed, fetched, pages: pagesFetched };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed';
      await supabase
        .from('ecommerce_connections')
        .update({ status: 'error', last_error: message })
        .eq('id', conn.id);
      if (log?.id) {
        await supabase
          .from('ecommerce_sync_logs')
          .update({
            status: 'failed',
            items_processed: processed,
            items_failed: failed,
            // Say where it stopped. "Imported 100" with no other context is what
            // made a one-page sync look like a complete one.
            message: `${message} (stopped after ${pagesFetched} page${pagesFetched === 1 ? '' : 's'}, ${fetched} fetched, ${processed} imported)`,
            finished_at: new Date().toISOString(),
          })
          .eq('id', log.id);
      }
      return { ok: false as const, processed, failed, fetched, pages: pagesFetched, message };
    }
  });

export const fetchStoreOrders = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { connectionId: string; workspaceId: string }) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const conn = await loadConnection(supabase, data.connectionId, data.workspaceId);
    const startUrl = ordersUrl(conn.platform, conn.store_url, 20);
    if (!startUrl) return { ok: false as const, message: 'Order import is not supported for this platform', orders: [] };
    try {
      const headers = authHeaders(conn.platform, conn.credentials ?? {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { items: raw, pages: pagesFetched } = await paginateStore<any>({
        startUrl,
        platform: conn.platform,
        fetchPage: async (pageUrl) => {
          const page = await callStorePage(pageUrl, headers);
          const items =
            conn.platform === 'shopify' ? (page.payload?.orders ?? []) : Array.isArray(page.payload) ? page.payload : [];
          return { items, headers: page.headers };
        },
      });
      // Imported orders normally carry the store's currency; when one does not,
      // the workspace's is right rather than dollars.
      const fallbackCurrency = await resolveWorkspaceCurrency(data.workspaceId);
      const orders = raw.map((o) => ({
        id: String(o.id),
        number: String(o.order_number ?? o.number ?? o.id),
        total: Number(o.total_price ?? o.total ?? 0) || 0,
        currency: o.currency ?? fallbackCurrency,
        status: o.financial_status ?? o.status ?? 'unknown',
        customer:
          [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') ||
          [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(' ') ||
          'Guest',
        created_at: o.created_at ?? o.date_created ?? null,
      }));
      await supabase
        .from('ecommerce_connections')
        .update({ orders_synced: orders.length, last_sync_at: new Date().toISOString() })
        .eq('id', conn.id);
      return { ok: true as const, orders, pages: pagesFetched };
    } catch (e) {
      return {
        ok: false as const,
        orders: [],
        message: e instanceof Error ? e.message : 'Failed to fetch orders',
      };
    }
  });
