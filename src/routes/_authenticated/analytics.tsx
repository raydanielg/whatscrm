import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { formatRate, formatSeconds, useAnalyticsSummary } from "@/hooks/use-analytics-summary";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

const DAYS = 14;

function AnalyticsPage() {
  const { rows, totals, isLoading, isError, error } = useAnalyticsSummary(DAYS);
  const empty = !isLoading && !isError && totals.messages === 0;

  const kpis = [
    { l: "Delivery rate", v: formatRate(totals.deliveryRate) },
    { l: "Read rate", v: formatRate(totals.readRate) },
    { l: "Avg. first response", v: formatSeconds(totals.avgFirstResponseSec) },
    { l: "CSAT", v: totals.csat == null ? "—" : `${totals.csat.toFixed(1)} / 5` },
  ];

  return (
    <>
      <AppTopbar title="Analytics" subtitle="Delivery, engagement, and team performance" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isError && (
          <div role="alert" className="rounded-control border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Couldn&apos;t load analytics: {error instanceof Error ? error.message : "unknown error"}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((s) => (
            <div key={s.l} className="rounded-control border border-border bg-surface p-4 shadow-sm">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className="text-2xl font-display font-semibold mt-1">{isLoading ? "" : s.v}</div>
            </div>
          ))}
        </div>

        {empty && (
          <div className="rounded-control border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
            No messages in the last {DAYS} days. Charts fill in as conversations flow through your inbox.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-control border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-display font-semibold">Volume trend</h3>
            <p className="text-xs text-muted-foreground mb-4">Messages sent (last {DAYS} days)</p>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={rows}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="sent" stroke="var(--color-accent)" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-control border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-display font-semibold">Delivery vs read</h3>
            <p className="text-xs text-muted-foreground mb-4">Comparison over time</p>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="delivered" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="read" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
