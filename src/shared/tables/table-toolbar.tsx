import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3, Download, Filter, Upload, X } from "lucide-react";
import { SearchBox } from "@/shared/components";

export type ColumnVisibility = Record<string, boolean>;

export type TableToolbarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  activeFilterCount?: number;
  onOpenFilters?: () => void;
  onClearFilters?: () => void;
  columns?: Array<{ key: string; header: ReactNode; hidden?: boolean; alwaysVisible?: boolean }>;
  columnVisibility?: ColumnVisibility;
  onColumnVisibilityChange?: (next: ColumnVisibility) => void;
  onExport?: () => void;
  onImport?: () => void;
  actions?: ReactNode;
  className?: string;
};

/**
 * Enterprise-grade toolbar: search, filters entry, column visibility, export,
 * import, and a slot for feature-specific actions. Every button is optional —
 * pass only the handlers you support.
 */
export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  activeFilterCount = 0,
  onOpenFilters,
  onClearFilters,
  columns,
  columnVisibility,
  onColumnVisibilityChange,
  onExport,
  onImport,
  actions,
  className,
}: TableToolbarProps) {
  const anyHidden =
    columnVisibility && Object.values(columnVisibility).some((v) => v === false);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <SearchBox
        value={search}
        onValueChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="w-full sm:w-64"
      />

      {onOpenFilters && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenFilters}
          className="gap-2"
        >
          <Filter className="h-4 w-4" aria-hidden />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 grid h-5 min-w-[20px] place-items-center rounded-control bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      )}

      {activeFilterCount > 0 && onClearFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={onClearFilters} className="gap-1 text-muted-foreground">
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {columns && columnVisibility && onColumnVisibilityChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <Columns3 className="h-4 w-4" aria-hidden />
                Columns
                {anyHidden && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={columnVisibility[c.key] !== false}
                  disabled={c.alwaysVisible}
                  onCheckedChange={(v) =>
                    onColumnVisibilityChange({ ...columnVisibility, [c.key]: !!v })
                  }
                >
                  {c.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onImport && (
          <Button type="button" variant="outline" size="sm" onClick={onImport} className="gap-2">
            <Upload className="h-4 w-4" aria-hidden />
            Import
          </Button>
        )}
        {onExport && (
          <Button type="button" variant="outline" size="sm" onClick={onExport} className="gap-2">
            <Download className="h-4 w-4" aria-hidden />
            Export
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}

/**
 * Utility: build an initial visibility map from a column list.
 */
export function initColumnVisibility(
  cols: Array<{ key: string; hidden?: boolean }>,
): ColumnVisibility {
  return Object.fromEntries(cols.map((c) => [c.key, !c.hidden]));
}
