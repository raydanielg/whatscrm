import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Sparkles,
  Coins,
  Zap,
  CheckCircle2,
  XCircle,
  Timer,
  Activity,
  DollarSign,
  Cpu,
  TrendingUp,
  TrendingDown,
  Workflow,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAiAutomationAnalytics } from "@/lib/bi/ai-automation.functions";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 24%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
  "hsl(var(--destructive))",
];

const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 }).format(n);
const fmtDuration = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtHours = (secs: number) => {
  const h = secs / 3600;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(secs / 60)}m`;
};

function DeltaBadge({ value, suffix = "%", invert = false }: { value: number | null | undefined; suffix?: string; invert?: boolean }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-muted-foreground">—</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${good ? "text-emerald-500" : "text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}{value.toFixed(1)}{suffix}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  deltaSuffix = "%",
  invertDelta = false,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  deltaSuffix?: string;
  invertDelta?: boolean;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success" ? "text-emerald-500"
    : tone === "warning" ? "text-amber-500"
    : tone === "destructive" ? "text-destructive"
    : "text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold  mt-1 truncate">{value}</p>
            <div className="flex items-center gap-2 mt-1">
              {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
              {delta != null ? <DeltaBadge value={delta} suffix={deltaSuffix} invert={invertDelta} /> : null}
            </div>
          </div>
          <Icon className={`h-5 w-5 ${toneClass}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function AiAutomationAnalytics({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(30);
  const [compare, setCompare] = useState(true);
  const call = useServerFn(getAiAutomationAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["bi.ai-automation", workspaceId, days, compare],
    enabled: !!workspaceId,
    queryFn: () => call({ data: { workspaceId, days, compare } }),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ai = data.ai;
  const wf = data.workflow;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">AI & Automation analytics</h2>
          <p className="text-sm text-muted-foreground">
            AI requests, token usage, costs, workflow executions and productivity savings.
            {data.compareRange ? " Compared with previous period." : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="cmp" checked={compare} onCheckedChange={setCompare} />
            <Label htmlFor="cmp" className="text-sm">Compare vs previous</Label>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList>
          <TabsTrigger value="ai"><Sparkles className="h-4 w-4 " /> AI</TabsTrigger>
          <TabsTrigger value="workflow"><Workflow className="h-4 w-4 " /> Automation</TabsTrigger>
          <TabsTrigger value="savings"><Timer className="h-4 w-4 " /> Savings</TabsTrigger>
        </TabsList>

        {/* AI TAB */}
        <TabsContent value="ai" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard icon={Sparkles} label="Requests" value={fmtNum(ai.totals.requests)} delta={ai.delta?.requests} />
            <KpiCard icon={Cpu} label="Total tokens" value={fmtNum(ai.totals.totalTokens)} hint={`${fmtNum(ai.totals.promptTokens)} in / ${fmtNum(ai.totals.completionTokens)} out`} delta={ai.delta?.totalTokens} />
            <KpiCard icon={DollarSign} label="Cost" value={fmtCurrency(ai.totals.costUsd)} delta={ai.delta?.costUsd} invertDelta />
            <KpiCard icon={CheckCircle2} label="Acceptance" value={fmtPct(ai.totals.acceptanceRate)} delta={ai.delta?.acceptanceRate} deltaSuffix="pp" tone="success" />
            <KpiCard icon={Timer} label="Avg latency" value={fmtDuration(ai.totals.avgLatencyMs)} />
            <KpiCard icon={Activity} label="Time saved" value={fmtHours(ai.totals.savedSeconds)} hint={`${fmtNum(ai.totals.successRequests)} accepted`} delta={ai.delta?.savedSeconds} tone="success" />
          </div>

          <Card>
            <CardHeader><CardTitle>Requests & cost over time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={ai.trend}>
                  <defs>
                    <linearGradient id="ai-req" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.5} /><stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ai-cost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[3]} stopOpacity={0.5} /><stop offset="95%" stopColor={COLORS[3]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="l" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="r" orientation="right" fontSize={12} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Area yAxisId="l" type="monotone" dataKey="requests" stroke={COLORS[0]} fill="url(#ai-req)" name="Requests" />
                  <Area yAxisId="l" type="monotone" dataKey="failedRequests" stroke={COLORS[5]} fill={COLORS[5]} fillOpacity={0.2} name="Failed" />
                  <Line yAxisId="r" type="monotone" dataKey="costUsd" stroke={COLORS[3]} strokeWidth={2} dot={false} name="Cost (USD)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Token usage over time</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={ai.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="totalTokens" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.25} name="Total tokens" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Provider mix</CardTitle></CardHeader>
              <CardContent>
                {ai.providers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No AI requests in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={ai.providers} dataKey="requests" nameKey="name" innerRadius={50} outerRadius={90}>
                        {ai.providers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtNum(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Providers & models</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ai.providers.map((p) => (
                    <TableRow key={`${p.providerId}-${p.name}`}>
                      <TableCell className="font-medium">{p.name} <span className="text-muted-foreground text-xs">{p.providerKind ?? ""}</span></TableCell>
                      <TableCell className="text-right ">{fmtNum(p.requests)}</TableCell>
                      <TableCell className="text-right ">{fmtPct(p.share)}</TableCell>
                      <TableCell className="text-right ">{fmtNum(p.totalTokens)}</TableCell>
                      <TableCell className="text-right ">{fmtCurrency(p.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                  {ai.models.map((m) => (
                    <TableRow key={m.model}>
                      <TableCell className="pl-8 text-muted-foreground">↳ {m.model}</TableCell>
                      <TableCell className="text-right ">{fmtNum(m.requests)}</TableCell>
                      <TableCell className="text-right  text-muted-foreground">—</TableCell>
                      <TableCell className="text-right ">{fmtNum(m.totalTokens)}</TableCell>
                      <TableCell className="text-right ">{fmtCurrency(m.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Top AI prompts</CardTitle></CardHeader>
              <CardContent>
                {ai.topPrompts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No prompt usage in range.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prompt</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Accept</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ai.topPrompts.map((p) => (
                        <TableRow key={p.key}>
                          <TableCell className="font-medium truncate max-w-[220px]">{p.name}</TableCell>
                          <TableCell className="text-right ">{fmtNum(p.requests)}</TableCell>
                          <TableCell className="text-right ">{fmtNum(p.totalTokens)}</TableCell>
                          <TableCell className="text-right ">{fmtCurrency(p.costUsd)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(p.acceptanceRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Cost by feature</CardTitle></CardHeader>
              <CardContent>
                {ai.costByFeature.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No feature attribution in range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={ai.costByFeature} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={12} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v.toFixed(1)}`} />
                      <YAxis type="category" dataKey="feature" fontSize={12} width={120} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="costUsd" fill={COLORS[3]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* WORKFLOW TAB */}
        <TabsContent value="workflow" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard icon={Zap} label="Executions" value={fmtNum(wf.totals.runs)} delta={wf.delta?.runs} />
            <KpiCard icon={CheckCircle2} label="Success rate" value={fmtPct(wf.totals.successRate)} delta={wf.delta?.successRate} deltaSuffix="pp" tone="success" />
            <KpiCard icon={XCircle} label="Failures" value={fmtNum(wf.totals.failed)} delta={wf.delta?.failed} invertDelta tone={wf.totals.failed > 0 ? "warning" : "default"} />
            <KpiCard icon={Activity} label="Running" value={fmtNum(wf.totals.running)} />
            <KpiCard icon={Timer} label="Avg duration" value={fmtDuration(wf.totals.avgDurationMs)} />
            <KpiCard icon={Timer} label="Time saved" value={fmtHours(wf.totals.savedSeconds)} delta={wf.delta?.savedSeconds} tone="success" />
          </div>

          <Card>
            <CardHeader><CardTitle>Executions over time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={wf.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="succeeded" stackId="s" fill={COLORS[1]} name="Succeeded" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" stackId="s" fill={COLORS[5]} name="Failed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Status mix</CardTitle></CardHeader>
              <CardContent>
                {wf.statusMix.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={wf.statusMix} dataKey="count" nameKey="status" innerRadius={50} outerRadius={90}>
                        {wf.statusMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Failure hotspots</CardTitle></CardHeader>
              <CardContent>
                {wf.failures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No failures in this range. 🎉</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workflow</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead>Last error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wf.failures.map((f) => (
                        <TableRow key={f.automationId}>
                          <TableCell className="font-medium truncate max-w-[160px]">{f.name}</TableCell>
                          <TableCell className="text-right ">
                            <Badge variant="destructive">{f.failed}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[240px]">{f.lastError ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Top workflows</CardTitle></CardHeader>
            <CardContent>
              {wf.topWorkflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflow runs in this range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workflow</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Succeeded</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Success %</TableHead>
                      <TableHead className="text-right">Avg duration</TableHead>
                      <TableHead className="text-right">Saved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wf.topWorkflows.map((w) => (
                      <TableRow key={w.automationId}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell className="text-right ">{fmtNum(w.runs)}</TableCell>
                        <TableCell className="text-right ">{fmtNum(w.succeeded)}</TableCell>
                        <TableCell className="text-right ">{fmtNum(w.failed)}</TableCell>
                        <TableCell className="text-right ">
                          <Badge variant={w.successRate >= 90 ? "default" : w.successRate >= 60 ? "outline" : "destructive"}>
                            {fmtPct(w.successRate)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right ">{fmtDuration(w.avgDurationMs)}</TableCell>
                        <TableCell className="text-right ">{fmtHours(w.savedSeconds)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SAVINGS TAB */}
        <TabsContent value="savings" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Sparkles} label="AI time saved" value={fmtHours(ai.totals.savedSeconds)} hint={`${fmtNum(ai.totals.successRequests)} accepted`} delta={ai.delta?.savedSeconds} tone="success" />
            <KpiCard icon={Workflow} label="Workflow time saved" value={fmtHours(wf.totals.savedSeconds)} hint={`${fmtNum(wf.totals.succeeded)} runs`} delta={wf.delta?.savedSeconds} tone="success" />
            <KpiCard icon={Timer} label="Total saved" value={fmtHours(ai.totals.savedSeconds + wf.totals.savedSeconds)} tone="success" />
            <KpiCard icon={Coins} label="Estimated value" value={fmtCurrency(((ai.totals.savedSeconds + wf.totals.savedSeconds) / 3600) * 40)} hint="@ $40/hr assumption" tone="success" />
          </div>
          <Card>
            <CardHeader><CardTitle>Where the time is coming from</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={[
                    ...ai.topPrompts.slice(0, 5).map((p) => ({ name: p.name, seconds: p.requests * 45, kind: "AI" })),
                    ...wf.topWorkflows.slice(0, 5).map((w) => ({ name: w.name, seconds: w.savedSeconds, kind: "Workflow" })),
                  ]}
                  layout="vertical"
                  margin={{ left: 100 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={12} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${Math.round(v / 60)}m`} />
                  <YAxis type="category" dataKey="name" fontSize={12} width={140} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v: number) => fmtHours(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="seconds" radius={[0, 4, 4, 0]}>
                    {[...ai.topPrompts.slice(0, 5), ...wf.topWorkflows.slice(0, 5)].map((_, i) => (
                      <Cell key={i} fill={i < 5 ? COLORS[0] : COLORS[1]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Estimated at 45 seconds saved per accepted AI response and 2 minutes per successful workflow run.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
