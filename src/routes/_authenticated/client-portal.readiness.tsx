import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getClientPortalReadiness,
  type CheckStatus,
} from "@/lib/client-portal/readiness.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/client-portal/readiness")({
  head: () => ({
    meta: [
      { title: "Customer Portal Readiness" },
      {
        name: "description",
        content:
          "Production readiness review for the customer portal — authentication, dashboard, conversations, appointments, billing, KB, AI assistant, notifications, files, and cross-module integrations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReadinessPage,
});

const ICONS: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />,
  warn: <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />,
  fail: <XCircle className="size-4 text-red-600" aria-hidden="true" />,
  info: <Info className="size-4 text-sky-600" aria-hidden="true" />,
};

const BADGE_VARIANT: Record<CheckStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pass: "default",
  warn: "secondary",
  fail: "destructive",
  info: "outline",
};

function ReadinessPage() {
  const fmtZoned = useZonedDateFormatter();
  const run = useServerFn(getClientPortalReadiness);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["client-portal-readiness"],
    queryFn: () => run({}),
    staleTime: 30_000,
  });

  const categories = data ? Object.entries(data.by_category) : [];

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/client">
              <ArrowLeft className="mr-1 size-4" aria-hidden="true" />
              Back to portal
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
              Customer Portal Readiness
            </h1>
            <p className="text-sm text-muted-foreground">
              End-to-end review across authentication, dashboard, conversations, appointments,
              billing, knowledge base, AI assistant, notifications, files, and integrations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Re-run readiness scan"
          >
            <RefreshCw
              className={`mr-1 size-4 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Re-scan
          </Button>
        </div>

        {isLoading && (
          <div className="py-16 text-center text-muted-foreground" role="status" aria-live="polite">
            Running checks
          </div>
        )}

        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Overall score</CardTitle>
                <CardDescription>
                  {data.checks.length} checks • {data.totals.pass} pass · {data.totals.warn} warn ·{" "}
                  {data.totals.fail} fail · {data.totals.info} info • last scan{" "}
                  {fmtZoned(new Date(data.generated_at), { timeStyle: "short" })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-semibold ">{data.score}</span>
                  <span className="text-muted-foreground">/ 100</span>
                </div>
                <Progress
                  value={data.score}
                  aria-label={`Readiness score ${data.score} out of 100`}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {categories.map(([name, s]) => (
                    <span key={name} className="flex items-center gap-1.5">
                      <strong className="text-foreground">{name}:</strong>
                      {s.pass > 0 && <Badge variant="default">{s.pass} pass</Badge>}
                      {s.warn > 0 && <Badge variant="secondary">{s.warn} warn</Badge>}
                      {s.fail > 0 && <Badge variant="destructive">{s.fail} fail</Badge>}
                      {s.info > 0 && <Badge variant="outline">{s.info} info</Badge>}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {categories.map(([category]) => {
                const items = data.checks.filter((c) => c.category === category);
                return (
                  <Card key={category}>
                    <CardHeader>
                      <CardTitle className="text-base">{category}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {items.map((c) => (
                        <div key={c.id} className="flex items-start gap-2 rounded-control border p-3">
                          <div className="mt-0.5">{ICONS[c.status]}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{c.label}</span>
                              <Badge variant={BADGE_VARIANT[c.status]} className="capitalize">
                                {c.status}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Integrations</CardTitle>
                <CardDescription>
                  Verified links between the portal and the rest of the platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Link
                  to="/customers"
                  className="rounded-control border p-3 hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">CRM</div>
                  <div className="text-xs text-muted-foreground">Contacts & orgs</div>
                </Link>
                <Link
                  to="/inbox"
                  className="rounded-control border p-3 hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">Omnichannel Inbox</div>
                  <div className="text-xs text-muted-foreground">Shared threads</div>
                </Link>
                <Link
                  to="/billing"
                  className="rounded-control border p-3 hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">Billing</div>
                  <div className="text-xs text-muted-foreground">Invoices & subs</div>
                </Link>
                <Link
                  to="/booking"
                  className="rounded-control border p-3 hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">Scheduling</div>
                  <div className="text-xs text-muted-foreground">Appointments</div>
                </Link>
                <Link
                  to="/client/assistant"
                  className="rounded-control border p-3 hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">AI Assistant</div>
                  <div className="text-xs text-muted-foreground">Provider engine</div>
                </Link>
                <Link
                  to="/automations"
                  className="rounded-control border p-3 hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">Workflow</div>
                  <div className="text-xs text-muted-foreground">Portal triggers</div>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
