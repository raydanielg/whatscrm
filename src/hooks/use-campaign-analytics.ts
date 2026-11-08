import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useCampaigns, type CampaignRow } from "@/hooks/use-marketing";

export type Range = "7d" | "30d" | "90d" | "ytd" | "all";

const DAY = 86400_000;

function rangeStart(r: Range): Date {
  const now = new Date();
  if (r === "7d") return new Date(now.getTime() - 7 * DAY);
  if (r === "30d") return new Date(now.getTime() - 30 * DAY);
  if (r === "90d") return new Date(now.getTime() - 90 * DAY);
  if (r === "ytd") return new Date(now.getFullYear(), 0, 1);
  return new Date(0);
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export type EventRow = {
  id: string;
  campaign_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** Workspace-wide campaign_events since range start. */
export function useWorkspaceCampaignEvents(range: Range) {
  const { active } = useCurrentWorkspace();
  const since = rangeStart(range).toISOString();
  return useQuery({
    queryKey: ["ws-campaign-events", active?.id, range],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data: campaigns, error: e1 } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", active!.id);
      if (e1) throw e1;
      const ids = (campaigns ?? []).map((c) => c.id);
      if (ids.length === 0) return [] as EventRow[];
      const { data, error } = await supabase
        .from("campaign_events")
        .select("id, campaign_id, event_type, metadata, created_at")
        .in("campaign_id", ids)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });
}

export function useAudienceGrowth(range: Range) {
  const { active } = useCurrentWorkspace();
  const since = rangeStart(range).toISOString();
  return useQuery({
    queryKey: ["audience-growth", active?.id, range],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, created_at")
        .eq("workspace_id", active!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(20000);
      if (error) throw error;
      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", active!.id)
        .lt("created_at", since);
      return { rows: data ?? [], baseline: count ?? 0 };
    },
  });
}

/** Cost & revenue model. Overridable via workspace settings later. */
const COST_PER_MESSAGE = 0.005;
const CONVERSION_VALUE = 25;

export type Metrics = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  clicked: number;
  optedOut: number;
  conversions: number;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
  clickRate: number;
  conversionRate: number;
  optOutRate: number;
  revenue: number;
  cost: number;
  costPerCampaign: number;
  activeCampaigns: number;
  totalCampaigns: number;
};

function isConversion(ev: EventRow) {
  const t = ev.event_type.toLowerCase();
  return t === "conversion" || t === "converted" || t === "purchase";
}

function eventRevenue(ev: EventRow): number {
  const v = (ev.metadata as { value?: unknown })?.value;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : CONVERSION_VALUE;
}

export function computeMetrics(campaigns: CampaignRow[], events: EventRow[]): Metrics {
  const sent = campaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);
  const delivered = campaigns.reduce((s, c) => s + (c.delivered_count ?? 0), 0);
  const read = campaigns.reduce((s, c) => s + (c.read_count ?? 0), 0);
  const failed = campaigns.reduce((s, c) => s + (c.failed_count ?? 0), 0);
  const replied = campaigns.reduce((s, c) => s + (c.replied_count ?? 0), 0);
  const clicked = campaigns.reduce((s, c) => s + (c.clicked_count ?? 0), 0);
  const optedOut = campaigns.reduce((s, c) => s + (c.opted_out_count ?? 0), 0);
  const conv = events.filter(isConversion);
  const conversions = conv.length;
  const revenue = conv.reduce((s, e) => s + eventRevenue(e), 0);
  const cost = sent * COST_PER_MESSAGE;
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === "running" || c.status === "scheduled").length;
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  return {
    sent, delivered, read, failed, replied, clicked, optedOut, conversions,
    deliveryRate: div(delivered, sent),
    readRate: div(read, delivered),
    responseRate: div(replied, delivered),
    clickRate: div(clicked, delivered),
    conversionRate: div(conversions, delivered),
    optOutRate: div(optedOut, delivered),
    revenue,
    cost,
    costPerCampaign: div(cost, totalCampaigns),
    activeCampaigns,
    totalCampaigns,
  };
}

export type TrendPoint = {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  clicked: number;
  failed: number;
  conversions: number;
};

/** Build day-bucketed engagement series from events + campaign totals fallback. */
export function buildTrend(events: EventRow[], range: Range): TrendPoint[] {
  const start = rangeStart(range);
  const end = new Date();
  const days: Record<string, TrendPoint> = {};
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const k = dayKey(cursor);
    days[k] = { date: k, sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, failed: 0, conversions: 0 };
    cursor.setTime(cursor.getTime() + DAY);
  }
  for (const e of events) {
    const k = dayKey(new Date(e.created_at));
    const b = days[k];
    if (!b) continue;
    const t = e.event_type.toLowerCase();
    if (t === "sent") b.sent++;
    else if (t === "delivered") b.delivered++;
    else if (t === "read") b.read++;
    else if (t === "replied" || t === "reply") b.replied++;
    else if (t === "clicked" || t === "click") b.clicked++;
    else if (t === "failed") b.failed++;
    else if (isConversion(e)) b.conversions++;
  }
  return Object.values(days);
}

export function buildAudienceSeries(
  rows: { created_at: string }[],
  baseline: number,
  range: Range,
): { date: string; total: number; added: number }[] {
  const start = rangeStart(range);
  const end = new Date();
  const days: Record<string, { added: number }> = {};
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    days[dayKey(cursor)] = { added: 0 };
    cursor.setTime(cursor.getTime() + DAY);
  }
  for (const r of rows) {
    const k = dayKey(new Date(r.created_at));
    if (days[k]) days[k].added++;
  }
  let running = baseline;
  return Object.entries(days).map(([date, v]) => {
    running += v.added;
    return { date, total: running, added: v.added };
  });
}

export function topCampaigns(campaigns: CampaignRow[], events: EventRow[], limit = 8) {
  const revByCampaign = new Map<string, { conv: number; rev: number }>();
  for (const e of events) {
    if (!isConversion(e)) continue;
    const cur = revByCampaign.get(e.campaign_id) ?? { conv: 0, rev: 0 };
    cur.conv++;
    cur.rev += eventRevenue(e);
    revByCampaign.set(e.campaign_id, cur);
  }
  return campaigns
    .map((c) => {
      const r = revByCampaign.get(c.id) ?? { conv: 0, rev: 0 };
      const engagement = c.delivered_count > 0 ? (c.replied_count + c.clicked_count) / c.delivered_count : 0;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        sent: c.sent_count,
        delivered: c.delivered_count,
        read: c.read_count,
        replied: c.replied_count,
        clicked: c.clicked_count,
        conversions: r.conv,
        revenue: r.rev,
        engagement,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.engagement - a.engagement)
    .slice(0, limit);
}

export function useCampaignAnalytics(range: Range) {
  const campaignsQ = useCampaigns();
  const eventsQ = useWorkspaceCampaignEvents(range);
  const audienceQ = useAudienceGrowth(range);

  const campaigns = useMemo(() => campaignsQ.data ?? [], [campaignsQ.data]);
  const events = useMemo(() => eventsQ.data ?? [], [eventsQ.data]);
  const metrics = useMemo(() => computeMetrics(campaigns, events), [campaigns, events]);
  const trend = useMemo(() => buildTrend(events, range), [events, range]);
  const audience = useMemo(
    () => buildAudienceSeries(audienceQ.data?.rows ?? [], audienceQ.data?.baseline ?? 0, range),
    [audienceQ.data, range],
  );
  const top = useMemo(() => topCampaigns(campaigns, events), [campaigns, events]);

  return {
    isLoading: campaignsQ.isLoading || eventsQ.isLoading,
    campaigns,
    events,
    metrics,
    trend,
    audience,
    top,
  };
}
