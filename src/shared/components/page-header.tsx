import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page header used inside route bodies. Companion to `AppTopbar` which owns
 * the top-of-viewport chrome. Use this when a page needs its own title band
 * with description + actions independent of the sticky header.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 lg:flex lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <div className="text-[11px] uppercase   text-muted-foreground">{eyebrow}</div>
        )}
        <h1 className="truncate font-display text-xl font-semibold text-foreground lg:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 justify-self-end">{actions}</div>}
    </header>
  );
}

/**
 * Section shell. Groups related content with a subtitle + optional actions.
 * Use inside a page body when a route has multiple discrete zones.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
