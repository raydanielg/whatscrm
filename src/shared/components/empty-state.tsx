import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  icon?: typeof Inbox;
  title: string;
  description?: string;
  action?: ReactNode;
  secondary?: ReactNode;
  variant?: "default" | "filter" | "compact";
  className?: string;
};

/**
 * Empty state per UI_STANDARDS §7. Ships four slots (icon, title, description,
 * actions) and three densities. The "filter" variant is for zero-result
 * filters — offers "Clear filters" instead of a domain CTA.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondary,
  variant = "default",
  className,
}: EmptyStateProps) {
  const compact = variant === "compact";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-8 px-4" : "gap-3 py-14 px-6",
        className,
      )}
    >
      <div
        className={cn(
          "grid place-items-center rounded-control border border-border/70 bg-muted/40 text-muted-foreground",
          compact ? "h-10 w-10" : "h-14 w-14",
        )}
      >
        <Icon className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className={cn("font-display font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {(action || secondary) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
