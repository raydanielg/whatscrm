import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { runMetricQuery } from "@/lib/bi/bi.functions";
import type { MetricKey, MetricResult, DateRange } from "@/lib/bi/types";
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useCurrencyFormatter } from "@/hooks/use-currency";

interface Props {
  workspaceId: string;
  metric: MetricKey;
  title: string;
  chart?: "kpi" | "line" | "area" | "bar" | "number";
  range?: DateRange;
  unit?: "count" | "currency" | "percent";
  className?: string;
}

/** `money` is injected so the currency unit follows the tenant, not the dollar. */
function formatValue(v: number, unit: Props["unit"], money: (value: number) => string) {
  if (unit === "currency") return money(v);
  if (unit === "percent") return `${v.toFixed(1)}%`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export function BiMetricWidget({ workspaceId, metric, title, chart = "kpi", range = { preset: "last_30d" }, unit = "count", className }: Props) {
  const money = useCurrencyFormatter({ maximumFractionDigits: 0 });
  const run = useServerFn(runMetricQuery);
  const { data, isLoading } = useQuery({
    queryKey: ["bi.metric", workspaceId, metric, chart, range.preset, range.from, range.to],
    queryFn: () => run({ data: { workspaceId, query: { metric, range }, cacheTtlS: 60 } }) as Promise<MetricResult>,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const delta = data?.deltaPct ?? 0;
  const trendIcon = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus;
  const TrendIcon = trendIcon;
  const trendClass = delta > 1 ? "text-emerald-500" : delta < -1 ? "text-rose-500" : "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-control border border-border bg-surface p-4 flex flex-col gap-2 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        {data && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${trendClass}`}>
            <TrendIcon className="h-3 w-3" />
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-display font-semibold">
          {isLoading ? "" : formatValue(data?.total ?? 0, unit, money)}
        </span>
        {data?.previousTotal !== undefined && (
          <span className="text-xs text-muted-foreground">vs {formatValue(data.previousTotal, unit, money)}</span>
        )}
      </div>
      {chart !== "kpi" && chart !== "number" && data && data.series.length > 0 && (
        <div className="h-24 mt-1">
          <ResponsiveContainer>
            {chart === "bar" ? (
              <BarChart data={data.series}>
                <Bar dataKey="y" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
                <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              </BarChart>
            ) : chart === "area" ? (
              <AreaChart data={data.series}>
                <Area dataKey="y" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.2} />
                <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              </AreaChart>
            ) : (
              <LineChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                <XAxis dataKey="t" hide />
                <YAxis hide />
                <Line dataKey="y" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {data?.fromCache && <span className="text-[11px] text-muted-foreground">cached</span>}
    </motion.div>
  );
}
