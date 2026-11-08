import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type DeltaTone = "positive" | "negative" | "neutral";

export type DeltaPillProps = {
  value: string;
  direction?: "up" | "down" | "flat";
  /** Which direction is "good" — inverts colors for churn/latency style metrics. */
  goodWhen?: "up" | "down";
  className?: string;
};

export function DeltaPill({ value, direction = "flat", goodWhen = "up", className }: DeltaPillProps) {
  const tone: DeltaTone =
    direction === "flat"
      ? "neutral"
      : (direction === "up" && goodWhen === "up") || (direction === "down" && goodWhen === "down")
        ? "positive"
        : "negative";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[11px] font-medium ",
        tone === "positive" && "border-success/20 bg-success-muted text-success",
        tone === "negative" && "border-danger/20 bg-danger-muted text-danger",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {value}
    </span>
  );
}
