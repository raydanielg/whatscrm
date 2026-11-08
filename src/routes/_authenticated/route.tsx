import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppFooter } from "@/components/app/app-footer";
import { CommandPalette } from "@/components/app/command-palette";
import { LayoutProvider } from "@/shared/contexts/layout-context";
import { RealtimeMessagingProvider } from "@/hooks/use-realtime-messaging";
import { UnsupportedProviderBanner } from "@/components/app/inbox/unsupported-provider-banner";
import { cn } from "@/lib/utils";
import { ensureMyOrganization } from "@/lib/tenant/provision.functions";
import {
  clearActiveOrgId,
  readActiveOrgId,
  setHostedTenant,
  writeActiveOrgId,
  writeActiveWorkspaceId,
} from "@/lib/tenant/active-tenant";
import {
  HostedDomainAccessError,
  HostedDomainResolutionError,
  resolveHostedWorkspace,
} from "@/lib/white-label/hosted-domain";
import { ThemeApplier } from "@/components/ThemeApplier";
import type { ReactNode } from "react";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { featureForRoute, isRouteEnabled } from "@/lib/admin/platform-features";
import { RoutePermissionGate } from "@/components/app/route-permission-gate";

export const Route = createFileRoute("/_authenticated")({
  // The Supabase session lives in localStorage, which the server cannot read.
  // Without this, SSR of a protected route always sees "no session" and
  // bounces signed-in users to /auth on hard refresh / direct link.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.href } });
    setHostedTenant(null);

    try {
      // A server-side failure can resolve to `undefined` instead of throwing
      // (e.g. the request middleware turned the error into an HTML response),
      // so never destructure the result blindly.
      const result = (await ensureMyOrganization()) as { organizationId?: string } | undefined;
      // Provisioning returns the personal/default organization. A navigation
      // triggered by the switcher must preserve the user's current selection.
      // Read after the await so an in-flight provision cannot undo a switch.
      const organizationId = readActiveOrgId() ?? result?.organizationId;
      if (!organizationId) {
        throw new Error("We could not prepare your workspace. Please try again.");
      }
      const hosted = await resolveHostedWorkspace(window.location.hostname);
      if (hosted) {
        writeActiveWorkspaceId(hosted.workspaceId);
        if (hosted.organizationId) writeActiveOrgId(hosted.organizationId);
        else clearActiveOrgId(data.session.user.id);
        setHostedTenant(hosted);
        return { user: data.session.user, organizationId: hosted.organizationId ?? organizationId };
      }
      writeActiveOrgId(organizationId);
      return { user: data.session.user, organizationId };
    } catch (error) {
      console.error("[auth] Failed to provision organization:", error);
      if (error instanceof HostedDomainAccessError || error instanceof HostedDomainResolutionError)
        throw error;
      // Fall back to the last known organization so a transient provisioning
      // failure does not lock the user out of the app.
      const cached = readActiveOrgId();
      if (cached) return { user: data.session.user, organizationId: cached };
      throw error;
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const location = useLocation();
  // The flow builder (/automations/<id>) is a full-height canvas, so it gets no footer.
  const isFlowBuilder = /^\/automations\/[^/]+/.test(location.pathname);
  const immersiveRoute =
    location.pathname === "/inbox" || location.pathname.startsWith("/admin") || isFlowBuilder;

  return (
    <LayoutProvider>
      <RealtimeMessagingProvider>
        <ThemeApplier />
        <div
          className={cn(
            "flex bg-background text-foreground",
            immersiveRoute ? "h-dvh min-h-0 overflow-hidden" : "min-h-dvh",
          )}
        >
          <AppSidebar />
          <div
            className={cn(
              "flex-1 min-w-0 flex flex-col",
              immersiveRoute && "h-dvh min-h-0 overflow-hidden",
            )}
          >
            <UnsupportedProviderBanner />
            <div
              className={cn(
                "flex-1 flex flex-col min-w-0",
                immersiveRoute && "min-h-0 overflow-hidden",
              )}
            >
              <PlatformFeatureRouteGate path={location.pathname}>
                <RoutePermissionGate path={location.pathname}>
                  <Outlet />
                </RoutePermissionGate>
              </PlatformFeatureRouteGate>
            </div>

            {!immersiveRoute && <AppFooter />}
          </div>
          <CommandPalette />
        </div>
      </RealtimeMessagingProvider>
    </LayoutProvider>
  );
}

function PlatformFeatureRouteGate({ path, children }: { path: string; children: ReactNode }) {
  const { config, loading } = usePlatformRuntime();
  const feature = featureForRoute(path);
  if (feature && loading) return null;
  if (feature && !isRouteEnabled(config.features, path)) {
    return (
      <main className="flex flex-1 items-center justify-center p-6" role="status">
        <div className="max-w-md rounded-control border bg-surface p-6 text-center">
          <h1 className="font-display text-xl font-semibold">Feature unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This feature is disabled in Platform Settings. Contact your administrator.
          </p>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
