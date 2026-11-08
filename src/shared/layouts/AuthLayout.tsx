import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppFrame, Container } from "./primitives";

/**
 * AuthLayout — sign-in / sign-up / recovery / verify screens.
 * Chromeless: no app sidebar, no topbar. Two variants:
 *  - "centered": single centered card (default)
 *  - "split":    marketing panel on the left, form on the right (desktop)
 */
export function AuthLayout({
  variant = "centered",
  brand,
  aside,
  footer,
  children,
  className,
}: {
  variant?: "centered" | "split";
  brand?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (variant === "split") {
    return (
      <AppFrame className={cn("grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]", className)}>
        <aside className="hidden lg:flex flex-col justify-between bg-gradient-hero text-primary-foreground p-10 xl:p-14">
          <div className="text-sidebar-brand text-primary-foreground">{brand}</div>
          <div className="max-w-md">{aside}</div>
          <div className="text-caption text-hero-foreground/90">{footer}</div>
        </aside>
        <main className="flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-[var(--content-max-xs)]">{children}</div>
        </main>
      </AppFrame>
    );
  }

  return (
    <AppFrame className={cn("flex flex-col", className)}>
      <header className="flex items-center justify-center py-8">{brand}</header>
      <main className="flex-1 flex items-start justify-center px-6">
        <div className="w-full max-w-[var(--content-max-xs)] py-6">{children}</div>
      </main>
      {footer && (
        <footer className="border-t border-white/10 bg-gradient-hero  py-6">
          <Container size="page" className="text-center text-caption text-white/60">
            {footer}
          </Container>
        </footer>

      )}
    </AppFrame>
  );
}
