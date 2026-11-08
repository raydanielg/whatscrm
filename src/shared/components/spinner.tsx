import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Spinner — accessible loading indicator.
 * Uses `role="status"` and a visually hidden label so screen readers announce it.
 */
export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  label?: string;
  className?: string;
}) {
  const sizes = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
    xl: "h-8 w-8",
  } as const;
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center", className)}>
      <Loader2 className={cn("animate-spin text-muted-foreground", sizes[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
