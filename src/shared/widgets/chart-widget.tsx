import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WidgetCard, type WidgetCardProps } from "./widget-card";
import type { ReactNode } from "react";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-popover-foreground)",
};

type Series = { key: string; label?: string; color?: string };

export type ChartWidgetProps = Omit<WidgetCardProps, "children"> & {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Series[];
  variant?: "area" | "line" | "bar";
  height?: number;
  stacked?: boolean;
  legend?: boolean;
};

export function ChartWidget({
  data,
  xKey,
  series,
  variant = "area",
  height = 260,
  stacked,
  legend = true,
  ...card
}: ChartWidgetProps) {
  return (
    <WidgetCard {...card} bodyClassName="p-4 pt-2">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          {variant === "bar" ? (
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={xKey} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
              {legend && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  stackId={stacked ? "s" : undefined}
                />
              ))}
            </BarChart>
          ) : variant === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={xKey} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              {legend && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                {series.map((s, i) => (
                  <linearGradient key={s.key} id={`cw-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={xKey} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              {legend && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {series.map((s, i) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  fill={`url(#cw-${s.key})`}
                  stackId={stacked ? "s" : undefined}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  );
}

export type DonutWidgetProps = Omit<WidgetCardProps, "children"> & {
  data: Array<{ name: string; value: number; color?: string }>;
  height?: number;
  centerLabel?: ReactNode;
};

export function DonutWidget({ data, height = 240, centerLabel, ...card }: DonutWidgetProps) {
  return (
    <WidgetCard {...card} bodyClassName="p-4">
      <div className="relative" style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              stroke="var(--color-surface)"
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            {centerLabel}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

export { CHART_COLORS };
