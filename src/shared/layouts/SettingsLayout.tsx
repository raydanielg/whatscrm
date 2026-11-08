import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container, SubnavContent } from "./primitives";

/**
 * SettingsLayout — left sub-nav + narrow content column.
 * Content column is capped to `content-max-sm` for readability.
 */
export function SettingsLayout({
  title,
  description,
  eyebrow,
  subnav,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  subnav: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Container size="dashboard" className={cn("py-6 lg:py-8", className)}>
      <header className="mb-6 space-y-1">
        {eyebrow && <div className="text-eyebrow">{eyebrow}</div>}
        <h1 className="text-heading-h2 lg:text-heading-h1">{title}</h1>
        {description && <p className="text-body-sm text-muted-foreground text-pretty">{description}</p>}
      </header>
      <SubnavContent subnav={subnav}>
        <div className="max-w-[var(--content-max-sm)] space-y-8">{children}</div>
      </SubnavContent>
    </Container>
  );
}
