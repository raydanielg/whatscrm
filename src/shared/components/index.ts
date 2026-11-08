/**
 * Barrel of shared UI primitives. Import from a single path across features:
 *
 *   import {
 *     ActionButton, SearchBox, Autocomplete, DatePicker, DateRangePicker,
 *     Timeline, Spinner, LoadingState,
 *     EmptyState, ErrorState, SuccessState,
 *     StatCard, StatusBadge, PageHeader, Section,
 *     DataTable, FormField, ConfirmDialog, SideDrawer,
 *     Skeleton, SkeletonText, SkeletonCard, SkeletonTableRow, LoadingAnnouncer,
 *     SkipLink, Breadcrumbs, notify,
 *   } from "@/shared/components";
 */
export { ActionButton, type ActionButtonProps } from "./action-button";
export { Autocomplete, type AutocompleteOption } from "./autocomplete";
export { Breadcrumbs } from "./breadcrumbs";
export { ConfirmDialog } from "./confirm-dialog";
export { CopyButton } from "./copy-button";
export { DataTable, type Column, type SortState } from "./data-table";
export { InfoTooltip } from "./info-tooltip";
export { Kbd } from "./kbd";
export { LabeledDivider } from "./labeled-divider";
export {
  SegmentedControl,
  type SegmentedControlOption,
} from "./segmented-control";
export { DatePicker, DateRangePicker, toDateString, fromDateString } from "./date-picker";
export { BirthdayPicker } from "./birthday-picker";
export { DateTimePicker, toLocalDateTimeString, fromLocalDateTimeString } from "./date-time-picker";
export { TimePicker } from "./time-picker";
export { EmptyState } from "./empty-state";
export { ErrorState } from "./error-state";
export { FormField, useFormField } from "./form-field";
export { LoadingState } from "./loading-state";
export { notify, type ExternalToast } from "./notify";
export { PageHeader, Section } from "./page-header";
export { SearchBox, type SearchBoxProps } from "./search-box";
export { SideDrawer } from "./side-drawer";
export {
  Skeleton, SkeletonCard, SkeletonCircle, SkeletonTableRow, SkeletonText,
  LoadingAnnouncer,
} from "./skeleton";
export { SkipLink } from "./skip-link";
export { Spinner } from "./spinner";
export { StatCard } from "./stat-card";
export { StatusBadge } from "./status-badge";
export { SuccessState } from "./success-state";
export { Timeline, type TimelineItem } from "./timeline";
