import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTestingSnapshot } from "@/lib/testing/testing.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Beaker,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  Activity,
  ShieldCheck,
  Zap,
  Accessibility,
  History,
  FlaskConical,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, typeof Beaker> = {
  unit: FlaskConical,
  integration: Beaker,
  api: Activity,
  e2e: CheckCircle2,
  ui: CheckCircle2,
  a11y: Accessibility,
  perf: Zap,
  security: ShieldCheck,
  regression: History,
  smoke: Activity,
};

export const Route = createFileRoute("/_authenticated/testing-dashboard")({
  head: () => ({
    meta: [
      { title: "Testing Dashboard" },
      { name: "description", content: "Unified view of unit, integration, E2E, a11y, performance, and security test results." },
    ],
  }),
  component: TestingDashboard,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Failed to load testing dashboard</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
        <Button
          className="mt-4"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
});

function TestingDashboard() {
  const fetchSnapshot = useServerFn(getTestingSnapshot);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["testing-snapshot"],
    queryFn: () => fetchSnapshot({ data: undefined }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const overall = data?.overall;
  const passRate = overall?.pass_rate ?? 0;

  return (
    <main className="mx-auto max-w-7xl w-full space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Testing Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live snapshot of every test suite — unit, integration, API, E2E, UI, a11y, performance, security, regression & smoke.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh test data">
          <RefreshCw className={"size-4 " + (isFetching ? "animate-spin" : "")} />
          Refresh
        </Button>
      </header>

      {/* Overall summary */}
      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total tests" value={overall?.total ?? 0} loading={isLoading} icon={Beaker} />
        <SummaryCard
          label="Passing"
          value={overall?.passed ?? 0}
          loading={isLoading}
          icon={CheckCircle2}
          tone="success"
        />
        <SummaryCard label="Failing" value={overall?.failed ?? 0} loading={isLoading} icon={XCircle} tone="destructive" />
        <SummaryCard
          label="Skipped"
          value={overall?.skipped ?? 0}
          loading={isLoading}
          icon={MinusCircle}
          tone="muted"
        />
      </section>

      {/* Pass rate + coverage */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overall pass rate</CardTitle>
            <CardDescription>Aggregated across every suite in the last run.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-3xl font-semibold ">{passRate}%</span>
              <Badge variant={passRate >= 95 ? "default" : passRate >= 80 ? "secondary" : "destructive"}>
                {passRate >= 95 ? "Healthy" : passRate >= 80 ? "At risk" : "Failing"}
              </Badge>
            </div>
            <Progress value={passRate} aria-label={`Overall pass rate ${passRate}%`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Code coverage</CardTitle>
            <CardDescription>Vitest / v8 provider. Target ≥ 70% across the board.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.coverage ? (
              (["lines", "statements", "functions", "branches"] as const).map((k) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <span className="">{data.coverage![k]}%</span>
                  </div>
                  <Progress value={data.coverage![k]} aria-label={`${k} coverage ${data.coverage![k]}%`} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Run <code className="rounded bg-muted px-1 py-0.5">npm run test:coverage</code> to populate this panel.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Suites */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Suites</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(data?.suites ?? []).map((s) => (
            <Card key={s.name}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{s.name}</CardTitle>
                <CardDescription>
                  {s.total} tests · {(s.duration_ms / 1000).toFixed(1)}s
                  {s.updated_at ? ` · updated ${new Date(s.updated_at).toLocaleString()}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Badge variant="default">{s.passed} passed</Badge>
                  {s.failed > 0 && <Badge variant="destructive">{s.failed} failed</Badge>}
                  {s.skipped > 0 && <Badge variant="secondary">{s.skipped} skipped</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
          {!isLoading && (data?.suites?.length ?? 0) === 0 && (
            <Alert className="md:col-span-2">
              <AlertTitle>No test artifacts found</AlertTitle>
              <AlertDescription>
                Run <code className="rounded bg-muted px-1 py-0.5">npm run test</code> and{" "}
                <code className="rounded bg-muted px-1 py-0.5">npm run test:e2e</code> to populate the dashboard.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </section>

      {/* Categories */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Test categories</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.categories ?? []).map((c) => {
            const Icon = CATEGORY_ICONS[c.key] ?? Beaker;
            return (
              <Card key={c.key}>
                <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                  <CardTitle className="text-base">{c.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.hint}</code>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  loading,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: typeof Beaker;
  tone?: "success" | "destructive" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={"size-4 " + toneClass} aria-hidden />
      </CardHeader>
      <CardContent>
        <div className={"text-3xl font-semibold  " + toneClass}>
          {loading ? "" : value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
