import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Building2,
  Users,
  Sparkles,
  CreditCard,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
  Shield,
  Server,
  ScrollText,
  Package,
  Settings2,
  Flag,
  Gauge,
  Package2,
  Receipt,
  Megaphone,
  LifeBuoy,
  Send,
  BarChart3,
  Code2,
  Menu,
  X,
  Archive,
  Eye,
  Smartphone,
  Webhook,
  PlugZap,
  Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: typeof Activity };
type Group = { label: string; icon: typeof Activity; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Overview",
    icon: Gauge,
    items: [
      { to: "/admin", label: "Dashboard", icon: Activity },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin/monitoring", label: "System Health", icon: Gauge },
    ],
  },
  {
    label: "Tenants",
    icon: Building2,
    items: [
      { to: "/admin/workspaces", label: "Tenants", icon: Building2 },
      { to: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Revenue",
    icon: CreditCard,
    items: [
      { to: "/admin/plans", label: "Subscription Plans", icon: Package },
      { to: "/admin/subscriptions", label: "Subscriptions", icon: Package2 },
      { to: "/admin/billing", label: "Billing", icon: Receipt },
      { to: "/admin/gateways", label: "Payment Gateways", icon: CreditCard },
      { to: "/admin/revenue", label: "Revenue Analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Integrations",
    icon: PlugZap,
    items: [
      { to: "/admin/ai-providers", label: "AI Providers", icon: Sparkles },
      { to: "/admin/whatsapp", label: "WhatsApp", icon: MessageSquare },
      { to: "/admin/whatsapp-status", label: "WhatsApp Status (Current Workspace)", icon: Webhook },
      { to: "/admin/channel-providers", label: "Channel Providers", icon: PlugZap },
      { to: "/admin/developer", label: "Developer Tools", icon: Code2 },
    ],
  },
  {
    label: "Marketplace",
    icon: Package,
    items: [
      { to: "/admin/marketplace-ops", label: "Marketplace Ops", icon: Package },
      { to: "/admin/extension-readiness", label: "Extension Readiness", icon: Package },
    ],
  },
  {
    label: "Platform",
    icon: Settings2,
    items: [
      { to: "/admin/features", label: "Plan Features", icon: Flag },
      { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { to: "/admin/communications", label: "Communications", icon: Send },
      { to: "/admin/template-preview", label: "Template Preview", icon: Eye },
      { to: "/admin/support", label: "Support Center", icon: LifeBuoy },
      { to: "/admin/security", label: "Security", icon: Shield },
      { to: "/security-center", label: "Security Center", icon: Shield },
      { to: "/compliance-center", label: "Compliance Center", icon: Shield },
      { to: "/backup-management", label: "Backup Management", icon: Archive },
      { to: "/performance-center", label: "Performance Center", icon: Gauge },
      { to: "/monitoring-center", label: "Monitoring Center", icon: Activity },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/admin/system", label: "System Ops", icon: Server },
      { to: "/release-readiness", label: "Release Readiness", icon: Shield },
      { to: "/admin/pwa", label: "PWA (Install App)", icon: Smartphone },
      { to: "/admin/settings", label: "Platform Settings", icon: Settings2 },
    ],
  },
];

function matchesItem(pathname: string, to: string) {
  return pathname === to || (to !== "/admin" && pathname.startsWith(`${to}/`));
}

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const activeGroup =
    GROUPS.find((group) => group.items.some((item) => matchesItem(pathname, item.to)))?.label ??
    "Overview";
  const [expanded, setExpanded] = useState({ pathname, label: activeGroup });
  const openGroup = expanded.pathname === pathname ? expanded.label : activeGroup;
  if (expanded.pathname !== pathname) {
    setExpanded({ pathname, label: activeGroup });
  }

  const query = q.trim().toLowerCase();
  const filteredGroups = query
    ? GROUPS.map((g) => ({
        ...g,
        items: g.label.toLowerCase().includes(query)
          ? g.items
          : g.items.filter((it) => it.label.toLowerCase().includes(query)),
      })).filter((g) => g.items.length > 0)
    : GROUPS;

  const accordionProps = query
    ? { type: "multiple" as const, defaultValue: filteredGroups.map((group) => group.label) }
    : {
        type: "single" as const,
        collapsible: true,
        value: openGroup,
        onValueChange: (label: string) => setExpanded({ pathname, label }),
      };

  const search = (
    <div className="px-3 pt-3 pb-1 shrink-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search admin pages…"
          aria-label="Search admin pages"
          className="h-10 w-full rounded-control border border-sidebar-border bg-sidebar-accent/20 py-1.5 pl-8 pr-8 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none focus:border-accent"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear admin search"
            onClick={(event) => {
              setQ("");
              event.currentTarget.parentElement?.querySelector("input")?.focus();
            }}
            className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-control text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );

  const nav = (
    <ScrollArea
      type="hover"
      className="flex-1 basis-0 min-h-0 [&>[data-radix-scroll-area-viewport]]:h-full"
    >
      <nav className="px-3 py-3" aria-label="Super admin navigation">
        {filteredGroups.length === 0 && (
          <p className="px-3 text-xs text-sidebar-foreground/50">No matching pages.</p>
        )}
        <Accordion
          key={query ? `search:${query}` : "navigation"}
          {...accordionProps}
          className="flex flex-col gap-1 motion-reduce:[&_[data-state]]:animate-none"
        >
          {filteredGroups.map((g) => {
            const GroupIcon = g.icon;
            return (
              <AccordionItem key={g.label} value={g.label} className="border-0">
                <AccordionTrigger
                  className={cn(
                    "min-h-10 gap-2 rounded-control px-3 py-2 text-[13px] font-semibold hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:text-sidebar-foreground/50 motion-reduce:[&>svg]:transition-none",
                    activeGroup === g.label
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70",
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <GroupIcon
                      className={cn("size-4 shrink-0", activeGroup === g.label && "text-accent")}
                      aria-hidden
                    />
                    <span className="truncate">{g.label}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-1 motion-reduce:animate-none">
                  <div className="ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2 pt-1">
                    {g.items.map((it) => {
                      const active = matchesItem(pathname, it.to);
                      const Icon = it.icon;
                      return (
                        <Link
                          key={it.to}
                          to={it.to}
                          onClick={() => {
                            setMobileOpen(false);
                            setQ("");
                            setExpanded({ pathname, label: g.label });
                          }}
                          title={it.label}
                          aria-current={active ? "page" : undefined}
                          className={`group relative flex min-h-9 items-center gap-2 rounded-control px-2 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          {active && (
                            <span
                              className="absolute -left-2 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent"
                              aria-hidden
                            />
                          )}
                          <Icon
                            className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`}
                            aria-hidden
                          />
                          <span className="flex-1 truncate">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </nav>
    </ScrollArea>
  );

  const header = (
    <div className="flex shrink-0 items-center h-header gap-2 px-5 border-b border-sidebar-border">
      <div className="grid place-items-center w-9 h-9 bg-destructive/15 text-destructive shrink-0">
        <ShieldCheck className="w-4 h-4" aria-hidden />
      </div>
      <div className="leading-tight">
        <div className="font-display font-semibold text-sidebar-accent-foreground">Super Admin</div>
        <div className="text-xs text-sidebar-foreground/50">Control plane</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin navigation"
        className="md:hidden fixed top-3 left-3 z-40 h-10 w-10 grid place-items-center rounded-control border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Desktop sidebar — fixed on wide screens; the spacer preserves layout
          flow while the fixed panel gives ScrollArea a hard viewport height. */}
      <div className="hidden md:block w-64 shrink-0" aria-hidden="true" />
      <aside className="hidden md:flex fixed left-[var(--sidebar-width-collapsed)] top-0 bottom-0 z-30 h-dvh max-h-dvh w-64 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        {header}
        {search}
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
        >
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-dvh max-h-dvh min-h-0 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-hidden animate-in slide-in-from-left duration-200">
            <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border">
              {header}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin navigation"
                className="h-9 w-9 mr-2 grid place-items-center rounded-control text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {search}
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
