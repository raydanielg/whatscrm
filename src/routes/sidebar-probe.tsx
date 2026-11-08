import { createFileRoute } from "@tanstack/react-router";
import { Brand } from "@/components/brand";
import { Folder, Users, Settings as SettingsIcon } from "lucide-react";
import { NestedNavItem, type NestedNavNode } from "@/components/app/nested-nav-item";

/**
 * Non-indexed probe page used by the sidebar visual regression spec
 * (`tests/e2e/sidebar-visual.spec.ts`).
 *
 * Renders the sidebar chrome (bg-sidebar surface + border-sidebar-border
 * divider) and a deterministic nested nav tree in the pre-expanded state,
 * so the test can snapshot borders, tree connectors, active states, and
 * hover states in both light and dark themes without needing auth.
 */
export const Route = createFileRoute("/sidebar-probe")({
  head: () => ({
    meta: [
      { title: "Sidebar Probe" },
      { name: "description", content: "Internal test surface for sidebar tokens and borders." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SidebarProbe,
});

const TREE: NestedNavNode[] = [
  {
    label: "Workspace",
    icon: Folder,
    to: "/sidebar-probe/workspace",
    children: [
      { label: "Overview", to: "/sidebar-probe/workspace/overview" },
      { label: "Members", to: "/sidebar-probe/workspace/members" },
      {
        label: "Projects",
        to: "/sidebar-probe/workspace/projects",
        children: [
          { label: "Active", to: "/sidebar-probe/workspace/projects/active" },
          { label: "Archived", to: "/sidebar-probe/workspace/projects/archived" },
        ],
      },
    ],
  },
  {
    label: "People",
    icon: Users,
    to: "/sidebar-probe/people",
    children: [
      { label: "Contacts", to: "/sidebar-probe/people/contacts", badge: 3 },
      { label: "Companies", to: "/sidebar-probe/people/companies" },
    ],
  },
  {
    label: "Settings",
    icon: SettingsIcon,
    to: "/sidebar-probe/settings",
  },
];

function SidebarProbe() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside
        data-testid="sidebar-probe"
        className="w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="border-b border-sidebar-border p-3">
          <div
            data-testid="sidebar-probe-header"
            className="rounded-control border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm font-medium"
          >
            <Brand />
          </div>
        </div>

        <nav data-testid="sidebar-probe-nav" className="space-y-0.5 p-2">
          {TREE.map((node, i) => (
            <NestedNavItem
              key={(node.to ?? node.label) + i}
              node={node}
              depth={0}
              collapsed={false}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
          Sidebar footer
        </div>
      </aside>

      <main className="flex-1 p-6">
        <h1 className="text-lg font-medium">Sidebar Probe</h1>
      </main>
    </div>
  );
}
