/**
 * Enterprise data-table standards. Import from a single path:
 *
 *   import {
 *     useTableControls,
 *     TableToolbar, initColumnVisibility,
 *     AdvancedFilters,
 *     BulkActionsBar,
 *     DataCards, ResponsiveDataView,
 *     toCsv, downloadCsv, parseCsv, pickCsvFile,
 *   } from "@/shared/tables";
 *
 * Pair with `DataTable` from `@/shared/components` for the actual rows.
 */
export {
  useTableControls,
  type UseTableControlsOptions,
  type FilterState,
  type FilterValue,
} from "./use-table-controls";
export { TableToolbar, initColumnVisibility, type TableToolbarProps, type ColumnVisibility } from "./table-toolbar";
export { AdvancedFilters, type FilterFieldDef } from "./advanced-filters";
export { BulkActionsBar, type BulkActionsBarProps } from "./bulk-actions-bar";
export { DataCards, type DataCardsProps, type DataCardField } from "./data-cards";
export { ResponsiveDataView } from "./responsive-data-view";
export { toCsv, downloadCsv, parseCsv, pickCsvFile, type ExportColumn } from "./export-utils";
