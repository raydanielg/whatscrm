import { sbAny } from "@/lib/supabase/untyped";
/**
 * WhatsApp Catalog — server-only helpers.
 *
 * Kept out of `wa-catalog.functions.ts` so that module stays a thin wrapper of
 * `createServerFn` declarations (server-function splitting removes runtime
 * siblings from that file).
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export async function metaFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error?.message ?? `Meta API ${res.status}`;
    throw new Error(msg);
  }
  return json as any;
}

/**
 * Meta's catalog batch endpoint answers 200 as soon as it queues the request;
 * each item is validated later and rejections only show up in
 * `check_batch_request_status`. Treating the 200 as success reported products
 * as synced that Meta never created.
 *
 * Polls the queued handles for up to ~20s. `done: false` means Meta was still
 * processing, so the caller must not claim success yet.
 */
export async function awaitBatchResult(
  catalogId: string,
  token: string,
  handles: string[],
  batch: Array<{ retailer_id: string }>,
): Promise<{ done: boolean; errors: Map<string, string>; general: string[] }> {
  const errors = new Map<string, string>();
  const general: string[] = [];
  if (handles.length === 0) return { done: false, errors, general };

  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    let allFinished = true;
    for (const handle of handles) {
      const res = await metaFetch(
        `/${catalogId}/check_batch_request_status?handle=${encodeURIComponent(handle)}`,
        token,
      );
      for (const entry of (res?.data ?? []) as any[]) {
        if (entry?.status !== "finished") {
          allFinished = false;
          continue;
        }
        for (const err of (entry?.errors ?? []) as any[]) {
          const message = String(err?.message ?? "Rejected by Meta");
          const rid =
            err?.retailer_id ??
            err?.id ??
            (Number.isInteger(err?.line) ? batch[err.line]?.retailer_id : null);
          if (rid) errors.set(String(rid), message);
          else general.push(message);
        }
      }
    }
    if (allFinished) return { done: true, errors, general };
  }
  return { done: false, errors, general };
}

/**
 * Ask the catalog which of these retailer ids it actually holds. The batch
 * status endpoint can stay unfinished for minutes, so on timeout this is the
 * source of truth: an item Meta lists exists, and its review status tells
 * whether it was rejected.
 */
export async function lookupCatalogItems(
  catalogId: string,
  token: string,
  retailerIds: string[],
): Promise<Map<string, { reviewStatus: string | null; rejection: string | null }>> {
  const found = new Map<string, { reviewStatus: string | null; rejection: string | null }>();
  if (!retailerIds.length) return found;
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { is_any: retailerIds } }));
  const res = await metaFetch(
    `/${catalogId}/products?filter=${filter}&fields=retailer_id,review_status,review_rejection_reasons&limit=${retailerIds.length}`,
    token,
  );
  for (const row of (res?.data ?? []) as any[]) {
    if (!row?.retailer_id) continue;
    const reasons = Array.isArray(row.review_rejection_reasons) ? row.review_rejection_reasons : [];
    found.set(String(row.retailer_id), {
      reviewStatus: row.review_status ?? null,
      rejection:
        row.review_status === "rejected" ? reasons.join(", ") || "Rejected by Meta review" : null,
    });
  }
  return found;
}

/**
 * A stored retailer_id wins: it is the id Meta already holds, so a product
 * imported from Commerce Manager (or one whose SKU changed later) keeps
 * pointing at the same catalog item instead of creating a duplicate.
 */
export function retailerIdFor(p: { id: string; sku?: string | null; retailer_id?: string | null }) {
  if (p.retailer_id && p.retailer_id.trim().length > 0) return p.retailer_id.trim();
  return p.sku && p.sku.trim().length > 0 ? p.sku.trim() : `wdf_${p.id.slice(0, 12)}`;
}

/**
 * Meta returns prices formatted for display (e.g. a currency code or symbol
 * glued to the digits, with thousands separators). Keep the digits and treat
 * the last separator followed by one or two digits as the decimal point.
 */
export function parseMetaPrice(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : s).replace(/[.,]/g, "");
  const n = Number(m ? `${whole}.${m[2]}` : whole);
  return Number.isFinite(n) ? n : null;
}

/** Every item in a Meta catalog, following cursor pages. */
export async function fetchAllCatalogItems(catalogId: string, token: string): Promise<any[]> {
  const fields = [
    "id",
    "retailer_id",
    "name",
    "description",
    "price",
    "sale_price",
    "currency",
    "image_url",
    "additional_image_urls",
    "availability",
    "inventory",
    "brand",
    "category",
    "url",
  ].join(",");
  const items: any[] = [];
  let after: string | null = null;
  // 20 pages × 100 items is far beyond what a WhatsApp catalog holds.
  for (let page = 0; page < 20; page++) {
    const cursor: string = after ? `&after=${encodeURIComponent(after)}` : "";
    const res = await metaFetch(
      `/${catalogId}/products?fields=${fields}&limit=100${cursor}`,
      token,
    );
    items.push(...((res?.data ?? []) as any[]));
    after = res?.paging?.next ? (res?.paging?.cursors?.after ?? null) : null;
    if (!after) break;
  }
  return items;
}

/** Every image a product has, primary first, de-duplicated. */
export function productImages(p: any): string[] {
  const all = [
    p.image_url,
    ...(Array.isArray(p.images) ? p.images : []),
    ...(Array.isArray(p.gallery) ? p.gallery : []),
  ].filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u.trim()));
  return Array.from(new Set(all.map((u) => u.trim())));
}

/**
 * Link Meta shows for the item. Without a public product page, a wa.me chat
 * link to the sending number is the most useful target. A Phone Number ID is
 * not a phone number, so it never belongs in a wa.me link.
 */
export function waChatLink(phoneNumber: string | null | undefined, productName: string) {
  const digits = (phoneNumber ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Hi, I'm interested in ${productName}`)}`;
}

/**
 * `fallbackCurrency` is required: this builds the payload Meta stores against
 * the product, so a hardcoded "USD" published dollar prices to WhatsApp for
 * catalogs that are not priced in dollars. The product's own currency wins over
 * the catalog setting — a BDT-priced product must not go out as USD.
 */
export function mapProductToMeta(p: any, cfg: any, fallbackCurrency: string, link?: string | null) {
  const price = Number(p.sale_price ?? p.price ?? 0);
  const currency = p?.currency || cfg?.currency || fallbackCurrency;
  // Postgres numerics arrive as strings ("50.000"); Meta wants a whole number.
  const stock = Math.max(0, Math.floor(Number(p.stock_quantity ?? 0) || 0));
  const images = productImages(p);
  return {
    retailer_id: retailerIdFor(p),
    name: p.name,
    description: p.description || p.name,
    availability: stock > 0 ? "in stock" : "out of stock",
    condition: "new",
    price: `${Math.round(price * 100)}`,
    currency,
    image_url: images[0] ?? null,
    additional_image_urls: images.slice(1, 10),
    url: p.public_url ?? cfg?.shop_url ?? link ?? null,
    brand: p.brand_name ?? undefined,
    category: p.category_name || p.category || cfg?.default_category || "General",
    visibility: p.wa_visibility === "hidden" ? "staging" : "published",
    inventory: stock,
  };
}

/**
 * Fields Meta requires on every catalog item. Checked before sending so the
 * operator sees what to fix, instead of the item disappearing in Meta's
 * asynchronous batch processing.
 */
export function missingCatalogFields(item: ReturnType<typeof mapProductToMeta>): string[] {
  const missing: string[] = [];
  if (!item.name?.trim()) missing.push("name");
  if (!item.description?.trim()) missing.push("description");
  if (!item.image_url) missing.push("image");
  if (!(Number(item.price) > 0)) missing.push("price");
  if (!/^[A-Z]{3}$/.test(item.currency ?? "")) missing.push("currency");
  if (!item.brand?.trim()) missing.push("brand");
  if (!item.url) missing.push("link (connect a WhatsApp number with a phone number)");
  return missing;
}

/**
 * Resolve the Graph access token + sending phone number for a workspace.
 *
 * The rest of the app stores WhatsApp credentials against a `channel_accounts`
 * row (token looked up by secret NAME), so the catalog must read from the same
 * place — otherwise a workspace that completed the WhatsApp setup wizard would
 * still be treated as "not configured" and every sync stayed staged locally.
 * Per-workspace / global env vars remain as a fallback for self-hosted installs
 * with no connected number.
 *
 * When the chosen number names its own token secret and that secret is unset,
 * this returns no token instead of borrowing another one: a token from a
 * different WhatsApp account cannot reach this catalog, and Meta then reports
 * the catalog as missing, which hid the real cause.
 *
 * `tokenSource` is the secret NAME that supplied the token (never its value);
 * `problem` explains a null token.
 */
export async function resolveWaCatalogCredentials(
  workspaceId: string,
  cfg: { phone_number_id?: string | null } | null,
): Promise<{
  token: string | null;
  phoneNumberId: string | null;
  tokenSource: string | null;
  problem: string | null;
}> {
  let phoneNumberId = cfg?.phone_number_id ?? null;

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  let q = (supabaseAdmin as any)
    .from("channel_accounts")
    .select("id, phone_number_id, status")
    .eq("workspace_id", workspaceId)
    .eq("provider", "whatsapp_cloud");
  if (cfg?.phone_number_id) q = q.eq("phone_number_id", cfg.phone_number_id);
  const { data: rows } = await q.order("is_default", { ascending: false }).limit(5);
  const account =
    (rows ?? []).find((r: any) => r.status === "active" || r.status === "connected") ??
    (rows ?? [])[0];

  if (account?.id) {
    const registry = await import("@/lib/messaging/registry.server");
    const record = await registry.loadChannelAccount(account.id);
    phoneNumberId = phoneNumberId ?? record.phoneNumberId ?? null;
    const secretName = record.accessTokenSecretName ?? "WHATSAPP_ACCESS_TOKEN";
    const token = registry.resolveSecretByName(secretName) ?? null;
    return token
      ? { token, phoneNumberId, tokenSource: secretName, problem: null }
      : {
          token: null,
          phoneNumberId,
          tokenSource: null,
          problem: `The access token secret "${secretName}" for WhatsApp number ${phoneNumberId ?? "?"} is not set on the server.`,
        };
  }

  if (cfg?.phone_number_id) {
    return {
      token: null,
      phoneNumberId,
      tokenSource: null,
      problem: `Phone Number ID ${cfg.phone_number_id} is not a connected WhatsApp number in this workspace.`,
    };
  }

  const key = `WA_TOKEN_${workspaceId.replace(/-/g, "_").toUpperCase()}`;
  if (process.env[key]) {
    return { token: process.env[key]!, phoneNumberId, tokenSource: key, problem: null };
  }
  if (process.env.WHATSAPP_ACCESS_TOKEN) {
    return {
      token: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId,
      tokenSource: "WHATSAPP_ACCESS_TOKEN",
      problem: null,
    };
  }
  return {
    token: null,
    phoneNumberId,
    tokenSource: null,
    problem: "No WhatsApp access token is configured for this workspace.",
  };
}

/**
 * Increment a daily catalog analytics counter.
 *
 * A plain upsert of `{ shares: 1 }` overwrote the running total, so counters
 * never grew past 1. Read-modify-write keeps the daily aggregate accurate.
 */
export async function bumpCatalogAnalytics(
  supabase: any,
  args: {
    workspaceId: string;
    productId: string;
    field: "views" | "shares" | "clicks" | "add_to_cart" | "orders";
    by?: number;
  },
) {
  const today = new Date().toISOString().slice(0, 10);
  const by = args.by ?? 1;
  const { data: existing } = await supabase
    .from("wa_catalog_analytics_daily")
    .select(`id, ${args.field}`)
    .eq("workspace_id", args.workspaceId)
    .eq("product_id", args.productId)
    .eq("date", today)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("wa_catalog_analytics_daily")
      .update({ [args.field]: (Number(existing[args.field]) || 0) + by })
      .eq("id", existing.id);
    return;
  }
  await sbAny(supabase)
    .from("wa_catalog_analytics_daily")
    .insert({
      workspace_id: args.workspaceId,
      product_id: args.productId,
      date: today,
      [args.field]: by,
    });
}
