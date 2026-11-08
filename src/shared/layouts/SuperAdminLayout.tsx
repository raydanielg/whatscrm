import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";
import { Container, SubHeader } from "./primitives";

/**
 * SuperAdminLayout — platform-level console. Same shape as AdminLayout
 * but with a persistent elevated-privilege banner so operators never
 * forget they're on cross-tenant surfaces.
 */
export function SuperAdminLayout({
  title,
  description,
  eyebrow = "Platform",
  actions,
  filters,
  banner,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-content", className)}>
      <div
        className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 lg:px-6 py-2 text-warning-foreground"
        role="status"
      >
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <p className="text-label-sm">
          {banner ?? "You are on the platform super-admin console. Actions here affect every workspace."}
        </p>
      </div>
      <Container size="wide" className="py-6 lg:py-8">
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
      <Container size="wide" className="py-6 flex-1 space-y-6">
        {children}
      </Container>
    </div>
  );
}
