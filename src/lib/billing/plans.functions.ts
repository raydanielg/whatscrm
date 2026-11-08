/**
 * Subscription plan management — server functions.
 *
 * Public reads: listing active public plans (used by /pricing).
 * Authenticated reads: full plan catalog + current org subscription.
 * Admin writes: plan CRUD (super-admin only, enforced by RLS).
 * Member actions: start trial, change plan, cancel/pause/resume, recommendPlan.
 *
 * State transitions delegate to the subscription-engine when a real provider
 * is connected; otherwise we mutate the local `subscriptions` row directly
 * (manual/self-hosted billing mode).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

const planTierEnum = z.enum(["free", "starter", "professional", "growth", "business", "enterprise", "custom"]);
const planIntervalEnum = z.enum(["month", "year", "lifetime"]);

const planInputShape = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
  name: z.string().min(2).max(80),
  tier: planTierEnum,
  description: z.string().max(500).nullable().optional(),
  tagline: z.string().max(160).nullable().optional(),
  badge: z.string().max(40).nullable().optional(),
  cta_label: z.string().max(40).nullable().optional(),
  price_cents: z.number().int().min(0),
  currency: z.string().length(3).default("USD"),
  interval: planIntervalEnum,
  trial_days: z.number().int().min(0).max(365).default(0),
  features: z.record(z.any()).default({}),
  limits: z.record(z.any()).default({}),
  is_active: z.boolean().default(true),
  is_public: z.boolean().default(true),
  is_custom: z.boolean().default(false),
  highlight: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  monthly_plan_code: z.string().nullable().optional(),
});

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Public plan catalog — safe to call unauthenticated for the pricing page. */
export const listPublicPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supa = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supa
    .from("plans")
    .select("id, code, name, tier, description, tagline, badge, cta_label, price_cents, currency, interval, trial_days, features, limits, highlight, sort_order, is_custom, monthly_plan_code")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

/** Full catalog for admins (includes hidden/custom plans). */
export const listAllPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

/** Current subscription + plan for an org — used by the billing page. */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ organization_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("*, plan:plans!plan_id(*)")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    return sub ?? null;
  });

/* -------------------------------------------------------------------------- */
/*  Recommendations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Recommend a plan based on the org's recent usage — the org's peak
 * `messages_per_month` usage over the last 90 days is compared against each
 * plan's `limits.messages_per_month` and we pick the cheapest plan whose
 * limit still covers 1.25x observed peak. Falls back to Professional.
 */
export const recommendPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ organization_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const usage = await context.supabase
      .from("usage_events")
      .select("meter_code, quantity, occurred_at")
      .eq("organization_id", data.organization_id)
      .eq("meter_code", "messages")
      .gte("occurred_at", since);
    // Aggregate by month client-side (small volume).
    const monthly = new Map<string, number>();
    for (const row of usage.data ?? []) {
      const m = String((row as any).occurred_at).slice(0, 7);
      monthly.set(m, (monthly.get(m) ?? 0) + Number((row as any).quantity ?? 0));
    }
    const peak = Math.max(0, ...monthly.values());
    const projected = Math.ceil(peak * 1.25);

    const plans = await context.supabase
      .from("plans")
      .select("code, name, tier, price_cents, interval, limits, highlight")
      .eq("is_active", true).eq("is_public", true).eq("interval", "month")
      .order("price_cents", { ascending: true });

    const candidates = (plans.data ?? []).filter((p: any) => {
      const cap = Number((p.limits as any)?.messages_per_month ?? -1);
      return cap === -1 || cap >= projected;
    });
    const pick = candidates[0] ?? (plans.data ?? []).find((p: any) => p.tier === "professional") ?? null;
    return {
      recommended_plan: pick,
      observed_peak: peak,
      projected_next_month: projected,
      reason: pick
        ? `Based on your peak usage of ${peak.toLocaleString()} messages/month, ${pick.name} covers your projected load with headroom.`
        : "Not enough usage data yet — the Professional plan is a safe default.",
    };
  });

/* -------------------------------------------------------------------------- */
/*  Admin CRUD (super-admin only via RLS)                                      */
/* -------------------------------------------------------------------------- */

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => planInputShape.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("plans")
      .upsert(data as any, { onConflict: "code" })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const setPlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("plans")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Soft-delete: deactivate & hide (subscriptions FK restricts hard delete).
    const { error } = await context.supabase
      .from("plans")
      .update({ is_active: false, is_public: false })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Subscription lifecycle actions (org owner/admin)                           */
/* -------------------------------------------------------------------------- */

async function assertOrgAdmin(supabase: any, org_id: string, user_id: string) {
  const { data, error } = await sbAny(supabase).rpc("has_org_role", {
    _org_id: org_id, _user_id: user_id, _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("forbidden");
}

/** Start (or restart) a free trial on a plan. Local billing mode. */
export const startTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), plan_code: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const plan = await sbAny(context.supabase).from("plans").select("id, trial_days").eq("code", data.plan_code).maybeSingle();
    if (!plan.data) throw new Error("plan_not_found");
    const trialDays = Math.max(1, plan.data.trial_days || 14);
    const trialEnds = new Date(Date.now() + trialDays * 86400_000).toISOString();
    const patch = {
      organization_id: data.organization_id,
      plan_id: plan.data.id,
      status: "trialing" as const,
      trial_ends_at: trialEnds,
      current_period_start: new Date().toISOString(),
      current_period_end: trialEnds,
    };
    const { data: row, error } = await context.supabase
      .from("subscriptions")
      .upsert(patch, { onConflict: "organization_id" })
      .select("*, plan:plans!plan_id(*)")
      .single();
    if (error) throw error;
    return row;
  });

/** Immediately switch the org to another plan (upgrade or downgrade). */
export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      organization_id: z.string().uuid(),
      plan_code: z.string(),
      /** When true, effective at next renewal instead of immediately. */
      at_period_end: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const plan = await sbAny(context.supabase).from("plans").select("id, interval").eq("code", data.plan_code).maybeSingle();
    if (!plan.data) throw new Error("plan_not_found");

    const existing = await context.supabase
      .from("subscriptions").select("*").eq("organization_id", data.organization_id).maybeSingle();

    const now = new Date();
    const periodEnd = plan.data.interval === "year"
      ? new Date(now.getTime() + 365 * 86400_000)
      : plan.data.interval === "lifetime"
        ? null
        : new Date(now.getTime() + 30 * 86400_000);

    if (data.at_period_end && existing.data?.current_period_end) {
      // Schedule change via metadata; actual switch happens at renewal.
      const meta = { ...(existing.data.metadata as any ?? {}), pending_plan_id: plan.data.id };
      const { data: row, error } = await context.supabase
        .from("subscriptions")
        .update({ metadata: meta })
        .eq("organization_id", data.organization_id)
        .select("*, plan:plans!plan_id(*)")
        .single();
      if (error) throw error;
      return row;
    }

    const patch = {
      organization_id: data.organization_id,
      plan_id: plan.data.id,
      status: "active" as const,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd?.toISOString() ?? null,
      cancel_at: null,
      canceled_at: null,
    };
    const { data: row, error } = await context.supabase
      .from("subscriptions")
      .upsert(patch, { onConflict: "organization_id" })
      .select("*, plan:plans!plan_id(*)")
      .single();
    if (error) throw error;
    return row;
  });

/** Cancel the current subscription (at period end by default). */
export const cancelSubscriptionForOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      organization_id: z.string().uuid(),
      at_period_end: z.boolean().default(true),
      reason: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const existing = await context.supabase
      .from("subscriptions").select("*").eq("organization_id", data.organization_id).maybeSingle();
    if (!existing.data) throw new Error("no_active_subscription");

    const now = new Date().toISOString();
    const patch = data.at_period_end
      ? { cancel_at: existing.data.current_period_end ?? now, metadata: { ...(existing.data.metadata as any ?? {}), cancel_reason: data.reason } }
      : { status: "canceled" as const, canceled_at: now, cancel_at: now, metadata: { ...(existing.data.metadata as any ?? {}), cancel_reason: data.reason } };

    const { data: row, error } = await context.supabase
      .from("subscriptions").update(patch).eq("organization_id", data.organization_id)
      .select("*, plan:plans!plan_id(*)").single();
    if (error) throw error;
    return row;
  });

/** Pause the subscription — retains data but blocks feature access. */
export const pauseSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ organization_id: z.string().uuid(), resume_at: z.string().datetime().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { data: row, error } = await context.supabase
      .from("subscriptions")
      .update({ status: "paused", metadata: { paused_at: new Date().toISOString(), resume_at: data.resume_at ?? null } })
      .eq("organization_id", data.organization_id)
      .select("*, plan:plans!plan_id(*)").single();
    if (error) throw error;
    return row;
  });

/** Resume a paused subscription. */
export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ organization_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { data: row, error } = await context.supabase
      .from("subscriptions")
      .update({ status: "active" })
      .eq("organization_id", data.organization_id)
      .select("*, plan:plans!plan_id(*)").single();
    if (error) throw error;
    return row;
  });

/**
 * Lightweight "what plan am I on?" read for the public pricing pages.
 *
 * Resolves the caller's organization from their membership rows (RLS scopes
 * the read to orgs they belong to) and returns just the fields the pricing
 * page needs to badge the current tier. Returns null when the user has no
 * organization or no subscription row yet.
 */
export const getMyPlanSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: membership } = await context.supabase
      .from("organization_members")
      .select("organization_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const orgId = (membership as { organization_id?: string } | null)?.organization_id;
    if (!orgId) return null;

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end, cancel_at, plan:plans!plan_id(code, name, tier, interval)")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!sub) return null;

    const s = sub as unknown as {
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      cancel_at: string | null;
      plan: { code: string; name: string; tier: string; interval: string } | null;
    };
    return {
      organization_id: orgId,
      status: s.status,
      trial_ends_at: s.trial_ends_at,
      current_period_end: s.current_period_end,
      cancel_at: s.cancel_at,
      plan_code: s.plan?.code ?? null,
      plan_name: s.plan?.name ?? null,
      plan_tier: s.plan?.tier ?? null,
      plan_interval: s.plan?.interval ?? null,
    };
  });
