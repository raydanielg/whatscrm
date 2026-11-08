import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container, SubHeader } from "./primitives";

/**
 * AdminLayout — org-admin workspace: table-forward, filter row above,
 * wide content, no metrics header.
 */
export function AdminLayout({
  title,
  description,
  eyebrow,
  actions,
  filters,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-content", className)}>
      <Container size="dashboard" className="py-6 lg:py-8">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 lg:flex lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            {eyebrow && <div className="text-eyebrow">{eyebrow}</div>}
            <h1 className="text-heading-h2 lg:text-heading-h1 truncate">{title}</h1>
            {description && <p className="text-body-sm text-muted-foreground text-pretty">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 justify-self-end">{actions}</div>}
        </header>
      </Container>
      {filters && <SubHeader>{filters}</SubHeader>}
      <Container size="dashboard" className="py-6 flex-1 space-y-6">
        {children}
      </Container>
    </div>
  );
}
