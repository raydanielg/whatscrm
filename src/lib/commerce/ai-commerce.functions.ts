/**
 * AI Commerce — server functions.
 *
 * Provides commerce-aware AI features:
 * - Product Recommendations, Upsell, Cross-sell, Frequently Bought Together
 * - Shopping Assistant (chat)
 * - Order Summary
 * - Product Search (natural language)
 * - Customer Preferences
 * - Purchase Prediction
 * - Revenue Prediction
 * - Abandoned Cart Recovery (message drafts for WhatsApp/Email/SMS)
 *
 * All calls go through the Lovable AI Gateway using GEMINI_API_KEY (server-only).
 * These functions are consumed by the Commerce dashboard AND by the Omnichannel
 * Inbox via `AiCommercePanel` so agents can recommend products in-chat.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveAggregateCurrency } from "@/lib/currency/resolve.server";
import { GEMINI_CHAT_URL, GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

// ---------- Gateway ----------

const AI_GATEWAY = GEMINI_CHAT_URL;
const DEFAULT_MODEL = GEMINI_DEFAULT_CHAT_MODEL;

async function callGateway<T>(
  system: string,
  user: string,
  opts?: { json?: boolean; model?: string },
): Promise<T | string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts?.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit exceeded — please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up your workspace.");
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (opts?.json) {
    try {
      const clean = content
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      return JSON.parse(clean) as T;
    } catch {
      throw new Error("AI returned invalid JSON");
    }
  }
  return content;
}

// ---------- Types ----------

export interface RecommendedProduct {
  productId: string;
  name: string;
  price: number;
  reason: string;
  score: number;
}
export interface RecommendationBundle {
  primary: RecommendedProduct[];
  upsell: RecommendedProduct[];
  crossSell: RecommendedProduct[];
  frequentlyBoughtTogether: RecommendedProduct[];
  narrative: string;
}
export interface OrderSummaryResult {
  headline: string;
  summary: string;
  highlights: string[];
  followUps: string[];
}
export interface NLSearchResult {
  interpretedQuery: string;
  filters: {
    categories?: string[];
    brands?: string[];
    tags?: string[];
    priceMin?: number;
    priceMax?: number;
    keywords?: string[];
  };
  productIds: string[];
  explanation: string;
}
export interface CustomerPreferencesResult {
  favoriteCategories: string[];
  favoriteBrands: string[];
  averageOrderValue: number;
  buyingCadenceDays: number | null;
  preferredChannel: string | null;
  personaSummary: string;
  interests: string[];
}
export interface PurchasePredictionResult {
  probability: number;
  timeframe: "24h" | "7d" | "30d" | "90d";
  confidence: "low" | "medium" | "high";
  drivers: { label: string; impact: "positive" | "negative" }[];
  suggestedProductIds: string[];
  narrative: string;
}
export interface RevenuePredictionResult {
  periodLabel: string;
  currency: string;
  worstCase: number;
  commit: number;
  bestCase: number;
  growthPercent: number;
  drivers: string[];
  narrative: string;
}
export interface AbandonedCartDraftResult {
  channel: "whatsapp" | "email" | "sms";
  subject?: string;
  body: string;
  tone: string;
  incentiveIdea: string | null;
}
export interface ShoppingAssistantResult {
  reply: string;
  suggestedProductIds: string[];
}

// ---------- Data loaders ----------

async function loadWorkspaceContext(workspaceId: string) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const [{ data: products }, { data: orders }] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id,name,description,price,currency,category_id,brand_id,tags,is_active,sku")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(200),
    supabaseAdmin
      .from("commerce_orders")
      .select(
        "id,contact_id,total,currency,status,created_at,commerce_order_items(product_id,quantity,unit_price)",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  return { products: products ?? [], orders: orders ?? [] };
}

async function loadContactContext(workspaceId: string, contactId: string) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const [{ data: contact }, { data: orders }, { data: cart }] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id,id,name,display_name,email,phone,tags,custom_fields")
      .eq("id", contactId)
      .maybeSingle(),
    supabaseAdmin
      .from("commerce_orders")
      .select(
        "id,total,currency,status,payment_status,created_at,commerce_order_items(product_id,quantity,unit_price)",
      )
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("commerce_carts")
      .select("id,updated_at,commerce_cart_items(product_id,quantity,unit_price)")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);
  return { contact: contact ?? null, orders: orders ?? [], carts: cart ?? [] };
}

function summarizeProducts(products: Array<Record<string, unknown>>, limit = 80) {
  return products.slice(0, limit).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    price: Number(p.price ?? 0),
    category: (p.category_id as string) ?? null,
    brand: (p.brand_id as string) ?? null,
    tags: (p.tags as string[]) ?? [],
    sku: (p.sku as string) ?? null,
    description: ((p.description as string) ?? "").slice(0, 240),
  }));
}

// ---------- Product recommendations (all four flavors) ----------

const recInput = z.object({
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  seedProductIds: z.array(z.string().uuid()).default([]),
  goal: z.enum(["recommend", "upsell", "crosssell", "fbt", "all"]).default("all"),
  limit: z.number().int().min(1).max(20).default(6),
});

export const getProductRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => recInput.parse(d))
  .handler(async ({ data }): Promise<RecommendationBundle> => {
    const ws = await loadWorkspaceContext(data.workspaceId);
    const contactCtx = data.contactId
      ? await loadContactContext(data.workspaceId, data.contactId)
      : null;

    const productList = summarizeProducts(ws.products);
    const boughtByContact = contactCtx
      ? contactCtx.orders.flatMap((o) =>
          ((o.commerce_order_items as Array<{ product_id: string; quantity: number }>) ?? []).map(
            (i) => i.product_id,
          ),
        )
      : [];
    const coOccurrence: Record<string, Record<string, number>> = {};
    for (const o of ws.orders) {
      const items = (o.commerce_order_items as Array<{ product_id: string }>) ?? [];
      for (const a of items)
        for (const b of items) {
          if (a.product_id === b.product_id) continue;
          coOccurrence[a.product_id] ??= {};
          coOccurrence[a.product_id][b.product_id] =
            (coOccurrence[a.product_id][b.product_id] ?? 0) + 1;
        }
    }

    const system = `You are an AI merchandiser. Given a product catalog, purchase history, and optional customer/seed products, produce product recommendations in 4 buckets:
- primary: best overall recommendations for the customer (or trending if no customer)
- upsell: higher-value alternatives to seed items
- crossSell: complementary categories to the seed items
- frequentlyBoughtTogether: items co-purchased with seed items in the order history

Return STRICT JSON matching:
{"primary":[{"productId":"","name":"","price":0,"reason":"","score":0}],"upsell":[...],"crossSell":[...],"frequentlyBoughtTogether":[...],"narrative":"..."}
Only include productId values that exist in the provided catalog. Score is 0-100. Keep each bucket at most ${data.limit} items.`;

    const user = JSON.stringify({
      goal: data.goal,
      catalog: productList,
      seedProductIds: data.seedProductIds,
      customer: contactCtx?.contact
        ? {
            name: contactCtx.contact.display_name ?? contactCtx.contact.name,
            tags: contactCtx.contact.tags,
          }
        : null,
      customerPurchasedProductIds: boughtByContact,
      coOccurrenceTop: Object.fromEntries(
        Object.entries(coOccurrence)
          .slice(0, 40)
          .map(([k, v]) => [
            k,
            Object.entries(v)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8),
          ]),
      ),
    });

    return (await callGateway<RecommendationBundle>(system, user, {
      json: true,
    })) as RecommendationBundle;
  });

// ---------- Shopping Assistant ----------

const chatInput = z.object({
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .default([]),
});

export const shoppingAssistantReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => chatInput.parse(d))
  .handler(async ({ data }): Promise<ShoppingAssistantResult> => {
    const ws = await loadWorkspaceContext(data.workspaceId);
    const contactCtx = data.contactId
      ? await loadContactContext(data.workspaceId, data.contactId)
      : null;
    const catalog = summarizeProducts(ws.products, 60);

    const system = `You are a friendly shopping assistant for a WhatsApp Commerce brand. Recommend products from ONLY the provided catalog.
Respond in JSON:
{"reply":"conversational message with 1-3 product suggestions","suggestedProductIds":["<id>", ...]}
Keep the reply concise, warm, and end with a question that moves the customer forward.`;

    const historyLines = data.history
      .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
      .join("\n");
    const user = `CATALOG:\n${JSON.stringify(catalog)}\n\nCUSTOMER:\n${JSON.stringify(contactCtx?.contact ?? null)}\n\nHISTORY:\n${historyLines}\n\nNEW MESSAGE:\n${data.message}`;
    return (await callGateway<ShoppingAssistantResult>(system, user, {
      json: true,
    })) as ShoppingAssistantResult;
  });

// ---------- Order Summary ----------

const orderInput = z.object({ workspaceId: z.string().uuid(), orderId: z.string().uuid() });

export const summarizeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data }): Promise<OrderSummaryResult> => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: order } = await supabaseAdmin
      .from("commerce_orders")
      .select("*, commerce_order_items(*, products(name)), contacts(name,display_name,email,phone)")
      .eq("id", data.orderId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");
    const system = `Summarize a commerce order for the internal team. Return JSON: {"headline":"","summary":"","highlights":[""],"followUps":[""]}.`;
    return (await callGateway<OrderSummaryResult>(system, JSON.stringify(order), {
      json: true,
    })) as OrderSummaryResult;
  });

// ---------- Natural Language Product Search ----------

const searchInput = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(12),
});

export const naturalLanguageSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => searchInput.parse(d))
  .handler(async ({ data }): Promise<NLSearchResult> => {
    const ws = await loadWorkspaceContext(data.workspaceId);
    const catalog = summarizeProducts(ws.products, 150);
    const system = `You are a product search engine. Given a natural language query and a catalog, return the best matches.
JSON shape:
{"interpretedQuery":"","filters":{"categories":[],"brands":[],"tags":[],"priceMin":null,"priceMax":null,"keywords":[]},"productIds":["<id>", ...],"explanation":""}
Return at most ${data.limit} productIds, ordered best-first. Only IDs from the catalog.`;
    return (await callGateway<NLSearchResult>(
      system,
      `QUERY: ${data.query}\n\nCATALOG:\n${JSON.stringify(catalog)}`,
      { json: true },
    )) as NLSearchResult;
  });

// ---------- Customer Preferences ----------

const contactInput = z.object({ workspaceId: z.string().uuid(), contactId: z.string().uuid() });

export const analyzeCustomerPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data }): Promise<CustomerPreferencesResult> => {
    const ctx = await loadContactContext(data.workspaceId, data.contactId);
    if (!ctx.contact) throw new Error("Contact not found");
    const system = `Analyze this customer's shopping preferences from their profile and order history. Return JSON:
{"favoriteCategories":[],"favoriteBrands":[],"averageOrderValue":0,"buyingCadenceDays":null,"preferredChannel":null,"personaSummary":"","interests":[]}`;
    return (await callGateway<CustomerPreferencesResult>(system, JSON.stringify(ctx), {
      json: true,
    })) as CustomerPreferencesResult;
  });

// ---------- Purchase Prediction ----------

export const predictPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data }): Promise<PurchasePredictionResult> => {
    const ctx = await loadContactContext(data.workspaceId, data.contactId);
    const ws = await loadWorkspaceContext(data.workspaceId);
    const system = `Predict the likelihood this customer purchases in the near term. Consider cadence, recency, LTV, active carts. Return JSON:
{"probability":0,"timeframe":"7d","confidence":"low","drivers":[{"label":"","impact":"positive"}],"suggestedProductIds":[],"narrative":""}
probability is 0-100. timeframe one of 24h|7d|30d|90d. Only use productIds from catalog.`;
    const payload = { customer: ctx, catalog: summarizeProducts(ws.products, 60) };
    return (await callGateway<PurchasePredictionResult>(system, JSON.stringify(payload), {
      json: true,
    })) as PurchasePredictionResult;
  });

// ---------- Revenue Prediction ----------

const revenueInput = z.object({
  workspaceId: z.string().uuid(),
  periodDays: z.number().int().min(7).max(365).default(30),
});

export const predictRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => revenueInput.parse(d))
  .handler(async ({ data }): Promise<RevenuePredictionResult> => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const since = new Date(Date.now() - data.periodDays * 3 * 86400000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("commerce_orders")
      .select("total,currency,status,payment_status,created_at")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    // Row zero mislabels a mixed-currency order history; resolved against the
    // workspace so the forecast the model returns is in the tenant's currency.
    const currency = await resolveAggregateCurrency(
      (orders ?? []) as Array<{ currency?: string | null }>,
      data.workspaceId,
    );
    const system = `Forecast next-period commerce revenue based on historical order data. Return JSON:
{"periodLabel":"","currency":"${currency}","worstCase":0,"commit":0,"bestCase":0,"growthPercent":0,"drivers":[],"narrative":""}`;
    const payload = { periodDays: data.periodDays, orders: orders ?? [] };
    return (await callGateway<RevenuePredictionResult>(system, JSON.stringify(payload), {
      json: true,
    })) as RevenuePredictionResult;
  });

// ---------- Abandoned Cart Recovery ----------

const cartInput = z.object({
  workspaceId: z.string().uuid(),
  cartId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  channel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
  tone: z.enum(["friendly", "urgent", "premium", "playful"]).default("friendly"),
  offerIncentive: z.boolean().default(true),
});

export const draftAbandonedCartRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => cartInput.parse(d))
  .handler(async ({ data }): Promise<AbandonedCartDraftResult> => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    let cart: Record<string, unknown> | null = null;
    if (data.cartId) {
      const { data: c } = await supabaseAdmin
        .from("commerce_carts")
        .select("*, commerce_cart_items(*, products(name,price,currency))")
        .eq("id", data.cartId)
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      cart = c ?? null;
    } else if (data.contactId) {
      const { data: c } = await supabaseAdmin
        .from("commerce_carts")
        .select("*, commerce_cart_items(*, products(name,price,currency))")
        .eq("contact_id", data.contactId)
        .eq("workspace_id", data.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cart = c ?? null;
    }
    if (!cart) throw new Error("No cart found to recover");
    const contactId = (cart.contact_id as string | null) ?? data.contactId ?? null;
    const contact = contactId
      ? (
          await sbAny(supabaseAdmin)
            .from("contacts")
            .select("name,display_name,email,phone,tags")
            .eq("id", contactId)
            .maybeSingle()
        ).data
      : null;
    const system = `Draft an abandoned cart recovery message. Return JSON:
{"channel":"${data.channel}","subject":"(email only, else null)","body":"","tone":"${data.tone}","incentiveIdea":"${data.offerIncentive ? "an idea" : ""}"}
Match the channel's tone: WhatsApp is short with an emoji or two, SMS <=160 chars, Email has a subject + 2-3 short paragraphs.
Reference the actual cart items and total. ${data.offerIncentive ? "Include a small incentive idea." : "Do not offer a discount."}`;
    return (await callGateway<AbandonedCartDraftResult>(
      system,
      JSON.stringify({ cart, contact, channel: data.channel }),
      { json: true },
    )) as AbandonedCartDraftResult;
  });

// ---------- Abandoned cart listing (used by dashboard) ----------

export const listAbandonedCarts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: carts, error } = await sbAny(context.supabase)
      .from("commerce_carts")
      .select(
        "id, contact_id, currency, updated_at, contacts(name,display_name,email,phone), commerce_cart_items(id, quantity, unit_price, products(name))",
      )
      .eq("workspace_id", data.workspaceId)
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return (carts ?? []).filter(
      (c) => Array.isArray(c.commerce_cart_items) && c.commerce_cart_items.length > 0,
    );
  });
