import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Gauge, Zap, ImageIcon, Database, Radio, List, Infinity as InfinityIcon,
  Workflow, Cpu, HardDrive, Package, Server, CheckCircle2, AlertTriangle,
  XCircle, RefreshCcw, TrendingUp, MinusCircle,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppTopbar } from "@/components/app/app-topbar";
import { requirePlatformRole } from "@/lib/rbac";
import { useBrowserVitals } from "@/hooks/use-browser-vitals";

import {
  getPerformanceSnapshot,
  type PerfCategory,
  type PerfFinding,
  type PerfSeverity,
} from "@/lib/performance/performance-center.functions";
import { browserFindings, performanceScore } from "@/lib/performance/perf-findings";
import { PERFORMANCE_GUIDANCE } from "@/lib/performance/perf-guidance";

export const Route = createFileRoute("/_authenticated/performance-center")({
  // Platform-wide numbers: staff only. The server function re-checks the role.
  beforeLoad: requirePlatformRole("superadmin", "support"),
  head: () => ({
    meta: [
      { title: "Performance Center" },
      { name: "description", content: `Measured performance for ${BRAND_NAME}: API, database and queues on the server, Core Web Vitals in your browser.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PerformanceCenter,
});

const CATEGORY_META: Record<PerfCategory, { label: string; icon: typeof Gauge }> = {
  "lazy-loading": { label: "Lazy Loading", icon: Zap },
  "code-splitting": { label: "Code Splitting", icon: Package },
  images: { label: "Images", icon: ImageIcon },
  caching: { label: "Caching", icon: HardDrive },
  database: { label: "Database", icon: Database },
  realtime: { label: "Realtime", icon: Radio },
  virtualization: { label: "Virtualization", icon: List },
  pagination: { label: "Infinite Scroll", icon: InfinityIcon },
  "background-jobs": { label: "Background Jobs", icon: Workflow },
  queues: { label: "Queue", icon: Workflow },
  api: { label: "API", icon: Server },
  bundle: { label: "Bundle", icon: Package },
  memory: { label: "Memory", icon: Cpu },
  cwv: { label: "Core Web Vitals", icon: Gauge },
};

function SeverityIcon({ severity }: { severity: PerfSeverity }) {
  if (severity === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (severity === "critical") return <XCircle className="h-4 w-4 text-red-500" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" />; // info = not measured
}

function scoreColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 90) return "text-emerald-500";
  if (score >= 75) return "text-amber-500";
  return "text-red-500";
}

const IS_DEV_BUILD = import.meta.env.DEV;

const num = (v: number | null, unit = "") => (v == null ? "—" : `${v.toLocaleString()}${unit}`);
const pct = (v: number | null, digits = 2) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const bytes = (n: number | null) => {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(Math.max(n, 1)) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

function PerformanceCenter() {
  const fetchSnap = useServerFn(getPerformanceSnapshot);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["performance-snapshot"],
    queryFn: () => fetchSnap(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const vitals = useBrowserVitals();

  const findings = useMemo<PerfFinding[]>(
    () => [...browserFindings(vitals, IS_DEV_BUILD), ...(data?.findings ?? [])],
    [vitals, data],
  );
  const { score, measured, total } = useMemo(() => performanceScore(findings), [findings]);

  const grouped = useMemo(() => {
    const m = new Map<PerfCategory, PerfFinding[]>();
    for (const f of findings) {
      const list = m.get(f.category) ?? [];
      list.push(f);
      m.set(f.category, list);
    }
    return m;
  }, [findings]);

  const s = data?.server;

  return (
    <>
      <AppTopbar
        title="Performance Center"
        subtitle="Measured, not simulated: API, database and queues from the server; Core Web Vitals from your browser."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isError && (
          <Card>
            <CardContent role="alert" className="p-6 text-sm">
              <div className="font-medium flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /> Couldn&apos;t load server measurements</div>
              <p className="text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
              <p className="text-muted-foreground mt-1">Browser measurements below are still live.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Performance score</CardDescription>
              <CardTitle className={`text-4xl ${scoreColor(score)}`}>{score ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={score ?? 0} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {score == null ? "Nothing measured yet" : `Average of ${measured} measured check${measured === 1 ? "" : "s"}`}
                {total > measured && ` · ${total - measured} not measured`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>LCP · your browser</CardDescription>
              <CardTitle className="text-3xl">{vitals.lcpMs != null ? `${(vitals.lcpMs / 1000).toFixed(2)}s` : "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              INP {num(vitals.inpMs != null ? Math.round(vitals.inpMs) : null, "ms")} · CLS {vitals.cls != null ? vitals.cls.toFixed(3) : "—"} · TTFB {num(vitals.ttfbMs, "ms")}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>JavaScript loaded · your browser</CardDescription>
              <CardTitle className="text-3xl">{vitals.js ? `${vitals.js.transferKb.toLocaleString()}KB` : "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {vitals.js ? `${vitals.js.files} files · largest ${vitals.js.largestKb}KB` : "No script resources observed"}
              {IS_DEV_BUILD && " · dev build"}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>API p95 · platform, last 5m</CardDescription>
              <CardTitle className="text-3xl">{s ? (s.api.p95Ms != null ? `${s.api.p95Ms}ms` : "No traffic") : isLoading ? "" : "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {s ? <>DB round trip {num(s.database.probeMs, "ms")} · cache hit {s.database.cacheHitPct != null ? `${s.database.cacheHitPct}%` : "—"}</> : "—"}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="findings">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="cwv">Web Vitals (your browser)</TabsTrigger>
            <TabsTrigger value="server">Server &amp; database</TabsTrigger>
            <TabsTrigger value="queues">Queues &amp; realtime</TabsTrigger>
            <TabsTrigger value="guidance">Best practices</TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Each finding comes from a real measurement. A grey dash means it could not be measured yet and is left out of the score.
            </p>
            {Array.from(grouped.entries()).map(([cat, list]) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              return (
                <Card key={cat}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4" /> {meta.label}
                      <Badge variant="secondary" className="ml-2">{list.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {list.map((f) => (
                      <div key={f.id} className="flex gap-3 items-start p-3 rounded-control border">
                        <SeverityIcon severity={f.severity} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{f.title}</span>
                            <Badge variant="outline" className="text-[11px]">{f.source === "browser" ? "your browser" : "server"}</Badge>
                            {f.severity !== "info" && (
                              <Badge variant="outline" className="text-[11px] uppercase">{f.impact} impact</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{f.detail}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="cwv" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Core Web Vitals — this page load, this browser</CardTitle>
                <CardDescription>
                  Measured live with the browser&apos;s PerformanceObserver, compared with Google&apos;s &quot;good&quot; thresholds.
                  These are <strong>not</strong> field data from other users — the app has no platform-wide real-user monitoring.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric label="LCP" value={vitals.lcpMs != null ? `${(vitals.lcpMs / 1000).toFixed(2)}s` : "—"} target="≤ 2.5s" ok={vitals.lcpMs == null ? null : vitals.lcpMs <= 2500} />
                <Metric label="INP" value={vitals.inpMs != null ? `${Math.round(vitals.inpMs)}ms` : "—"} target="≤ 200ms" ok={vitals.inpMs == null ? null : vitals.inpMs <= 200} hint="Needs a click or keypress" />
                <Metric label="CLS" value={vitals.cls != null ? vitals.cls.toFixed(3) : "—"} target="≤ 0.1" ok={vitals.cls == null ? null : vitals.cls <= 0.1} />
                <Metric label="TTFB" value={vitals.ttfbMs != null ? `${vitals.ttfbMs}ms` : "—"} target="≤ 800ms" ok={vitals.ttfbMs == null ? null : vitals.ttfbMs <= 800} />
                <Metric label="Long tasks" value={String(vitals.longTasks)} target="≤ 5 since load" ok={vitals.supported ? vitals.longTasks <= 5 : null} />
                <Metric label="JS heap" value={vitals.jsHeapMb != null ? `${vitals.jsHeapMb}MB` : "—"} target="≤ 512MB" ok={vitals.jsHeapMb == null ? null : vitals.jsHeapMb <= 512} hint="Chromium only" />
                <Metric label="JS loaded" value={vitals.js ? `${vitals.js.transferKb}KB` : "—"} target={IS_DEV_BUILD ? "n/a in dev" : "≤ 250KB"} ok={vitals.js == null || IS_DEV_BUILD ? null : vitals.js.transferKb <= 250} />
                <Metric label="Largest script" value={vitals.js ? `${vitals.js.largestKb}KB` : "—"} target={IS_DEV_BUILD ? "n/a in dev" : "≤ 500KB"} ok={vitals.js == null || IS_DEV_BUILD ? null : vitals.js.largestKb <= 500} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="server" className="mt-4 space-y-4">
            {!s ? (
              <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{isLoading ? "Loading server measurements" : "Server measurements are unavailable."}</CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">API gateway (last 5 minutes)</CardTitle>
                    <CardDescription>{s.api.requests24h.toLocaleString()} gateway requests in the last 24 hours. Percentiles need at least 20 requests in the window.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Metric label="Requests / min" value={String(s.api.reqPerMin)} target="—" ok={null} />
                    <Metric label="p50" value={num(s.api.p50Ms, "ms")} target="—" ok={null} />
                    <Metric label="p95" value={num(s.api.p95Ms, "ms")} target="≤ 500ms" ok={s.api.p95Ms == null ? null : s.api.p95Ms <= 500} />
                    <Metric label="p99" value={num(s.api.p99Ms, "ms")} target="—" ok={null} />
                    <Metric label="5xx rate" value={pct(s.api.errorRate)} target="≤ 1%" ok={s.api.errorRate == null ? null : s.api.errorRate <= 0.01} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Database &amp; host</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Metric label="Round trip" value={num(s.database.probeMs, "ms")} target="≤ 300ms" ok={s.database.probeMs == null ? null : s.database.probeMs <= 300} hint="Includes network" />
                    <Metric label="Cache hit" value={s.database.cacheHitPct != null ? `${s.database.cacheHitPct}%` : "—"} target="≥ 95%" ok={s.database.cacheHitPct == null ? null : s.database.cacheHitPct >= 95} />
                    <Metric label="Connections" value={s.database.connections != null ? `${s.database.connections}/${s.database.maxConnections ?? "?"}` : "—"} target="< 80%" ok={s.database.connections != null && s.database.maxConnections ? (s.database.connections / s.database.maxConnections) * 100 < 80 : null} />
                    <Metric label="Database size" value={bytes(s.database.sizeBytes)} target="—" ok={null} />
                    <Metric label="Server memory" value={s.process.memoryPct != null ? `${s.process.memoryPct}%` : "—"} target="≤ 85%" ok={s.process.memoryPct == null ? null : s.process.memoryPct <= 85} />
                    <Metric label="Server CPU" value={s.process.cpuPct != null ? `${s.process.cpuPct}%` : "—"} target="—" ok={null} hint="Not available on Windows" />
                    <Metric label="Process uptime" value={s.process.uptimeSeconds != null ? `${Math.floor(s.process.uptimeSeconds / 3600)}h ${Math.floor((s.process.uptimeSeconds % 3600) / 60)}m` : "—"} target="—" ok={null} />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="queues" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {!s ? (
              <Card className="md:col-span-2"><CardContent className="p-8 text-center text-sm text-muted-foreground">{isLoading ? "Loading server measurements" : "Server measurements are unavailable."}</CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Queues</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <Metric label="Waiting" value={String(s.queues.depth)} target="< 5k" ok={s.queues.depth < 5000} />
                    <Metric label="Running" value={String(s.queues.running)} target="—" ok={null} />
                    <Metric label="Failed" value={String(s.queues.failed)} target="0" ok={s.queues.failed === 0} />
                    <Metric label="Oldest wait" value={s.queues.oldestWaitMin != null ? `${s.queues.oldestWaitMin} min` : "Nothing waiting"} target="≤ 10 min" ok={s.queues.oldestWaitMin == null ? true : s.queues.oldestWaitMin <= 10} />
                    <Metric label="Failure rate" value={pct(s.queues.failureRate)} target="≤ 2%" ok={s.queues.failureRate == null ? null : s.queues.failureRate <= 0.02} />
                    <Metric label="Messages sent (24h)" value={s.queues.outboxSent24h.toLocaleString()} target="—" ok={null} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Realtime activity</CardTitle>
                    <CardDescription>Realtime channel and subscriber counts are not observable from the app, so they are not shown.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <Metric label="Sessions (5m)" value={String(s.realtime.sessions5m)} target="—" ok={null} />
                    <Metric label="Users (15m)" value={String(s.realtime.users15m)} target="—" ok={null} />
                    <Metric label="Conversations (5m)" value={String(s.realtime.conversations5m)} target="—" ok={null} />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="guidance" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">General guidance — advice, not measurements. It does not affect the score.</p>
            {PERFORMANCE_GUIDANCE.map((g) => {
              const Icon = CATEGORY_META[g.category].icon;
              return (
                <Card key={g.id}>
                  <CardContent className="p-4 flex gap-3 items-start">
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{g.title}</div>
                      <p className="text-sm text-muted-foreground mt-1">{g.detail}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-right flex items-center justify-end gap-1">
          <TrendingUp className="h-3 w-3" />
          {data ? <>Server snapshot {new Date(data.generatedAt).toLocaleString()}</> : "Server snapshot pending"}
        </p>
      </main>
    </>
  );
}

/** `ok === null` means "not measured / no target": neutral colour, never a pass or a fail. */
function Metric({ label, value, target, ok, hint }: { label: string; value: string; target: string; ok: boolean | null; hint?: string }) {
  const color = ok === null ? "text-foreground" : ok ? "text-emerald-500" : "text-amber-500";
  return (
    <div className="p-3 rounded-control border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${value === "—" ? "text-muted-foreground" : color}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">
        {target === "—" ? (hint ?? "Informational") : `Target ${target}`}
        {hint && target !== "—" && ` · ${hint}`}
      </div>
    </div>
  );
}
