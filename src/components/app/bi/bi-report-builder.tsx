import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Play, Download, Trash2, FileBarChart } from "lucide-react";
import { listReports, upsertReport, deleteReport, runReport, exportReport } from "@/lib/bi/bi.functions";
import { AVAILABLE_METRICS_UI } from "./metrics-catalog";

interface Props { workspaceId: string }

export function BiReportBuilder({ workspaceId }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listReports);
  const upsert = useServerFn(upsertReport);
  const del = useServerFn(deleteReport);
  const run = useServerFn(runReport);
  const exp = useServerFn(exportReport);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [dataSource, setDataSource] = useState<string>(AVAILABLE_METRICS_UI[0].key);
  const [chartType, setChartType] = useState<"line"|"bar"|"area"|"table"|"number">("line");

  const { data: reports } = useQuery({
    queryKey: ["bi.reports", workspaceId],
    queryFn: () => list({ data: { workspaceId } }),
  });

  const createMut = useMutation({
    mutationFn: () => upsert({ data: { workspaceId, name, dataSource, chartType, category: "general" } }),
    onSuccess: () => { setCreating(false); setName(""); qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] }); },
  });

  const runMut = useMutation({
    mutationFn: (id: string) => run({ data: { workspaceId, reportId: id } }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] }),
  });

  async function handleExport(reportId: string, format: "csv" | "json") {
    const res = await exp({ data: { workspaceId, reportId, format } }) as { content: string; mimeType: string; filename: string };
    const blob = new Blob([res.content], { type: res.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = res.filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileBarChart className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold">Report Builder</h3>
        </div>
        <button
          onClick={() => setCreating((s) => !s)}
          className="inline-flex items-center gap-1 text-sm rounded-control bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New report
        </button>
      </div>

      {creating && (
        <div className="p-4 border-b border-border grid gap-3 md:grid-cols-4">
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Report name" className="rounded-control border border-border bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <select value={dataSource} onChange={(e) => setDataSource(e.target.value)} className="rounded-control border border-border bg-background px-3 py-2 text-sm">
            {AVAILABLE_METRICS_UI.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={chartType} onChange={(e) => setChartType(e.target.value as typeof chartType)} className="flex-1 rounded-control border border-border bg-background px-2 py-2 text-sm">
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="area">Area</option>
              <option value="number">Number</option>
              <option value="table">Table</option>
            </select>
            <button
              disabled={!name || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="rounded-control bg-primary text-primary-foreground px-3 text-sm disabled:opacity-50"
            >Save</button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border">
        {(reports ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-surface-elevated transition-colors">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.category} · {r.data_source} · {r.chart_type}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button title="Run" onClick={() => runMut.mutate(r.id)} className="p-2 hover:bg-surface rounded-control">
                <Play className="h-4 w-4" />
              </button>
              <button title="Export CSV" onClick={() => handleExport(r.id, "csv")} className="p-2 hover:bg-surface rounded-control">
                <Download className="h-4 w-4" />
              </button>
              <button title="Delete" onClick={() => deleteMut.mutate(r.id)} className="p-2 hover:bg-surface rounded-control text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {reports && reports.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No reports yet. Create your first one.</li>
        )}
      </ul>
    </div>
  );
}
