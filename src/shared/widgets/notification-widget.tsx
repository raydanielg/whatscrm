import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { cn } from "@/lib/utils";
import { Bell, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { formatRelativeTime } from "./format";
import type { ReactNode } from "react";

export type Notification = {
  id: string;
  title: string;
  body?: ReactNode;
  timestamp: Date | string | number;
  tone?: "info" | "success" | "warning" | "danger";
  read?: boolean;
  href?: string;
};

const toneIcon: Record<NonNullable<Notification["tone"]>, { Icon: typeof Info; cls: string }> = {
  info: { Icon: Info, cls: "bg-info-muted text-info" },
  success: { Icon: CheckCircle2, cls: "bg-success-muted text-success" },
  warning: { Icon: AlertTriangle, cls: "bg-warning-muted text-warning" },
  danger: { Icon: XCircle, cls: "bg-danger-muted text-danger" },
};

export type NotificationWidgetProps = Omit<WidgetCardProps, "children"> & {
  notifications: Notification[];
  onItemClick?: (id: string) => void;
};

export function NotificationWidget({ notifications, onItemClick, ...card }: NotificationWidgetProps) {
  return (
    <WidgetCard icon={<Bell className="h-4 w-4" />} {...card} bodyClassName="p-0">
      {notifications.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">All caught up</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {notifications.map((n) => {
            const { Icon, cls } = toneIcon[n.tone ?? "info"];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onItemClick?.(n.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-sunken/70",
                    !n.read && "bg-accent-muted/30",
                  )}
                >
                  <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full", cls)}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                    </span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {formatRelativeTime(n.timestamp)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
