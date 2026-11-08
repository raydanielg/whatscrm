import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container, MetricsGrid } from "./primitives";

/**
 * DashboardLayout — analytics home. Assumes the authenticated shell
 * (`AppShell`) already provides the sidebar + topbar; this owns page body.
 * Renders: title band → optional filter row → metrics grid → children.
 */
export function DashboardLayout({
  title,
  description,
  eyebrow,
  actions,
  filters,
  metrics,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  metrics?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Container size="dashboard" className={cn("py-6 lg:py-8 space-y-6 lg:space-y-8", className)}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 lg:flex lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow && <div className="text-eyebrow">{eyebrow}</div>}
          <h1 className="text-heading-h2 lg:text-heading-h1 truncate">{title}</h1>
          {description && <p className="text-body-sm text-muted-foreground text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 justify-self-end">{actions}</div>}
      </header>

      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {metrics && <MetricsGrid>{metrics}</MetricsGrid>}
      {children}
    </Container>
  );
}
