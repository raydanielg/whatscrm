import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Download, RefreshCw, Loader2, ChevronDown, ChevronRight,
  ScrollText, LogIn, Shield, Receipt, CreditCard, KeyRound, Webhook, Sparkles, Workflow, Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { queryLogs, type LogEntry, type LogSource } from "@/lib/admin/audit.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SOURCES: { id: LogSource; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: "audit", label: "Audit", icon: ScrollText, hint: "System & tenant privileged actions" },
  { id: "auth", label: "Auth", icon: LogIn, hint: "Login, logout, failed attempts" },
  { id: "security", label: "Security", icon: Shield, hint: "Security events & alerts" },
  { id: "billing", label: "Billing", icon: Receipt, hint: "Subscription & invoice events" },
  { id: "payment", label: "Payments", icon: CreditCard, hint: "Payment attempts & failures" },
  { id: "api", label: "API Keys", icon: KeyRound, hint: "API key lifecycle" },
  { id: "webhook", label: "Webhooks", icon: Webhook, hint: "Inbound webhook deliveries" },
  { id: "ai", label: "AI", icon: Sparkles, hint: "AI provider requests" },
  { id: "workflow", label: "Workflows", icon: Workflow, hint: "Automation node executions" },
  { id: "provider", label: "Providers", icon: Server, hint: "Provider integration logs" },
];

const severityStyles: Record<LogEntry["severity"], string> = {
  info: "bg-muted text-muted-foreground border-border",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  error: "bg-red-500/10 text-red-600 border-red-500/20",
  critical: "bg-red-600/20 text-red-700 border-red-600/40",
};

function toCsv(rows: LogEntry[]): string {
  const cols = ["timestamp", "source", "severity", "action", "resource", "actor", "workspace_id", "organization_id", "ip", "message"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(",");
  const body = rows.map(r => cols.map(c => esc((r as unknown as Record<string, unknown>)[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

function downloadFile(name: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function AuditLogsExplorer({ initialSource = "audit" as LogSource }: { initialSource?: LogSource }) {
  const [source, setSource] = useState<LogSource>(initialSource);
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<string>("all");
  const [range, setRange] = useState<string>("24h");
  const [expanded, setExpanded] = useState<string | null>(null);
  const run = useServerFn(queryLogs);

  const timeRange = useMemo(() => {
    const now = Date.now();
    const map: Record<string, number> = { "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
    const hrs = map[range];
    if (!hrs) return { from: undefined, to: undefined };
    return { from: new Date(now - hrs * 3600 * 1000).toISOString(), to: new Date(now).toISOString() };
  }, [range]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-logs", source, q, severity, range],
    queryFn: () => run({ data: {
      source, q: q || undefined,
      severity: severity !== "all" ? severity : undefined,
      from: timeRange.from, to: timeRange.to, limit: 200,
    }}),
    refetchInterval: 15000,
  });

  const rows = data?.rows ?? [];

  function handleExport() {
    if (!rows.length) { toast.info("Nothing to export"); return; }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadFile(`${source}-logs-${stamp}.csv`, toCsv(rows));
    toast.success(`Exported ${rows.length} rows`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SOURCES.map(s => {
          const Icon = s.icon;
          const active = source === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-control border text-sm transition-all",
                active ? "bg-accent/10 border-accent text-accent" : "bg-surface border-border hover:border-border-strong",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search action, resource, message, ID" className="pl-8 h-9" />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Time range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 backdrop-blur z-10">
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="p-2 w-8"></th>
                <th className="p-2">Timestamp</th>
                <th className="p-2">Severity</th>
                <th className="p-2">Action</th>
                <th className="p-2">Resource</th>
                <th className="p-2">Actor / IP</th>
                <th className="p-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !isFetching && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No log entries match the filters.</td></tr>
              )}
              {rows.map(r => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      <td className="p-2 text-muted-foreground">{isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                      <td className="p-2 whitespace-nowrap font-mono text-xs">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="p-2"><Badge variant="outline" className={cn("text-xs", severityStyles[r.severity as keyof typeof severityStyles])}>{r.severity}</Badge></td>
                      <td className="p-2 font-medium">{r.action}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[220px]">{r.resource ?? "—"}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">
                        <div className="truncate max-w-[160px]">{r.actor ?? "system"}</div>
                        {r.ip && <div className="text-[11px] opacity-70">{r.ip}</div>}
                      </td>
                      <td className="p-2 text-muted-foreground truncate max-w-[280px]">{r.message ?? "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr key={r.id + "-detail"} className="bg-muted/20">
                        <td colSpan={7} className="p-3">
                          <pre className="text-xs font-mono bg-background rounded-control p-3 border border-border overflow-x-auto max-h-64">
{JSON.stringify({ id: r.id, workspace_id: r.workspace_id, organization_id: r.organization_id, user_agent: r.user_agent, meta: r.meta }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground">
        {rows.length} entries · auto-refresh 15s · {SOURCES.find(s => s.id === source)?.hint}
      </div>
    </div>
  );
}
