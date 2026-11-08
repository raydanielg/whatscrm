/**
 * PlatformMaintenanceGate — enforces Super Admin → Platform Settings →
 * Maintenance across the whole app.
 *
 * When maintenance mode is on (and inside its scheduled window), everyone
 * except platform staff sees the maintenance screen with the configured
 * message. Platform staff keep full access, and a few routes stay reachable
 * so staff can still sign in and turn it back off.
 *
 * Read-only mode renders a persistent banner instead of blocking the app.
 */
import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Wrench, Lock } from "lucide-react";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { usePlatformRole } from "@/shared/hooks/use-platform-role";

/** Always reachable so staff can sign in and lift maintenance. */
const BYPASS_PREFIXES = [
  "/auth",
  "/admin",
  "/install",
  "/maintenance",
  "/forgot-password",
  "/reset-password",
  "/legal",
  "/api",
];

export function usePlatformReadOnly(): boolean {
  const { config } = usePlatformRuntime();
  const { role } = usePlatformRole();
  return config.maintenance.readOnly && role !== "superadmin";
}

export function PlatformMaintenanceGate({ children }: { children: ReactNode }) {
  const { config, loading } = usePlatformRuntime();
  const { role, loading: roleLoading } = usePlatformRole();
  const brand = usePlatformBranding();
  const pathname = useLocation({ select: (l) => l.pathname });

  const staff = role === "superadmin" || role === "support";
  const bypass = BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
  const blocked = !loading && !roleLoading && config.maintenance.enabled && !staff && !bypass;

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/10 text-warning">
            <Wrench className="h-7 w-7" />
          </div>
          <p className="mt-6 text-xs uppercase text-muted-foreground">{brand.platformName}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">We'll be right back</h1>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {config.maintenance.message ??
              `${brand.platformName} is undergoing scheduled maintenance. Please check back shortly.`}
          </p>
          {config.maintenance.endsAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              Expected back at {new Date(config.maintenance.endsAt).toLocaleString()}
            </p>
          )}
          {brand.supportEmail && (
            <p className="mt-6 text-xs text-muted-foreground">
              Need help?{" "}
              <a href={`mailto:${brand.supportEmail}`} className="underline hover:text-foreground">
                {brand.supportEmail}
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  const showReadOnly = !loading && config.maintenance.readOnly && !bypass;

  return (
    <>
      {showReadOnly && (
        <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-xs font-medium text-warning-foreground">
          <Lock className="h-3.5 w-3.5" />
          Read-only mode — changes are temporarily disabled while maintenance is in progress.
        </div>
      )}
      {children}
    </>
  );
}
