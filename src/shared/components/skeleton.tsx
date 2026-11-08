import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/**
 * Base skeleton block. Shape-matches the content it replaces. Prefer the
 * specific `SkeletonText`, `SkeletonCircle`, `SkeletonCard`, and
 * `SkeletonTableRow` helpers below for common patterns.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("skeleton-shimmer rounded-control bg-muted", className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Skeleton
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-control border border-border bg-surface p-5 shadow-sm", className)}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size={36} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </div>
      <div className="mt-5">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="mt-2 h-2.5 w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="grid gap-3 py-3 border-b border-border/60" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === 0 ? "w-3/4" : "w-1/2")} />
      ))}
    </div>
  );
}

/**
 * Announces to screen readers that a region is loading. Pair with any of the
 * visual skeletons above.
 */
export function LoadingAnnouncer({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}
