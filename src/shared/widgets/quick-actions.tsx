import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export type QuickAction = {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: "accent" | "primary" | "success" | "warning" | "danger";
  shortcut?: string;
};

const toneMap: Record<NonNullable<QuickAction["tone"]>, string> = {
  accent: "bg-accent-muted text-accent",
  primary: "bg-primary-muted text-primary",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-danger",
};

export type QuickActionsProps = Omit<WidgetCardProps, "children"> & {
  actions: QuickAction[];
  columns?: 2 | 3 | 4;
};

export function QuickActions({ actions, columns = 2, ...card }: QuickActionsProps) {
  return (
    <WidgetCard {...card}>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-2 sm:grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {actions.map((a) => {
          const inner = (
            <>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control", toneMap[a.tone ?? "accent"])}>
                {a.icon}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-foreground">{a.label}</span>
                {a.description && (
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                )}
              </span>
              {a.shortcut && (
                <kbd className="ml-auto shrink-0 rounded border border-border bg-surface-sunken px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                  {a.shortcut}
                </kbd>
              )}
            </>
          );
          const cls =
            "flex items-center gap-3 rounded-control border border-border bg-surface-elevated px-3 py-2.5 text-left transition-all duration-normal ease-emphasized hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          if (a.to) {
            return (
              <Link key={a.id} to={a.to} className={cls}>
                {inner}
              </Link>
            );
          }
          return (
            <button key={a.id} type="button" onClick={a.onClick} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
    </WidgetCard>
  );
}
