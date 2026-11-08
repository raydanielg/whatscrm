/**
 * Billing service — thin server functions on top of the provider abstraction.
 *
 * These helpers are the ONLY way the app talks to billing. They:
 *   - resolve the organization's billing customer,
 *   - dispatch to the correct `BillingProvider` adapter,
 *   - persist snapshots to Supabase (subscriptions, billing_customers, billing_events).
 *
 * Payment gateway SDKs are never imported from route or component files.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { getBillingProvider, listBillingProviders } from "./providers";
import type { BillingProviderId } from "./providers/types";
import { sbAny } from "@/lib/supabase/untyped";

/** List available payment gateways (for admin UI). */
export const listProviders = createServerFn({ method: "GET" }).handler(async () => {
  return listBillingProviders();
});

/** Record a usage event for metered billing. Idempotent via idempotency_key. */
export const recordUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        meter_code: z.string().min(1),
        quantity: z.number().positive().default(1),
        occurred_at: z.string().datetime().optional(),
        idempotency_key: z.string().optional(),
        subscription_id: z.string().uuid().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await sbAny(supabase).from("usage_events").insert({
      organization_id: data.organization_id,
      meter_code: data.meter_code,
      quantity: data.quantity,
      occurred_at: data.occurred_at ?? new Date().toISOString(),
      idempotency_key: data.idempotency_key ?? null,
      subscription_id: data.subscription_id ?? null,
      metadata: data.metadata ?? {},
    });
    if (error && !error.message.includes("duplicate key")) throw error;
    return { ok: true };
  });

/** Get an organization's current billing overview (customer, subscription, quotas). */
export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [customer, subscription, quotas] = await Promise.all([
      sbAny(supabase).from("billing_customers").select("*").eq("organization_id", data.organization_id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("*, plans(*)")
        .eq("organization_id", data.organization_id)
        .maybeSingle(),
      supabase
        .from("tenant_quotas")
        .select("*")
        .eq("organization_id", data.organization_id)
        .gte("period_end", new Date().toISOString()),
    ]);
    return {
      customer: customer.data ?? null,
      subscription: subscription.data ?? null,
      quotas: quotas.data ?? [],
    };
  });

/**
 * Create a hosted checkout session for a plan.
 *
 * The gateway and the gateway-side price are resolved from the plan's
 * `plan_gateway_prices` links (Super Admin → Subscription Plans → Gateways),
 * honouring the platform/workspace gateway switches. When a link only carries
 * a hosted checkout URL, that URL is returned as-is.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        provider: z.string().optional(),
        workspace_id: z.string().uuid().nullable().optional(),
        plan_code: z.string(),
        quantity: z.number().int().positive().optional(),
        coupon_code: z.string().optional(),
        trial_days: z.number().int().nonnegative().optional(),
        success_url: z.string().url(),
        cancel_url: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createGatewayCheckout } = await import("./checkout.server");
    return createGatewayCheckout(sbAny(context.supabase), {
      organization_id: data.organization_id,
      plan_code: data.plan_code,
      workspace_id: data.workspace_id ?? null,
      provider: data.provider ?? null,
      quantity: data.quantity,
      coupon_code: data.coupon_code,
      trial_days: data.trial_days,
      success_url: data.success_url,
      cancel_url: data.cancel_url,
    });
  });


/** Open the customer portal for self-service billing management. */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        provider: z.string().default("stripe"),
        return_url: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { assertGatewayEnabled } = await import("./gateway-guard.server");
    await assertGatewayEnabled(supabase, data.provider);
    const provider = getBillingProvider(data.provider as BillingProviderId);
    const { data: customer } = await supabase
      .from("billing_customers")
      .select("provider_customer_id")
      .eq("organization_id", data.organization_id)
      .eq("provider", data.provider)
      .maybeSingle();
    if (!customer) throw new Error("No billing customer for this organization/provider");
    return provider.createCustomerPortalSession(
      { provider: data.provider as BillingProviderId, provider_customer_id: customer.provider_customer_id },
      data.return_url,
    );
  });

/* ------------------------------------------------------------------------- */
/*  Engine-facing server functions (subscription + invoice + payment + BI)   */
/*  Each dynamically imports its *.server helper to keep the client bundle   */
/*  small — top-level engine imports would pull the service-role client in.  */
/* ------------------------------------------------------------------------- */

async function assertOrgAdmin(supabase: any, org_id: string, user_id: string) {
  const { data, error } = await sbAny(supabase).rpc("has_org_role", {
    _org_id: org_id, _user_id: user_id, _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("forbidden");
}

/** Cancel the org's subscription (at period end by default). */
export const cancelOrgSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), at_period_end: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(sbAny(context.supabase), data.organization_id, context.userId);
    const { cancelSubscription } = await import("./subscription-engine.server");
    return cancelSubscription(sbAny(context.supabase), data.organization_id, { at_period_end: data.at_period_end });
  });

/** Change seat count on the active subscription. */
export const changeOrgSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), quantity: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(sbAny(context.supabase), data.organization_id, context.userId);
    const { changePlanSeats } = await import("./subscription-engine.server");
    return changePlanSeats(sbAny(context.supabase), data.organization_id, data.quantity);
  });

/** Draft an invoice for a subscription cycle. Admin only. */
export const draftInvoiceForOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      organization_id: z.string().uuid(),
      subscription_id: z.string().uuid(),
      period_start: z.string().datetime(),
      period_end: z.string().datetime(),
      coupon_code: z.string().optional(),
      finalize: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(sbAny(context.supabase), data.organization_id, context.userId);
    const { draftInvoice } = await import("./invoice-engine.server");
    return draftInvoice(sbAny(context.supabase), data);
  });

/** List invoices for the org (paginated). */
export const listOrgInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), limit: z.number().int().max(100).default(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("billing_invoices")
      .select("id, number, status, total_cents, amount_paid_cents, amount_due_cents, currency, period_start, period_end, issued_at, due_at, paid_at, hosted_url, pdf_url")
      .eq("organization_id", data.organization_id)
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

/** Inspect a quota (feature-limits gate). Any org member. */
export const inspectOrgQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      organization_id: z.string().uuid(),
      meter_code: z.string(),
      requested: z.number().int().positive().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { inspectQuota } = await import("./quota-manager.server");
    return inspectQuota(sbAny(context.supabase), data.organization_id, data.meter_code, data.requested ?? 1);
  });

/** Read the org's revenue snapshots (admins only). */
export const getRevenueSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), days: z.number().int().min(1).max(365).default(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(sbAny(context.supabase), data.organization_id, context.userId);
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: rows, error } = await sbAny(context.supabase)
      .from("billing_revenue_snapshots")
      .select("*")
      .eq("organization_id", data.organization_id)
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });
