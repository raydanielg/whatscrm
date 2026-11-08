import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, MessagesSquare, CalendarDays, Receipt, LifeBuoy,
  Files, UserCircle, Bell, BookOpen, Sparkles,
} from "lucide-react";
import { FloatingChatWidget } from "@/components/client-portal/floating-chat-widget";

export const Route = createFileRoute("/_authenticated/client")({
  staticData: { breadcrumb: "Customer portal" },
  head: () => ({
    meta: [
      { title: "Customer portal" },
      { name: "description", content: "Manage your conversations, appointments, invoices, tickets, orders, files, notifications, knowledge base, AI assistant, and profile." },
    ],
  }),
  component: ClientPortalLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/client", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/client/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/client/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/client/billing", label: "Billing", icon: Receipt },
  { to: "/client/tickets", label: "Support", icon: LifeBuoy },
  { to: "/client/files", label: "Files", icon: Files },
  { to: "/client/notifications", label: "Notifications", icon: Bell },
  { to: "/client/knowledge", label: "Knowledge base", icon: BookOpen },
  { to: "/client/assistant", label: "AI assistant", icon: Sparkles },
  { to: "/client/profile", label: "Profile", icon: UserCircle },
];

function ClientPortalLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-accent focus:text-accent-foreground focus:px-3 focus:py-1.5"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-surface/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase   text-accent font-medium">Customer portal</p>
            <h1 className="font-display text-xl font-semibold">Your workspace</h1>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto grid md:grid-cols-[220px_1fr] gap-6 md:gap-8 px-4 sm:px-6 py-6">
        <nav aria-label="Customer portal" className="md:sticky md:top-4 md:self-start md:h-[calc(100dvh-6rem)] md:overflow-y-auto -mx-4 sm:-mx-0 px-4 sm:px-0">
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 snap-x">
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <li key={n.to} className="shrink-0 md:shrink snap-start">
                  <Link
                    to={n.to as "/client"}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-sm border whitespace-nowrap ${
                      active
                        ? "bg-accent/10 text-accent border-accent/30 font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-surface"
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" /> {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main id="portal-main" className="min-w-0"><Outlet /></main>
      </div>
      <FloatingChatWidget />
    </div>
  );
}
