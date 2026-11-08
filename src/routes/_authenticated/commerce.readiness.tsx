import { Brand } from "@/components/brand";
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw } from "lucide-react";
import { getCommerceReadiness, type CheckStatus } from "@/lib/commerce/readiness.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/commerce/readiness")({
  head: () => ({
    meta: [
      { title: "Commerce Readiness" },
      {
        name: "description",
        content:
          "Production readiness review across catalog, WhatsApp, checkout, payments, orders, AI, analytics, and security.",
      },
    ],
  }),
  component: ReadinessPage,
});

const ICONS: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-emerald-600" />,
  warn: <AlertTriangle className="size-4 text-amber-600" />,
  fail: <XCircle className="size-4 text-red-600" />,
  info: <Info className="size-4 text-sky-600" />,
};

const BADGE_VARIANT: Record<CheckStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pass: "default",
  warn: "secondary",
  fail: "destructive",
  info: "outline",
};

function ReadinessPage() {
  const zonedDate = useZonedDateFormatter();
  const run = useServerFn(getCommerceReadiness);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["commerce-readiness"],
    queryFn: () => run({}),
  });

  const categories = data ? Object.entries(data.by_category) : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/commerce">
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Commerce Production Readiness</h1>
          <p className="text-sm text-muted-foreground">
            End-to-end review across catalog, WhatsApp catalog, checkout, payment links, orders, AI,
            analytics, security and UX.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Re-scan commerce readiness"
        >
          <RefreshCw className={`mr-1 size-4 ${isFetching ? "animate-spin" : ""}`} />
          Re-scan
        </Button>
      </div>

      {isLoading && <div className="py-16 text-center text-muted-foreground">Running checks</div>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Overall score</CardTitle>
              <CardDescription>
                {data.checks.length} checks • last scan{" "}
                {zonedDate(data.generated_at, { hour: "2-digit", minute: "2-digit" })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-semibold ">{data.score}</span>
                <span className="text-muted-foreground">/ 100</span>
              </div>
              <Progress value={data.score} />
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
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
                          <div className="flex items-center gap-2">
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
                Verified links to the rest of <Brand />.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Link to="/customers" className="rounded-control border p-3 hover:bg-muted">
                <div className="text-sm font-medium">CRM</div>
                <div className="text-xs text-muted-foreground">Contacts & deals</div>
              </Link>
              <Link to="/inbox" className="rounded-control border p-3 hover:bg-muted">
                <div className="text-sm font-medium">Inbox</div>
                <div className="text-xs text-muted-foreground">Omnichannel</div>
              </Link>
              <Link to="/commerce/ai" className="rounded-control border p-3 hover:bg-muted">
                <div className="text-sm font-medium">AI Commerce</div>
                <div className="text-xs text-muted-foreground">Recs & forecasts</div>
              </Link>
              <Link to="/automations" className="rounded-control border p-3 hover:bg-muted">
                <div className="text-sm font-medium">Workflows</div>
                <div className="text-xs text-muted-foreground">Automation</div>
              </Link>
              <Link to="/billing" className="rounded-control border p-3 hover:bg-muted">
                <div className="text-sm font-medium">Billing</div>
                <div className="text-xs text-muted-foreground">Invoices & subs</div>
              </Link>
              <Link to="/client/billing" className="rounded-control border p-3 hover:bg-muted">
                <div className="text-sm font-medium">Customer Portal</div>
                <div className="text-xs text-muted-foreground">Self-service</div>
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
