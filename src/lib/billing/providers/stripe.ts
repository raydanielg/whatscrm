/**
 * Stripe adapter — default gateway for WACRM billing.
 *
 * This adapter is written against the Stripe REST API directly (no SDK) so it
 * runs in the Cloudflare Worker SSR runtime. Wire STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET via `add_secret` before enabling live billing.
 *
 * Every method throws a descriptive error until the corresponding Stripe call
 * is wired. The engine treats Stripe as the primary provider; unimplemented
 * methods surface as clear "not yet wired" errors during development.
 */

import type {
  BillingProvider,
  CheckoutSession,
  CheckoutSessionInput,
  CustomerInput,
  CustomerRef,
  InvoicePreview,
  PaymentIntent,
  PaymentIntentInput,
  Refund,
  RefundInput,
  SubscriptionSnapshot,
  UsageReport,
  WebhookEvent,
  WebhookVerifyInput,
} from "./types";
import { BillingProviderUnsupported } from "./types";

const STRIPE_API = "https://api.stripe.com/v1";

function requireKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Add it via secrets before using the Stripe billing adapter.",
    );
  }
  return key;
}

function form(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${k}]`, v);
      }
    } else {
      params.append(prefix, String(value));
    }
  };
  for (const [k, v] of Object.entries(body)) walk(k, v);
  return params;
}

async function stripeCall<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const key = requireKey();
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? form(body).toString() : undefined,
  });
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${json.error?.message ?? res.statusText}`);
  }
  return json as T;
}

export const stripeProvider: BillingProvider = {
  id: "stripe",
  displayName: "Stripe",
  supports: {
    checkout: true, customer_portal: true, usage_reporting: true, tax: true, coupons: true,
    payments: true, refunds: true, partial_refunds: true, webhooks: true,
  },

  async createCustomer(input: CustomerInput): Promise<CustomerRef> {
    const created = await stripeCall<{ id: string }>("POST", "/customers", {
      email: input.email,
      name: input.name,
      address: input.billing_address,
      tax_id_data: input.tax_id ? [{ type: "eu_vat", value: input.tax_id }] : undefined,
      metadata: { organization_id: input.organization_id, ...input.metadata },
    });
    return { provider: "stripe", provider_customer_id: created.id };
  },

  async updateCustomer(ref: CustomerRef, patch: Partial<CustomerInput>): Promise<void> {
    await stripeCall("POST", `/customers/${ref.provider_customer_id}`, {
      email: patch.email,
      name: patch.name,
      address: patch.billing_address,
      metadata: patch.metadata,
    });
  },

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const session = await stripeCall<{ id: string; url: string }>("POST", "/checkout/sessions", {
      mode: "subscription",
      customer: input.customer.provider_customer_id,
      line_items: [{ price: input.plan_code, quantity: input.quantity ?? 1 }],
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      subscription_data: {
        trial_period_days: input.trial_days,
        metadata: { organization_id: input.organization_id, ...input.metadata },
      },
      discounts: input.coupon_code ? [{ coupon: input.coupon_code }] : undefined,
      allow_promotion_codes: !input.coupon_code,
    });
    return { id: session.id, url: session.url, provider: "stripe" };
  },

  async createCustomerPortalSession(ref: CustomerRef, return_url: string) {
    const s = await stripeCall<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: ref.provider_customer_id,
      return_url,
    });
    return { url: s.url };
  },

  async getSubscription(id: string): Promise<SubscriptionSnapshot> {
    const s = await stripeCall<any>("GET", `/subscriptions/${id}`);
    return mapSubscription(s);
  },

  async cancelSubscription(id: string, at_period_end = true): Promise<SubscriptionSnapshot> {
    const s = at_period_end
      ? await stripeCall<any>("POST", `/subscriptions/${id}`, { cancel_at_period_end: true })
      : await stripeCall<any>("DELETE", `/subscriptions/${id}`);
    return mapSubscription(s);
  },

  async updateSubscriptionQuantity(id: string, quantity: number): Promise<SubscriptionSnapshot> {
    const sub = await stripeCall<any>("GET", `/subscriptions/${id}`);
    const itemId = sub?.items?.data?.[0]?.id;
    if (!itemId) throw new Error(`Stripe subscription ${id} has no items`);
    const updated = await stripeCall<any>("POST", `/subscriptions/${id}`, {
      items: [{ id: itemId, quantity }],
      proration_behavior: "create_prorations",
    });
    return mapSubscription(updated);
  },

  async reportUsage(input: UsageReport): Promise<void> {
    // Requires subscription_item id resolved from meter_code mapping.
    // This is orchestrated in the billing service layer; the raw call:
    if (!input.subscription_id) throw new Error("subscription_id required for Stripe usage reporting");
    await stripeCall("POST", `/subscription_items/${input.subscription_id}/usage_records`, {
      quantity: input.quantity,
      timestamp: Math.floor(new Date(input.occurred_at).getTime() / 1000),
      action: "increment",
    });
  },

  async previewInvoice(subscriptionId: string): Promise<InvoicePreview> {
    const inv = await stripeCall<any>("GET", `/invoices/upcoming?subscription=${subscriptionId}`);
    return {
      subtotal_cents: inv.subtotal ?? 0,
      tax_cents: inv.tax ?? 0,
      discount_cents: (inv.total_discount_amounts ?? []).reduce(
        (n: number, d: any) => n + (d.amount ?? 0),
        0,
      ),
      total_cents: inv.total ?? 0,
      currency: (inv.currency ?? "usd").toUpperCase(),
      line_items: (inv.lines?.data ?? []).map((l: any) => ({
        description: l.description ?? "Line item",
        amount_cents: l.amount ?? 0,
        quantity: l.quantity ?? 1,
      })),
    };
  },

  async verifyWebhook({ raw_body, signature, secret }: WebhookVerifyInput): Promise<WebhookEvent> {
    if (!signature) throw new Error("Missing Stripe signature header");
    // Stripe's signature format: t=<ts>,v1=<hex>
    const parts = Object.fromEntries(signature.split(",").map((p) => p.split("=") as [string, string]));
    const ts = parts.t;
    const v1 = parts.v1;
    if (!ts || !v1) throw new Error("Malformed Stripe signature");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${raw_body}`));
    const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (expected !== v1) throw new Error("Invalid Stripe signature");
    const event = JSON.parse(raw_body);
    return { provider: "stripe", id: event.id, type: event.type, data: event.data };
  },

  async createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    const headers: Record<string, unknown> = {};
    const pi = await stripeCall<any>("POST", "/payment_intents", {
      amount: input.amount_cents,
      currency: input.currency.toLowerCase(),
      customer: input.customer.provider_customer_id,
      description: input.description,
      metadata: {
        organization_id: input.organization_id,
        invoice_id: input.invoice_id,
        ...input.metadata,
      },
      automatic_payment_methods: { enabled: true },
    });
    return mapPaymentIntent(pi);
  },

  async getPayment(id: string): Promise<PaymentIntent> {
    const pi = await stripeCall<any>("GET", `/payment_intents/${id}`);
    return mapPaymentIntent(pi);
  },

  async retryPayment(id: string): Promise<PaymentIntent> {
    // Stripe: confirm() reattempts a requires_payment_method intent.
    const pi = await stripeCall<any>("POST", `/payment_intents/${id}/confirm`);
    return mapPaymentIntent(pi);
  },

  async refundPayment(input: RefundInput): Promise<Refund> {
    const r = await stripeCall<any>("POST", "/refunds", {
      payment_intent: input.provider_payment_id,
      amount: input.amount_cents,
      reason: input.reason,
      metadata: input.metadata,
    });
    return {
      provider: "stripe",
      provider_refund_id: r.id,
      provider_payment_id: input.provider_payment_id,
      amount_cents: r.amount ?? 0,
      currency: (r.currency ?? "usd").toUpperCase(),
      status: r.status === "succeeded" ? "succeeded" : r.status === "pending" ? "pending" : r.status === "failed" ? "failed" : "canceled",
      reason: r.reason ?? input.reason,
      created_at: new Date((r.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    };
  },
};

function mapPaymentIntent(pi: any): PaymentIntent {
  const stripeStatus = pi.status as string;
  const status: PaymentIntent["status"] =
    stripeStatus === "succeeded" ? "succeeded" :
    stripeStatus === "processing" ? "processing" :
    stripeStatus === "requires_action" || stripeStatus === "requires_confirmation" ? "requires_action" :
    stripeStatus === "canceled" ? "canceled" :
    stripeStatus === "requires_payment_method" ? "failed" : "pending";
  return {
    provider: "stripe",
    provider_payment_id: pi.id,
    provider_intent_id: pi.id,
    status,
    amount_cents: pi.amount ?? 0,
    currency: (pi.currency ?? "usd").toUpperCase(),
    next_action_url: pi.next_action?.redirect_to_url?.url,
    failure_code: pi.last_payment_error?.code,
    failure_message: pi.last_payment_error?.message,
    refunded_amount_cents: pi.amount_refunded ?? 0,
    metadata: pi.metadata ?? {},
  };
}

function mapSubscription(s: any): SubscriptionSnapshot {
  return {
    provider: "stripe",
    provider_subscription_id: s.id,
    provider_customer_id: s.customer,
    status: s.status,
    plan_code: s.items?.data?.[0]?.price?.id ?? "",
    quantity: s.items?.data?.[0]?.quantity ?? 1,
    current_period_start: new Date((s.current_period_start ?? 0) * 1000).toISOString(),
    current_period_end: new Date((s.current_period_end ?? 0) * 1000).toISOString(),
    trial_ends_at: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
    cancel_at: s.cancel_at ? new Date(s.cancel_at * 1000).toISOString() : null,
    canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
    metadata: s.metadata ?? {},
  };
}

// Type-guard to satisfy TS when adapter is used before being fully wired.
export function assertStripeSupports(cap: keyof BillingProvider["supports"]) {
  if (!stripeProvider.supports[cap]) throw new BillingProviderUnsupported("stripe", cap);
}
