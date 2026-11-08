/**
 * Reusable layouts for WACRM v6.8.9.
 *
 * Every layout is composed from tokens defined in `src/styles.css` — never
 * hardcode widths, gutters, heights, or z-index outside of a token.
 *
 * Chromed vs chromeless
 *  · The authenticated app chrome (sidebar + topbar) is owned by the
 *    `_authenticated` route via the project's AppShell/AppSidebar/AppTopbar.
 *    All authenticated page layouts here (Dashboard, CRM, Inbox, Settings,
 *    Reports, Automation, Admin, SuperAdmin) render *inside* that chrome —
 *    they own the page body only.
 *  · Auth and Marketing layouts are chromeless and own the full viewport.
 */

export * from "./primitives";
export { AuthLayout } from "./AuthLayout";
export { DashboardLayout } from "./DashboardLayout";
export { CRMLayout } from "./CRMLayout";
export { InboxLayout } from "./InboxLayout";
export { SettingsLayout } from "./SettingsLayout";
export { ReportsLayout } from "./ReportsLayout";
export { MarketingLayout, MarketingSection } from "./MarketingLayout";
export { AutomationLayout } from "./AutomationLayout";
export { AdminLayout } from "./AdminLayout";
export { SuperAdminLayout } from "./SuperAdminLayout";
