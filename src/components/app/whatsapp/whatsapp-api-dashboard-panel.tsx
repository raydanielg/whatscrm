import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Info,
  Search,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export type ApiLog = {
  id: string;
  keyId?: string | null;
  messageId?: string | null;
  status: "sent" | "delivered" | "read" | "failed" | "pending";
  endpoint: string;
  to?: string;
  request: unknown;
  response: unknown;
  error?: string | null;
  createdAt: string;
};

const STATUS_STYLES: Record<ApiLog["status"], string> = {
  sent: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  read: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  failed: "bg-red-50 text-red-700 ring-1 ring-red-200",
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

const STATUS_ICON: Record<ApiLog["status"], typeof CheckCircle2> = {
  sent: Send,
  delivered: CheckCircle2,
  read: CheckCircle2,
  failed: XCircle,
  pending: Clock,
};

export function apiLogsStorageKey(wsId: string) {
  return `wacrm:whatsapp-api-logs:${wsId}`;
}

export function appendApiLog(
  wsId: string,
  log: Omit<ApiLog, "id" | "createdAt"> & { id?: string; createdAt?: string },
) {
  try {
    const key = apiLogsStorageKey(wsId);
    const raw = localStorage.getItem(key);
    const list: ApiLog[] = raw ? JSON.parse(raw) : [];
    const entry: ApiLog = {
      id: log.id ?? crypto.randomUUID(),
      createdAt: log.createdAt ?? new Date().toISOString(),
      ...log,
    };
    list.unshift(entry);
    localStorage.setItem(key, JSON.stringify(list.slice(0, 500)));
  } catch {
    /* ignore */
  }
}

export function WhatsAppApiDashboardPanel() {
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id ?? "workspace";
  const formatZoned = useZonedDateFormatter();

  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApiLog["status"]>("all");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiLog | null>(null);

  useEffect(() => {
    if (!ws?.id) return;
    const raw = localStorage.getItem(apiLogsStorageKey(ws.id));
    setLogs(raw ? JSON.parse(raw) : []);
  }, [ws?.id]);

  const refresh = () => {
    if (!ws?.id) return;
    const raw = localStorage.getItem(apiLogsStorageKey(ws.id));
    setLogs(raw ? JSON.parse(raw) : []);
  };

  const clearAll = () => {
    if (!ws?.id) return;
    if (!confirm("Clear all API logs? This cannot be undone.")) return;
    localStorage.removeItem(apiLogsStorageKey(ws.id));
    setLogs([]);
    toast.success("API logs cleared");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (l.messageId ?? "").toLowerCase().includes(q) ||
        (l.keyId ?? "").toLowerCase().includes(q) ||
        (l.to ?? "").toLowerCase().includes(q) ||
        (l.endpoint ?? "").toLowerCase().includes(q) ||
        (l.error ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, query, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const pageSafe = Math.min(page, totalPages);
  const start = (pageSafe - 1) * rowsPerPage;
  const paged = filtered.slice(start, start + rowsPerPage);

  const kpis = useMemo(() => {
    const by = (s: ApiLog["status"]) => logs.filter((l) => l.status === s).length;
    return {
      total: logs.length,
      sent: by("sent") + by("delivered") + by("read"),
      failed: by("failed"),
      pending: by("pending"),
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> API Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View messages reports sent using Meta Rest API.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-2 rounded-control text-sm font-medium border border-border hover:bg-muted"
          >
            Refresh
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-2 rounded-control text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" /> Clear logs
          </button>
        </div>
      </div>

      {/* How logging works */}
      <div className="rounded-control border border-blue-200 bg-blue-50/60 p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold mb-1">How Logging Works</p>
          <p>
            API logs are only recorded when you include{" "}
            <code className="px-1.5 py-0.5 rounded bg-white/70 font-mono text-xs">
              enableLog: true
            </code>{" "}
            in your API request body. Without this flag, no logs will be saved to the dashboard.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total logs" value={kpis.total} tone="bg-muted text-foreground" />
        <Kpi label="Successful" value={kpis.sent} tone="bg-emerald-50 text-emerald-700" />
        <Kpi label="Failed" value={kpis.failed} tone="bg-red-50 text-red-700" />
        <Kpi label="Pending" value={kpis.pending} tone="bg-amber-50 text-amber-700" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Message ID, Key ID, recipient, or error..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="px-3 py-2 text-sm rounded-control border border-border bg-background"
        >
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="read">Read</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-control border border-border overflow-hidden bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <Th>#</Th>
                <Th>Key ID</Th>
                <Th>Message ID</Th>
                <Th>Status</Th>
                <Th>Request</Th>
                <Th>Response</Th>
                <Th>Created At</Th>
                <Th className="text-right pr-4">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No API logs yet</p>
                    <p className="text-xs mt-1">
                      Send an API request with <code className="font-mono">enableLog: true</code> to
                      see it here.
                    </p>
                  </td>
                </tr>
              )}
              {paged.map((l, i) => {
                const Icon = STATUS_ICON[l.status];
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/40">
                    <Td className="text-muted-foreground">#{start + i + 1}</Td>
                    <Td className="font-mono text-xs">
                      {l.keyId ?? <span className="text-muted-foreground">No ID</span>}
                    </Td>
                    <Td className="font-mono text-xs">
                      {l.messageId ? (
                        <span
                          className="truncate inline-block max-w-[180px] align-middle"
                          title={l.messageId}
                        >
                          {l.messageId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No ID</span>
                      )}
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-control text-xs font-medium ${STATUS_STYLES[l.status]}`}
                      >
                        <Icon className="w-3 h-3" /> {l.status}
                      </span>
                    </Td>
                    <Td className="text-xs">
                      {l.to ? (
                        <span>→ {l.to}</span>
                      ) : (
                        <button
                          onClick={() => setSelected(l)}
                          className="text-primary hover:underline"
                        >
                          View Details
                        </button>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {l.error ? (
                        <span
                          className="text-red-600 truncate inline-block max-w-[220px] align-middle"
                          title={l.error}
                        >
                          {l.error}
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelected(l)}
                          className="text-primary hover:underline"
                        >
                          View Details
                        </button>
                      )}
                    </Td>
                    <Td className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatZoned(new Date(l.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Td>
                    <Td className="text-right pr-4">
                      <button
                        onClick={() => setSelected(l)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-control text-xs font-medium border border-border hover:bg-muted"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-control border border-border bg-background text-foreground"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="text-muted-foreground">
            {total === 0
              ? "0 of 0"
              : `${start + 1}–${Math.min(start + rowsPerPage, total)} of ${total}`}
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-control border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs text-muted-foreground">
              {pageSafe} / {totalPages}
            </span>
            <button
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-control border border-border disabled:opacity-40 hover:bg-muted"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Details modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-background rounded-control border border-border shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-start justify-between">
              <div>
                <h3 className="font-display font-semibold">Log details</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{selected.id}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded-control hover:bg-muted">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <Info2
                  label="Status"
                  value={
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-control text-xs font-medium ${STATUS_STYLES[selected.status]}`}
                    >
                      {selected.status}
                    </span>
                  }
                />
                <Info2
                  label="Endpoint"
                  value={<code className="font-mono text-xs break-all">{selected.endpoint}</code>}
                />
                <Info2 label="Recipient" value={selected.to ?? "—"} />
                <Info2
                  label="Message ID"
                  value={
                    <span className="font-mono text-xs break-all">{selected.messageId ?? "—"}</span>
                  }
                />
                <Info2
                  label="Key ID"
                  value={<span className="font-mono text-xs">{selected.keyId ?? "—"}</span>}
                />
                <Info2
                  label="Created"
                  value={formatZoned(new Date(selected.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                />
              </div>
              {selected.error && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Error</p>
                  <pre className="p-3 rounded-control border border-red-200 bg-red-50 text-red-800 text-xs overflow-x-auto whitespace-pre-wrap">
                    {selected.error}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Request</p>
                <pre className="p-3 rounded-control border border-border bg-muted/50 text-xs overflow-x-auto max-h-64">
                  {JSON.stringify(selected.request, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Response</p>
                <pre className="p-3 rounded-control border border-border bg-muted/50 text-xs overflow-x-auto max-h-64">
                  {JSON.stringify(selected.response, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-display font-semibold">{value}</span>
        <span className={`text-[11px] uppercase px-1.5 py-0.5 rounded-control ${tone}`}>
          logs
        </span>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-4 py-2.5 ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}
function Info2({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
