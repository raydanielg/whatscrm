import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type BulkActionsBarProps = {
  count: number;
  onClear?: () => void;
  itemNoun?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Sticky action bar that appears when selection > 0. Sits above the table
 * inside a scroll container, or fixed-bottom on mobile via responsive parent.
 */
export function BulkActionsBar({
  count,
  onClear,
  itemNoun = "item",
  children,
  className,
}: BulkActionsBarProps) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cn(
        "sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-elevated px-3 py-2 shadow-sm animate-fade-in",
        className,
      )}
    >
      <span className="text-sm font-medium text-foreground">
        {count} {itemNoun}
        {count === 1 ? "" : "s"} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        {onClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
