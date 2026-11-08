/**
 * Product attachments for the Inbox composer.
 *
 * `listInboxProducts` feeds the composer's product picker. `prepareProductMessage`
 * turns a selection into what the composer should persist as outbound rows:
 *   - WhatsApp: one `interactive` row carrying a native catalog payload
 *     (`product` for one item, `product_list` for 2–30) in
 *     `metadata.interactive`, which the WhatsApp branch of `outbound.server.ts`
 *     sends as-is. A `metadata.products` snapshot lets the inbox render it.
 *   - Other channels: a product card per item — the product image (when the
 *     channel takes images) with a caption of name, price and link, or text.
 *
 * Reads go through the caller's RLS-scoped client; nothing is sent here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { attachmentRules, checkAttachment } from "./channel-attachments";
import { formatMoney } from "@/lib/currency/format";

export interface InboxProduct {
  id: string;
  name: string;
  sku: string | null;
  retailer_id: string | null;
  price: number | null;
  sale_price: number | null;
  currency: string | null;
  image_url: string | null;
  category: string | null;
  tags: string[] | null;
  is_featured: boolean | null;
  wa_catalog_status: string | null;
  link: string | null;
}

/** Snapshot stored on the message so the bubble renders without a lookup. */
export interface ProductSnapshot {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  retailer_id: string;
}

const PRODUCT_COLUMNS =
  "id, name, sku, retailer_id, price, sale_price, currency, image_url, category, tags, is_featured, wa_catalog_status, metadata";

function productLink(metadata: unknown): string | null {
  const m = (metadata ?? {}) as Record<string, unknown>;
  for (const key of ["url", "product_url", "permalink", "meta_url"]) {
    const v = m[key];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

function retailerIdFor(p: { id: string; sku?: string | null; retailer_id?: string | null }) {
  // Mirrors `retailerIdFor` in wa-catalog.server.ts (what the sync publishes).
  if (p.retailer_id && p.retailer_id.trim()) return p.retailer_id.trim();
  return p.sku && p.sku.trim() ? p.sku.trim() : `wdf_${p.id.slice(0, 12)}`;
}

function toInboxProduct(r: Record<string, any>): InboxProduct {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: r.id,
    name: r.name,
    sku: r.sku ?? null,
    retailer_id: r.retailer_id ?? null,
    price: r.price == null ? null : Number(r.price),
    sale_price: r.sale_price == null ? null : Number(r.sale_price),
    currency: r.currency ?? null,
    image_url: r.image_url ?? null,
    category: r.category ?? null,
    tags: Array.isArray(r.tags) ? r.tags : null,
    is_featured: r.is_featured ?? null,
    wa_catalog_status: r.wa_catalog_status ?? null,
    link: productLink(r.metadata),
  };
}

export const listInboxProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; search?: string }) =>
    z.object({ workspaceId: z.string().uuid(), search: z.string().max(120).optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<InboxProduct[]> => {
    let q = sbAny(context.supabase)
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("workspace_id", data.workspaceId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("is_featured", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.search?.trim()) q = q.ilike("name", `%${sanitizeSearchTerm(data.search.trim())}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map(toInboxProduct);
  });

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonObject = { [k: string]: JsonValue };

export type PreparedProductMessage =
  | {
      kind: "whatsapp_catalog";
      body: string;
      metadata: {
        interactive: JsonObject;
        products: ProductSnapshot[];
        catalog_id: string;
      };
    }
  | {
      kind: "cards";
      /** One or more rows to send in order. */
      rows: Array<{
        messageType: "image" | "text";
        body: string;
        mediaUrl?: string;
        mediaType?: string;
        metadata: JsonObject;
      }>;
    };

/** Best-effort mime from an image URL's extension (product images carry no type). */
function guessImageMime(url: string): string | null {
  const path = url.split(/[?#]/)[0]!.toLowerCase();
  if (/\.(jpe?g)$/.test(path)) return "image/jpeg";
  if (/\.png$/.test(path)) return "image/png";
  if (/\.gif$/.test(path)) return "image/gif";
  if (/\.webp$/.test(path)) return "image/webp";
  // Unknown extension (CDN URLs): most product images are JPEG.
  return /\.(svg|heic|avif|bmp|tiff?)$/.test(path) ? null : "image/jpeg";
}

function priceLabel(p: InboxProduct): string | null {
  const amount = p.sale_price ?? p.price;
  if (amount == null || !Number.isFinite(amount)) return null;
  return formatMoney(amount, p.currency);
}

export const prepareProductMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { workspaceId: string; conversationId: string; productIds: string[]; bodyText?: string }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          conversationId: z.string().uuid(),
          productIds: z.array(z.string().uuid()).min(1).max(30),
          bodyText: z.string().max(1024).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<PreparedProductMessage> => {
    const { data: conv } = await sbAny(context.supabase)
      .from("conversations")
      .select("id, workspace_id, channel")
      .eq("id", data.conversationId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!conv) throw new Error("Conversation not found");

    const { data: rows, error } = await sbAny(context.supabase)
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("workspace_id", data.workspaceId)
      .in("id", data.productIds);
    if (error) throw new Error(error.message);
    // Keep the agent's selection order.
    const byId = new Map(
      ((rows ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, toInboxProduct(r)]),
    );
    const products = data.productIds.map((id) => byId.get(id)).filter(Boolean) as InboxProduct[];
    if (!products.length) throw new Error("Products not found");

    const rules = attachmentRules(conv.channel as string);

    if (rules.nativeProducts) {
      const unsynced = products.filter((p) => p.wa_catalog_status !== "synced");
      if (unsynced.length) {
        throw new Error(
          `Sync to WhatsApp catalog first: ${unsynced.map((p) => p.name).join(", ")}`,
        );
      }
      const { data: cfg } = await sbAny(context.supabase)
        .from("wa_catalog_config")
        .select("catalog_id")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      const catalogId = (cfg as { catalog_id?: string | null } | null)?.catalog_id;
      if (!catalogId) {
        throw new Error(
          "No WhatsApp Catalog ID is set. Add it in Commerce → WhatsApp Catalog settings.",
        );
      }
      const snapshots: ProductSnapshot[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.sale_price ?? p.price,
        currency: p.currency,
        image_url: p.image_url,
        retailer_id: retailerIdFor(p),
      }));
      const body =
        data.bodyText?.trim() ||
        (products.length === 1
          ? `Have a look at ${products[0]!.name}`
          : "Here are some products for you");
      const interactive: JsonObject =
        products.length === 1
          ? {
              type: "product",
              body: { text: body.slice(0, 1024) },
              action: { catalog_id: catalogId, product_retailer_id: snapshots[0]!.retailer_id },
            }
          : {
              type: "product_list",
              header: { type: "text", text: "Products" },
              body: { text: body.slice(0, 1024) },
              action: {
                catalog_id: catalogId,
                sections: [
                  {
                    title: "Products",
                    product_items: snapshots
                      .slice(0, 30)
                      .map((s) => ({ product_retailer_id: s.retailer_id })),
                  },
                ],
              },
            };
      return {
        kind: "whatsapp_catalog",
        body,
        metadata: { interactive, products: snapshots, catalog_id: catalogId },
      };
    }

    const canImage = rules.kinds.includes("image");
    const out: Extract<PreparedProductMessage, { kind: "cards" }>["rows"] = [];
    const intro = data.bodyText?.trim();
    if (intro) out.push({ messageType: "text", body: intro, metadata: {} });
    for (const p of products) {
      const caption = [p.name, priceLabel(p), p.link].filter(Boolean).join("\n");
      const snapshot: JsonObject = {
        product_card: {
          id: p.id,
          name: p.name,
          price: p.sale_price ?? p.price,
          currency: p.currency,
          link: p.link,
        },
      };
      const imageMime = p.image_url ? guessImageMime(p.image_url) : null;
      const imageCheck = imageMime
        ? checkAttachment(conv.channel as string, { mime: imageMime })
        : null;
      // Only send the photo when the channel takes it as an image (not a
      // downgraded document); otherwise the card goes out as text.
      const imageOk = canImage && !!imageCheck?.ok && imageCheck.kind === "image";
      if (imageOk && p.image_url && imageMime) {
        if (rules.captionWithMedia) {
          out.push({
            messageType: "image",
            body: caption,
            mediaUrl: p.image_url,
            mediaType: imageMime,
            metadata: snapshot,
          });
        } else {
          // Messenger/Instagram drop text on media sends: image, then the details.
          out.push({
            messageType: "image",
            body: "",
            mediaUrl: p.image_url,
            mediaType: imageMime,
            metadata: snapshot,
          });
          out.push({ messageType: "text", body: caption, metadata: snapshot });
        }
      } else {
        out.push({ messageType: "text", body: caption, metadata: snapshot });
      }
    }
    return { kind: "cards", rows: out };
  });
