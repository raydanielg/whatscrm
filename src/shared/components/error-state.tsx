import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Boundary-level error state per UI_STANDARDS §8. Never show raw error text —
 * map to user copy via `mapError()`. The raw error should be reported to the
 * monitoring service before this renders.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again — if this keeps happening, contact support.",
  onRetry,
  retryLabel = "Try again",
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 px-6 text-center",
        className,
      )}
    >
      <div className="grid h-14 w-14 place-items-center rounded-control bg-danger-muted text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground text-pretty">{description}</p>
      </div>
      {(onRetry || action) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              {retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
