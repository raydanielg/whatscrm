import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";
import type { ReactNode } from "react";

export type RealtimePresence = {
  id: string;
  label: string;
  count?: number;
  tone?: "success" | "accent" | "warning" | "info";
};

const dotTone: Record<NonNullable<RealtimePresence["tone"]>, string> = {
  success: "bg-success",
  accent: "bg-accent",
  warning: "bg-warning",
  info: "bg-info",
};

export type RealtimeActivityProps = Omit<WidgetCardProps, "children"> & {
  live?: boolean;
  presence?: RealtimePresence[];
  totalOnline?: number;
  totalLabel?: string;
  children?: ReactNode;
};

/**
 * Live pulse header + optional presence rows. Combine with `ActivityFeed` for the
 * scrolling event stream.
 */
export function RealtimeActivity({
  live = true,
  presence = [],
  totalOnline,
  totalLabel = "online now",
  children,
  ...card
}: RealtimeActivityProps) {
  return (
    <WidgetCard icon={<Activity className="h-4 w-4" />} {...card}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-60",
                live && "animate-ping bg-success",
              )}
              aria-hidden
            />
            <span className={cn("relative inline-flex h-3 w-3 rounded-full", live ? "bg-success" : "bg-muted-foreground")} />
          </span>
          <span className="text-xs font-medium  text-muted-foreground">
            {live ? "Live" : "Idle"}
          </span>
        </div>
        {totalOnline !== undefined && (
          <div className="text-right">
            <div className="font-display text-xl font-semibold  text-foreground">
              {totalOnline}
            </div>
            <div className="text-[11px] text-muted-foreground">{totalLabel}</div>
          </div>
        )}
      </div>
      {presence.length > 0 && (
        <ul className="mt-4 space-y-2">
          {presence.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone[p.tone ?? "success"])} />
              <span className="min-w-0 flex-1 truncate text-foreground">{p.label}</span>
              {p.count !== undefined && (
                <span className=" text-muted-foreground">{p.count}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {children && <div className="mt-4">{children}</div>}
    </WidgetCard>
  );
}
