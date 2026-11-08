import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  analyticsOverview, agentPerformance, departmentPerformance,
  categoryBreakdown, escalationTrends, slaCompliance, knowledgeUsage, analyticsFacets,
} from "@/lib/helpdesk/analytics.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  TicketIcon, CheckCircle2, AlertTriangle, ChevronUp, Timer, Clock,
  Radio, RadioTower, Download, Filter, Star, TrendingUp,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

export const Route = createFileRoute("/_authenticated/helpdesk/analytics")({
  component: AnalyticsPage,
});

type Filters = {
  days: number;
  departmentId?: string;
  categoryId?: string;
  agentId?: string;
  priority?: string;
  channel?: string;
};

const CHART_COLORS = ["#075E54", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

function fmtMin(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 1440).toFixed(1)}d`;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function AnalyticsPage() {
  const [filters, setFilters] = useState<Filters>({ days: 30 });
  const [realtime, setRealtime] = useState(true);
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;

  const facetsFn = useServerFn(analyticsFacets);
  const overviewFn = useServerFn(analyticsOverview);
  const agentsFn = useServerFn(agentPerformance);
  const deptsFn = useServerFn(departmentPerformance);
  const catsFn = useServerFn(categoryBreakdown);
  const escFn = useServerFn(escalationTrends);
  const slaFn = useServerFn(slaCompliance);
  const kbFn = useServerFn(knowledgeUsage);

  const key = useMemo(() => JSON.stringify(filters), [filters]);
  const { data: facets } = useQuery({ queryKey: ["hd-analytics-facets"], queryFn: () => facetsFn() });
  const { data: overview } = useQuery({ queryKey: ["hd-analytics-overview", key], queryFn: () => overviewFn({ data: filters }) });
  const { data: agents } = useQuery({ queryKey: ["hd-analytics-agents", key], queryFn: () => agentsFn({ data: filters }) });
  const { data: depts } = useQuery({ queryKey: ["hd-analytics-depts", key], queryFn: () => deptsFn({ data: filters }) });
  const { data: cats } = useQuery({ queryKey: ["hd-analytics-cats", key], queryFn: () => catsFn({ data: filters }) });
  const { data: esc } = useQuery({ queryKey: ["hd-analytics-esc", key], queryFn: () => escFn({ data: filters }) });
  const { data: sla } = useQuery({ queryKey: ["hd-analytics-sla", key], queryFn: () => slaFn({ data: filters }) });
  const { data: kb } = useQuery({ queryKey: ["hd-analytics-kb", key], queryFn: () => kbFn({ data: filters }) });

  // Realtime: refetch on ticket, sla, escalation, csat, kb events.
  useEffect(() => {
    if (!realtime || !workspaceId) return;
    const wsFilter = `workspace_id=eq.${workspaceId}`;
    const channel = supabase.channel(`helpdesk-analytics-live:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: wsFilter }, () => {
        qc.invalidateQueries({ queryKey: ["hd-analytics-overview"] });
        qc.invalidateQueries({ queryKey: ["hd-analytics-agents"] });
        qc.invalidateQueries({ queryKey: ["hd-analytics-depts"] });
        qc.invalidateQueries({ queryKey: ["hd-analytics-cats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_sla_tracking", filter: wsFilter }, () => {
        qc.invalidateQueries({ queryKey: ["hd-analytics-sla"] });
        qc.invalidateQueries({ queryKey: ["hd-analytics-overview"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_escalations", filter: wsFilter }, () => {
        qc.invalidateQueries({ queryKey: ["hd-analytics-esc"] });
        qc.invalidateQueries({ queryKey: ["hd-analytics-overview"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "csat_responses", filter: wsFilter }, () => {
        qc.invalidateQueries({ queryKey: ["hd-analytics-overview"] });
        qc.invalidateQueries({ queryKey: ["hd-analytics-agents"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "kb_article_events", filter: wsFilter }, () => {
        qc.invalidateQueries({ queryKey: ["hd-analytics-kb"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [realtime, qc, workspaceId]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const reset = () => setFilters({ days: filters.days });

  const o = overview as Awaited<ReturnType<typeof analyticsOverview>> | undefined;
  const priorityData = o ? Object.entries(o.by_priority).map(([name, value]) => ({ name, value })) : [];
  const channelData = o ? Object.entries(o.by_channel).map(([name, value]) => ({ name, value })) : [];
  const statusData = o ? Object.entries(o.by_status).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className="space-y-4">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <Badge variant={realtime ? "default" : "outline"} className="gap-1 cursor-pointer" onClick={() => setRealtime((v) => !v)}>
            {realtime ? <RadioTower className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
            {realtime ? "Realtime on" : "Realtime off"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={String(filters.days)} onValueChange={(v) => set({ days: parseInt(v, 10) })}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 7, 14, 30, 60, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>Last {d}d</SelectItem>)}
            </SelectContent>
          </Select>
          <FacetSelect label="Department" value={filters.departmentId} onChange={(v) => set({ departmentId: v })} options={facets?.departments ?? []} />
          <FacetSelect label="Category" value={filters.categoryId} onChange={(v) => set({ categoryId: v })} options={facets?.categories ?? []} />
          <FacetSelect label="Agent" value={filters.agentId} onChange={(v) => set({ agentId: v })} options={facets?.agents ?? []} />
          <Select value={filters.priority ?? "all"} onValueChange={(v) => set({ priority: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {["low", "normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.channel ?? "all"} onValueChange={(v) => set({ channel: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {["email", "whatsapp", "instagram", "messenger", "telegram", "sms", "livechat", "web"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Open tickets" value={o?.open_count ?? 0} icon={Clock} />
        <Metric label="Created" value={o?.created ?? 0} icon={TicketIcon} />
        <Metric label="Resolved" value={o?.resolved ?? 0} tone="green" icon={CheckCircle2} sub={`${o?.resolution_rate_pct ?? 0}% rate`} />
        <Metric label="SLA compliance" value={`${o?.sla_compliance_pct ?? 100}%`} tone={((o?.sla_compliance_pct ?? 100) >= 90) ? "green" : "orange"} icon={Timer} sub={`${o?.breached_count ?? 0} breaches`} />
        <Metric label="Avg first response" value={fmtMin(o?.avg_first_response_min ?? 0)} icon={Timer} sub={`p90 ${fmtMin(o?.p90_first_response_min ?? 0)}`} />
        <Metric label="Avg resolution" value={fmtMin(o?.avg_resolution_min ?? 0)} icon={Timer} sub={`p90 ${fmtMin(o?.p90_resolution_min ?? 0)}`} />
        <Metric label="Escalations" value={o?.escalations ?? 0} tone="orange" icon={ChevronUp} />
        <Metric label="CSAT" value={o?.csat_avg ? `${o.csat_avg} ★` : "—"} icon={Star} tone="green" sub={`${o?.csat_responses ?? 0} responses · NPS ${o?.nps ?? 0}`} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <ChartCard title="Volume trend" onExport={o ? () => downloadCsv("volume-trend", o.timeseries) : undefined}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={o?.timeseries ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="created" stroke="#075E54" fill="#075E54" fillOpacity={0.2} name="Created" />
                <Area type="monotone" dataKey="resolved" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} name="Resolved" />
                <Area type="monotone" dataKey="escalations" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} name="Escalations" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="grid md:grid-cols-3 gap-3">
            <PieCard title="By priority" data={priorityData} />
            <PieCard title="By channel" data={channelData} />
            <PieCard title="By status" data={statusData} />
          </div>
        </TabsContent>

        {/* SLA */}
        <TabsContent value="sla" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Tracked tickets" value={sla?.total ?? 0} icon={Timer} />
            <Metric label="Compliance" value={`${sla?.compliance_pct ?? 100}%`} tone="green" icon={CheckCircle2} />
            <Metric label="Response breaches" value={sla?.first_response_breaches ?? 0} tone="red" icon={AlertTriangle} />
            <Metric label="Resolution breaches" value={sla?.resolution_breaches ?? 0} tone="red" icon={AlertTriangle} />
          </div>
          <ChartCard title="Compliance trend" onExport={sla ? () => downloadCsv("sla-trend", sla.trend) : undefined}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={sla?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="compliance_pct" stroke="#22c55e" name="Compliance %" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <TableCard title="By policy" columns={["Policy", "Total", "Response breaches", "Resolution breaches", "Compliance"]}
            rows={(sla?.by_policy ?? []).map((r) => [r.name, r.total, r.first_response_breaches, r.resolution_breaches, `${r.compliance_pct}%`])}
            onExport={sla ? () => downloadCsv("sla-by-policy", sla.by_policy) : undefined} />
        </TabsContent>

        {/* Agents */}
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Agent performance</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => agents && downloadCsv("agent-performance", agents)}>
                <Download className="h-4 w-4 " /> Export
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Agent</th><th className="p-3">Assigned</th><th className="p-3">Resolved</th>
                    <th className="p-3">Rate</th><th className="p-3">Avg response</th><th className="p-3">Avg resolution</th><th className="p-3">CSAT</th>
                  </tr>
                </thead>
                <tbody>
                  {(agents ?? []).map((a) => (
                    <tr key={a.agent_id} className="border-b">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7"><AvatarImage src={a.avatar_url ?? undefined} /><AvatarFallback>{a.name.charAt(0)}</AvatarFallback></Avatar>
                          <span>{a.name}</span>
                        </div>
                      </td>
                      <td className="p-3">{a.assigned}</td>
                      <td className="p-3">{a.resolved}</td>
                      <td className="p-3"><div className="flex items-center gap-2"><Progress value={a.resolution_rate} className="w-16 h-2" /><span className="text-xs">{a.resolution_rate}%</span></div></td>
                      <td className="p-3">{fmtMin(a.avg_first_response_min)}</td>
                      <td className="p-3">{fmtMin(a.avg_resolution_min)}</td>
                      <td className="p-3">{a.csat_avg != null ? <Badge variant={a.csat_avg >= 4 ? "default" : a.csat_avg >= 3 ? "secondary" : "destructive"}>{a.csat_avg} ★</Badge> : "—"}</td>
                    </tr>
                  ))}
                  {(agents ?? []).length === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No agent activity.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments */}
        <TabsContent value="departments" className="space-y-4">
          <ChartCard title="Volume by department" onExport={depts ? () => downloadCsv("departments", depts) : undefined}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={depts ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#075E54" name="Total" />
                <Bar dataKey="resolved" fill="#22c55e" name="Resolved" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <TableCard title="Details" columns={["Department", "Total", "Resolved", "Rate", "Avg response", "Avg resolution"]}
            rows={(depts ?? []).map((d) => [d.name, d.total, d.resolved, `${d.resolution_rate}%`, fmtMin(d.avg_first_response_min), fmtMin(d.avg_resolution_min)])} />
        </TabsContent>

        {/* Categories */}
        <TabsContent value="categories" className="space-y-4">
          <ChartCard title="Volume by category" onExport={cats ? () => downloadCsv("categories", cats) : undefined}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cats ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="total" fill="#3b82f6" name="Total" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <TableCard title="Details" columns={["Category", "Total", "Resolved", "Rate"]}
            rows={(cats ?? []).map((c) => [c.name, c.total, c.resolved, `${c.resolution_rate}%`])} />
        </TabsContent>

        {/* Escalations */}
        <TabsContent value="escalations" className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Total escalations" value={esc?.total ?? 0} icon={ChevronUp} tone="orange" />
            <Metric label="Auto" value={esc?.auto ?? 0} icon={TrendingUp} />
            <Metric label="Manual" value={esc?.manual ?? 0} icon={TrendingUp} />
          </div>
          <ChartCard title="Escalation trend" onExport={esc ? () => downloadCsv("escalations-trend", esc.trend) : undefined}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={esc?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="l1" stackId="s" fill="#eab308" name="Level 1" />
                <Bar dataKey="l2" stackId="s" fill="#f59e0b" name="Level 2" />
                <Bar dataKey="l3" stackId="s" fill="#ef4444" name="Level 3+" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <TableCard title="Top reasons" columns={["Reason", "Count"]} rows={(esc?.top_reasons ?? []).map((r) => [r.reason, r.count])} />
        </TabsContent>

        {/* Knowledge */}
        <TabsContent value="knowledge" className="space-y-4">
          <ChartCard title="Knowledge activity" onExport={kb ? () => downloadCsv("kb-trend", kb.trend) : undefined}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={kb?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="views" stroke="#3b82f6" name="Views" />
                <Line type="monotone" dataKey="suggested" stroke="#075E54" name="AI suggested" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <TableCard title="Top articles" columns={["Article", "Views", "AI suggested", "Helpful", "Not helpful", "Helpful %"]}
            rows={(kb?.top_articles ?? []).map((a) => [a.title, a.views, a.suggested, a.helpful, a.not_helpful, a.helpful_pct != null ? `${a.helpful_pct}%` : "—"])}
            onExport={kb ? () => downloadCsv("kb-top-articles", kb.top_articles) : undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FacetSelect({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string | undefined) => void; options: Array<{ id: string; name: string }> }) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? undefined : v)}>
      <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Metric({ label, value, icon: Icon, tone, sub }: { label: string; value: number | string; icon: typeof TicketIcon; tone?: "green" | "red" | "orange"; sub?: string }) {
  const toneClass = tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : tone === "orange" ? "text-orange-600" : "text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${toneClass}`} />{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children, onExport }: { title: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {onExport && <Button size="sm" variant="ghost" onClick={onExport}><Download className="h-4 w-4 " />Export</Button>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PieCard({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label={(e) => e.name}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function TableCard({ title, columns, rows, onExport }: { title: string; columns: string[]; rows: Array<Array<React.ReactNode>>; onExport?: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {onExport && <Button size="sm" variant="ghost" onClick={onExport}><Download className="h-4 w-4 " />Export</Button>}
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>{columns.map((c) => <th key={c} className="p-3">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (<tr key={i} className="border-b">{r.map((cell, j) => <td key={j} className="p-3">{cell}</td>)}</tr>))}
            {rows.length === 0 && <tr><td colSpan={columns.length} className="p-10 text-center text-muted-foreground">No data.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
