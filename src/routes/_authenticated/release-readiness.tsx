import { requireWorkspaceRole } from "@/lib/rbac";
import { docsUrl } from "@/lib/docs/links";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ShieldCheck,
  FileCheck2,
  Database,
  Cog,
  Package,
  RefreshCcw,
} from "lucide-react";
import {
  getReleaseReadiness,
  type Check,
  type ReadinessSection,
} from "@/lib/release/readiness.functions";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/release-readiness")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  head: () => ({
    meta: [
      { title: "Release Readiness — Security, Compliance & CodeCanyon" },
      {
        name: "description",
        content:
          "Enterprise release checklist covering security, compliance, backups, DevOps, and CodeCanyon publication.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReleaseReadinessPage,
});

const ICONS: Record<ReadinessSection["key"], typeof ShieldCheck> = {
  security: ShieldCheck,
  compliance: FileCheck2,
  backup: Database,
  devops: Cog,
  release: Package,
};

function statusIcon(s: Check["status"]) {
  switch (s) {
    case "pass":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden />;
    case "warn":
      return <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden />;
    case "fail":
      return <XCircle className="w-4 h-4 text-destructive" aria-hidden />;
    default:
      return <Info className="w-4 h-4 text-muted-foreground" aria-hidden />;
  }
}

function ReleaseReadinessPage() {
  const fetchReadiness = useServerFn(getReleaseReadiness);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["release-readiness"],
    queryFn: () => fetchReadiness(),
    refetchInterval: 60_000,
  });
  const [tab, setTab] = useState<string>("overview");
  const sections = useMemo(() => data?.sections ?? [], [data]);

  const statusBadge =
    data?.status === "ready" ? (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
        Ready to ship
      </Badge>
    ) : data?.status === "blocked" ? (
      <Badge variant="destructive">Blocked</Badge>
    ) : (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Needs attention</Badge>
    );

  return (
    <>
      <AppTopbar
        title="Release Readiness"
        subtitle="Security, compliance, backup, DevOps and publication checklist"
        actions={
          <div className="flex items-center gap-3">
            {data && statusBadge}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Overall readiness score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold ">
                {isLoading ? "—" : `${data?.overall_score ?? 0}%`}
              </div>
              <div className="flex-1">
                <Progress value={data?.overall_score ?? 0} className="h-3" />
                <p className="text-xs text-muted-foreground mt-2">
                  Aggregated from 5 sections · {sections.reduce((a, s) => a + s.checks.length, 0)}{" "}
                  checks.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {sections.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className="capitalize">
                {s.title.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sections.map((s) => {
                const Icon = ICONS[s.key];
                const failing = s.checks.filter((c) => c.status === "fail").length;
                const warn = s.checks.filter((c) => c.status === "warn").length;
                return (
                  <Card
                    key={s.key}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setTab(s.key)}
                  >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-primary" aria-hidden />
                        <CardTitle className="text-sm">{s.title}</CardTitle>
                      </div>
                      <span className="text-2xl font-bold ">{s.score}%</span>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Progress value={s.score} className="h-2" />
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{s.checks.length} checks</span>
                        {warn > 0 && <span className="text-amber-600">{warn} warn</span>}
                        {failing > 0 && <span className="text-destructive">{failing} fail</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {sections.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <Badge variant="outline">{s.score}% complete</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {s.checks.map((c) => (
                      <li key={c.id} className="py-3 flex items-start gap-3">
                        <div className="mt-0.5">{statusIcon(c.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{c.label}</p>
                            <Badge variant="outline" className="capitalize text-xs">
                              {c.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Operator runbooks</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {[
              { l: "Self-hosting guide", h: docsUrl("index", "self-hosting") },
              { l: "Backup & restore", h: docsUrl("index", "backup-restore") },
              { l: "Security hardening", h: docsUrl("index", "security-hardening") },
              { l: "GDPR compliance", h: docsUrl("index", "gdpr") },
              { l: "CodeCanyon release checklist", h: docsUrl("index", "codecanyon-release") },
              { l: "Incident response", h: docsUrl("index", "incident-response") },
            ].map((d) => (
              <a
                key={d.l}
                href={d.h}
                className="rounded-control border border-border p-3 hover:bg-muted/60 transition-colors"
              >
                {d.l}
              </a>
            ))}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
