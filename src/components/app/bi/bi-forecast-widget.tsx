import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { runForecastFn } from "@/lib/bi/bi.functions";
import type { ForecastResult, MetricKey } from "@/lib/bi/types";

interface Props {
  workspaceId: string;
  metric: MetricKey;
  title: string;
}

export function BiForecastWidget({ workspaceId, metric, title }: Props) {
  const [method, setMethod] = useState<"linear" | "ema">("linear");
  const [horizon, setHorizon] = useState(30);
  const runForecast = useServerFn(runForecastFn);

  const { data, isLoading } = useQuery({
    queryKey: ["bi.forecast", workspaceId, metric, method, horizon],
    queryFn: () => runForecast({ data: { workspaceId, metric, method, horizonDays: horizon } }) as Promise<ForecastResult>,
    staleTime: 60_000 * 10,
  });

  const combined = useMemo(() => {
    if (!data) return [];
    return [
      ...data.historical.map((p) => ({ t: p.t, actual: p.y, forecast: null })),
      ...data.projection.map((p) => ({ t: p.t, actual: null, forecast: p.y, low: p.low, high: p.high })),
    ];
  }, [data]);

  const splitIdx = data ? data.historical.length : 0;
  const splitDate = combined[splitIdx]?.t;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-control border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h3 className="font-display font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {data?.accuracy?.mape !== undefined ? `MAPE ${data.accuracy.mape.toFixed(1)}%` : "Forecast projection"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={method} onChange={(e) => setMethod(e.target.value as "linear" | "ema")}
            className="text-xs rounded-control border border-border bg-background px-2 py-1"
          >
            <option value="linear">Linear regression</option>
            <option value="ema">EMA smoothing</option>
          </select>
          <select
            value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}
            className="text-xs rounded-control border border-border bg-background px-2 py-1"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>
      <div className="h-64">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Computing forecast</div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={combined}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
              <XAxis dataKey="t" stroke="var(--color-muted-foreground)" fontSize={10} tickFormatter={(t) => t.slice(5, 10)} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={10} />
              <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              {splitDate && <ReferenceLine x={splitDate} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />}
              <Line dataKey="actual" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls={false} />
              <Line dataKey="forecast" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
