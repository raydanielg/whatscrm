import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import {
  LifeBuoy, ListTree, Zap, Timer, BarChart3, Star, Tags, Users, ShieldCheck,
  ChevronDown, Inbox, SlidersHorizontal, Settings2, Check,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/helpdesk")({
  head: () => ({
    meta: [
      { title: "Helpdesk" },
      { name: "description", content: "Enterprise ticketing, SLA management, escalations and CSAT — fully integrated with Omnichannel Inbox, CRM and AI." },
    ],
  }),
  component: HelpdeskLayout,
});

type NavLeaf = { to: string; label: string; icon: LucideIcon; description?: string; exact?: boolean };
type NavGroup = { key: string; label: string; icon: LucideIcon; items: NavLeaf[] };

const GROUPS: NavGroup[] = [
  {
    key: "tickets",
    label: "Tickets",
    icon: Inbox,
    items: [
      { to: "/helpdesk", label: "Queue", icon: LifeBuoy, description: "Live ticket queue", exact: true },
      { to: "/helpdesk/manage", label: "Manage", icon: ListTree, description: "Bulk actions & triage" },
      { to: "/helpdesk/organization", label: "Organization", icon: Users, description: "Teams, groups & assignees" },
    ],
  },
  {
    key: "sla",
    label: "SLA & Automation",
    icon: SlidersHorizontal,
    items: [
      { to: "/helpdesk/sla", label: "SLA Monitor", icon: Timer, description: "Real-time SLA health" },
      { to: "/helpdesk/sla-management", label: "SLA Setup", icon: Timer, description: "Policies & escalations" },
      { to: "/helpdesk/macros", label: "Macros", icon: Zap, description: "One-click responses" },
      { to: "/helpdesk/categories", label: "Categories", icon: Tags, description: "Taxonomy & routing" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    icon: BarChart3,
    items: [
      { to: "/helpdesk/csat", label: "CSAT", icon: Star, description: "Customer satisfaction" },
      { to: "/helpdesk/analytics", label: "Analytics", icon: BarChart3, description: "Volume, SLA, performance" },
      { to: "/helpdesk/readiness", label: "Readiness", icon: ShieldCheck, description: "Compliance & health" },
    ],
  },
];

function HelpdeskLayout() {
  const loc = useLocation();
  const isActive = (n: NavLeaf) => (n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to));
  const activeLeaf = GROUPS.flatMap((g) => g.items).find(isActive);

  return (
    <>
      <AppTopbar title="Helpdesk" subtitle="Tickets, SLAs, escalations & customer satisfaction" />
      <div className="border-b bg-background sticky top-[var(--topbar-height,var(--header-height))] z-10">
        <nav
          className="max-w-7xl w-full mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-6 sm:flex sm:flex-wrap"
          aria-label="Helpdesk"
        >
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto sm:overflow-visible">
            {GROUPS.map((group) => {
              const groupActive = group.items.some(isActive);
              const GroupIcon = group.icon;
              return (
                <DropdownMenu key={group.key}>
                  <DropdownMenuTrigger
                    className={cn(
                      "flex shrink-0 items-center gap-2 px-2 sm:px-3 py-2.5 text-sm border-b-2 whitespace-nowrap outline-none transition-colors rounded-none",
                      groupActive
                        ? "border-primary text-primary font-semibold bg-primary/5"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
                      "data-[state=open]:bg-muted/60 data-[state=open]:text-foreground",
                    )}
                    aria-label={group.label}
                  >
                    <GroupIcon className={cn("h-4 w-4 shrink-0", groupActive && "text-primary")} />
                    <span className="hidden sm:inline">{group.label}</span>
                    {groupActive && (
                      <span className="hidden sm:inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] font-semibold text-primary">
                        •
                      </span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="start" sideOffset={4} className="w-[min(16rem,calc(100vw-1.5rem))]">
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                      {group.label}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {group.items.map((leaf) => {
                      const Icon = leaf.icon;
                      const active = isActive(leaf);
                      return (
                        <DropdownMenuItem key={leaf.to} asChild>
                          <Link
                            to={leaf.to}
                            className={cn(
                              "relative flex items-start gap-2.5 cursor-pointer px-2 transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted",
                            )}

                            aria-current={active ? "page" : undefined}
                          >
                            <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active && "text-primary")} />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className={cn("text-sm leading-tight truncate", active && "font-semibold")}>
                                {leaf.label}
                              </span>
                              {leaf.description && (
                                <span className={cn("text-[11px] truncate", active ? "text-primary/80" : "text-muted-foreground")}>
                                  {leaf.description}
                                </span>
                              )}
                            </span>
                            {active && <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />}
                          </Link>
                        </DropdownMenuItem>

                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2 py-2 sm:ml-auto sm:pl-3">
            {activeLeaf && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden md:inline">Current:</span>
                <span className="font-medium text-foreground truncate max-w-[10rem]">{activeLeaf.label}</span>
              </span>
            )}
          </div>
        </nav>
      </div>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </div>
    </>
  );
}
