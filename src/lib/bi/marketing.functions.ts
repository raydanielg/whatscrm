// Marketing analytics server functions.
// Aggregates campaign performance, delivery/read/response/click/conversion/opt-out rates,
// audience growth, top campaigns, revenue & ROI, template performance, segment performance,
// and A/B testing results.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(730).default(90),
});

export interface CampaignPerf {
  id: string;
  name: string;
  status: string;
  channel: string;
  templateId: string | null;
  segmentId: string | null;
  contactListId: string | null;
  sentAt: string | null;
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  clicked: number;
  failed: number;
  optedOut: number;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
  clickRate: number;
  conversionRate: number;
  optOutRate: number;
  failureRate: number;
  revenue: number;
  cost: number;
  roi: number;
}

export interface MarketingAnalytics {
  range: { from: string; to: string; days: number };
  totals: {
    campaigns: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    clicked: number;
    optedOut: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
    responseRate: number;
    clickRate: number;
    conversionRate: number;
    optOutRate: number;
    revenue: number;
    cost: number;
    roi: number;
  };
  performanceTrend: {
    date: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    clicked: number;
    optedOut: number;
  }[];
  rateTrend: {
    date: string;
    deliveryRate: number;
    readRate: number;
    responseRate: number;
    clickRate: number;
    optOutRate: number;
  }[];
  audienceGrowth: {
    date: string;
    optedIn: number;
    optedOut: number;
    net: number;
    cumulative: number;
  }[];
  audienceTotals: {
    activeSubscribers: number;
    optedInPeriod: number;
    optedOutPeriod: number;
    netGrowth: number;
    growthRate: number;
  };
  topCampaigns: CampaignPerf[];
  campaigns: CampaignPerf[];
  campaignRevenue: {
    id: string;
    name: string;
    revenue: number;
    cost: number;
    roi: number;
    conversions: number;
  }[];
  templates: {
    id: string;
    name: string;
    campaigns: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    readRate: number;
    responseRate: number;
  }[];
  segments: {
    id: string;
    name: string;
    campaigns: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    readRate: number;
    responseRate: number;
    conversionRate: number;
  }[];
  abTests: {
    campaignId: string;
    campaignName: string;
    variants: {
      id: string;
      name: string;
      weight: number;
      sent: number;
      delivered: number;
      read: number;
      replied: number;
      clicked: number;
      isWinner: boolean;
      readRate: number;
      responseRate: number;
      clickRate: number;
    }[];
    winnerId: string | null;
    lift: number;
  }[];
}

const safeDiv = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export const getMarketingAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<MarketingAnalytics> => {
    const { supabase } = context;
    const days = data.days;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    // Campaigns in range
    const { data: campaignsRaw = [] } = await supabase
      .from("campaigns")
      .select(
        "id,name,status,channel,template_id,segment_id,contact_list_id,scheduled_at,started_at,completed_at,created_at,total_recipients,sent_count,delivered_count,read_count,replied_count,clicked_count,failed_count,opted_out_count,audience_snapshot"
      )
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    const campaigns: CampaignPerf[] = (campaignsRaw ?? []).map((c: any) => {
      const snap = (c.audience_snapshot ?? {}) as Record<string, any>;
      const cost = Number(snap.cost ?? snap.budget ?? 0) || 0;
      const revenue = Number(snap.revenue ?? snap.attributed_revenue ?? 0) || 0;
      const sent = c.sent_count ?? 0;
      const delivered = c.delivered_count ?? 0;
      const read = c.read_count ?? 0;
      const replied = c.replied_count ?? 0;
      const clicked = c.clicked_count ?? 0;
      const failed = c.failed_count ?? 0;
      const optedOut = c.opted_out_count ?? 0;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        channel: c.channel,
        templateId: c.template_id,
        segmentId: c.segment_id,
        contactListId: c.contact_list_id,
        sentAt: c.started_at ?? c.scheduled_at ?? c.created_at,
        totalRecipients: c.total_recipients ?? 0,
        sent,
        delivered,
        read,
        replied,
        clicked,
        failed,
        optedOut,
        deliveryRate: safeDiv(delivered, sent),
        readRate: safeDiv(read, delivered),
        responseRate: safeDiv(replied, delivered),
        clickRate: safeDiv(clicked, delivered),
        conversionRate: safeDiv(replied + clicked, delivered),
        optOutRate: safeDiv(optedOut, delivered),
        failureRate: safeDiv(failed, sent),
        revenue,
        cost,
        roi: cost > 0 ? ((revenue - cost) / cost) * 100 : 0,
      };
    });

    // Totals
    const agg = campaigns.reduce(
      (a, c) => {
        a.sent += c.sent;
        a.delivered += c.delivered;
        a.read += c.read;
        a.replied += c.replied;
        a.clicked += c.clicked;
        a.failed += c.failed;
        a.optedOut += c.optedOut;
        a.revenue += c.revenue;
        a.cost += c.cost;
        return a;
      },
      { sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, failed: 0, optedOut: 0, revenue: 0, cost: 0 }
    );

    // Performance trend from campaign_recipients timestamps in period
    const campaignIds = campaigns.map((c) => c.id);
    const trendMap = new Map<string, { sent: number; delivered: number; read: number; replied: number; clicked: number; optedOut: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      trendMap.set(dayKey(d), { sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, optedOut: 0 });
    }

    if (campaignIds.length > 0) {
      const { data: recipients = [] } = await supabase
        .from("campaign_recipients")
        .select("sent_at,delivered_at,read_at,replied_at,clicked_at,opted_out_at")
        .in("campaign_id", campaignIds)
        .gte("created_at", fromIso)
        .limit(100000);

      for (const r of recipients ?? []) {
        const bump = (ts: string | null, key: keyof typeof trendMap extends never ? never : "sent" | "delivered" | "read" | "replied" | "clicked" | "optedOut") => {
          if (!ts) return;
          const k = dayKey(new Date(ts));
          const b = trendMap.get(k);
          if (b) b[key] += 1;
        };
        bump((r as any).sent_at, "sent");
        bump((r as any).delivered_at, "delivered");
        bump((r as any).read_at, "read");
        bump((r as any).replied_at, "replied");
        bump((r as any).clicked_at, "clicked");
        bump((r as any).opted_out_at, "optedOut");
      }
    }

    const performanceTrend = Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v }));

    const rateTrend = performanceTrend.map((p) => ({
      date: p.date,
      deliveryRate: safeDiv(p.delivered, p.sent),
      readRate: safeDiv(p.read, p.delivered),
      responseRate: safeDiv(p.replied, p.delivered),
      clickRate: safeDiv(p.clicked, p.delivered),
      optOutRate: safeDiv(p.optedOut, p.delivered),
    }));

    // Audience growth from consent_records
    const { data: consents = [] } = await supabase
      .from("consent_records")
      .select("status,effective_at,revoked_at,created_at")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", fromIso)
      .limit(50000);

    const growthMap = new Map<string, { optedIn: number; optedOut: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      growthMap.set(dayKey(d), { optedIn: 0, optedOut: 0 });
    }
    let optedInPeriod = 0;
    let optedOutPeriod = 0;
    for (const c of consents ?? []) {
      const status = (c as any).status as string;
      if (status === "opted_in") {
        const k = dayKey(new Date((c as any).effective_at ?? (c as any).created_at));
        const b = growthMap.get(k);
        if (b) b.optedIn += 1;
        optedInPeriod += 1;
      }
      if ((c as any).revoked_at || status === "opted_out") {
        const rk = dayKey(new Date((c as any).revoked_at ?? (c as any).created_at));
        const b = growthMap.get(rk);
        if (b) b.optedOut += 1;
        optedOutPeriod += 1;
      }
    }
    let cumulative = 0;
    const audienceGrowth = Array.from(growthMap.entries()).map(([date, v]) => {
      const net = v.optedIn - v.optedOut;
      cumulative += net;
      return { date, optedIn: v.optedIn, optedOut: v.optedOut, net, cumulative };
    });

    const { count: activeSubs = 0 } = await supabase
      .from("consent_records")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("status", "opted_in")
      .is("revoked_at", null);

    const netGrowth = optedInPeriod - optedOutPeriod;
    const audienceTotals = {
      activeSubscribers: activeSubs ?? 0,
      optedInPeriod,
      optedOutPeriod,
      netGrowth,
      growthRate: (activeSubs ?? 0) > 0 ? (netGrowth / (activeSubs ?? 1)) * 100 : 0,
    };

    // Top campaigns by delivered
    const topCampaigns = [...campaigns].sort((a, b) => b.delivered - a.delivered).slice(0, 10);

    const campaignRevenue = campaigns
      .map((c) => ({
        id: c.id,
        name: c.name,
        revenue: c.revenue,
        cost: c.cost,
        roi: c.roi,
        conversions: c.replied + c.clicked,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Templates
    const templateIds = Array.from(new Set(campaigns.map((c) => c.templateId).filter(Boolean))) as string[];
    let templateNames = new Map<string, string>();
    if (templateIds.length > 0) {
      const { data: tpls = [] } = await supabase
        .from("wa_templates")
        .select("id,name")
        .in("id", templateIds);
      for (const t of tpls ?? []) templateNames.set((t as any).id, (t as any).name);
    }
    const tplAgg = new Map<string, { name: string; campaigns: number; sent: number; delivered: number; read: number; replied: number }>();
    for (const c of campaigns) {
      if (!c.templateId) continue;
      const key = c.templateId;
      const cur = tplAgg.get(key) ?? { name: templateNames.get(key) ?? "Unknown", campaigns: 0, sent: 0, delivered: 0, read: 0, replied: 0 };
      cur.campaigns += 1;
      cur.sent += c.sent;
      cur.delivered += c.delivered;
      cur.read += c.read;
      cur.replied += c.replied;
      tplAgg.set(key, cur);
    }
    const templates = Array.from(tplAgg.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        campaigns: v.campaigns,
        sent: v.sent,
        delivered: v.delivered,
        read: v.read,
        replied: v.replied,
        readRate: safeDiv(v.read, v.delivered),
        responseRate: safeDiv(v.replied, v.delivered),
      }))
      .sort((a, b) => b.delivered - a.delivered);

    // Segments (via segment_id or contact_list_id)
    const segIds = Array.from(new Set(campaigns.map((c) => c.segmentId).filter(Boolean))) as string[];
    const listIds = Array.from(new Set(campaigns.map((c) => c.contactListId).filter(Boolean))) as string[];
    const segNames = new Map<string, string>();
    if (segIds.length > 0) {
      const { data: segs = [] } = await supabase
        .from("customer_segments")
        .select("id,name")
        .in("id", segIds);
      for (const s of segs ?? []) segNames.set((s as any).id, (s as any).name);
    }
    if (listIds.length > 0) {
      const { data: lists = [] } = await supabase
        .from("contact_lists")
        .select("id,name")
        .in("id", listIds);
      for (const l of lists ?? []) segNames.set((l as any).id, `${(l as any).name} (list)`);
    }
    const segAgg = new Map<string, { name: string; campaigns: number; sent: number; delivered: number; read: number; replied: number; clicked: number }>();
    for (const c of campaigns) {
      const key = c.segmentId ?? c.contactListId;
      if (!key) continue;
      const cur = segAgg.get(key) ?? { name: segNames.get(key) ?? "Unnamed", campaigns: 0, sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0 };
      cur.campaigns += 1;
      cur.sent += c.sent;
      cur.delivered += c.delivered;
      cur.read += c.read;
      cur.replied += c.replied;
      cur.clicked += c.clicked;
      segAgg.set(key, cur);
    }
    const segments = Array.from(segAgg.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        campaigns: v.campaigns,
        sent: v.sent,
        delivered: v.delivered,
        read: v.read,
        replied: v.replied,
        readRate: safeDiv(v.read, v.delivered),
        responseRate: safeDiv(v.replied, v.delivered),
        conversionRate: safeDiv(v.replied + v.clicked, v.delivered),
      }))
      .sort((a, b) => b.delivered - a.delivered);

    // A/B tests
    const { data: variants = [] } = await supabase
      .from("campaign_ab_variants")
      .select("id,campaign_id,name,weight,sent_count,delivered_count,read_count,replied_count,clicked_count,is_winner")
      .eq("workspace_id", data.workspaceId)
      .in("campaign_id", campaignIds.length > 0 ? campaignIds : ["00000000-0000-0000-0000-000000000000"]);

    const variantsByCampaign = new Map<string, any[]>();
    for (const v of variants ?? []) {
      const arr = variantsByCampaign.get((v as any).campaign_id) ?? [];
      arr.push(v);
      variantsByCampaign.set((v as any).campaign_id, arr);
    }
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));
    const abTests = Array.from(variantsByCampaign.entries()).map(([cid, vs]) => {
      const perVariant = vs.map((v: any) => ({
        id: v.id,
        name: v.name,
        weight: Number(v.weight ?? 0),
        sent: v.sent_count ?? 0,
        delivered: v.delivered_count ?? 0,
        read: v.read_count ?? 0,
        replied: v.replied_count ?? 0,
        clicked: v.clicked_count ?? 0,
        isWinner: !!v.is_winner,
        readRate: safeDiv(v.read_count ?? 0, v.delivered_count ?? 0),
        responseRate: safeDiv(v.replied_count ?? 0, v.delivered_count ?? 0),
        clickRate: safeDiv(v.clicked_count ?? 0, v.delivered_count ?? 0),
      }));
      const sorted = [...perVariant].sort((a, b) => b.responseRate - a.responseRate);
      const winner = perVariant.find((v) => v.isWinner) ?? sorted[0];
      const runnerUp = sorted[1];
      const lift = winner && runnerUp && runnerUp.responseRate > 0
        ? ((winner.responseRate - runnerUp.responseRate) / runnerUp.responseRate) * 100
        : 0;
      return {
        campaignId: cid,
        campaignName: campaignById.get(cid)?.name ?? "Campaign",
        variants: perVariant,
        winnerId: winner?.id ?? null,
        lift,
      };
    });

    const totals = {
      campaigns: campaigns.length,
      sent: agg.sent,
      delivered: agg.delivered,
      read: agg.read,
      replied: agg.replied,
      clicked: agg.clicked,
      optedOut: agg.optedOut,
      failed: agg.failed,
      deliveryRate: safeDiv(agg.delivered, agg.sent),
      readRate: safeDiv(agg.read, agg.delivered),
      responseRate: safeDiv(agg.replied, agg.delivered),
      clickRate: safeDiv(agg.clicked, agg.delivered),
      conversionRate: safeDiv(agg.replied + agg.clicked, agg.delivered),
      optOutRate: safeDiv(agg.optedOut, agg.delivered),
      revenue: agg.revenue,
      cost: agg.cost,
      roi: agg.cost > 0 ? ((agg.revenue - agg.cost) / agg.cost) * 100 : 0,
    };

    return {
      range: { from: fromIso, to: toIso, days },
      totals,
      performanceTrend,
      rateTrend,
      audienceGrowth,
      audienceTotals,
      topCampaigns,
      campaigns,
      campaignRevenue,
      templates,
      segments,
      abTests,
    };
  });
