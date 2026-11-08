import type { ReactNode } from "react";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";

/**
 * LoadingState — inline block for pages/panes that are fetching data.
 * Pair with `Skeleton` for content-shaped skeletons; use this for pure spinners.
 */
export function LoadingState({
  title = "Loading",
  description,
  size = "md",
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
}) {
  const paddings = { sm: "py-8", md: "py-16", lg: "py-24" } as const;
  const spinnerSize = { sm: "md", md: "lg", lg: "xl" } as const;
  return (
    <div
      className={cn("flex flex-col items-center justify-center text-center", paddings[size], className)}
      role="status"
      aria-busy="true"
    >
      <Spinner size={spinnerSize[size]} label="" />
      <p className="mt-4 text-label-md">{title}</p>
      {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
