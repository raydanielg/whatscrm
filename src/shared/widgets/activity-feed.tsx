import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "./format";
import type { ReactNode } from "react";

export type ActivityItem = {
  id: string;
  actor?: { name: string; avatarUrl?: string };
  icon?: ReactNode;
  message: ReactNode;
  meta?: ReactNode;
  timestamp: string | Date | number;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

const toneRing: Record<NonNullable<ActivityItem["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-danger",
  info: "bg-info-muted text-info",
};

export type ActivityFeedProps = Omit<WidgetCardProps, "children"> & {
  items: ActivityItem[];
  emptyLabel?: string;
  maxItems?: number;
};

export function ActivityFeed({ items, emptyLabel = "No recent activity", maxItems, ...card }: ActivityFeedProps) {
  const list = maxItems ? items.slice(0, maxItems) : items;
  return (
    <WidgetCard {...card} bodyClassName="p-0">
      {list.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <ol className="relative divide-y divide-border/60">
          {list.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
              {item.actor ? (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={item.actor.avatarUrl} alt="" />
                  <AvatarFallback className="text-[11px]">
                    {item.actor.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span
                  className={cn(
                    "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                    toneRing[item.tone ?? "default"],
                  )}
                >
                  {item.icon}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground [&_strong]:font-medium">{item.message}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={new Date(item.timestamp).toISOString()}>
                    {formatRelativeTime(item.timestamp)}
                  </time>
                  {item.meta && <span aria-hidden>·</span>}
                  {item.meta}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  );
}
