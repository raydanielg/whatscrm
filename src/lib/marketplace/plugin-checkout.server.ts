/**
 * Marketplace Buy-now — real Stripe Checkout for paid plugin listings.
 *
 * Flow:
 *   1. `startPluginCheckoutServer` reads the listing (`plugins`), verifies the
 *      Stripe gateway is enabled, and creates a live Stripe Checkout Session
 *      with `price_data` derived from the listing price (one-time for
 *      perpetual/one_time listings, recurring for subscription listings).
 *   2. Stripe redirects the buyer back; the `checkout.session.completed`
 *      webhook calls `fulfilPluginCheckout`, which issues the license,
 *      records the purchase + revenue share, and marks it paid.
 *
 * Free listings are fulfilled inline (no Stripe round trip).
 */
import { sbAny } from "@/lib/supabase/untyped";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";

const STRIPE_API = "https://api.stripe.com/v1";
export const PLUGIN_CHECKOUT_PURPOSE = "plugin_purchase";

function requireStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured for this platform yet. Add the Stripe secret key in Super Admin → Gateways before selling plugins.",
    );
  }
  return key;
}

function form(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    else if (typeof value === "object")
      for (const [k, v] of Object.entries(value as Record<string, unknown>))
        walk(`${prefix}[${k}]`, v);
    else params.append(prefix, String(value));
  };
  for (const [k, v] of Object.entries(body)) walk(k, v);
  return params;
}

async function stripePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireStripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form(body).toString(),
  });
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(`Stripe checkout failed: ${json.error?.message ?? res.statusText}`);
  return json as T;
}

export type StartPluginCheckoutInput = {
  pluginId: string;
  workspaceId: string;
  origin: string;
  seats?: number;
};

type PluginRow = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  price_cents: number;
  currency: string;
  pricing_model: string;
  status: string;
  is_public: boolean;
};

/** Creates a Stripe Checkout Session (or fulfils free listings inline). */
export async function startPluginCheckoutServer(
  supabase: any,
  userId: string,
  input: StartPluginCheckoutInput,
): Promise<{ free: boolean; url?: string; sessionId?: string; licenseId?: string }> {
  const seats = Math.max(1, Math.min(input.seats ?? 1, 500));

  const { data: plugin, error } = await sbAny(supabase)
    .from("plugins")
    .select("id, name, slug, tagline, price_cents, currency, pricing_model, status, is_public")
    .eq("id", input.pluginId)
    .maybeSingle();
  if (error) throw error;
  if (!plugin) throw new Error("Listing not found");
  const listing = plugin as PluginRow;
  if (!listing.is_public || listing.status !== "published")
    throw new Error("This listing is not available for purchase");

  const { data: release, error: releaseError } = await sbAny(supabase)
    .from("plugin_versions")
    .select("id, entry_url")
    .eq("plugin_id", listing.id)
    .eq("is_stable", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (releaseError) throw releaseError;
  if (!release?.entry_url) {
    throw new Error(
      "This plugin has no installable release yet. You cannot purchase it until its publisher publishes one.",
    );
  }

  const isSubscription = listing.pricing_model === "subscription";
  const amount = listing.price_cents * seats;

  // Free listing → issue the license immediately, no payment step.
  if (amount <= 0) {
    const { adminPurchasePlugin } = await import("@/lib/plugins/server/licensing.server");
    const res = await adminPurchasePlugin(
      {
        pluginId: listing.id,
        workspaceId: input.workspaceId,
        gateway: "manual",
        amountCents: 0,
        currency: (
          listing.currency || (await resolveWorkspaceCurrency(input.workspaceId))
        ).toUpperCase(),
        licenseType: "free",
        seats,
      },
      userId,
    );
    return { free: true, licenseId: res.license?.id };
  }

  const { assertGatewayEnabled } = await import("@/lib/billing/gateway-guard.server");
  await assertGatewayEnabled(supabase, "stripe");

  const currency = (
    listing.currency || (await resolveWorkspaceCurrency(input.workspaceId))
  ).toLowerCase();
  const successUrl = `${input.origin}/marketplace/plugins/${listing.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${input.origin}/marketplace/plugins/${listing.slug}?checkout=cancelled`;

  const metadata = {
    wacrm_purpose: PLUGIN_CHECKOUT_PURPOSE,
    plugin_id: listing.id,
    workspace_id: input.workspaceId,
    buyer_user_id: userId,
    seats: String(seats),
  };

  const session = await stripePost<{ id: string; url: string }>("/checkout/sessions", {
    mode: isSubscription ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: `${listing.id}:${input.workspaceId}`,
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          ...(isSubscription ? { recurring: { interval: "month" } } : {}),
          product_data: {
            name: listing.name,
            description: listing.tagline ?? undefined,
          },
        },
      },
    ],
    metadata,
    ...(isSubscription
      ? { subscription_data: { metadata } }
      : { payment_intent_data: { metadata } }),
  });

  return { free: false, url: session.url, sessionId: session.id };
}

/**
 * Webhook fulfilment for `checkout.session.completed` sessions created above.
 * Idempotent: a session already recorded in `plugin_purchases` is skipped.
 */
export async function fulfilPluginCheckout(
  session: any,
): Promise<{ handled: boolean; reason?: string }> {
  const meta = (session?.metadata ?? {}) as Record<string, string>;
  if (meta.wacrm_purpose !== PLUGIN_CHECKOUT_PURPOSE)
    return { handled: false, reason: "not a plugin checkout" };
  if (session.payment_status && session.payment_status !== "paid" && session.status !== "complete")
    return { handled: false, reason: "session not paid" };

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const reference = String(session.id);

  const existing = await sbAny(supabaseAdmin)
    .from("plugin_purchases")
    .select("id")
    .eq("gateway_reference", reference)
    .maybeSingle();
  if (existing.data) return { handled: true, reason: "already fulfilled" };

  const seats = Math.max(1, Number(meta.seats ?? "1") || 1);
  const amountCents = Number(session.amount_total ?? 0);
  const currency = String(session.currency ?? "usd").toUpperCase();
  const isSubscription = session.mode === "subscription";

  const { adminPurchasePlugin } = await import("@/lib/plugins/server/licensing.server");
  const res = await adminPurchasePlugin(
    {
      pluginId: meta.plugin_id,
      workspaceId: meta.workspace_id,
      gateway: "stripe",
      gatewayReference: reference,
      amountCents,
      currency,
      licenseType: isSubscription ? "subscription" : "perpetual",
      seats,
    },
    meta.buyer_user_id,
  );

  // Stripe already collected the money — mark the purchase and share as paid.
  if (res.purchase?.id) {
    await sbAny(supabaseAdmin)
      .from("plugin_purchases")
      .update({ status: "paid" })
      .eq("id", res.purchase.id);
    await sbAny(supabaseAdmin)
      .from("plugin_revenue_shares")
      .update({ status: "paid" })
      .eq("purchase_id", res.purchase.id);
  }

  return { handled: true };
}
