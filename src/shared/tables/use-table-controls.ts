"use client";
import { useCallback, useMemo, useState } from "react";
import type { SortState } from "@/shared/components";

export type FilterValue = string | number | boolean | string[] | null;
export type FilterState = Record<string, FilterValue>;

export type UseTableControlsOptions<T> = {
  rows: T[];
  /** Fields whose values should be scanned for the search query. */
  searchFields?: Array<keyof T | ((row: T) => string | undefined)>;
  /** Custom filter predicates keyed by filter id. */
  filterFns?: Record<string, (row: T, value: FilterValue) => boolean>;
  /** Custom sort comparators keyed by column key. */
  sortFns?: Record<string, (a: T, b: T) => number>;
  /** How to derive a stable id from a row (used by selection). */
  rowKey: (row: T) => string;
  /** Default page size. Set 0 for unpaged. */
  pageSize?: number;
  initialSort?: SortState;
  initialFilters?: FilterState;
};

/**
 * One hook that owns search, filters, sort, pagination, and selection state
 * for any `DataTable`. Fully client-side; swap to server-driven by lifting
 * `search`, `filters`, `sort`, `page` up and passing back the paged rows.
 */
export function useTableControls<T>({
  rows,
  searchFields,
  filterFns,
  sortFns,
  rowKey,
  pageSize = 25,
  initialSort = null,
  initialFilters = {},
}: UseTableControlsOptions<T>) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && searchFields?.length) {
        const hit = searchFields.some((f) => {
          const raw = typeof f === "function" ? f(row) : (row[f] as unknown);
          return typeof raw === "string" || typeof raw === "number"
            ? String(raw).toLowerCase().includes(q)
            : false;
        });
        if (!hit) return false;
      }
      for (const [key, value] of Object.entries(filters)) {
        if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
        const fn = filterFns?.[key];
        if (fn && !fn(row, value)) return false;
      }
      return true;
    });
  }, [rows, search, filters, filterFns, searchFields]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const fn = sortFns?.[sort.key];
    if (!fn) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => (sort.direction === "asc" ? fn(a, b) : fn(b, a)));
    return copy;
  }, [filtered, sort, sortFns]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const clampedPage = Math.min(page, totalPages);
  const paged = useMemo(
    () =>
      pageSize > 0
        ? sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)
        : sorted,
    [sorted, clampedPage, pageSize],
  );

  const setFilter = useCallback((key: string, value: FilterValue) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearch("");
    setPage(1);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(
    (selected: boolean) => {
      setSelectedIds((s) => {
        const next = new Set(s);
        for (const row of paged) {
          const id = rowKey(row);
          if (selected) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [paged, rowKey],
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  ).length;

  return {
    // state
    search,
    setSearch: (v: string) => {
      setSearch(v);
      setPage(1);
    },
    filters,
    setFilter,
    clearFilters,
    sort,
    setSort,
    page: clampedPage,
    setPage,
    pageSize,
    totalPages,
    // derived
    filteredRows: filtered,
    sortedRows: sorted,
    pagedRows: paged,
    totalRows: rows.length,
    filteredCount: filtered.length,
    activeFilterCount,
    // selection
    selectedIds,
    toggleSelected,
    selectAllOnPage,
    clearSelection,
    isSelected: (id: string) => selectedIds.has(id),
  };
}
