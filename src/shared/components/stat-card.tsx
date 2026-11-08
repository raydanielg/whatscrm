import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "./skeleton";

type StatCardProps = {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat"; goodWhen?: "up" | "down" };
  icon?: ReactNode;
  timeframe?: string;
  loading?: boolean;
  className?: string;
};

/**
 * KPI card used on dashboards per UI_STANDARDS §18. Handles its own loading
 * state and inverts delta color for "good-when-down" metrics (churn,
 * response time).
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  timeframe = "vs last 7d",
  loading,
  className,
}: StatCardProps) {
  const goodWhen = delta?.goodWhen ?? "up";
  const isPositive =
    delta &&
    ((delta.direction === "up" && goodWhen === "up") ||
      (delta.direction === "down" && goodWhen === "down"));
  const isNegative =
    delta &&
    ((delta.direction === "down" && goodWhen === "up") ||
      (delta.direction === "up" && goodWhen === "down"));

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-control border border-border bg-surface p-5 shadow-sm transition-all duration-normal ease-emphasized hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {icon && (
          <div className="grid h-9 w-9 place-items-center rounded-control bg-accent-muted text-accent">
            {icon}
          </div>
        )}
        {delta && !loading && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[11px] font-medium",
              isPositive && "border-success/20 bg-success-muted text-success",
              isNegative && "border-danger/20 bg-danger-muted text-danger",
              !isPositive && !isNegative && "border-border bg-muted text-muted-foreground",
            )}
          >
            {delta.direction === "up" && <ArrowUpRight className="h-3 w-3" aria-hidden />}
            {delta.direction === "down" && <ArrowDownRight className="h-3 w-3" aria-hidden />}
            {delta.direction === "flat" && <Minus className="h-3 w-3" aria-hidden />}
            {delta.value}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1">
        {loading ? (
          <>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-32" />
          </>
        ) : (
          <>
            <div className="font-display text-2xl font-semibold  tracking-tight text-foreground">
              {value}
            </div>
            <div className="text-xs text-muted-foreground">
              {label}
              {timeframe && <span className="text-muted-foreground/60"> · {timeframe}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
