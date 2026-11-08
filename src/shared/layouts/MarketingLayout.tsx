import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppFrame, Container, Section } from "./primitives";

/**
 * MarketingLayout — public marketing pages (home / features / pricing /
 * legal). Chromeless from the app perspective — provide your own header
 * and footer via `header` and `footer` props (the project's
 * `MarketingShell` already wraps this pattern; use that if you want the
 * shared nav).
 */
export function MarketingLayout({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppFrame className={cn("flex flex-col", className)}>
      {header}
      <main className="flex-1">{children}</main>
      {footer}
    </AppFrame>
  );
}

/** MarketingSection — full-bleed section band with a max-width inner container. */
export function MarketingSection({
  size = "lg",
  container = "app",
  className,
  children,
}: {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  container?: "prose" | "page" | "app" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Section y={size} className={cn(className)}>
      <Container size={container}>{children}</Container>
    </Section>
  );
}
