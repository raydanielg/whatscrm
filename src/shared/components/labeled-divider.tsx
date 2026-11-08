import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface LabeledDividerProps {
  children?: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

/**
 * Horizontal rule with an optional inline label ("OR", "Yesterday",
 * section markers in feeds/inbox). Purely decorative — aria-hidden.
 */
export function LabeledDivider({
  children,
  className,
  align = "center",
}: LabeledDividerProps) {
  if (!children) {
    return (
      <hr
        aria-hidden="true"
        className={cn("my-4 border-t border-border", className)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn("my-4 flex items-center gap-3", className)}
    >
      {align !== "start" && <div className="h-px flex-1 bg-border" />}
      <span className="text-xs font-medium  text-muted-foreground">
        {children}
      </span>
      {align !== "end" && <div className="h-px flex-1 bg-border" />}
    </div>
  );
}
