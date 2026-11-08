import type { ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { SkeletonTableRow } from "./skeleton";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Optional width e.g. "12rem" or "160px". Missing widths flex. */
  width?: string;
  /** Right-align (numeric) cells. */
  align?: "left" | "right";
  /** Sortable column key; when present, the header shows a caret. */
  sortable?: boolean;
  /** Additional class on the cell wrapper. */
  className?: string;
};

export type SortState = { key: string; direction: "asc" | "desc" } | null;

type Props<T> = {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  selectedKey?: string;
  empty?: { title: string; description?: string; action?: ReactNode };
  size?: "default" | "compact";
  caption?: string;
  className?: string;
};

/**
 * Accessible, tokenised data-table shell per UI_STANDARDS §16. Handles
 * loading, empty, and error states in-band. Sorting is controlled by the
 * caller; keys and directions round-trip through props.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  sort,
  onSortChange,
  selectedKey,
  empty,
  size = "default",
  caption,
  className,
}: Props<T>) {
  const gridTemplate = columns.map((c) => c.width ?? "minmax(0, 1fr)").join(" ");
  const cellPad = size === "compact" ? "py-2 px-3" : "py-3 px-4";

  function toggleSort(key: string) {
    if (!onSortChange) return;
    if (sort?.key !== key) return onSortChange({ key, direction: "asc" });
    if (sort.direction === "asc") return onSortChange({ key, direction: "desc" });
    return onSortChange(null);
  }

  return (
    <div className={cn("overflow-hidden rounded-control border border-border bg-surface", className)}>
      <div role="table" aria-label={caption} className="min-w-full text-sm">
        {caption && <span className="sr-only">{caption}</span>}
        {/* Header */}
        <div
          role="row"
          className="grid gap-3 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase   text-muted-foreground"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {columns.map((col) => {
            const isSorted = sort?.key === col.key;
            const ariaSort: "ascending" | "descending" | "none" | undefined = col.sortable
              ? isSorted
                ? sort.direction === "asc" ? "ascending" : "descending"
                : "none"
              : undefined;
            const Icon = isSorted ? (sort.direction === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
            return (
              <div
                key={col.key}
                role="columnheader"
                aria-sort={ariaSort}
                className={cn(cellPad, col.align === "right" && "text-right", col.className)}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isSorted && "text-foreground",
                    )}
                  >
                    <span>{col.header}</span>
                    <Icon className="h-3 w-3" aria-hidden />
                  </button>
                ) : (
                  col.header
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div role="rowgroup">
          {loading && (
            <div className="divide-y divide-border/60">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonTableRow key={i} cols={columns.length} />
              ))}
              <span role="status" aria-live="polite" className="sr-only">Loading data</span>
            </div>
          )}

          {!loading && Boolean(error) && (
            <ErrorState onRetry={onRetry} />
          )}

          {!loading && !error && rows && rows.length === 0 && (
            <EmptyState
              title={empty?.title ?? "Nothing here yet"}
              description={empty?.description}
              action={empty?.action}
            />
          )}

          {!loading && !error && rows && rows.length > 0 && rows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            return (
              <div
                key={key}
                role="row"
                aria-selected={selected || undefined}
                tabIndex={onRowClick ? 0 : -1}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "grid gap-3 border-b border-border/60 last:border-b-0 transition-colors",
                  onRowClick && "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  selected ? "bg-accent-muted" : "hover:bg-muted/50",
                )}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    role="cell"
                    className={cn(
                      cellPad,
                      "min-w-0 truncate",
                      col.align === "right" && "text-right ",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
