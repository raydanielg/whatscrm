import { useBrandName } from "@/hooks/use-brand-name";
import { requireOrgRole } from "@/lib/rbac";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BookOpen,
  Terminal,
  Sparkles,
  Palette,
  FlaskConical,
  Play,
  Compass,
  Webhook,
  Code2,
  Package,
  Rocket,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";

export const Route = createFileRoute("/_authenticated/developer-tools")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "Developer Tools" },
  head: () => ({
    meta: [
      { title: "Developer Tools" },
      {
        name: "description",
        content:
          "SDK docs, plugin generator, theme generator, sandbox, API explorer, webhook tester, code examples, and publishing guides.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevToolsLayout,
});

type NavItem = { to: string; label: string; icon: typeof Terminal; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/developer-tools", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/developer-tools/sdk", label: "SDK Docs", icon: BookOpen },
  { to: "/developer-tools/cli", label: "CLI Tool", icon: Terminal },
  { to: "/developer-tools/plugin-generator", label: "Plugin Generator", icon: Sparkles },
  { to: "/developer-tools/theme-generator", label: "Theme Generator", icon: Palette },
  { to: "/developer-tools/sandbox", label: "Testing Sandbox", icon: FlaskConical },
  { to: "/developer-tools/playground", label: "Playground", icon: Play },
  { to: "/developer-tools/api-explorer", label: "API Explorer", icon: Compass },
  { to: "/developer-tools/webhook-tester", label: "Webhook Tester", icon: Webhook },
  { to: "/developer-tools/examples", label: "Code Examples", icon: Code2 },
  { to: "/developer-tools/templates", label: "Package Templates", icon: Package },
  { to: "/developer-tools/publishing", label: "Publishing Guide", icon: Rocket },
  { to: "/developer-tools/versioning", label: "Versioning Guide", icon: GitBranch },
];

function DevToolsLayout() {
  const brandName = useBrandName();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <AppTopbar
        title="Developer Tools"
        subtitle={`Everything you need to build, test, and ship plugins for ${brandName}.`}
        actions={<DeveloperOrgSwitcher />}
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
          <nav
            aria-label="Developer tools"
            className="md:sticky md:top-[calc(var(--topbar-height,var(--header-height))+1rem)] self-start"
          >
            <ul className="space-y-0.5">
              {NAV.map((n) => {
                const active = n.exact
                  ? pathname === n.to
                  : pathname.startsWith(n.to) && n.to !== "/developer-tools";
                return (
                  <li key={n.to}>
                    <Link
                      to={n.to as unknown as "/developer-tools"}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-control text-sm font-medium transition-colors",
                        active ? "bg-accent/10 text-accent" : "hover:bg-muted text-foreground/80",
                      )}
                    >
                      <n.icon className="w-4 h-4" aria-hidden />
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
    </>
  );
}
