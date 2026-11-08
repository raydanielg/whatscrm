import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ShieldCheck,
  MoreHorizontal,
  LayoutDashboard,
  User,
  Settings,
  CreditCard,
  LifeBuoy,
  Bell,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useLayout } from "@/shared/contexts/layout-context";
import { OrganizationSwitcherConnected } from "./organization-switcher-connected";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import wacrmLogo from "@/assets/wacrm-logo.png";
import { NAV_ITEMS, NAV_GROUPS, API_CONFIG_CHILDREN, navKey, type NavItem } from "./nav-config";
import { NestedNavItem, NestedNavGroup, type NestedNavNode } from "./nested-nav-item";
import { SidebarGroupFlyout, type SidebarFlyoutSection } from "./sidebar-group-flyout";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { usePlatformRole } from "@/shared/hooks/use-platform-role";
import { usePermissions } from "@/hooks/use-permissions";
import { useConversationCounts } from "@/hooks/use-conversations";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { isRouteEnabled } from "@/lib/admin/platform-features";
import { docsUrl } from "@/lib/docs/links";

export function AppSidebar() {
  const { effectiveCollapsed, navMode, toggleSidebar } = useLayout();
  const location = useLocation();
  const isInbox = location.pathname === "/inbox" || location.pathname.startsWith("/inbox/");
  const sidebarCollapsed = isInbox || effectiveCollapsed;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = usePlatformRole();
  const { can, isSuperAdmin, loading: permsLoading, orgRole, platformRole } = usePermissions();
  const { active: activeWorkspace } = useCurrentWorkspace();
  const { data: workspaceRole } = useWorkspaceRole(activeWorkspace?.id);
  const brand = useTenantBrand();
  const { data: convCounts } = useConversationCounts();
  const { config: platform } = usePlatformRuntime();
  const liveBadge = (to: string): number | undefined =>
    to === "/inbox" ? (convCounts?.badges?.unread ?? convCounts?.unread) : undefined;

  const isActive = (to: string, exact?: boolean) =>
    exact
      ? location.pathname === to
      : location.pathname === to || location.pathname.startsWith(to + "/");

  function buildGroupNode(
    group: { id: NavItem["group"]; label: string; icon: typeof LayoutDashboard },
    items: NavItem[],
  ): NestedNavNode {
    if (group.id === "api") {
      return { label: group.label, icon: group.icon, children: API_CONFIG_CHILDREN };
    }
    const byCategory = items.reduce(
      (acc, it) => {
        const key = it.category ?? "Other";
        if (!acc[key]) acc[key] = [];
        acc[key].push(it);
        return acc;
      },
      {} as Record<string, NavItem[]>,
    );

    const hasCategories = items.some((it) => it.category);
    const children = hasCategories
      ? Object.entries(byCategory).map(([category, catItems]) => ({
          label: category,
          children: catItems.map((it) => ({
            to: it.to,
            label: it.label,
            icon: it.icon,
            badge: liveBadge(it.to) ?? it.badge,
            external: it.external,
            exact: it.exact,
            hash: it.hash,
          })),
        }))
      : items.map((it) => ({
          to: it.to,
          label: it.label,
          icon: it.icon,
          badge: liveBadge(it.to) ?? it.badge,
          external: it.external,
          exact: it.exact,
          hash: it.hash, // was dropped here, unlike the categorised branch above
        }));

    return { label: group.label, icon: group.icon, children };
  }

  function buildFlyoutSections(node: NestedNavNode): SidebarFlyoutSection[] {
    const children = node.children ?? [];
    const direct = children.filter((child) => child.to);
    const grouped = children.filter((child) => !child.to && child.children?.length);
    const sections: SidebarFlyoutSection[] = [];

    if (direct.length) {
      sections.push({
        items: direct.map((child) => ({
          to: child.to!,
          label: child.label,
          icon: child.icon ?? node.icon ?? LayoutDashboard,
          active: isActive(child.to!, child.exact),
          badge: child.badge,
          external: child.external,
          hash: child.hash,
        })),
      });
    }

    grouped.forEach((section) => {
      sections.push({
        label: section.label,
        items: (section.children ?? [])
          .filter((child): child is NestedNavNode & { to: string } => !!child.to)
          .map((child) => ({
            to: child.to,
            label: child.label,
            icon: child.icon ?? node.icon ?? LayoutDashboard,
            active: isActive(child.to, child.exact),
            badge: child.badge,
            external: child.external,
            hash: child.hash,
          })),
      });
    });

    return sections.filter((section) => section.items.length > 0);
  }

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreTooltipOpen, setMoreTooltipOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const groups = [
    ...NAV_GROUPS,
    ...(role === "superadmin"
      ? [{ id: "admin" as const, label: "Platform", icon: ShieldCheck }]
      : []),
  ];

  if (navMode === "mobile") return null;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-collapsed={sidebarCollapsed || undefined}
        data-nav-mode={navMode}
        className={cn(
          "group/sidebar flex shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-300 ease-out",
          "sticky top-0 h-screen self-start",
          sidebarCollapsed ? "w-[60px]" : "w-64",
        )}
      >
        {/* Brand */}
        <a
          href="/"
          className={cn(
            "flex items-center h-header border-b border-sidebar-border transition-all",
            sidebarCollapsed ? "justify-center px-2" : "gap-2 px-5",
          )}
        >
          <div className="grid place-items-center shrink-0 overflow-hidden">
            <img
              src={brand.logoUrl ?? wacrmLogo}
              alt={`${brand.name} logo`}
              className="size-6"
              onError={(e) => {
                // A tenant logo URL can 404 (deleted asset / expired signed
                // URL). Fall back to the bundled mark instead of rendering a
                // broken-image icon in the rail.
                const img = e.currentTarget;
                if (img.src !== wacrmLogo) img.src = wacrmLogo;
              }}
            />
          </div>

          {!sidebarCollapsed && (
            <div className="leading-tight animate-fade-in min-w-0">
              <div
                className="font-display font-bold text-xl text-sidebar-foreground truncate"
                title={brand.name}
              >
                {brand.name}
              </div>
            </div>
          )}
        </a>

        {/* Organization + Workspace switcher (merged) */}
        <div className={cn("pt-4", sidebarCollapsed ? "px-2" : "px-3")}>
          <OrganizationSwitcherConnected collapsed={sidebarCollapsed} />
        </div>

        {/* Navigation */}
        <ScrollAreaPrimitive.Root className="relative flex-1 min-h-0 overflow-hidden">
          <ScrollAreaPrimitive.Viewport className="h-full w-full">
            <nav className={cn("py-4", sidebarCollapsed ? "px-2 space-y-4" : "px-3 space-y-0.5")}>
              <NestedNavGroup>
                {groups.map((group) => {
                  const items = NAV_ITEMS.filter((n) => n.group === group.id)
                    .filter((n) => {
                      if (
                        n.to === "/settings/white-label" &&
                        workspaceRole !== "owner" &&
                        workspaceRole !== "admin"
                      )
                        return false;
                      // Developer Center items are group: 'settings', category: 'Developer'
                      // Navigation to /developer requires 'owner' or 'admin' org role.
                      if (n.to.startsWith("/developer") || n.to === "/developer") {
                        const isAuthorized =
                          orgRole === "owner" ||
                          orgRole === "admin" ||
                          platformRole === "superadmin";
                        if (!isAuthorized) return false;
                      }
                      return !n.permission || permsLoading || isSuperAdmin || can(n.permission);
                    })
                    .filter((n) => isRouteEnabled(platform.features, n.to));
                  if (!items.length) return null;

                  if (sidebarCollapsed) {
                    if (group.flat && items.length === 1) {
                      const item = items[0];
                      return (
                        <SidebarLink
                          key={navKey(item)}
                          item={{ ...item, badge: liveBadge(item.to) ?? item.badge }}
                          active={isActive(item.to, item.exact)}
                          collapsed
                        />
                      );
                    }

                    const node = buildGroupNode(group, items);
                    return (
                      <SidebarGroupFlyout
                        key={group.id}
                        label={group.label}
                        icon={group.icon}
                        active={items.some((item) => isActive(item.to, item.exact))}
                        sections={buildFlyoutSections(node)}
                        testId={`sidebar-group-${group.id}`}
                      />
                    );
                  }

                  // Flat groups (e.g. Inbox) render as plain links, not a collapsible section.
                  if (group.flat) {
                    return (
                      <div key={group.id} className="space-y-1">
                        {items.map((item) => (
                          <SidebarLink
                            key={navKey(item)}
                            item={{ ...item, badge: liveBadge(item.to) ?? item.badge }}
                            active={isActive(item.to, item.exact)}
                            collapsed={false}
                          />
                        ))}
                      </div>
                    );
                  }

                  const node = buildGroupNode(group, items);
                  return <NestedNavItem key={group.id} node={node} itemKey={group.id} />;
                })}
              </NestedNavGroup>
            </nav>
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.Scrollbar
            orientation="vertical"
            className="flex touch-none select-none transition-colors h-full w-2 border-l border-l-transparent p-[1px]"
          >
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-sidebar-border hover:bg-sidebar-accent-foreground/40 transition-colors" />
          </ScrollAreaPrimitive.Scrollbar>
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>

        {/* Footer actions */}
        <div
          className={cn(
            "h-header flex items-center border-t border-sidebar-border",
            sidebarCollapsed ? "px-2" : "px-3",
          )}
        >
          <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <Tooltip
              open={sidebarCollapsed && moreTooltipOpen && !moreMenuOpen}
              onOpenChange={setMoreTooltipOpen}
            >
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center rounded-control text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      sidebarCollapsed
                        ? "mx-auto h-10 w-10 justify-center p-0"
                        : "w-full gap-3 px-3 py-2",
                    )}
                    aria-label="Account menu"
                    aria-haspopup="menu"
                    aria-expanded={moreMenuOpen}
                  >
                    <MoreHorizontal
                      className={cn(sidebarCollapsed ? "h-5 w-5" : "h-4 w-4")}
                      aria-hidden="true"
                    />
                    {!sidebarCollapsed && <span className="flex-1 text-left">More</span>}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">More</TooltipContent>}
            </Tooltip>
            <DropdownMenuContent
              side={sidebarCollapsed ? "right" : "top"}
              align="start"
              className="w-52"
              loop
              onCloseAutoFocus={(e) => {
                // Let AlertDialog take focus when opening; otherwise return focus to trigger (Radix default).
                if (confirmSignOut) e.preventDefault();
              }}
            >
              {navMode === "full" && !isInbox && (
                <>
                  <DropdownMenuItem onSelect={toggleSidebar}>
                    {sidebarCollapsed ? (
                      <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                    <span>{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem asChild>
                <Link to="/profile" className="gap-2">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/billing" className="gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span>Billing</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/organization" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>Organization</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings/notifications" className="gap-2">
                  <Bell className="h-4 w-4" />
                  <span>Notifications</span>
                </Link>
              </DropdownMenuItem>
              {role === "superadmin" && (
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Super Admin</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={docsUrl("support")} target="_blank" rel="noreferrer" className="gap-2">
                  <LifeBuoy className="h-4 w-4" />
                  <span>Help &amp; support</span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmSignOut(true);
                }}
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of your account?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign in again to access your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const linkClass = cn(
    "group relative flex items-center rounded-control text-sm transition-all",
    collapsed ? "mx-auto h-10 w-10 justify-center p-0" : "gap-3 px-3 py-2",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
  );
  const inner = (
    <>
      {active && (
        <span
          className={cn(
            "absolute left-0 top-1/2 w-0.5 -translate-y-1/2 rounded-r-full bg-accent",
            collapsed ? "h-5" : "h-4 -translate-x-3",
          )}
          aria-hidden
        />
      )}
      <Icon
        className={cn(
          "shrink-0 transition-transform",
          collapsed ? "h-5 w-5" : "h-4 w-4",
          active && "text-accent",
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span
              data-testid={`sidebar-badge-${item.to}`}
              className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent"
            >
              {item.badge}
            </span>
          ) : item.group === "admin" ? (
            <ShieldCheck className="h-3 w-3 text-accent/70" />
          ) : null}
        </>
      )}
      {collapsed && item.badge ? (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" aria-hidden />
      ) : null}
    </>
  );
  const content = item.external ? (
    <a href={item.to} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {inner}
    </a>
  ) : (
    // `hash` carries the in-page deep link (Social Studio tabs etc). Without
    // it every Social Studio entry rendered as a bare /social link, so all six
    // sub-items navigated to the same place.
    <Link to={item.to} hash={item.hash} className={linkClass}>
      {inner}
    </Link>
  );

  if (!collapsed) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {item.label}
        {item.shortcut && (
          <kbd className="rounded bg-muted px-1 text-[11px] font-mono text-muted-foreground">
            {item.shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
