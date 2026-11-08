// Shared BI types (client-safe)

export type DashboardVisibility = "private" | "workspace" | "public";

export type WidgetType =
  | "kpi" | "line" | "bar" | "pie" | "area"
  | "table" | "funnel" | "heatmap" | "gauge" | "number" | "map";

export type ChartType =
  | "table" | "line" | "bar" | "pie" | "area"
  | "number" | "funnel" | "heatmap" | "gauge";

export type MetricKey =
  | "conversations.total"
  | "conversations.open"
  | "conversations.resolved"
  | "messages.sent"
  | "messages.delivered"
  | "messages.read"
  | "messages.failed"
  | "deals.count"
  | "deals.won"
  | "deals.lost"
  | "deals.revenue"
  | "deals.pipeline_value"
  | "campaigns.sent"
  | "campaigns.delivered"
  | "campaigns.ctr"
  | "ai.requests"
  | "ai.tokens"
  | "ai.cost"
  | "workflow.runs"
  | "workflow.errors"
  | "contacts.new"
  | "contacts.total"
  | "leads.new"
  | "leads.qualified";

export type DateRangePreset =
  | "today" | "yesterday"
  | "last_7d" | "last_14d" | "last_30d" | "last_90d"
  | "mtd" | "qtd" | "ytd" | "custom";

export interface DateRange {
  preset: DateRangePreset;
  from?: string;
  to?: string;
}

export interface Granularity {
  bucket: "hour" | "day" | "week" | "month" | "quarter" | "year";
}

export interface MetricQuery {
  metric: MetricKey;
  range: DateRange;
  granularity?: Granularity["bucket"];
  filters?: Record<string, unknown>;
  groupBy?: string[];
}

export interface MetricResultPoint {
  t: string; // ISO
  y: number;
  label?: string;
  group?: string;
}

export interface MetricResult {
  metric: MetricKey;
  total: number;
  previousTotal?: number;
  deltaPct?: number;
  series: MetricResultPoint[];
  computedAt: string;
  fromCache?: boolean;
}

export interface KpiDefinition {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description?: string | null;
  category: string;
  unit: "count" | "currency" | "percent" | "duration_ms";
  target?: number | null;
  direction: "higher" | "lower" | "neutral";
  formula: {
    source: MetricKey;
    aggregation?: "sum" | "avg" | "min" | "max" | "count";
    filters?: Record<string, unknown>;
  };
}

export interface WidgetConfig {
  metric?: MetricKey;
  range?: DateRange;
  granularity?: Granularity["bucket"];
  filters?: Record<string, unknown>;
  groupBy?: string[];
  thresholds?: { warning?: number; critical?: number };
  compare?: "previous_period" | "previous_year" | "none";
  colorScheme?: string;
}

export interface ForecastPoint { t: string; y: number; low?: number; high?: number }

export interface ForecastResult {
  metric: MetricKey;
  method: "linear" | "ema" | "holt_winters" | "arima" | "ai";
  horizonDays: number;
  historical: ForecastPoint[];
  projection: ForecastPoint[];
  accuracy?: { mape?: number; rmse?: number };
}
