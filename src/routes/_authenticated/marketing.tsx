import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import {
  Send,
  UsersRound,
  Zap,
  ShieldCheck,
  FileText,
  Radio,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { useMarketingDashboard, useMarketingExtrasRealtime } from "@/hooks/use-marketing-extras";
import { useMarketingRealtime } from "@/hooks/use-marketing";

export const Route = createFileRoute("/_authenticated/marketing")({
  component: MarketingDashboard,
});

function MarketingDashboard() {
  useMarketingRealtime();
  useMarketingExtrasRealtime();
  const { data, isLoading } = useMarketingDashboard();

  const kpis = [
    { label: "Messages sent", value: data?.totals.sent ?? 0, icon: Send },
    { label: "Delivery rate", value: pct(data?.totals.deliveryRate ?? 0), icon: TrendingUp },
    { label: "Read rate", value: pct(data?.totals.readRate ?? 0), icon: BarChart3 },
    { label: "Reply rate", value: pct(data?.totals.replyRate ?? 0), icon: BarChart3 },
  ];

  const tiles = [
    { to: "/campaigns", label: "Campaigns", icon: Send, count: data?.counts.campaigns },
    { to: "/broadcasts", label: "Broadcasts", icon: Radio, count: data?.counts.running },
    { to: "/segments", label: "Segments", icon: UsersRound, count: data?.counts.segments },
    { to: "/audience", label: "Audience", icon: UsersRound },
    { to: "/contact-lists", label: "Contact Lists", icon: UsersRound, count: data?.counts.lists },
    { to: "/drip", label: "Drip Campaigns", icon: Zap, count: data?.counts.activeDrips },
    { to: "/campaign-templates", label: "Templates", icon: FileText, count: data?.counts.templates },
    { to: "/whatsapp-templates", label: "WhatsApp Templates", icon: FileText },
    { to: "/scheduling", label: "Scheduling", icon: Zap },
    { to: "/consent", label: "Consent Center", icon: ShieldCheck, count: data?.counts.optedIn },
    { to: "/campaign-analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <>
      <AppTopbar title="Marketing" subtitle="Command center for campaigns, audiences and consent" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-control border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <k.icon className="w-3.5 h-3.5" />
                {k.label}
              </div>
              <div className="text-2xl font-display font-semibold mt-2 ">
                {isLoading ? "" : typeof k.value === "number" ? k.value.toLocaleString() : k.value}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-xs  text-muted-foreground mb-2">Modules</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="rounded-control border border-border bg-surface p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition"
              >
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                    <t.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.label}</div>
                    {typeof t.count === "number" && (
                      <div className="text-xs text-muted-foreground ">
                        {t.count.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-control border border-border bg-surface shadow-sm">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="font-medium">Recent campaigns</div>
            <Link to="/campaigns" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading</div>
            ) : (data?.campaigns ?? []).slice(0, 8).length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No campaigns yet.</div>
            ) : (
              (data?.campaigns ?? []).slice(0, 8).map((c: any) => (
                <Link
                  key={c.id}
                  to="/campaigns/$campaignId"
                  params={{ campaignId: c.id }}
                  className="p-4 flex items-center gap-3 hover:bg-muted/40 transition"
                >
                  <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">Campaign {c.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.total_recipients?.toLocaleString?.() ?? 0} recipients ·{" "}
                      {c.sent_count?.toLocaleString?.() ?? 0} sent
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-control bg-muted capitalize">{c.status}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}
