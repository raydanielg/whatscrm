/**
 * Client-side breadcrumb trail for tenant (org/workspace) resolution.
 *
 * Org-mismatch incidents are hard to reproduce because the decisive state —
 * the active tenant, the URL `?org=`, the owning workspace of the resource —
 * only exists in the browser at the moment of the redirect. We keep a small
 * ring buffer in sessionStorage so support can ask a user to export the trail
 * (or an error report can attach it) right after the incident.
 */

const STORAGE_KEY = "wacrm.tenant.breadcrumbs";
const MAX_BREADCRUMBS = 50;

export type TenantBreadcrumbKind =
  | "workflow.open"
  | "workflow.not_found"
  | "workflow.lookup_failed"

  | "workflow.no_membership"
  | "workflow.tenant_realigned"
  | "workflow.redirect"
  | "tenant.switch";

export type TenantBreadcrumb = {
  at: string;
  kind: TenantBreadcrumbKind;
  message: string;
  data?: Record<string, unknown>;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Reads the trail, oldest first. Never throws. */
export function readTenantBreadcrumbs(): TenantBreadcrumb[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TenantBreadcrumb[]) : [];
  } catch {
    return [];
  }
}

/** Appends a breadcrumb and mirrors it to the console for live debugging. */
export function pushTenantBreadcrumb(
  kind: TenantBreadcrumbKind,
  message: string,
  data?: Record<string, unknown>,
): TenantBreadcrumb {
  const crumb: TenantBreadcrumb = {
    at: new Date().toISOString(),
    kind,
    message,
    ...(data ? { data } : {}),
  };

  if (isBrowser()) {
    try {
      const next = [...readTenantBreadcrumbs(), crumb].slice(-MAX_BREADCRUMBS);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked — the console mirror below still helps.
    }
  }

  // eslint-disable-next-line no-console
  console.info(`[tenant] ${kind}: ${message}`, data ?? {});
  return crumb;
}

export function clearTenantBreadcrumbs(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Human-readable dump, handy for pasting into a support ticket. */
export function formatTenantBreadcrumbs(): string {
  return readTenantBreadcrumbs()
    .map((c) => `${c.at} ${c.kind} — ${c.message}${c.data ? ` ${JSON.stringify(c.data)}` : ""}`)
    .join("\n");
}
