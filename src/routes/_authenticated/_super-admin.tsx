import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requirePlatformRole } from "@/lib/rbac";
import { useLayout } from "@/shared/contexts/layout-context";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { getMonitoringSnapshot } from "@/lib/admin/monitoring.functions";
import { cn } from "@/lib/utils";

/**
 * Admin Panel gate.
 *
 * `beforeLoad` runs BEFORE any route in this subtree is loaded, and even
 * before the layout component is instantiated — so route-level RBAC here
 * strictly prevents the admin bundle from rendering for anyone other than a
 * platform superadmin. This is the primary enforcement point; the API layer
 * additionally re-checks role for every mutation (defense in depth).
 */
export const Route = createFileRoute("/_authenticated/_super-admin")({
  beforeLoad: requirePlatformRole("superadmin"),
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const brand = useTenantBrand();
  const { platformRole } = Route.useRouteContext();
  const { sidebarCollapsed, setSidebarCollapsed } = useLayout();
  const runSnapshot = useServerFn(getMonitoringSnapshot);
  const monitoring = useQuery({
    queryKey: ["admin-header-monitoring"],
    queryFn: () => runSnapshot(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const incidents = monitoring.data?.incidents ?? [];
  const healthUnavailable = monitoring.isError || monitoring.data?.system.status === "unknown";
  const hasCritical = !healthUnavailable && incidents.some((i) => i.severity === "down");
  const hasWarning = !healthUnavailable && incidents.some((i) => i.severity === "degraded");
  const healthLabel = healthUnavailable
    ? "Status unavailable"
    : !monitoring.data
      ? "Checking systems"
      : hasCritical
        ? "Active incident"
        : hasWarning
          ? "Needs attention"
          : "All systems operational";
  const healthClasses = hasCritical
    ? "bg-red-500/10 text-red-600"
    : hasWarning
      ? "bg-amber-500/10 text-amber-600"
      : !monitoring.data || healthUnavailable
        ? "bg-muted text-muted-foreground"
        : "bg-emerald-500/10 text-emerald-600";
  const dotClasses = hasCritical
    ? "bg-red-500"
    : hasWarning
      ? "bg-amber-500"
      : !monitoring.data || healthUnavailable
        ? "bg-muted-foreground"
        : "bg-emerald-500";

  // Auto-collapse the main app sidebar while inside /admin so the AdminSidebar
  // has room to breathe; restore the previous state when leaving.
  useEffect(() => {
    const previous = sidebarCollapsed;
    if (!previous) setSidebarCollapsed(true, { persist: false });
    return () => {
      if (!previous) setSidebarCollapsed(false, { persist: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex min-h-0">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-header border-b border-border bg-surface px-6 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Platform · role {platformRole}</div>
            <h1 className="font-display font-semibold text-sm">{`${brand.name} Super Admin`}</h1>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Link
              to="/admin/monitoring"
              title={
                incidents.map((incident) => `${incident.source}: ${incident.message}`).join("\n") ||
                "Open System Health"
              }
              aria-label={`System health: ${healthLabel}. Open details`}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded-control hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                healthClasses,
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  dotClasses,
                  monitoring.data && "animate-pulse",
                )}
              />
              {healthLabel}
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
