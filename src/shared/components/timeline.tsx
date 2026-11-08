import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  timestamp?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";
  meta?: ReactNode;
};

const toneRing: Record<NonNullable<TimelineItem["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/10 text-primary ring-primary/30",
  accent: "bg-accent/10 text-accent ring-accent/30",
  success: "bg-success/10 text-success ring-success/30",
  warning: "bg-warning/10 text-warning ring-warning/30",
  danger: "bg-danger/10 text-danger ring-danger/30",
  info: "bg-info/10 text-info ring-info/30",
};

/**
 * Timeline — vertical activity feed for audit logs, notifications, ticket
 * history. Each item has a tone-tinted dot/icon and optional timestamp.
 */
export function Timeline({
  items,
  className,
  compact = false,
}: {
  items: TimelineItem[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <ol className={cn("relative", className)}>
      {items.map((item, i) => {
        const tone = item.tone ?? "neutral";
        const isLast = i === items.length - 1;
        return (
          <li key={item.id} className={cn("relative flex gap-4", compact ? "pb-4" : "pb-6")}>
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-3 top-6 bottom-0 w-px bg-border"
              />
            )}
            <span
              className={cn(
                "relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-4 ring-background",
                toneRing[tone],
              )}
              aria-hidden="true"
            >
              {item.icon ?? <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-label-md text-foreground">{item.title}</div>
                {item.timestamp && (
                  <time className="text-caption shrink-0">{item.timestamp}</time>
                )}
              </div>
              {item.description && (
                <p className="mt-1 text-body-sm text-muted-foreground text-pretty">{item.description}</p>
              )}
              {item.meta && <div className="mt-2">{item.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
