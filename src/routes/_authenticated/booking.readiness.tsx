import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw } from "lucide-react";
import { getBookingReadiness, type CheckStatus } from "@/lib/booking/readiness.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/booking/readiness")({
  head: () => ({
    meta: [
      { title: "Booking Readiness" },
      {
        name: "description",
        content:
          "Production readiness review across booking pages, calendars, meetings, notifications, AI, analytics, and integrations.",
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
  const fmtZoned = useZonedDateFormatter();
  const runReadiness = useServerFn(getBookingReadiness);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["booking-readiness"],
    queryFn: () => runReadiness({}),
  });

  const categories = data ? Object.entries(data.by_category) : [];

  return (
    <div className="min-h-screen bg-background">
      <AppTopbar
        title="Booking Readiness"
        subtitle="End-to-end review across booking pages, calendars, availability, meetings, notifications, AI, analytics and integrations."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/booking">
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1 size-4 ${isFetching ? "animate-spin" : ""}`} />
              Re-scan
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {isLoading && (
          <div className="py-16 text-center text-muted-foreground">Running checks</div>
        )}

        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Overall score</CardTitle>
                <CardDescription>
                  {data.checks.length} checks • last scan{" "}
                  {fmtZoned(new Date(data.generated_at), { timeStyle: "short" })}
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
                <CardDescription>Verified links to the rest of the platform.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Link to="/customers" className="rounded-control border p-3 hover:bg-muted">
                  <div className="text-sm font-medium">CRM</div>
                  <div className="text-xs text-muted-foreground">Contacts & deals</div>
                </Link>
                <Link to="/inbox" className="rounded-control border p-3 hover:bg-muted">
                  <div className="text-sm font-medium">Omnichannel Inbox</div>
                  <div className="text-xs text-muted-foreground">Unified timeline</div>
                </Link>
                <Link to="/automations" className="rounded-control border p-3 hover:bg-muted">
                  <div className="text-sm font-medium">Workflow Automation</div>
                  <div className="text-xs text-muted-foreground">Booking triggers</div>
                </Link>
                <Link to="/booking/ai-assistant" className="rounded-control border p-3 hover:bg-muted">
                  <div className="text-sm font-medium">AI Scheduling</div>
                  <div className="text-xs text-muted-foreground">11 AI features</div>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
