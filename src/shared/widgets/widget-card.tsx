import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";

export type WidgetCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  interactive?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

/**
 * Base shell for every dashboard widget. Provides consistent border, elevation,
 * header rhythm, and footer slot. Extend — don't fork — this component.
 */
export function WidgetCard({
  title,
  description,
  icon,
  action,
  footer,
  padded = true,
  interactive,
  className,
  bodyClassName,
  children,
}: WidgetCardProps) {
  return (
    <section
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-control elevation-1 transition-all duration-normal ease-emphasized",
        interactive && "elevation-hover",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-accent-muted text-accent">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
              )}
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action !== undefined ? (
            <div className="shrink-0">{action}</div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Widget options"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </header>
      )}
      <div className={cn("flex-1", padded && "p-5", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="border-t border-border/60 bg-surface-sunken/50 px-5 py-3 text-xs text-muted-foreground">
          {footer}
        </footer>
      )}
    </section>
  );
}
