/**
 * Provider webhook normalization (server-only).
 *
 * Raw Stripe/Paddle webhook payloads are provider-shaped. Everything
 * downstream (subscription engine, payment engine, notifications) speaks a
 * single canonical shape, so this module is the one place that knows about
 * provider field names.
 *
 * Two jobs:
 *   1. Map the provider object to a `SubscriptionSnapshot` / payment record.
 *   2. Resolve the two identifiers the provider does not know about:
 *        - `organization_id` (metadata -> billing_customers -> subscriptions)
 *        - internal `plan_code` (plan_gateway_prices.external_price_id -> plans.code)
 *
 * Anything that cannot be resolved returns `kind: "ignored"` with a reason,
 * so the delivery is still ack'ed (200) and recorded in `billing_events`
 * instead of being retried forever by the provider.
 */

import type { SubscriptionSnapshot } from "./providers/types";
import { resolveOrganizationCurrency } from "@/lib/currency/resolve.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type NormalizedPayment = {
  organization_id: string;
  invoice_id?: string | null;
  subscription_id?: string | null;
  provider: string;
  provider_payment_id?: string | null;
  amount_cents: number;
  currency: string;
  status: "succeeded" | "failed";
  failure_code?: string | null;
  failure_message?: string | null;
  metadata?: Record<string, unknown>;
};

export type NormalizedEvent =
  | { kind: "subscription"; organization_id: string; snapshot: SubscriptionSnapshot }
  | { kind: "payment"; payment: NormalizedPayment; refresh_subscription_id?: string | null }
  | { kind: "ignored"; reason: string };

/* ------------------------------------------------------------------ */
/* Status mapping                                                      */
/* ------------------------------------------------------------------ */

const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "paused",
] as const;
type Status = (typeof SUBSCRIPTION_STATUSES)[number];

function mapStripeStatus(raw: string): Status {
  switch (raw) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "paused":
      return raw;
    case "unpaid":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "incomplete";
  }
}

function mapPaddleStatus(raw: string): Status {
  switch (raw) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "incomplete";
  }
}

/* ------------------------------------------------------------------ */
/* Identifier resolution                                               */
/* ------------------------------------------------------------------ */

/** Resolve the internal plan code from a gateway price/product id. */
export async function resolvePlanCodeFromExternal(
  supabase: Client,
  providerId: string,
  externalPriceId: string | null | undefined,
  externalProductId?: string | null,
): Promise<string | null> {
  if (!externalPriceId && !externalProductId) return null;

  const tryMatch = async (column: "external_price_id" | "external_product_id", value: string) => {
    const { data } = await supabase
      .from("plan_gateway_prices")
      .select("plan_id")
      .eq("provider_id", providerId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (!data?.plan_id) return null;
    const { data: plan } = await supabase
      .from("plans")
      .select("code")
      .eq("id", data.plan_id)
      .maybeSingle();
    return (plan?.code as string | undefined) ?? null;
  };

  if (externalPriceId) {
    const byPrice = await tryMatch("external_price_id", externalPriceId);
    if (byPrice) return byPrice;
  }
  if (externalProductId) {
    const byProduct = await tryMatch("external_product_id", externalProductId);
    if (byProduct) return byProduct;
  }

  // Last resort: the gateway price id may literally be our plan code
  // (older setups pushed `plan_code` straight into checkout).
  if (externalPriceId) {
    const { data: plan } = await supabase
      .from("plans")
      .select("code")
      .eq("code", externalPriceId)
      .maybeSingle();
    if (plan?.code) return plan.code as string;
  }
  return null;
}

/**
 * Resolve the owning organization for a provider object.
 * Order: explicit metadata -> billing_customers mapping -> existing subscription.
 */
export async function resolveOrganizationId(
  supabase: Client,
  providerId: string,
  hints: {
    metadata_organization_id?: string | null;
    provider_customer_id?: string | null;
    provider_subscription_id?: string | null;
  },
): Promise<string | null> {
  if (hints.metadata_organization_id) return hints.metadata_organization_id;

  if (hints.provider_customer_id) {
    const { data } = await supabase
      .from("billing_customers")
      .select("organization_id")
      .eq("provider", providerId)
      .eq("provider_customer_id", hints.provider_customer_id)
      .maybeSingle();
    if (data?.organization_id) return data.organization_id as string;
  }

  if (hints.provider_subscription_id) {
    const { data } = await supabase
      .from("subscriptions")
      .select("organization_id")
      .eq("provider_subscription_id", hints.provider_subscription_id)
      .maybeSingle();
    if (data?.organization_id) return data.organization_id as string;
  }
  return null;
}

/** Keep billing_customers in sync so later events resolve without metadata. */
async function ensureCustomerMapping(
  supabase: Client,
  providerId: string,
  organization_id: string,
  provider_customer_id: string | null | undefined,
) {
  if (!provider_customer_id) return;
  const { data } = await supabase
    .from("billing_customers")
    .select("id")
    .eq("provider", providerId)
    .eq("provider_customer_id", provider_customer_id)
    .maybeSingle();
  if (data?.id) return;
  await supabase
    .from("billing_customers")
    .upsert(
      { organization_id, provider: providerId, provider_customer_id },
      { onConflict: "organization_id,provider" },
    );
}

/* ------------------------------------------------------------------ */
/* Stripe                                                              */
/* ------------------------------------------------------------------ */

function stripeCustomerId(value: Any): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : (value.id ?? null);
}

async function normalizeStripe(
  supabase: Client,
  type: string,
  data: Any,
): Promise<NormalizedEvent> {
  const object = data?.object ?? data ?? {};

  if (type.startsWith("customer.subscription.")) {
    const customerId = stripeCustomerId(object.customer);
    const organization_id = await resolveOrganizationId(supabase, "stripe", {
      metadata_organization_id: object.metadata?.organization_id,
      provider_customer_id: customerId,
      provider_subscription_id: object.id,
    });
    if (!organization_id) return { kind: "ignored", reason: "unresolved_organization" };

    const item = object.items?.data?.[0] ?? {};
    const plan_code = await resolvePlanCodeFromExternal(
      supabase,
      "stripe",
      item.price?.id ?? item.plan?.id,
      item.price?.product ?? item.plan?.product,
    );
    if (!plan_code) return { kind: "ignored", reason: "unmapped_plan_price" };

    await ensureCustomerMapping(supabase, "stripe", organization_id, customerId);

    const deleted = type === "customer.subscription.deleted";
    const snapshot: SubscriptionSnapshot = {
      provider: "stripe",
      provider_subscription_id: object.id,
      provider_customer_id: customerId ?? "",
      status: deleted ? "canceled" : mapStripeStatus(String(object.status ?? "")),
      plan_code,
      quantity: item.quantity ?? 1,
      current_period_start: iso(object.current_period_start ?? item.current_period_start),
      current_period_end: iso(object.current_period_end ?? item.current_period_end),
      trial_ends_at: object.trial_end ? iso(object.trial_end) : null,
      cancel_at: object.cancel_at ? iso(object.cancel_at) : null,
      canceled_at: deleted
        ? iso(object.canceled_at ?? object.ended_at ?? Math.floor(Date.now() / 1000))
        : object.canceled_at
          ? iso(object.canceled_at)
          : null,
      metadata: object.metadata ?? {},
    };
    return { kind: "subscription", organization_id, snapshot };
  }

  if (type === "invoice.payment_succeeded" || type === "invoice.paid" || type === "invoice.payment_failed") {
    const customerId = stripeCustomerId(object.customer);
    const subscriptionId =
      typeof object.subscription === "string" ? object.subscription : (object.subscription?.id ?? null);
    const organization_id = await resolveOrganizationId(supabase, "stripe", {
      metadata_organization_id: object.metadata?.organization_id,
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
    });
    if (!organization_id) return { kind: "ignored", reason: "unresolved_organization" };

    const failed = type === "invoice.payment_failed";
    return {
      kind: "payment",
      refresh_subscription_id: subscriptionId,
      payment: {
        organization_id,
        provider: "stripe",
        subscription_id: subscriptionId,
        provider_payment_id:
          typeof object.payment_intent === "string"
            ? object.payment_intent
            : (object.payment_intent?.id ?? object.id ?? null),
        amount_cents: failed ? (object.amount_due ?? 0) : (object.amount_paid ?? object.amount_due ?? 0),
        currency: String(object.currency ?? "usd").toUpperCase(),
        status: failed ? "failed" : "succeeded",
        failure_code: object.last_finalization_error?.code ?? null,
        failure_message: object.last_finalization_error?.message ?? null,
        metadata: { invoice_id: object.id, hosted_invoice_url: object.hosted_invoice_url },
      },
    };
  }

  if (type === "checkout.session.completed") {
    const customerId = stripeCustomerId(object.customer);
    const organization_id = await resolveOrganizationId(supabase, "stripe", {
      metadata_organization_id: object.metadata?.organization_id ?? object.client_reference_id,
      provider_customer_id: customerId,
    });
    if (organization_id) await ensureCustomerMapping(supabase, "stripe", organization_id, customerId);
    // The follow-up `customer.subscription.created` carries the full state.
    return { kind: "ignored", reason: "checkout_recorded" };
  }

  return { kind: "ignored", reason: `unhandled:${type}` };
}

function iso(seconds: Any): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

/* ------------------------------------------------------------------ */
/* Paddle (Billing v2)                                                 */
/* ------------------------------------------------------------------ */

async function normalizePaddle(
  supabase: Client,
  type: string,
  data: Any,
): Promise<NormalizedEvent> {
  const object = data ?? {};

  if (type.startsWith("subscription.")) {
    const customerId = object.customer_id ?? null;
    const organization_id = await resolveOrganizationId(supabase, "paddle", {
      metadata_organization_id: object.custom_data?.organization_id,
      provider_customer_id: customerId,
      provider_subscription_id: object.id,
    });
    if (!organization_id) return { kind: "ignored", reason: "unresolved_organization" };

    const item = object.items?.[0] ?? {};
    const plan_code = await resolvePlanCodeFromExternal(
      supabase,
      "paddle",
      item.price?.id,
      item.price?.product_id ?? item.product?.id,
    );
    if (!plan_code) return { kind: "ignored", reason: "unmapped_plan_price" };

    await ensureCustomerMapping(supabase, "paddle", organization_id, customerId);

    const canceled = type === "subscription.canceled" || object.status === "canceled";
    const scheduledCancel =
      object.scheduled_change?.action === "cancel" ? object.scheduled_change.effective_at : null;

    const snapshot: SubscriptionSnapshot = {
      provider: "paddle",
      provider_subscription_id: object.id,
      provider_customer_id: customerId ?? "",
      status: canceled ? "canceled" : mapPaddleStatus(String(object.status ?? "")),
      plan_code,
      quantity: item.quantity ?? 1,
      current_period_start:
        object.current_billing_period?.starts_at ?? object.started_at ?? new Date().toISOString(),
      current_period_end:
        object.current_billing_period?.ends_at ?? object.next_billed_at ?? new Date().toISOString(),
      trial_ends_at: item.trial_dates?.ends_at ?? null,
      cancel_at: scheduledCancel,
      canceled_at: canceled ? (object.canceled_at ?? new Date().toISOString()) : null,
      metadata: object.custom_data ?? {},
    };
    return { kind: "subscription", organization_id, snapshot };
  }

  if (type === "transaction.completed" || type === "transaction.payment_failed") {
    const customerId = object.customer_id ?? null;
    const subscriptionId = object.subscription_id ?? null;
    const organization_id = await resolveOrganizationId(supabase, "paddle", {
      metadata_organization_id: object.custom_data?.organization_id,
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
    });
    if (!organization_id) return { kind: "ignored", reason: "unresolved_organization" };

    const failed = type === "transaction.payment_failed";
    const totals = object.details?.totals ?? {};
    const failedPayment = (object.payments ?? []).find((p: Any) => p.status === "error");
    return {
      kind: "payment",
      refresh_subscription_id: subscriptionId,
      payment: {
        organization_id,
        provider: "paddle",
        subscription_id: subscriptionId,
        provider_payment_id: object.id ?? null,
        amount_cents: Number(totals.grand_total ?? totals.total ?? 0),
        // Paddle always sends currency_code; a payload without one is malformed,
        // and the organization's own currency is a better guess than dollars for
        // a payment that is about to be recorded.
        currency: String(
          object.currency_code ?? (await resolveOrganizationCurrency(organization_id)),
        ).toUpperCase(),
        status: failed ? "failed" : "succeeded",
        failure_code: failedPayment?.error_code ?? null,
        failure_message: failedPayment?.error_code ? `Paddle: ${failedPayment.error_code}` : null,
        metadata: { transaction_id: object.id, invoice_number: object.invoice_number },
      },
    };
  }

  return { kind: "ignored", reason: `unhandled:${type}` };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function normalizeProviderEvent(
  supabase: Client,
  providerId: string,
  type: string,
  data: Any,
): Promise<NormalizedEvent> {
  // Pre-normalized events (internal replays / tests) pass straight through.
  if (data?.snapshot && data?.organization_id) {
    return { kind: "subscription", organization_id: data.organization_id, snapshot: data.snapshot };
  }
  if (providerId === "stripe") return normalizeStripe(supabase, type, data);
  if (providerId === "paddle") return normalizePaddle(supabase, type, data);
  return { kind: "ignored", reason: `unsupported_provider:${providerId}` };
}
