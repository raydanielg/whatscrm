import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

/**
 * Real per-day analytics for the active workspace, backed by the
 * `analytics_daily_summary` SQL function (migration 20260924120000).
 *
 * This replaces the fabricated `Math.random()` series the Analytics, Reports
 * and Omnichannel pages used to render in every mode. Days are UTC calendar
 * days; the function is SECURITY INVOKER, so RLS scopes it to the caller.
 */
export type AnalyticsDay = {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  /** Short axis label, e.g. "Sep 24". */
  day: string;
  /** Message count keyed by `inbox_channel` enum value (whatsapp, email, ). */
  byChannel: Record<string, number>;
  messages: number;
  sent: number;
  delivered: number;
  read: number;
  conversations: number;
  avgFirstResponseSec: number | null;
  firstResponseCount: number;
  avgResolutionMin: number | null;
  resolvedCount: number;
  csatAvg: number | null;
  csatCount: number;
};

export type AnalyticsTotals = {
  messages: number;
  sent: number;
  delivered: number;
  read: number;
  conversations: number;
  /** delivered / sent, or null when nothing was sent in the window. */
  deliveryRate: number | null;
  /** read / sent, or null when nothing was sent in the window. */
  readRate: number | null;
  avgFirstResponseSec: number | null;
  avgResolutionMin: number | null;
  csat: number | null;
  csatCount: number;
};

type RpcRow = {
  day: string;
  msgs_by_channel: Record<string, number> | null;
  messages_total: number | string;
  outbound_sent: number | string;
  outbound_delivered: number | string;
  outbound_read: number | string;
  conversations_opened: number | string;
  avg_first_response_sec: number | string | null;
  first_response_count: number | string;
  avg_resolution_min: number | string | null;
  resolved_count: number | string;
  csat_avg: number | string | null;
  csat_count: number | string;
};

const EMPTY: AnalyticsDay[] = [];

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));
const numOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

function axisLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function toDay(r: RpcRow): AnalyticsDay {
  const byChannel: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.msgs_by_channel ?? {})) byChannel[k] = Number(v);
  return {
    date: r.day,
    day: axisLabel(r.day),
    byChannel,
    messages: num(r.messages_total),
    sent: num(r.outbound_sent),
    delivered: num(r.outbound_delivered),
    read: num(r.outbound_read),
    conversations: num(r.conversations_opened),
    avgFirstResponseSec: numOrNull(r.avg_first_response_sec),
    firstResponseCount: num(r.first_response_count),
    avgResolutionMin: numOrNull(r.avg_resolution_min),
    resolvedCount: num(r.resolved_count),
    csatAvg: numOrNull(r.csat_avg),
    csatCount: num(r.csat_count),
  };
}

/** Weighted mean of per-day averages, weighted by how many rows fed each one. */
function weighted(pairs: Array<[avg: number | null, n: number]>): number | null {
  let sum = 0;
  let n = 0;
  for (const [avg, count] of pairs) {
    if (avg == null || count <= 0) continue;
    sum += avg * count;
    n += count;
  }
  return n > 0 ? sum / n : null;
}

export function summarizeAnalytics(rows: AnalyticsDay[]): AnalyticsTotals {
  let messages = 0, sent = 0, delivered = 0, read = 0, conversations = 0, csatCount = 0;
  for (const r of rows) {
    messages += r.messages;
    sent += r.sent;
    delivered += r.delivered;
    read += r.read;
    conversations += r.conversations;
    csatCount += r.csatCount;
  }
  return {
    messages,
    sent,
    delivered,
    read,
    conversations,
    deliveryRate: sent > 0 ? delivered / sent : null,
    readRate: sent > 0 ? read / sent : null,
    avgFirstResponseSec: weighted(rows.map((r) => [r.avgFirstResponseSec, r.firstResponseCount])),
    avgResolutionMin: weighted(rows.map((r) => [r.avgResolutionMin, r.resolvedCount])),
    csat: weighted(rows.map((r) => [r.csatAvg, r.csatCount])),
    csatCount,
  };
}

/** Display label for an `inbox_channel` enum value. `voice`/`other` fold into "Other". */
export function channelLabel(channel: string): string {
  switch (channel) {
    case "whatsapp": return "WhatsApp";
    case "instagram": return "Instagram";
    case "messenger": return "Messenger";
    case "telegram": return "Telegram";
    case "email": return "Email";
    case "sms": return "SMS";
    case "webchat": return "Live Chat";
    default: return "Other";
  }
}

/** 0.9841 → "98.4%". Null (no data) renders as an em dash, never as 0%. */
export function formatRate(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

/** 192 → "3m 12s". Null (no data) renders as an em dash. */
export function formatSeconds(v: number | null): string {
  if (v == null) return "—";
  const s = Math.round(v);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function useAnalyticsSummary(days: number) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;

  const query = useQuery({
    queryKey: ["analytics-daily-summary", workspaceId, days],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsDay[]> => {
      const { data, error } = await sbAny(supabase).rpc("analytics_daily_summary", {
        _workspace_id: workspaceId,
        _days: days,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as RpcRow[]).map(toDay);
    },
  });

  const rows = query.data ?? EMPTY;
  const totals = useMemo(() => summarizeAnalytics(rows), [rows]);
  return { ...query, rows, totals };
}
