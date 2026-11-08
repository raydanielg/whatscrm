import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ColumnDef<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  defaultVisible?: boolean;
  align?: "left" | "right" | "center";
};

type Props<T extends { id: string }> = {
  columns: ColumnDef<T>[];
  rows: T[];
  loading?: boolean;
  emptyLabel?: string;
  sortKey?: string | null;
  sortDir?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  selected: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
  bulkActions?: ReactNode;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
};

export function DataTable<T extends { id: string }>({
  columns, rows, loading, emptyLabel = "No results",
  sortKey, sortDir = "asc", onSort,
  selected, onSelectionChange, bulkActions, onRowClick, stickyHeader,
}: Props<T>) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultVisible !== false).map((c) => c.id)),
  );
  const cols = useMemo(() => columns.filter((c) => visible.has(c.id)), [columns, visible]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));

  function toggleAll(v: boolean) {
    const next = new Set(selected);
    for (const r of rows) v ? next.add(r.id) : next.delete(r.id);
    onSelectionChange(next);
  }
  function toggleRow(id: string, v: boolean) {
    const next = new Set(selected);
    v ? next.add(id) : next.delete(id);
    onSelectionChange(next);
  }
  function clickSort(id: string) {
    if (!onSort) return;
    const dir = sortKey === id && sortDir === "asc" ? "desc" : "asc";
    onSort(id, dir);
  }

  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        {selected.size > 0 ? (
          <>
            <span className="text-xs px-2 text-muted-foreground">{selected.size} selected</span>
            {bulkActions}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onSelectionChange(new Set())}>
              <X className="w-3.5 h-3.5 " /> Clear
            </Button>
          </>
        ) : (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline"><Columns3 className="w-3.5 h-3.5 mr-1.5" /> Columns</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={visible.has(c.id)}
                    onCheckedChange={(v) => {
                      setVisible((s) => {
                        const n = new Set(s);
                        v ? n.add(c.id) : n.delete(c.id);
                        return n;
                      });
                    }}
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={cn(stickyHeader && "sticky top-0 bg-surface z-10")}>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
              <th className="w-9 px-3 py-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="Select all"
                />
              </th>
              {cols.map((c) => (
                <th key={c.id} className={cn("px-3 py-2 text-left font-medium", c.className)}>
                  {c.sortable ? (
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => clickSort(c.id)}>
                      {c.header}
                      {sortKey === c.id ? (
                        sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      ) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={cols.length + 1} className="p-6 text-center text-xs text-muted-foreground">Loading</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="p-8 text-center text-sm text-muted-foreground">{emptyLabel}</td></tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-nostop]") === null && onRowClick) onRowClick(r);
                }}
                className={cn(
                  "border-b border-border/70 hover:bg-muted/30 transition-colors",
                  onRowClick && "cursor-pointer",
                  selected.has(r.id) && "bg-accent/5",
                )}
              >
                <td className="px-3 py-2 w-9" onClick={(e) => e.stopPropagation()} data-nostop>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={(v) => toggleRow(r.id, !!v)}
                    aria-label="Select row"
                  />
                </td>
                {cols.map((c) => (
                  <td key={c.id} className={cn("px-3 py-2 align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- Pagination bar --------------------------- */

export function Pagination({
  page, pageSize, total, onPage, onPageSize,
  pageSizes = [25, 50, 100, 250],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  pageSizes?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-border text-xs">
      <span className="text-muted-foreground">{from}–{to} of {total.toLocaleString()}</span>
      {onPageSize && (
        <select
          className="ml-2 h-7 rounded-control border border-border bg-background px-2"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {pageSizes.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7" onClick={() => onPage(1)} disabled={page <= 1}>First</Button>
        <Button variant="outline" size="sm" className="h-7" onClick={() => onPage(page - 1)} disabled={page <= 1}>Prev</Button>
        <span className="px-2">Page {page} / {totalPages}</span>
        <Button variant="outline" size="sm" className="h-7" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next</Button>
        <Button variant="outline" size="sm" className="h-7" onClick={() => onPage(totalPages)} disabled={page >= totalPages}>Last</Button>
      </div>
    </div>
  );
}
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const _Check = Check; // keep icon import used
