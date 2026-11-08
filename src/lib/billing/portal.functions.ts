/**
 * Customer billing portal — server functions.
 *
 * Read/write endpoints powering the self-service portal:
 *  - portal overview (customer, subscription, plan, payment methods, usage,
 *    referral credit balance, tax exemption flag)
 *  - payment methods list / delete / set-default
 *  - billing info (address, tax id, email, name)
 *  - coupon validation + application to metadata
 *  - referral credit balance & redemption history
 *  - subscription reactivation (clears cancel_at)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const orgOnly = z.object({ organization_id: z.string().uuid() });

/* -------------------------------------------------------------------------- */
/*  Overview                                                                   */
/* -------------------------------------------------------------------------- */

export const getPortalOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgOnly.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [customer, subscription, methods, payments] = await Promise.all([
      sbAny(supabase).from("billing_customers").select("*").eq("organization_id", data.organization_id).maybeSingle(),
      sbAny(supabase).from("subscriptions").select("*, plans(*)").eq("organization_id", data.organization_id).maybeSingle(),
      sbAny(supabase).from("payment_methods").select("*").eq("organization_id", data.organization_id).order("is_default", { ascending: false }),
      sbAny(supabase).from("payments").select("id, amount, currency, status, method, paid_at, reference, processor, processor_ref, created_at, invoice_id")
        .eq("organization_id", data.organization_id).order("created_at", { ascending: false }).limit(50),
    ]);

    const subMeta = (subscription.data?.metadata as Record<string, unknown> | null) ?? {};
    const referral = {
      credit_cents: Number(subMeta.referral_credit_cents ?? 0),
      referral_code: (subMeta.referral_code as string | null) ?? null,
      redemptions: Array.isArray(subMeta.referral_history) ? (subMeta.referral_history as Array<{ code: string; credit_cents: number; applied_at: string }>) : [],
    };
    const coupon = {
      code: (subMeta.coupon_code as string | null) ?? null,
      applied_at: (subMeta.coupon_applied_at as string | null) ?? null,
    };

    return {
      customer: customer.data ?? null,
      subscription: subscription.data ?? null,
      payment_methods: methods.data ?? [],
      recent_payments: payments.data ?? [],
      referral,
      coupon,
    };
  });

/* -------------------------------------------------------------------------- */
/*  Billing info (address, tax id, contact name/email)                         */
/* -------------------------------------------------------------------------- */

export const updateBillingInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      organization_id: z.string().uuid(),
      name: z.string().max(120).nullable().optional(),
      email: z.string().email().nullable().optional(),
      tax_id: z.string().max(64).nullable().optional(),
      billing_address: z
        .object({
          line1: z.string().max(200).optional().default(""),
          line2: z.string().max(200).optional().default(""),
          city: z.string().max(120).optional().default(""),
          state: z.string().max(120).optional().default(""),
          postal_code: z.string().max(30).optional().default(""),
          country: z.string().max(2).optional().default(""),
        })
        .optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const existing = await sbAny(supabase).from("billing_customers").select("*").eq("organization_id", data.organization_id).maybeSingle();
    const patch = {
      name: (data.name ?? existing.data?.name ?? null) as string | null,
      email: (data.email ?? existing.data?.email ?? null) as string | null,
      tax_id: (data.tax_id ?? existing.data?.tax_id ?? null) as string | null,
      billing_address: (data.billing_address ?? (existing.data?.billing_address as Record<string, unknown> | null) ?? {}) as never,
      updated_at: new Date().toISOString(),
    };
    if (existing.data) {
      await sbAny(supabase).from("billing_customers").update(patch).eq("id", existing.data.id);
      return { ok: true };
    }
    await sbAny(supabase).from("billing_customers").insert({
      organization_id: data.organization_id,
      provider: "manual",
      provider_customer_id: `manual_${data.organization_id}`,
      ...patch,
    });
    return { ok: true };
  });


/* -------------------------------------------------------------------------- */
/*  Payment methods                                                            */
/* -------------------------------------------------------------------------- */

export const setDefaultPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), payment_method_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await sbAny(supabase).from("payment_methods")
      .update({ is_default: false })
      .eq("organization_id", data.organization_id);
    await sbAny(supabase).from("payment_methods")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", data.payment_method_id)
      .eq("organization_id", data.organization_id);
    return { ok: true };
  });

export const removePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), payment_method_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await sbAny(supabase).from("payment_methods")
      .delete()
      .eq("id", data.payment_method_id)
      .eq("organization_id", data.organization_id);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Coupons & referrals                                                        */
/* -------------------------------------------------------------------------- */

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), code: z.string().min(2).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date();
    const c = await sbAny(supabase).from("coupons").select("*").ilike("code", data.code).maybeSingle();
    if (!c.data) return { ok: false as const, reason: "Coupon not found" };
    if (!c.data.is_active) return { ok: false as const, reason: "Coupon inactive" };
    if (c.data.redeem_by && new Date(c.data.redeem_by) < now) return { ok: false as const, reason: "Coupon expired" };
    if (c.data.max_redemptions && c.data.times_redeemed >= c.data.max_redemptions) {
      return { ok: false as const, reason: "Coupon fully redeemed" };
    }
    return {
      ok: true as const,
      coupon: {
        code: c.data.code,
        name: c.data.name,
        description: c.data.description,
        discount_type: c.data.discount_type,
        percent_off: c.data.percent_off,
        amount_off_cents: c.data.amount_off_cents,
        currency: c.data.currency,
        duration: c.data.duration,
        duration_in_months: c.data.duration_in_months,
      },
    };
  });

export const applyCouponToSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), code: z.string().min(2).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const c = await sbAny(supabase).from("coupons").select("*").ilike("code", data.code).maybeSingle();
    if (!c.data || !c.data.is_active) throw new Error("Coupon not valid");

    const sub = await sbAny(supabase).from("subscriptions").select("*").eq("organization_id", data.organization_id).maybeSingle();
    if (!sub.data) throw new Error("No active subscription to apply coupon to");

    const meta = { ...((sub.data.metadata as Record<string, unknown> | null) ?? {}) };
    meta.coupon_code = c.data.code;
    meta.coupon_applied_at = new Date().toISOString();

    await sbAny(supabase).from("subscriptions").update({ metadata: meta as never, updated_at: new Date().toISOString() }).eq("id", sub.data.id);
    await sbAny(supabase).from("coupons").update({ times_redeemed: (c.data.times_redeemed ?? 0) + 1 }).eq("id", c.data.id);
    return { ok: true };
  });

export const applyReferralCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), referral_code: z.string().min(3).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const sub = await sbAny(supabase).from("subscriptions").select("*").eq("organization_id", data.organization_id).maybeSingle();
    if (!sub.data) throw new Error("No active subscription");
    const meta = { ...((sub.data.metadata as Record<string, unknown> | null) ?? {}) };
    const history = Array.isArray(meta.referral_history) ? (meta.referral_history as Array<{ code: string; credit_cents: number; applied_at: string }>) : [];
    if (history.some((r) => r.code.toLowerCase() === data.referral_code.toLowerCase())) {
      throw new Error("Referral code already applied");
    }
    const credit = 1000; // $10.00 default referral credit
    history.push({ code: data.referral_code, credit_cents: credit, applied_at: new Date().toISOString() });
    meta.referral_history = history;
    meta.referral_credit_cents = Number(meta.referral_credit_cents ?? 0) + credit;
    await sbAny(supabase).from("subscriptions").update({ metadata: meta as never, updated_at: new Date().toISOString() }).eq("id", sub.data.id);
    return { ok: true, credit_cents: credit };
  });

/* -------------------------------------------------------------------------- */
/*  Subscription reactivation                                                  */
/* -------------------------------------------------------------------------- */

export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgOnly.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const sub = await sbAny(supabase).from("subscriptions").select("*").eq("organization_id", data.organization_id).maybeSingle();
    if (!sub.data) throw new Error("No subscription");
    await sbAny(supabase).from("subscriptions").update({
      cancel_at: null,
      canceled_at: null,
      status: sub.data.status === "canceled" ? "active" : sub.data.status,
      updated_at: new Date().toISOString(),
    }).eq("id", sub.data.id);
    return { ok: true };
  });
