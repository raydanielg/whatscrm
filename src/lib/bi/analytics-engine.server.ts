// Analytics engine — evaluates metric queries against Supabase tables.
// Server-only. Uses supabaseAdmin to bypass per-user RLS (workspace scoping is enforced by callers).

import type { MetricKey, MetricQuery, MetricResult, MetricResultPoint } from "./types";
import { bucketKey, defaultGranularity, resolveDateRange } from "./date-range";
import { sbAny } from "@/lib/supabase/untyped";

interface MetricBinding {
  table: string;
  dateColumn: string;
  valueColumn?: string; // when not provided, count(*)
  aggregation: "count" | "sum" | "avg";
  filter?: Record<string, unknown>;
}

const BINDINGS: Record<MetricKey, MetricBinding> = {
  "conversations.total":   { table: "conversations", dateColumn: "created_at", aggregation: "count" },
  "conversations.open":    { table: "conversations", dateColumn: "created_at", aggregation: "count", filter: { status: "open" } },
  "conversations.resolved":{ table: "conversations", dateColumn: "created_at", aggregation: "count", filter: { status: "resolved" } },
  "messages.sent":         { table: "messages", dateColumn: "created_at", aggregation: "count", filter: { direction: "outbound" } },
  "messages.delivered":    { table: "messages", dateColumn: "created_at", aggregation: "count", filter: { status: "delivered" } },
  "messages.read":         { table: "messages", dateColumn: "created_at", aggregation: "count", filter: { status: "read" } },
  "messages.failed":       { table: "messages", dateColumn: "created_at", aggregation: "count", filter: { status: "failed" } },
  "deals.count":           { table: "deals", dateColumn: "created_at", aggregation: "count" },
  "deals.won":             { table: "deals", dateColumn: "closed_at", aggregation: "count", filter: { status: "won" } },
  "deals.revenue":         { table: "deals", dateColumn: "closed_at", valueColumn: "amount", aggregation: "sum", filter: { status: "won" } },
  "deals.pipeline_value":  { table: "deals", dateColumn: "created_at", valueColumn: "amount", aggregation: "sum", filter: { status: "open" } },
  "campaigns.sent":        { table: "campaign_recipients", dateColumn: "created_at", aggregation: "count", filter: { status: "sent" } },
  "campaigns.delivered":   { table: "campaign_recipients", dateColumn: "created_at", aggregation: "count", filter: { status: "delivered" } },
  "campaigns.ctr":         { table: "campaign_events", dateColumn: "created_at", aggregation: "count", filter: { event: "click" } },
  "ai.requests":           { table: "ai_request_logs", dateColumn: "created_at", aggregation: "count" },
  "ai.tokens":             { table: "ai_request_logs", dateColumn: "created_at", valueColumn: "total_tokens", aggregation: "sum" },
  "ai.cost":               { table: "ai_request_logs", dateColumn: "created_at", valueColumn: "cost_usd", aggregation: "sum" },
  "workflow.runs":         { table: "workflow_runs", dateColumn: "created_at", aggregation: "count" },
  "workflow.errors":       { table: "workflow_runs", dateColumn: "created_at", aggregation: "count", filter: { status: "failed" } },
  "contacts.new":          { table: "contacts", dateColumn: "created_at", aggregation: "count" },
  "contacts.total":        { table: "contacts", dateColumn: "created_at", aggregation: "count" },
  "leads.new":             { table: "leads", dateColumn: "created_at", aggregation: "count" },
  "leads.qualified":       { table: "leads", dateColumn: "created_at", aggregation: "count", filter: { status: "qualified" } },
  "deals.lost":            { table: "deals", dateColumn: "closed_at", aggregation: "count", filter: { status: "lost" } },
};

interface AdminClient {
  from: (t: string) => {
    select: (s: string, opts?: { count?: "exact"; head?: boolean }) => any;
  };
}

export async function runMetric(
  supabaseAdmin: AdminClient,
  workspaceId: string,
  query: MetricQuery,
): Promise<MetricResult> {
  const binding = BINDINGS[query.metric];
  if (!binding) {
    return { metric: query.metric, total: 0, series: [], computedAt: new Date().toISOString() };
  }
  const { from, to, previousFrom, previousTo } = resolveDateRange(query.range);
  const granularity = query.granularity ?? defaultGranularity(query.range);

  const select = binding.valueColumn
    ? `${binding.dateColumn}, ${binding.valueColumn}`
    : binding.dateColumn;

  const buildQuery = (start: Date, end: Date) => {
    let q = sbAny(supabaseAdmin).from(binding.table).select(select);
    q = q.eq("workspace_id", workspaceId)
      .gte(binding.dateColumn, start.toISOString())
      .lte(binding.dateColumn, end.toISOString());
    if (binding.filter) for (const [k, v] of Object.entries(binding.filter)) q = q.eq(k, v);
    if (query.filters) for (const [k, v] of Object.entries(query.filters)) q = q.eq(k, v);
    return q.limit(50000);
  };

  const [{ data: currentRows, error }, { data: previousRows }] = await Promise.all([
    buildQuery(from, to),
    buildQuery(previousFrom, previousTo),
  ]);
  if (error) throw error;

  const rows = (currentRows ?? []) as unknown as Array<Record<string, unknown>>;
  const buckets = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const t = new Date(row[binding.dateColumn] as string);
    const key = bucketKey(t, granularity);
    const val = binding.valueColumn ? Number(row[binding.valueColumn] ?? 0) : 1;
    buckets.set(key, (buckets.get(key) ?? 0) + val);
    total += val;
  }

  let previousTotal = 0;
  for (const row of (previousRows ?? []) as unknown as Array<Record<string, unknown>>) {
    previousTotal += binding.valueColumn ? Number(row[binding.valueColumn] ?? 0) : 1;
  }

  const series: MetricResultPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([t, y]) => ({ t, y }));

  const deltaPct = previousTotal === 0 ? (total > 0 ? 100 : 0) : ((total - previousTotal) / previousTotal) * 100;

  return {
    metric: query.metric,
    total,
    previousTotal,
    deltaPct,
    series,
    computedAt: new Date().toISOString(),
  };
}

export const AVAILABLE_METRICS: MetricKey[] = Object.keys(BINDINGS) as MetricKey[];
