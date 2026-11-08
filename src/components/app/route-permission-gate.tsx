import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutDashboard, ShieldAlert } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useActiveOrganization } from "@/hooks/use-organization";
import { requiredPermissionsForPath } from "./nav-permissions";

/**
 * Central RBAC gate for every nav-reachable route.
 *
 * Mounted once around the authenticated `<Outlet />`, so typing a URL is gated
 * exactly like clicking the (hidden) sidebar link.
 *
 * Fail-OPEN while anything is still resolving — permissions, the super-admin
 * check, or the active organization id. `usePermissions` only resolves the org
 * owner/admin blanket grant once an active org id exists, so rendering the
 * denied state before then would flash "Access denied" at legitimate users on
 * every navigation, or lock out an owner entirely.
 */
export function RoutePermissionGate({ path, children }: { path: string; children: ReactNode }) {
  const required = requiredPermissionsForPath(path);
  const { can, loading, isSuperAdmin } = usePermissions();
  const { active, activeId, isLoading: orgLoading } = useActiveOrganization();

  const orgResolved = !orgLoading && !!(active?.id ?? activeId);

  if (required.length === 0) return <>{children}</>;
  if (loading || !orgResolved) return <>{children}</>;
  if (isSuperAdmin) return <>{children}</>;
  if (required.some((key) => can(key))) return <>{children}</>;

  return <RouteAccessDenied path={path} required={required} />;
}

function RouteAccessDenied({ path, required }: { path: string; required: string[] }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6" role="status">
      <div className="w-full max-w-md rounded-control border bg-surface p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>

        <p className="mt-6 text-xs uppercase text-muted-foreground">Error 403</p>
        <h1 className="mt-2 font-display text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          You don&apos;t have permission to view this page. Ask your workspace owner to grant you
          the right role.
        </p>

        <dl className="mt-6 space-y-2 rounded-control border border-border bg-muted/40 p-4 text-left text-xs">
          <div className="flex items-start justify-between gap-3">
            <dt className="font-medium text-muted-foreground">Required permission</dt>
            <dd className="flex flex-wrap justify-end gap-1">
              {required.map((key) => (
                <span
                  key={key}
                  className="rounded-control bg-background px-2 py-0.5 font-mono font-medium"
                >
                  {key}
                </span>
              ))}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="font-medium text-muted-foreground">Blocked path</dt>
            <dd className="truncate font-mono text-[11px]" title={path}>
              {path}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col flex-wrap gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/dashboard"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              }
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-input bg-background px-4 text-sm font-medium transition hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}
