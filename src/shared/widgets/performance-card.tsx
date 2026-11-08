import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type PerformanceMetric = {
  label: string;
  value: number;
  target?: number;
  unit?: string;
  tone?: "success" | "warning" | "danger" | "info" | "accent";
};

const tones: Record<NonNullable<PerformanceMetric["tone"]>, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-accent",
};

export type PerformanceCardProps = Omit<WidgetCardProps, "children"> & {
  metrics: PerformanceMetric[];
  headline?: ReactNode;
};

export function PerformanceCard({ metrics, headline, ...card }: PerformanceCardProps) {
  return (
    <WidgetCard {...card}>
      {headline && (
        <div className="mb-4 font-display text-2xl font-semibold  text-foreground">
          {headline}
        </div>
      )}
      <ul className="space-y-3">
        {metrics.map((m) => {
          const pct = m.target ? Math.min(100, (m.value / m.target) * 100) : Math.min(100, m.value);
          return (
            <li key={m.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{m.label}</span>
                <span className=" font-medium text-foreground">
                  {m.value}
                  {m.unit ?? ""}
                  {m.target !== undefined && (
                    <span className="text-muted-foreground"> / {m.target}{m.unit ?? ""}</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", tones[m.tone ?? "accent"])}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
