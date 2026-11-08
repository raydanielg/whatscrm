// CRM & Sales analytics server functions.
// Provides aggregated data for lead sources, funnel, pipeline velocity, win rate,
// loss reasons, deal size, sales cycle, agent performance, revenue trends, LTV, CAC, forecast.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(730).default(90),
});

export interface CrmSalesAnalytics {
  range: { from: string; to: string; days: number };
  leadSources: { source: string; total: number; converted: number; conversionRate: number }[];
  leadConversion: {
    total: number;
    qualified: number;
    converted: number;
    lost: number;
    qualificationRate: number;
    conversionRate: number;
    avgDaysToConvert: number;
  };
  funnel: { stage: string; deals: number; value: number; probability: number; position: number }[];
  pipeline: {
    totalValue: number;
    weightedValue: number;
    openDeals: number;
    avgDealSize: number;
    avgVelocityDays: number;
    stagnantDeals: number;
  };
  winLoss: {
    won: number;
    lost: number;
    open: number;
    winRate: number;
    wonValue: number;
    lostValue: number;
    avgSalesCycleDays: number;
  };
  lossReasons: { reason: string; count: number; value: number }[];
  agents: {
    ownerId: string;
    name: string;
    won: number;
    lost: number;
    open: number;
    revenue: number;
    winRate: number;
  }[];
  revenueTrend: { date: string; revenue: number; deals: number }[];
  dealSizeTrend: { date: string; avg: number; count: number }[];
  ltv: { avgLtv: number; totalRevenue: number; totalCustomers: number };
  cac: { estimatedCac: number; totalSpend: number; newCustomers: number };
  forecast: { month: string; projected: number; weightedPipeline: number }[];
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const iso = (d: Date) => d.toISOString();
const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
const monthKey = (d: string | Date) => new Date(d).toISOString().slice(0, 7);

export const getCrmSalesAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<CrmSalesAnalytics> => {
    const { supabase } = context;
    const { workspaceId, days } = data;
    const from = daysAgo(days);
    const fromIso = iso(from);
    const toIso = iso(new Date());

    // Parallel fetches
    const [leadsRes, dealsRes, stagesRes, membersRes, historyRes] = await Promise.all([
      supabase
        .from("leads")
        .select("id, source, status, converted_at, qualified_at, created_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .gte("created_at", fromIso),
      supabase
        .from("deals")
        .select(
          "id, amount, currency, probability, status, stage_id, owner_id, source, loss_reason, created_at, actual_close_date, expected_close_date, contact_id",
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .gte("created_at", fromIso),
      supabase
        .from("deal_stages")
        .select("id, name, position, probability, is_won, is_lost")
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: true }),
      supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId),
      supabase
        .from("deal_stage_history")
        .select("deal_id, from_stage_id, to_stage_id, duration_seconds, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", fromIso),
    ]);

    const leads = leadsRes.data ?? [];
    const deals = dealsRes.data ?? [];
    const stages = stagesRes.data ?? [];
    const memberIds = (membersRes.data ?? []).map((m: any) => m.user_id).filter(Boolean);
    const history = historyRes.data ?? [];

    // Lookup owner names
    let ownerNames = new Map<string, string>();
    const ownerIds = Array.from(new Set(deals.map((d: any) => d.owner_id).filter(Boolean))) as string[];
    const allIds = Array.from(new Set([...ownerIds, ...memberIds])) as string[];
    if (allIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allIds);
      (profiles ?? []).forEach((p: any) => {
        ownerNames.set(p.id, p.full_name || p.email || "Unknown");
      });
    }

    // Lead sources
    const sourceMap = new Map<string, { total: number; converted: number }>();
    for (const l of leads) {
      const s = (l.source as string) || "Unknown";
      const rec = sourceMap.get(s) ?? { total: 0, converted: 0 };
      rec.total++;
      if (l.converted_at) rec.converted++;
      sourceMap.set(s, rec);
    }
    const leadSources = Array.from(sourceMap.entries())
      .map(([source, v]) => ({
        source,
        total: v.total,
        converted: v.converted,
        conversionRate: v.total ? (v.converted / v.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    // Lead conversion
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter((l: any) => l.qualified_at || l.status === "qualified" || l.converted_at).length;
    const convertedLeads = leads.filter((l: any) => !!l.converted_at).length;
    const lostLeads = leads.filter((l: any) => l.status === "lost" || l.status === "unqualified").length;
    const convertedTimes = leads
      .filter((l: any) => l.converted_at && l.created_at)
      .map((l: any) => (new Date(l.converted_at as string).getTime() - new Date(l.created_at).getTime()) / 86400_000);
    const avgDaysToConvert =
      convertedTimes.length > 0 ? convertedTimes.reduce((a: number, b: number) => a + b, 0) / convertedTimes.length : 0;
    const leadConversion = {
      total: totalLeads,
      qualified: qualifiedLeads,
      converted: convertedLeads,
      lost: lostLeads,
      qualificationRate: totalLeads ? (qualifiedLeads / totalLeads) * 100 : 0,
      conversionRate: totalLeads ? (convertedLeads / totalLeads) * 100 : 0,
      avgDaysToConvert,
    };

    // Funnel by stage
    const stageMap = new Map(stages.map((s: any) => [s.id, s]));
    const funnelAgg = new Map<string, { deals: number; value: number }>();
    for (const d of deals) {
      const key = d.stage_id || "unassigned";
      const agg = funnelAgg.get(key) ?? { deals: 0, value: 0 };
      agg.deals++;
      agg.value += Number(d.amount || 0);
      funnelAgg.set(key, agg);
    }
    const funnel = stages.map((s: any) => {
      const agg = funnelAgg.get(s.id) ?? { deals: 0, value: 0 };
      return {
        stage: s.name,
        deals: agg.deals,
        value: agg.value,
        probability: Number(s.probability || 0),
        position: s.position,
      };
    });

    // Pipeline metrics
    const openDeals = deals.filter((d: any) => d.status === "open");
    const wonDeals = deals.filter((d: any) => d.status === "won");
    const lostDeals = deals.filter((d: any) => d.status === "lost");
    const totalValue = openDeals.reduce((a: number, d: any) => a + Number(d.amount || 0), 0);
    const weightedValue = openDeals.reduce(
      (a: number, d: any) => a + Number(d.amount || 0) * (Number(d.probability || 0) / 100),
      0,
    );
    const avgDealSize =
      wonDeals.length > 0
        ? wonDeals.reduce((a: number, d: any) => a + Number(d.amount || 0), 0) / wonDeals.length
        : 0;

    // Velocity: avg duration from stage history
    const durations = history
      .filter((h: any) => h.duration_seconds)
      .map((h: any) => Number(h.duration_seconds) / 86400);
    const avgVelocityDays =
      durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;

    // Stagnant deals: open > 30 days since last activity (using created_at as proxy)
    const stagnantCutoff = daysAgo(30).getTime();
    const stagnantDeals = openDeals.filter((d: any) => new Date(d.created_at).getTime() < stagnantCutoff).length;

    // Sales cycle: avg from created to actual_close_date for won
    const cycles = wonDeals
      .filter((d: any) => d.actual_close_date)
      .map(
        (d: any) =>
          (new Date(d.actual_close_date as string).getTime() - new Date(d.created_at).getTime()) / 86400_000,
      );
    const avgSalesCycleDays =
      cycles.length > 0 ? cycles.reduce((a: number, b: number) => a + b, 0) / cycles.length : 0;

    const wonValue = wonDeals.reduce((a: number, d: any) => a + Number(d.amount || 0), 0);
    const lostValue = lostDeals.reduce((a: number, d: any) => a + Number(d.amount || 0), 0);
    const winRate = wonDeals.length + lostDeals.length > 0
      ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100
      : 0;

    // Loss reasons
    const lossMap = new Map<string, { count: number; value: number }>();
    for (const d of lostDeals) {
      const r = (d.loss_reason as string) || "Unspecified";
      const rec = lossMap.get(r) ?? { count: 0, value: 0 };
      rec.count++;
      rec.value += Number(d.amount || 0);
      lossMap.set(r, rec);
    }
    const lossReasons = Array.from(lossMap.entries())
      .map(([reason, v]) => ({ reason, count: v.count, value: v.value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Agents / owners
    const agentMap = new Map<
      string,
      { won: number; lost: number; open: number; revenue: number }
    >();
    for (const d of deals) {
      if (!d.owner_id) continue;
      const rec = agentMap.get(d.owner_id) ?? { won: 0, lost: 0, open: 0, revenue: 0 };
      if (d.status === "won") {
        rec.won++;
        rec.revenue += Number(d.amount || 0);
      } else if (d.status === "lost") rec.lost++;
      else rec.open++;
      agentMap.set(d.owner_id, rec);
    }
    const agents = Array.from(agentMap.entries())
      .map(([ownerId, v]) => ({
        ownerId,
        name: ownerNames.get(ownerId) || "Unknown",
        won: v.won,
        lost: v.lost,
        open: v.open,
        revenue: v.revenue,
        winRate: v.won + v.lost > 0 ? (v.won / (v.won + v.lost)) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    // Revenue trend by day (won deals with actual_close_date)
    const revMap = new Map<string, { revenue: number; deals: number }>();
    for (const d of wonDeals) {
      const dt = d.actual_close_date || d.created_at;
      const k = dayKey(dt as string);
      const rec = revMap.get(k) ?? { revenue: 0, deals: 0 };
      rec.revenue += Number(d.amount || 0);
      rec.deals++;
      revMap.set(k, rec);
    }
    // Fill trend with zero-days across range
    const revenueTrend: { date: string; revenue: number; deals: number }[] = [];
    const bucketDays = Math.min(days, 90);
    for (let i = bucketDays - 1; i >= 0; i--) {
      const k = dayKey(daysAgo(i));
      const rec = revMap.get(k) ?? { revenue: 0, deals: 0 };
      revenueTrend.push({ date: k, revenue: rec.revenue, deals: rec.deals });
    }

    // Deal size trend (avg won deal size per week)
    const sizeMap = new Map<string, { sum: number; count: number }>();
    for (const d of wonDeals) {
      const dt = d.actual_close_date || d.created_at;
      const k = dayKey(dt as string);
      const rec = sizeMap.get(k) ?? { sum: 0, count: 0 };
      rec.sum += Number(d.amount || 0);
      rec.count++;
      sizeMap.set(k, rec);
    }
    const dealSizeTrend = Array.from(sizeMap.entries())
      .map(([date, v]) => ({ date, avg: v.count ? v.sum / v.count : 0, count: v.count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    // LTV: total won revenue / distinct customers with won deal
    const customerRevenue = new Map<string, number>();
    for (const d of wonDeals) {
      const c = (d.contact_id as string) || (d as any).company_id;
      if (!c) continue;
      customerRevenue.set(c, (customerRevenue.get(c) ?? 0) + Number(d.amount || 0));
    }
    const totalCustomers = customerRevenue.size;
    const totalRevenue = wonValue;
    const avgLtv = totalCustomers ? totalRevenue / totalCustomers : 0;

    // CAC estimate: uses campaign spend if available
    let totalSpend = 0;
    try {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("budget, spend")
        .eq("workspace_id", workspaceId)
        .gte("created_at", fromIso);
      totalSpend = (campaigns ?? []).reduce(
        (a: number, c: any) => a + Number(c.spend ?? c.budget ?? 0),
        0,
      );
    } catch {
      totalSpend = 0;
    }
    const newCustomers = totalCustomers;
    const estimatedCac = newCustomers ? totalSpend / newCustomers : 0;

    // Forecast: next 3 months projected revenue from open deals with expected_close_date, weighted by probability
    const forecastMap = new Map<string, { projected: number; weightedPipeline: number }>();
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      forecastMap.set(monthKey(d), { projected: 0, weightedPipeline: 0 });
    }
    for (const d of openDeals) {
      if (!d.expected_close_date) continue;
      const k = monthKey(d.expected_close_date as string);
      const rec = forecastMap.get(k);
      if (!rec) continue;
      const weighted = Number(d.amount || 0) * (Number(d.probability || 0) / 100);
      rec.projected += Number(d.amount || 0);
      rec.weightedPipeline += weighted;
    }
    const forecast = Array.from(forecastMap.entries())
      .map(([month, v]) => ({ month, projected: v.projected, weightedPipeline: v.weightedPipeline }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));

    return {
      range: { from: fromIso, to: toIso, days },
      leadSources,
      leadConversion,
      funnel,
      pipeline: {
        totalValue,
        weightedValue,
        openDeals: openDeals.length,
        avgDealSize,
        avgVelocityDays,
        stagnantDeals,
      },
      winLoss: {
        won: wonDeals.length,
        lost: lostDeals.length,
        open: openDeals.length,
        winRate,
        wonValue,
        lostValue,
        avgSalesCycleDays,
      },
      lossReasons,
      agents,
      revenueTrend,
      dealSizeTrend,
      ltv: { avgLtv, totalRevenue, totalCustomers },
      cac: { estimatedCac, totalSpend, newCustomers },
      forecast,
    };
  });
