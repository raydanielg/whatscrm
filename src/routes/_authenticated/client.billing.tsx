import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Receipt, ShoppingBag, FileText, Repeat, Wallet, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/client/billing")({
  head: () => ({ meta: [
    { title: "Billing — Customer portal" },
    { name: "description", content: "Orders, invoices, receipts, quotes, subscriptions, payments and upcoming charges." },
  ] }),
  component: BillingLayout,
});

const TABS: Array<{ to: string; label: string; icon: typeof Receipt; exact?: boolean }> = [
  { to: "/client/billing", label: "Overview", icon: Wallet, exact: true },
  { to: "/client/billing/orders", label: "Orders", icon: ShoppingBag },
  { to: "/client/billing/invoices", label: "Invoices", icon: Receipt },
  { to: "/client/billing/quotes", label: "Quotes", icon: FileText },
  { to: "/client/billing/subscriptions", label: "Subscriptions", icon: Repeat },
  { to: "/client/billing/payments", label: "Payments", icon: Wallet },
  { to: "/client/billing/upcoming", label: "Upcoming", icon: CalendarClock },
];

function BillingLayout() {
  const { pathname } = useLocation();
  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-display text-2xl font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">Everything about your orders, invoices, quotes, and payments.</p>
      </header>
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to as "/client/billing"}
              className={`inline-flex items-center gap-1.5 rounded-control px-3 h-9 text-sm border whitespace-nowrap ${
                active ? "bg-accent/10 text-accent border-accent/30 font-medium" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-surface"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
