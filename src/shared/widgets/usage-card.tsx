import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { cn } from "@/lib/utils";
import { formatBytes, formatCompact } from "./format";
import type { ReactNode } from "react";

export type UsageCardProps = Omit<WidgetCardProps, "children"> & {
  label?: string;
  used: number;
  limit: number;
  unit?: string;
  format?: (n: number) => string;
  breakdown?: Array<{ label: string; value: number; color?: string }>;
  resetLabel?: ReactNode;
};

const palette = [
  "var(--color-chart-1)",
  "var(--color-chart-3)",
  "var(--color-chart-5)",
  "var(--color-chart-7)",
];

export function UsageCard({
  label = "Usage",
  used,
  limit,
  unit = "",
  format = (n) => `${formatCompact(n)}${unit}`,
  breakdown,
  resetLabel,
  ...card
}: UsageCardProps) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const near = pct >= 80;
  const over = pct >= 100;
  return (
    <WidgetCard title={card.title ?? label} {...card}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="font-display text-2xl font-semibold  text-foreground">
          {format(used)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">/ {format(limit)}</span>
        </div>
        <div
          className={cn(
            "text-xs font-medium ",
            over ? "text-danger" : near ? "text-warning" : "text-muted-foreground",
          )}
        >
          {pct.toFixed(0)}%
        </div>
      </div>
      {breakdown && breakdown.length > 0 ? (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {breakdown.map((b, i) => (
            <div
              key={b.label}
              className="h-full"
              style={{
                width: `${(b.value / limit) * 100}%`,
                background: b.color ?? palette[i % palette.length],
              }}
              title={`${b.label}: ${format(b.value)}`}
            />
          ))}
        </div>
      ) : (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              over ? "bg-danger" : near ? "bg-warning" : "bg-accent",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {breakdown && breakdown.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {breakdown.map((b, i) => (
            <li key={b.label} className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: b.color ?? palette[i % palette.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.label}</span>
              <span className=" text-foreground">{format(b.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {resetLabel && <div className="mt-3 text-xs text-muted-foreground">{resetLabel}</div>}
    </WidgetCard>
  );
}

export type StorageCardProps = Omit<UsageCardProps, "format" | "unit"> & { bytesUsed?: boolean };

/**
 * StorageCard is UsageCard formatted with byte units. Pass `used`/`limit` in bytes.
 */
export function StorageCard({ used, limit, breakdown, ...rest }: StorageCardProps) {
  return (
    <UsageCard
      label="Storage"
      used={used}
      limit={limit}
      breakdown={breakdown}
      format={formatBytes}
      {...rest}
    />
  );
}
