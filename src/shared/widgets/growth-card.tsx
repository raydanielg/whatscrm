import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";
import { WidgetCard } from "./widget-card";
import { DeltaPill } from "./delta-pill";
import { formatCompact, formatPercent } from "./format";
import { Skeleton } from "./widget-skeleton";
import type { ReactNode } from "react";

export type GrowthCardProps = {
  label: string;
  current: number;
  previous?: number;
  series?: Array<{ x: string | number; y: number }>;
  timeframe?: string;
  icon?: ReactNode;
  loading?: boolean;
  goodWhen?: "up" | "down";
  className?: string;
};

export function GrowthCard({
  label,
  current,
  previous,
  series,
  timeframe = "vs last period",
  icon,
  loading,
  goodWhen = "up",
  className,
}: GrowthCardProps) {
  const change = previous && previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const direction: "up" | "down" | "flat" = change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
  return (
    <WidgetCard title={label} description={timeframe} icon={icon} action={null} className={className} bodyClassName="p-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {loading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <div className="font-display text-2xl font-semibold  text-foreground">
              {formatCompact(current)}
            </div>
          )}
          {!loading && previous !== undefined && (
            <DeltaPill value={formatPercent(change)} direction={direction} goodWhen={goodWhen} />
          )}
        </div>
        {series && series.length > 0 && (
          <div className="h-14 w-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="y" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
