import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Globe,
  Smartphone,
  KeyRound,
  AlertTriangle,
  Lock,
  Zap,
  Webhook,
  ScrollText,
  RefreshCcw,
  TrendingUp,
  MapPin,
  Fingerprint,
  Server,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSecurityOverview, type Severity } from "@/lib/security/security-center.functions";
import { AppTopbar } from "@/components/app/app-topbar";
import { UnavailableSignalsBanner } from "@/components/security/unavailable-signals-banner";

export const Route = createFileRoute("/_authenticated/security-center")({
  head: () => ({
    meta: [
      { title: "Enterprise Security Center" },
      {
        name: "description",
        content:
          "Centralized security posture, threat detection, and OWASP-aligned recommendations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityCenterPage,
});

const sevColor: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-destructive/10 text-destructive border-destructive/25",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  info: "bg-muted text-muted-foreground border-border",
};

function SeverityBadge({ s }: { s: Severity }) {
  return (
    <Badge variant="outline" className={sevColor[s]}>
      {s}
    </Badge>
  );
}

function SecurityCenterPage() {
  const fetchOverview = useServerFn(getSecurityOverview);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["security-center"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
  });

  const score = data?.security_score ?? 0;
  const posture = data?.posture ?? "fair";
  const m = data?.metrics;
  const gradient = useMemo(() => {
    if (posture === "strong") return "from-emerald-500/20 via-emerald-500/5 to-transparent";
    if (posture === "fair") return "from-amber-500/20 via-amber-500/5 to-transparent";
    return "from-destructive/25 via-destructive/5 to-transparent";
  }, [posture]);

  return (
    <>
      <AppTopbar
        title="Enterprise Security Center"
        subtitle="OWASP-aligned posture, real-time threat detection, and audit trail"
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isError && (
          <div role="alert" className="rounded-control border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Couldn&apos;t load the security overview: {error instanceof Error ? error.message : "unknown error"}
          </div>
        )}
        <UnavailableSignalsBanner signals={data?.unavailable} />

        {/* Hero: Security Score */}
        <Card className={`relative overflow-hidden border-border/60`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
          <CardContent className="relative p-6 md:p-8 grid md:grid-cols-3 gap-6 items-center">
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    className="stroke-muted/40"
                    fill="none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(score / 100) * 264} 264`}
                    className={
                      posture === "strong"
                        ? "stroke-emerald-500"
                        : posture === "fair"
                          ? "stroke-amber-500"
                          : "stroke-destructive"
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold ">{isLoading ? "--" : score}</div>
                  <div className="text-xs text-muted-foreground ">Score</div>
                </div>
              </div>
              <Badge
                className="mt-3"
                variant={
                  posture === "strong"
                    ? "default"
                    : posture === "fair"
                      ? "secondary"
                      : "destructive"
                }
              >
                {posture === "strong" ? (
                  <ShieldCheck className="h-3 w-3 " />
                ) : (
                  <ShieldAlert className="h-3 w-3 " />
                )}
                {posture.toUpperCase()}
              </Badge>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                icon={AlertTriangle}
                label="Failed logins 24h"
                value={m?.failed_logins_24h}
                tone="warn"
              />
              <StatTile
                icon={Activity}
                label="Suspicious events 24h"
                value={m?.suspicious_events_24h}
                tone="warn"
              />
              <StatTile
                icon={Lock}
                label="Locked accounts"
                value={m?.locked_accounts}
                tone="danger"
              />
              <StatTile icon={Fingerprint} label="Active sessions" value={m?.active_sessions} />
              <StatTile icon={Globe} label="Login IPs 7d" value={m?.unique_login_ips_7d} />
              <StatTile icon={MapPin} label="Countries 7d" value={m?.unique_countries_7d} />
              <StatTile icon={Smartphone} label="Devices 7d" value={m?.unique_devices_7d} />
              <StatTile icon={ScrollText} label="Audit events 24h" value={m?.audit_events_24h} />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="threats" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-6  ">
            <TabsTrigger value="threats">Threats</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="api">API & Webhooks</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="timeline">Audit Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="threats" className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-amber-500" /> Brute-force IPs (24h)
                </CardTitle>
                <CardDescription>IPs with ≥5 failed logins.</CardDescription>
              </CardHeader>
              <CardContent>
                <IpList
                  rows={data?.threat.brute_force_ips ?? []}
                  valueKey="attempts"
                  valueLabel="attempts"
                  empty="No brute-force activity detected."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4 text-destructive" /> Suspicious IPs (7d)
                </CardTitle>
                <CardDescription>IPs seen in security events.</CardDescription>
              </CardHeader>
              <CardContent>
                <IpList
                  rows={data?.threat.suspicious_ips ?? []}
                  valueKey="events"
                  valueLabel="events"
                  empty="No suspicious IPs."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4" /> Geo login distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Distribution
                  rows={data?.threat.geo_distribution ?? []}
                  labelKey="location"
                  valueKey="logins"
                  empty="No geo data yet."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-4 w-4" /> Device tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Distribution
                  rows={data?.threat.devices ?? []}
                  labelKey="device"
                  valueKey="logins"
                  empty="No device data yet."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access" className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" /> Password policy
                </CardTitle>
                <CardDescription>
                  {data?.password_policy.configured ? "Active" : "Not configured"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row k="Minimum length" v={data?.password_policy.min_length ?? "—"} />
                <Row k="Require uppercase" v={boolTxt(data?.password_policy.require_uppercase)} />
                <Row k="Require number" v={boolTxt(data?.password_policy.require_number)} />
                <Row k="Require symbol" v={boolTxt(data?.password_policy.require_symbol)} />
                <Row k="Max age (days)" v={data?.password_policy.max_age_days ?? "—"} />
                <Row k="Lockout threshold" v={data?.password_policy.lockout_threshold ?? "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4" /> Account protection
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row k="Locked accounts" v={m?.locked_accounts ?? 0} />
                <Row k="Failed logins 24h" v={m?.failed_logins_24h ?? 0} />
                <Row k="Failed logins 7d" v={m?.failed_logins_7d ?? 0} />
                <Row k="Successful logins 24h" v={m?.successful_logins_24h ?? 0} />
                <Row k="IP allowlist rules" v={m?.ip_allowlist_rules ?? 0} />
                <Row k="Active sessions" v={m?.active_sessions ?? 0} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="grid md:grid-cols-3 gap-4">
            <MiniKpi icon={Server} label="Rate-limit hits 24h" value={m?.rate_limit_hits_24h} />
            <MiniKpi
              icon={Sparkles}
              label="API 4xx/5xx 24h"
              value={m?.api_errors_24h}
              tone="warn"
            />
            <MiniKpi
              icon={Webhook}
              label="Webhook failures 24h"
              value={m?.webhook_failures_24h}
              tone="warn"
            />
            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Surface health
                </CardTitle>
                <CardDescription>
                  Rolling 24-hour snapshots across API and webhook surfaces.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Bar label="API error rate" value={Math.min(100, (m?.api_errors_24h ?? 0) / 10)} />
                <Bar
                  label="Webhook failure rate"
                  value={Math.min(100, (m?.webhook_failures_24h ?? 0) * 5)}
                />
                <Bar
                  label="Rate-limit pressure"
                  value={Math.min(100, (m?.rate_limit_hits_24h ?? 0) / 20)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Security alerts
                </CardTitle>
                <CardDescription>Real-time threat signals across the platform.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.alerts?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No active alerts. Systems nominal.
                  </p>
                ) : (
                  <ScrollArea className="h-[420px] pr-2">
                    <ul className="space-y-2">
                      {data!.alerts.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-start gap-3 p-3 rounded-control border bg-card/50 hover:bg-card transition-colors"
                        >
                          <div className="pt-0.5">
                            <SeverityBadge s={a.severity} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{a.title}</span>
                              <Badge variant="secondary" className="text-[11px]">
                                {a.category}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{a.detail}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true })}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Security recommendations
                </CardTitle>
                <CardDescription>OWASP Top 10-aligned improvements.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.recommendations?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    All best-practice checks pass.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data!.recommendations.map((r) => (
                      <li key={r.id} className="p-3 rounded-control border bg-card/50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              r.priority === "high"
                                ? "destructive"
                                : r.priority === "medium"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {r.priority}
                          </Badge>
                          <span className="font-medium">{r.title}</span>
                          {r.owasp && (
                            <Badge variant="outline" className="text-[11px]">
                              {r.owasp}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{r.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4" /> Audit timeline
                </CardTitle>
                <CardDescription>Latest security & audit events.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.timeline?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No recent events.
                  </p>
                ) : (
                  <ScrollArea className="h-[500px] pr-2">
                    <ol className="relative border-l border-border/60 ml-2 space-y-4">
                      {data!.timeline.map((t) => (
                        <li key={`${t.source}-${t.id}`} className="ml-4">
                          <span
                            className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 border-background ${
                              t.severity === "critical" || t.severity === "high"
                                ? "bg-destructive"
                                : t.severity === "medium"
                                  ? "bg-amber-500"
                                  : "bg-primary"
                            }`}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{t.action}</span>
                            <Badge variant="outline" className="text-[11px]">
                              {t.source}
                            </Badge>
                            <SeverityBadge s={t.severity} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                            {t.ip ? ` • ${t.ip}` : ""}
                            {t.actor ? ` • actor ${t.actor.slice(0, 8)}` : ""}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function boolTxt(v: boolean | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v ? "Yes" : "No";
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium ">{v}</span>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  tone?: "warn" | "danger";
}) {
  const color =
    tone === "danger" && (value ?? 0) > 0
      ? "text-destructive"
      : tone === "warn" && (value ?? 0) > 0
        ? "text-amber-500"
        : "text-foreground";
  return (
    <div className="p-3 rounded-control border bg-card/70 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold  mt-1 ${color}`}>{value ?? "--"}</div>
    </div>
  );
}

function MiniKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  tone?: "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <div
          className={`text-3xl font-semibold  mt-1 ${tone === "warn" && (value ?? 0) > 0 ? "text-amber-500" : ""}`}
        >
          {value ?? "--"}
        </div>
      </CardContent>
    </Card>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="">{Math.round(value)}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function IpList({
  rows,
  valueKey,
  valueLabel,
  empty,
}: {
  rows: Array<{ ip: string; last_seen: string; [key: string]: string | number }>;
  valueKey: string;
  valueLabel: string;
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.ip}
          className="flex items-center justify-between gap-2 p-2 rounded-control border bg-card/50 text-sm"
        >
          <span className="font-mono">{r.ip}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDistanceToNow(new Date(r.last_seen), { addSuffix: true })}</span>
            <Badge variant="secondary" className="">
              {r[valueKey]} {valueLabel}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Distribution({
  rows,
  labelKey,
  valueKey,
  empty,
}: {
  rows: Array<Record<string, string | number>>;
  labelKey: string;
  valueKey: string;
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>;
  const max = Math.max(...rows.map((r) => Number(r[valueKey])));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{r[labelKey]}</span>
            <span className=" text-muted-foreground">{r[valueKey]}</span>
          </div>
          <Progress value={max > 0 ? (Number(r[valueKey]) / max) * 100 : 0} />
        </li>
      ))}
    </ul>
  );
}
