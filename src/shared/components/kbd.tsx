import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/**
 * Keyboard shortcut chip. Renders semantic <kbd>. Compose multiple with
 * `<Kbd>⌘</Kbd><Kbd>K</Kbd>` to indicate combos. Fully theme-aware.
 */
export function Kbd({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-border bg-muted px-1 font-mono text-[11px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_0_var(--color-border)]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
