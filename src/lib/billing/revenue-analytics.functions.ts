/**
 * SaaS revenue analytics — aggregates MRR, ARR, churn, LTV, ARPU,
 * revenue-by-plan / country, refunds, failed payments, trial conversions,
 * expansions / downgrades. Super-admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { normalizeCurrencyCode } from "@/lib/currency/format";
import { platformDefaultCurrency } from "@/lib/currency/resolve.server";

const RangeInput = z.object({
  range_days: z.number().int().min(7).max(730).default(90),
  // Absent → the platform's localization currency (USD only if none is set).
  currency: z.string().optional(),
});

type PlanRow = {
  id: string;
  name: string;
  code: string;
  price_cents: number;
  currency: string;
  interval: string;
};

const MONTHLY_FACTOR: Record<string, number> = {
  day: 30,
  week: 4.33,
  month: 1,
  quarter: 1 / 3,
  year: 1 / 12,
};

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

export const getRevenueAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => RangeInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);

    const currency =
      normalizeCurrencyCode(data.currency) ?? (await platformDefaultCurrency()) ?? "USD";
    const now = new Date();
    const rangeStart = new Date(now.getTime() - data.range_days * 86400_000);
    const rangeStartIso = rangeStart.toISOString();
    const prevRangeStart = new Date(
      rangeStart.getTime() - data.range_days * 86400_000,
    ).toISOString();

    // ---- Plans lookup
    const { data: plansData } = await sbAny(supabase)
      .from("plans")
      .select("id, name, code, price_cents, currency, interval");
    const plans = new Map<string, PlanRow>((plansData ?? []).map((p: any) => [p.id, p as PlanRow]));

    // ---- Subscriptions
    const { data: subs } = await supabase
      .from("subscriptions")
      .select(
        "id, organization_id, plan_id, status, seats, trial_ends_at, created_at, canceled_at, cancel_at, current_period_start, current_period_end, metadata",
      );
    const allSubs = (subs ?? []) as any[];

    let mrr = 0;
    let active = 0;
    let trialing = 0;
    let canceled = 0;
    let paused = 0;
    const revByPlan = new Map<string, { plan: string; mrr_cents: number; subs: number }>();

    for (const s of allSubs) {
      const p = plans.get(s.plan_id);
      if (!p || p.currency !== currency) continue;
      const factor = MONTHLY_FACTOR[p.interval] ?? 1;
      const monthly = Math.round(p.price_cents * (s.seats ?? 1) * factor);
      if (s.status === "active") {
        active++;
        mrr += monthly;
        const key = p.name;
        const cur = revByPlan.get(key) ?? { plan: key, mrr_cents: 0, subs: 0 };
        cur.mrr_cents += monthly;
        cur.subs += 1;
        revByPlan.set(key, cur);
      } else if (s.status === "trialing") trialing++;
      else if (s.status === "canceled") canceled++;
      else if (s.status === "paused") paused++;
    }

    // ---- Trial conversions (in range)
    const trialsStarted = allSubs.filter(
      (s) => s.trial_ends_at && new Date(s.created_at) >= rangeStart,
    ).length;
    const trialsConverted = allSubs.filter((s) => {
      if (!s.trial_ends_at) return false;
      if (new Date(s.created_at) < rangeStart) return false;
      return s.status === "active";
    }).length;
    const trialConversionRate = trialsStarted === 0 ? 0 : trialsConverted / trialsStarted;

    // ---- Churn: canceled in range vs active at start
    const churnedInRange = allSubs.filter(
      (s) => s.canceled_at && new Date(s.canceled_at) >= rangeStart,
    ).length;
    const activeAtStart = active + churnedInRange;
    const churnRate = activeAtStart === 0 ? 0 : churnedInRange / activeAtStart;

    // ---- Snapshot timeseries
    const { data: snaps } = await supabase
      .from("billing_revenue_snapshots")
      .select(
        "snapshot_date, mrr_cents, arr_cents, active_subscriptions, gross_revenue_cents, refunds_cents, net_revenue_cents, new_subscriptions, churned_subscriptions, churn_rate, currency",
      )
      .eq("currency", currency)
      .is("organization_id", null)
      .gte("snapshot_date", rangeStartIso.slice(0, 10))
      .order("snapshot_date", { ascending: true });

    const timeseries = (snaps ?? []).map((s: any) => ({
      date: s.snapshot_date,
      mrr: (s.mrr_cents ?? 0) / 100,
      arr: (s.arr_cents ?? 0) / 100,
      active: s.active_subscriptions ?? 0,
      gross: (s.gross_revenue_cents ?? 0) / 100,
      refunds: (s.refunds_cents ?? 0) / 100,
      net: (s.net_revenue_cents ?? 0) / 100,
      new_subs: s.new_subscriptions ?? 0,
      churned: s.churned_subscriptions ?? 0,
      churn_rate: Number(s.churn_rate ?? 0),
    }));

    // Growth vs previous window
    const first = timeseries[0];
    const last = timeseries[timeseries.length - 1];
    const monthlyGrowth = first && last && first.mrr > 0 ? (last.mrr - first.mrr) / first.mrr : 0;
    const annualGrowth = monthlyGrowth; // ARR = MRR*12; growth ratio identical

    // ---- Invoices in range for gross revenue, refunds, expansions/downgrades
    const { data: invoicesRaw } = await supabase
      .from("billing_invoices")
      .select(
        "id, organization_id, subscription_id, total_cents, amount_paid_cents, amount_refunded_cents, status, paid_at, currency, metadata",
      )
      .eq("currency", currency)
      .gte("paid_at", rangeStartIso);
    const invoices = (invoicesRaw ?? []) as any[];

    const grossRevenue = invoices.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0);
    const refundsTotal = invoices.reduce((s, i) => s + (i.amount_refunded_cents ?? 0), 0);

    // ---- Payment attempts: failed + refunds
    const { data: attemptsRaw } = await supabase
      .from("billing_payment_attempts")
      .select(
        "id, status, amount_cents, refunded_amount_cents, failure_reason, currency, created_at",
      )
      .eq("currency", currency)
      .gte("created_at", rangeStartIso);
    const attempts = (attemptsRaw ?? []) as any[];

    const failedPayments = attempts.filter((a) => a.status === "failed");
    const failedByReason = new Map<string, number>();
    for (const f of failedPayments) {
      const key = (f.failure_reason as string) || "unknown";
      failedByReason.set(key, (failedByReason.get(key) ?? 0) + 1);
    }

    // ---- Expansion / downgrade approximation via billing_events
    const { data: eventsRaw } = await supabase
      .from("billing_events")
      .select("event_type, payload, created_at")
      .in("event_type", [
        "subscription.upgraded",
        "subscription.downgraded",
        "subscription.expanded",
      ])
      .gte("created_at", rangeStartIso);
    const events = (eventsRaw ?? []) as any[];
    let expansionRevenue = 0;
    let downgradeLoss = 0;
    let upgrades = 0;
    let downgrades = 0;
    for (const ev of events) {
      const delta = Number(ev.payload?.mrr_delta_cents ?? 0);
      if (ev.event_type === "subscription.downgraded" || delta < 0) {
        downgradeLoss += Math.abs(delta);
        downgrades++;
      } else {
        expansionRevenue += delta;
        upgrades++;
      }
    }

    // ---- Revenue by country (via billing_customers)
    const orgIds = Array.from(new Set(invoices.map((i) => i.organization_id).filter(Boolean)));
    const revByCountry = new Map<string, number>();
    if (orgIds.length) {
      const { data: customersRaw } = await supabase
        .from("billing_customers")
        .select("organization_id, billing_address")
        .in("organization_id", orgIds);
      const countryByOrg = new Map<string, string>();
      for (const c of (customersRaw ?? []) as any[]) {
        const country = (c.billing_address as any)?.country ?? "Unknown";
        countryByOrg.set(c.organization_id, country);
      }
      for (const inv of invoices) {
        const country = countryByOrg.get(inv.organization_id) ?? "Unknown";
        revByCountry.set(country, (revByCountry.get(country) ?? 0) + (inv.amount_paid_cents ?? 0));
      }
    }

    // ---- LTV & ARPU
    const totalRevenueAllTimeRes = await supabase
      .from("billing_invoices")
      .select("amount_paid_cents", { count: "exact", head: false })
      .eq("currency", currency);
    const totalPaid = ((totalRevenueAllTimeRes.data ?? []) as any[]).reduce(
      (s, i) => s + (i.amount_paid_cents ?? 0),
      0,
    );
    const totalCustomers = Math.max(1, allSubs.length);
    const arpu = active === 0 ? 0 : mrr / active;
    const ltv = churnRate > 0 ? arpu / churnRate : arpu * 24; // fallback: 24 months
    const previousRangeInvoicesRes = await supabase
      .from("billing_invoices")
      .select("amount_paid_cents, paid_at")
      .eq("currency", currency)
      .gte("paid_at", prevRangeStart)
      .lt("paid_at", rangeStartIso);
    const previousGross = ((previousRangeInvoicesRes.data ?? []) as any[]).reduce(
      (s, i) => s + (i.amount_paid_cents ?? 0),
      0,
    );
    const revenueGrowth = previousGross === 0 ? 0 : (grossRevenue - previousGross) / previousGross;

    return {
      currency,
      range_days: data.range_days,
      generated_at: now.toISOString(),
      kpis: {
        mrr_cents: mrr,
        arr_cents: mrr * 12,
        monthly_growth: monthlyGrowth,
        annual_growth: annualGrowth,
        revenue_growth: revenueGrowth,
        active_subscriptions: active,
        trialing_subscriptions: trialing,
        canceled_subscriptions: canceled,
        paused_subscriptions: paused,
        trial_conversion_rate: trialConversionRate,
        trials_started: trialsStarted,
        trials_converted: trialsConverted,
        churn_rate: churnRate,
        churned_in_range: churnedInRange,
        expansion_revenue_cents: expansionRevenue,
        downgrade_loss_cents: downgradeLoss,
        upgrades,
        downgrades,
        gross_revenue_cents: grossRevenue,
        refunds_cents: refundsTotal,
        net_revenue_cents: grossRevenue - refundsTotal,
        failed_payments: failedPayments.length,
        failed_payments_amount_cents: failedPayments.reduce((s, f) => s + (f.amount_cents ?? 0), 0),
        arpu_cents: Math.round(arpu),
        ltv_cents: Math.round(ltv),
        total_paid_cents: totalPaid,
        total_customers: totalCustomers,
      },
      timeseries,
      revenue_by_plan: Array.from(revByPlan.values()).sort((a, b) => b.mrr_cents - a.mrr_cents),
      revenue_by_country: Array.from(revByCountry.entries())
        .map(([country, cents]) => ({ country, revenue_cents: cents }))
        .sort((a, b) => b.revenue_cents - a.revenue_cents),
      failed_by_reason: Array.from(failedByReason.entries()).map(([reason, count]) => ({
        reason,
        count,
      })),
      recent_failed_payments: failedPayments
        .slice(-10)
        .reverse()
        .map((f) => ({
          id: f.id,
          amount_cents: f.amount_cents ?? 0,
          reason: f.failure_reason ?? "unknown",
          created_at: f.created_at,
        })),
    };
  });

export type RevenueAnalytics = Awaited<ReturnType<typeof getRevenueAnalytics>>;
