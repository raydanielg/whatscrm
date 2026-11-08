import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { WidgetCard } from "./widget-card";
import { DeltaPill } from "./delta-pill";
import { formatCurrency } from "./format";
import { Skeleton } from "./widget-skeleton";
import type { ReactNode } from "react";
import { useTenantCurrency } from "@/hooks/use-currency";

export type RevenueCardProps = {
  label?: string;
  amount: number;
  currency?: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  timeframe?: string;
  series?: Array<{ x: string | number; y: number }>;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function RevenueCard({
  label = "Revenue",
  amount,
  currency,
  delta,
  timeframe = "Last 30 days",
  series,
  icon,
  loading,
  className,
}: RevenueCardProps) {
  // The caller may omit `currency`; the tenant's fills in rather than dollars.
  const tenantCurrency = useTenantCurrency();
  const resolvedCurrency = currency ?? tenantCurrency;
  return (
    <WidgetCard title={label} description={timeframe} icon={icon} action={null} className={className} bodyClassName="p-0">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-end justify-between gap-3">
          {loading ? (
            <Skeleton className="h-9 w-40" />
          ) : (
            <div className="font-display text-3xl font-semibold  tracking-tight text-foreground">
              {formatCurrency(amount, resolvedCurrency)}
            </div>
          )}
          {delta && !loading && <DeltaPill value={delta.value} direction={delta.direction} />}
        </div>
        {series && series.length > 0 && (
          <div className="h-20 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                  formatter={(v: number) => formatCurrency(v, resolvedCurrency)}
                />
                <Area
                  type="monotone"
                  dataKey="y"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#rev-fill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
