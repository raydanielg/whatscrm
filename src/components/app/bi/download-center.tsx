import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, RefreshCw, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { listReportRuns } from "@/lib/bi/bi.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

interface Props {
  workspaceId: string;
}

type Status = "pending" | "running" | "success" | "failed";

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  running: "Running",
  success: "Ready",
  failed: "Failed",
};

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { icon: typeof Clock; class: string }> = {
    pending: { icon: Clock, class: "text-muted-foreground bg-surface-elevated" },
    running: { icon: Loader2, class: "text-blue-500 bg-blue-500/10" },
    success: { icon: CheckCircle2, class: "text-emerald-500 bg-emerald-500/10" },
    failed: { icon: XCircle, class: "text-rose-500 bg-rose-500/10" },
  };
  const { icon: Icon, class: cls } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase rounded-control px-2 py-0.5 ${cls}`}
    >
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />{" "}
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatBytes(n?: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DownloadCenter({ workspaceId }: Props) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const list = useServerFn(listReportRuns);
  const fmtZoned = useZonedDateFormatter();
  const formatDate = (iso?: string | null) => (iso ? fmtZoned(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "—");
  const {
    data: runs,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["bi.report-runs", workspaceId, filter],
    enabled: !!workspaceId,
    queryFn: () =>
      list({ data: { workspaceId, status: filter === "all" ? undefined : filter, limit: 200 } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold">Download Center</h3>
          <span className="text-xs text-muted-foreground">Recent report generations</span>
        </div>
        <div className="flex items-center gap-1">
          {(["all", "success", "running", "pending", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-control border capitalize ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-surface-elevated"}`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-control hover:bg-surface-elevated"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-surface-elevated/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Report</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Format</th>
              <th className="text-left px-4 py-2 font-medium">Size</th>
              <th className="text-left px-4 py-2 font-medium">Started</th>
              <th className="text-left px-4 py-2 font-medium">Duration</th>
              <th className="text-right px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading report runs
                </td>
              </tr>
            )}
            {!isLoading && runs && runs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No report runs yet. Scheduled reports will appear here once generated.
                </td>
              </tr>
            )}
            {(runs ?? []).map((r: any) => {
              const started = r.started_at ? new Date(r.started_at).getTime() : null;
              const finished = r.finished_at ? new Date(r.finished_at).getTime() : null;
              const duration =
                started && finished
                  ? `${((finished - started) / 1000).toFixed(1)}s`
                  : started
                    ? ""
                    : "—";
              return (
                <tr key={r.id} className="hover:bg-surface-elevated/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium truncate max-w-[280px]">
                    {r.bi_reports?.name ?? "Untitled"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status as Status} />
                  </td>
                  <td className="px-4 py-2.5 uppercase text-xs text-muted-foreground">
                    {r.format ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatBytes(r.file_size)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(r.started_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{duration}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.status === "success" && r.file_url ? (
                      <a
                        href={r.file_url}
                        download
                        className="inline-flex items-center gap-1 text-xs rounded-control border border-border px-3 py-1.5 hover:bg-surface-elevated"
                      >
                        <Download className="h-3 w-3" /> Download
                      </a>
                    ) : r.status === "failed" ? (
                      <span className="text-xs text-rose-500" title={r.error ?? ""}>
                        Failed
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
