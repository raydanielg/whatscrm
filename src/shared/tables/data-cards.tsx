import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/shared/components";
import { SkeletonCard } from "@/shared/components";

export type DataCardField<T> = {
  key: string;
  label?: ReactNode;
  value: (row: T) => ReactNode;
};

export type DataCardsProps<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  primary: (row: T) => ReactNode;
  secondary?: (row: T) => ReactNode;
  fields?: DataCardField<T>[];
  actions?: (row: T) => ReactNode;
  onClick?: (row: T) => void;
  loading?: boolean;
  empty?: { title: string; description?: string; action?: ReactNode };
  columns?: 1 | 2 | 3;
  className?: string;
};

/**
 * Card-view alternative to `DataTable`. Use directly for card-first UIs, or
 * via `ResponsiveDataView` to auto-swap from table on narrow viewports.
 */
export function DataCards<T>({
  rows,
  rowKey,
  primary,
  secondary,
  fields,
  actions,
  onClick,
  loading,
  empty,
  columns = 1,
  className,
}: DataCardsProps<T>) {
  if (loading) {
    return (
      <div className={cn("grid gap-3", gridClass(columns), className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }
  if (!rows.length) {
    return (
      <EmptyState
        title={empty?.title ?? "Nothing here yet"}
        description={empty?.description}
        action={empty?.action}
      />
    );
  }
  return (
    <ul className={cn("grid gap-3", gridClass(columns), className)}>
      {rows.map((row) => {
        const clickable = !!onClick;
        return (
          <li key={rowKey(row)}>
            <div
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onClick?.(row) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onClick?.(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "flex flex-col gap-2 rounded-control border border-border bg-surface p-4 shadow-sm transition-all duration-normal ease-emphasized",
                clickable &&
                  "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {primary(row)}
                  </div>
                  {secondary && (
                    <div className="truncate text-xs text-muted-foreground">{secondary(row)}</div>
                  )}
                </div>
                {actions && <div className="shrink-0">{actions(row)}</div>}
              </div>
              {fields && fields.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {fields.map((f) => (
                    <div key={f.key} className="min-w-0">
                      {f.label && (
                        <dt className="truncate text-[11px] uppercase text-muted-foreground">
                          {f.label}
                        </dt>
                      )}
                      <dd className="truncate text-foreground">{f.value(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function gridClass(columns: 1 | 2 | 3) {
  if (columns === 3) return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
  if (columns === 2) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1";
}
