import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatbotAnalytics, type Chatbot } from "@/lib/chatbots/chatbots.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, RefreshCw, TrendingUp, MessageSquare, UserRound, Zap, BookOpen, ThumbsUp, AlertTriangle, Sparkles } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area,
} from "recharts";

const RANGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 60, label: "Last 60 days" },
  { value: 90, label: "Last 90 days" },
];

const PIE_COLORS = ["hsl(var(--primary))", "#25d366", "#ba181b", "#128C7E", "#b1a7a6", "#d3d3d3"];

export function ChatbotAnalyticsTab({ bot }: { bot: Chatbot }) {
  const [days, setDays] = useState(14);
  const q = useQuery({
    queryKey: ["chatbot-analytics", bot.id, days],
    queryFn: () => chatbotAnalytics({ data: { chatbotId: bot.id, days } }),
    refetchInterval: 30_000,
  });

  // Realtime: refetch when sessions or messages change for this bot
  useEffect(() => {
    const ch = supabase
      .channel(`bot-analytics:${bot.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chatbot_sessions", filter: `chatbot_id=eq.${bot.id}` }, () => q.refetch())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chatbot_messages", filter: `workspace_id=eq.${bot.workspace_id}` }, () => q.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id, bot.workspace_id]);

  const d = q.data;

  const exportCSV = () => {
    if (!d) return;
    const lines: string[] = [];
    lines.push("Metric,Value");
    lines.push(`Range (days),${d.days}`);
    lines.push(`Sessions,${d.sessions}`);
    lines.push(`Messages,${d.messages}`);
    lines.push(`Resolved by AI,${d.resolvedByAI}`);
    lines.push(`Escalated (handoffs),${d.handoffs}`);
    lines.push(`Resolution rate %,${d.resolutionRate}`);
    lines.push(`AI resolution rate %,${d.aiResolutionRate}`);
    lines.push(`Handoff rate %,${d.handoffRate}`);
    lines.push(`Fallback rate %,${d.fallbackRate}`);
    lines.push(`Knowledge usage %,${d.knowledgeUsage}`);
    lines.push(`Avg response latency (ms),${d.avgLatency}`);
    lines.push(`p95 latency (ms),${d.p95Latency}`);
    lines.push(`Avg first response (ms),${d.avgFirstResponseMs}`);
    lines.push(`Avg confidence %,${d.avgConfidence ?? ""}`);
    lines.push(`Avg CSAT,${d.avgCsat ?? ""}`);
    lines.push("");
    lines.push("Date,Sessions,Messages,Handoffs,Resolved");
    for (const s of d.series) lines.push(`${s.date},${s.sessions},${s.messages},${s.handoffs},${s.resolved}`);
    lines.push("");
    lines.push("Question,Count");
    for (const t of d.topQuestions) lines.push(`"${t.question.replace(/"/g, '""')}",${t.count}`);
    lines.push("");
    lines.push("Intent,Count");
    for (const t of d.topIntents) lines.push(`${t.intent},${t.count}`);
    lines.push("");
    lines.push("Handoff reason,Count");
    for (const r of d.handoffReasons) lines.push(`${r.reason},${r.count}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatbot-${bot.id}-analytics-${d.days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const funnelData = useMemo(() => {
    if (!d) return [];
    return [
      { name: "Sessions", value: d.sessions },
      { name: "Engaged", value: d.userMessages > 0 ? d.sessions : 0 },
      { name: "Resolved by AI", value: d.resolvedByAI },
      { name: "Escalated", value: d.handoffs },
    ];
  }, [d]);

  if (q.isLoading) {
    return <div className="p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading analytics</div>;
  }
  if (!d) return null;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-xs text-muted-foreground">Live · updates every 30s</span>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5 " /> Export CSV
        </Button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Conversations" value={d.sessions} sub={`${d.messages} messages`} />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="Resolved by AI" value={d.resolvedByAI} sub={`${d.aiResolutionRate}% of total`} />
        <Kpi icon={<UserRound className="h-4 w-4" />} label="Escalated" value={d.handoffs} sub={`${d.handoffRate}% handoff rate`} tone={d.handoffRate > 40 ? "warn" : undefined} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Resolution rate" value={`${d.resolutionRate}%`} sub={`${d.resolved} closed`} />
        <Kpi icon={<Zap className="h-4 w-4" />} label="Avg response" value={`${formatMs(d.avgLatency)}`} sub={`p95 ${formatMs(d.p95Latency)}`} />
        <Kpi icon={<Zap className="h-4 w-4" />} label="First response" value={formatMs(d.avgFirstResponseMs)} sub="user → assistant" />
        <Kpi icon={<ThumbsUp className="h-4 w-4" />} label="Customer satisfaction" value={d.avgCsat != null ? `${d.avgCsat} / 5` : "—"} sub={d.avgCsat != null ? "avg rating" : "no ratings yet"} />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="AI confidence" value={d.avgConfidence != null ? `${d.avgConfidence}%` : "—"} sub={d.avgConfidence != null ? "avg" : "no data"} />
        <Kpi icon={<BookOpen className="h-4 w-4" />} label="Knowledge usage" value={`${d.knowledgeUsage}%`} sub={`${d.knowledgeMessages} answers cited KB`} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Fallback rate" value={`${d.fallbackRate}%`} sub={`${d.fallbackMessages} fallbacks`} tone={d.fallbackRate > 20 ? "warn" : undefined} />
        <Kpi icon={<UserRound className="h-4 w-4" />} label="Human handoff rate" value={`${d.handoffRate}%`} sub={`${d.handoffs} conversations`} />
        <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Avg messages / chat" value={d.sessions ? Math.round((d.messages / d.sessions) * 10) / 10 : 0} />
      </div>

      {/* Charts row 1 — Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Conversation volume">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={shortDay} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="sessions" name="Sessions" stroke="hsl(var(--primary))" fill="url(#gSess)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Messages per day">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={shortDay} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="messages" name="Messages" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="handoffs" name="Handoffs" stroke="#25d366" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#0f766e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Charts row 2 — Funnel + Intents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Resolution funnel">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Intent detection">
          {d.topIntents.length === 0 ? (
            <EmptyChart text="No intents captured yet. Populate session.metadata.intent from your flow to see this." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={d.topIntents} dataKey="count" nameKey="intent" cx="50%" cy="50%" outerRadius={90} label={(e: { intent: string }) => e.intent}>
                  {d.topIntents.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Row 3 — Top questions + Handoff reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Most asked questions">
          {d.topQuestions.length === 0 ? (
            <EmptyChart text="No user messages in this range yet." />
          ) : (
            <div className="divide-y divide-border">
              {d.topQuestions.map((t, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">#{i + 1}</span>
                  <span className="text-sm flex-1 line-clamp-2">{t.question}</span>
                  <span className="text-xs font-medium ">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Handoff reasons">
          {d.handoffReasons.length === 0 ? (
            <EmptyChart text="No handoffs in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d.handoffReasons} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="reason" stroke="hsl(var(--muted-foreground))" fontSize={11} width={110} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#25d366" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon?: React.ReactNode; label: string; value: string | number; sub?: string; tone?: "warn" }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold  ${tone === "warn" ? "text-[#25d366]" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground text-center px-6">{text}</div>;
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

function shortDay(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function formatMs(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}
