import { BRAND_NAME } from "@/lib/branding/brand";
import { docsUrl } from "@/lib/docs/links";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  Download,
  RefreshCcw,
  Activity,
  Sparkles,
  FileText,
  KeyRound,
  Bug,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Rocket,
  ArrowUpCircle,
} from "lucide-react";
import {
  checkForUpdates,
  verifyLicense,
  runHealthReport,
  runOptimizationReport,
  runErrorDiagnostics,
  getDocumentationPackage,
  runOneClickUpgrade,
  type ProbeStatus,
} from "@/lib/release/installation.functions";

export const Route = createFileRoute("/_authenticated/release-center")({
  head: () => ({
    meta: [
      { title: `Release Center — ${BRAND_NAME} CodeCanyon Toolkit` },
      { name: "description", content: `License, updates, health, optimization, diagnostics, and documentation package for ${BRAND_NAME}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReleaseCenter,
});

const statusIcon = (s: ProbeStatus) => {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-rose-500" />;
  return <Info className="h-4 w-4 text-sky-500" />;
};

function ReleaseCenter() {
  const licenseFn = useServerFn(verifyLicense);
  const updateFn = useServerFn(checkForUpdates);
  const healthFn = useServerFn(runHealthReport);
  const optFn = useServerFn(runOptimizationReport);
  const diagFn = useServerFn(runErrorDiagnostics);
  const docsFn = useServerFn(getDocumentationPackage);
  const upgradeFn = useServerFn(runOneClickUpgrade);

  const license = useQuery({ queryKey: ["rc.license"], queryFn: () => licenseFn() });
  const updates = useQuery({ queryKey: ["rc.updates"], queryFn: () => updateFn() });
  const health = useQuery({ queryKey: ["rc.health"], queryFn: () => healthFn() });
  const opt = useQuery({ queryKey: ["rc.opt"], queryFn: () => optFn() });
  const diag = useQuery({ queryKey: ["rc.diag"], queryFn: () => diagFn() });
  const docs = useQuery({ queryKey: ["rc.docs"], queryFn: () => docsFn() });

  const upgradeMut = useMutation({ mutationFn: () => upgradeFn() });

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Rocket className="h-6 w-6 text-primary" /> Release Center
          </h1>
          <p className="text-sm text-muted-foreground">CodeCanyon toolkit — license, updates, health, and documentation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/install">Re-run install wizard</Link></Button>
          <Button variant="outline" asChild><Link to="/release-readiness">Release readiness</Link></Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>License</CardDescription></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold capitalize">{license.data?.tier ?? "—"}</div>
            <Badge variant={license.data?.active ? "default" : "outline"} className="mt-1">
              {license.data?.active ? "Active" : "Not activated"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Version</CardDescription></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{updates.data?.current ?? "—"}</div>
            <p className="text-xs text-muted-foreground">{updates.data?.update_available ? `Update to ${updates.data.latest}` : "Up to date"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Health score</CardDescription></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{health.data?.score ?? "—"}%</div>
            <Progress value={health.data?.score ?? 0} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Recommendations</CardDescription></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{opt.data?.tips.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">Open optimization tips</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="license" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="license"><KeyRound className="h-4 w-4" />License</TabsTrigger>
          <TabsTrigger value="updates"><RefreshCcw className="h-4 w-4" />Updates</TabsTrigger>
          <TabsTrigger value="health"><Activity className="h-4 w-4" />Health</TabsTrigger>
          <TabsTrigger value="optimization"><Sparkles className="h-4 w-4" />Optimization</TabsTrigger>
          <TabsTrigger value="diagnostics"><Bug className="h-4 w-4" />Diagnostics</TabsTrigger>
          <TabsTrigger value="docs"><FileText className="h-4 w-4" />Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="license">
          <Card>
            <CardHeader>
              <CardTitle>License Verification</CardTitle>
              <CardDescription>{license.data?.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Product" value={license.data?.product} />
                <Field label="Tier" value={license.data?.tier} />
                <Field label="License key" value={license.data?.license_key ?? "—"} />
                <Field label="Purchase code" value={license.data?.purchase_code ?? "—"} />
                <Field label="Buyer" value={license.data?.buyer ?? "—"} />
                <Field label="Activated" value={license.data?.activated_at ?? "—"} />
                <Field label="Expires" value={license.data?.expires_at ?? "Never"} />
                <Field label="Domain" value={license.data?.domain ?? "—"} />
              </div>
              <Button asChild variant="outline"><Link to="/install">Activate / change license</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="updates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> Update Checker
              </CardTitle>
              <CardDescription>Channel: {updates.data?.channel} · Released {updates.data?.released_at?.slice(0, 10)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-control border p-4">
                <div>
                  <p className="font-medium">Current v{updates.data?.current}</p>
                  <p className="text-sm text-muted-foreground">
                    {updates.data?.update_available ? `A new version (v${updates.data.latest}) is available.` : "You're on the latest release."}
                  </p>
                </div>
                <Button onClick={() => upgradeMut.mutate()} disabled={upgradeMut.isPending}>
                  <ArrowUpCircle className="h-4 w-4" />
                  {upgradeMut.isPending ? "Upgrading" : "One-click upgrade"}
                </Button>
              </div>

              {upgradeMut.data && (
                <ul className="space-y-2">
                  {upgradeMut.data.steps.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 rounded-control border p-3">
                      {statusIcon(s.status)}
                      <div>
                        <p className="font-medium">{s.label}</p>
                        <p className="text-sm text-muted-foreground">{s.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <p className="mb-2 text-sm font-medium">Highlights</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {updates.data?.highlights.map((h) => <li key={h}>• {h}</li>)}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle>Health Report</CardTitle>
              <CardDescription>Live diagnostics across database, auth, AI, messaging, and billing.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {health.data?.sections.map((s) => (
                  <li key={s.key} className="flex items-start gap-3 rounded-control border p-3">
                    {statusIcon(s.status)}
                    <div>
                      <p className="font-medium capitalize">{s.label}</p>
                      <p className="text-sm text-muted-foreground">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Report</CardTitle>
              <CardDescription>Actionable performance, cost, and UX recommendations.</CardDescription>
            </CardHeader>
            <CardContent>
              {opt.data?.tips.length === 0 && (
                <p className="rounded-control border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
                  Everything looks great — no recommendations right now.
                </p>
              )}
              <ul className="space-y-3">
                {opt.data?.tips.map((tip) => (
                  <li key={tip.id} className="rounded-control border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="uppercase text-[11px]">{tip.category}</Badge>
                      <Badge
                        variant={tip.severity === "high" ? "destructive" : tip.severity === "medium" ? "default" : "secondary"}
                        className="uppercase text-[11px]"
                      >
                        {tip.severity}
                      </Badge>
                      <span className="font-medium">{tip.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tip.detail}</p>
                    <p className="mt-1 text-xs text-primary">→ {tip.action}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics">
          <Card>
            <CardHeader>
              <CardTitle>Error Diagnostics</CardTitle>
              <CardDescription>Recent events from the audit log for rapid triage.</CardDescription>
            </CardHeader>
            <CardContent>
              {diag.data?.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent events. System is quiet.</p>
              ) : (
                <ul className="space-y-2">
                  {diag.data?.events.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 rounded-control border p-3 text-sm">
                      <div>
                        <p className="font-medium">{e.message}</p>
                        <p className="text-xs text-muted-foreground">{new Date(e.when).toLocaleString()} · {e.source}</p>
                      </div>
                      <Badge variant="outline" className="uppercase">{e.severity}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Documentation Package</CardTitle>
              <CardDescription>
                {docs.data?.package_name} · {docs.data?.files.length} documents · v{docs.data?.version}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                {docs.data?.files.map((f) => (
                  <li key={f.path} className="flex items-center justify-between rounded border bg-card/40 px-3 py-2">
                    <span className="font-medium">{f.title}</span>
                    <span className="text-xs text-muted-foreground">{(f.bytes / 1024).toFixed(1)} KB · {f.path}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline"><a href={docsUrl()} target="_blank" rel="noreferrer">Open Documentation</a></Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-control border bg-card/40 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}
