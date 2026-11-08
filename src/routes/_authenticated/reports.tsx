import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useAnalyticsSummary } from "@/hooks/use-analytics-summary";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  staticData: { breadcrumb: "Reports" },
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: ReportsPage,
});

const DAYS = 14;

function ReportsPage() {
  const { rows, totals, isLoading, isError, error } = useAnalyticsSummary(DAYS);
  const empty = !isLoading && !isError && totals.messages === 0;

  return (
    <>
      <AppTopbar title="Reports" subtitle="Delivery, response times, and team performance" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isError && (
          <div role="alert" className="rounded-control border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Couldn&apos;t load reports: {error instanceof Error ? error.message : "unknown error"}
          </div>
        )}
        <div className="rounded-control border border-border bg-surface p-5">
          <h3 className="font-display font-semibold">Volume — last {DAYS} days</h3>
          {empty && (
            <p className="mt-2 text-sm text-muted-foreground">
              No outbound messages in this period yet. This chart fills in as you send messages.
            </p>
          )}
          <div className="h-72 mt-4">
            <ResponsiveContainer>
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="delivered" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="read" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </>
  );
}
