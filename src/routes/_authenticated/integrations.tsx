import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ALL_PROVIDERS } from "@/lib/integrations/providers";
import { Store, PlugZap, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsLayout,
  head: () => ({
    meta: [
      { title: "Integrations" },
      { name: "description", content: `Connect ${BRAND_NAME} to Google Workspace, Microsoft 365, Slack, Zoom, Zapier, and 15+ tools through the provider abstraction layer.` },
    ],
  }),
});

const NAV = [
  { to: "/integrations/marketplace", label: "Marketplace", icon: Store },
  { to: "/integrations/installed", label: "Installed", icon: PlugZap },
  { to: "/integrations/settings", label: "Settings", icon: SettingsIcon },
] as const;

/** Header copy per tab — the layout owns the single page header so child
 *  routes never stack a second sticky <AppTopbar> under the tab strip. */
const HEADERS: Record<string, { title: string; subtitle: string }> = {
  "/integrations/marketplace": {
    title: "Integrations Marketplace",
    subtitle: `Browse and connect ${ALL_PROVIDERS.length} providers across productivity, communication, storage, automation, and developer categories.`,
  },
  "/integrations/installed": {
    title: "Installed integrations",
    subtitle: "Manage active connections, sync status, and lifecycle for every installed integration.",
  },
  "/integrations/settings": {
    title: "Integration settings",
    subtitle: "Global defaults, credentials, and webhook behaviour for the provider layer.",
  },
};

function IntegrationsLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Provider detail/install routes render their own header + no tab strip.
  const isDetail = /^\/integrations\/marketplace\/[^/]+/.test(pathname);
  const header = HEADERS[pathname] ?? {
    title: "Integrations",
    subtitle: `Extensible provider layer — ${ALL_PROVIDERS.length} integrations active`,
  };

  if (isDetail) return <Outlet />;

  return (
    <>
      <AppTopbar title={header.title} subtitle={header.subtitle} />
        <div className="border-b border-border px-4 md:px-6">
          <ScrollArea orientation="horizontal" type="hover" className="w-full">
            <nav className="flex w-max items-center gap-1" role="tablist">

              {NAV.map((item) => {
                const active = pathname === item.to || pathname.startsWith(item.to + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap rounded-none",
                      active
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </div>
      <div className="w-full max-w-7xl mx-auto">
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}

