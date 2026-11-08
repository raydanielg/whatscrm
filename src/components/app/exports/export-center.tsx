import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Play, Trash2, Calendar as CalendarIcon, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format as fmtDate, parseISO } from "date-fns";
import { DatePicker } from "@/shared/components";
import {
  DATASET_CATALOG,
  FORMAT_LABELS,
  RECURRENCE_LABELS,
  type ExportDataset,
  type ExportFormat,
  type ExportRecurrence,
} from "@/lib/exports/types";
import {
  createExportJob,
  listExportJobs,
  cancelExportJob,
  retryExportJob,
  deleteExportJob,
  getExportDownloadUrl,
  listReportOptions,
} from "@/lib/exports/exports.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

interface Props {
  workspaceId: string;
  canManage: boolean;
}

export function ExportCenter({ workspaceId, canManage }: Props) {
  const qc = useQueryClient();
  const fmtZoned = useZonedDateFormatter();
  const list = useServerFn(listExportJobs);
  const create = useServerFn(createExportJob);
  const cancel = useServerFn(cancelExportJob);
  const retry = useServerFn(retryExportJob);
  const remove = useServerFn(deleteExportJob);
  const downloadFn = useServerFn(getExportDownloadUrl);
  const reportOptions = useServerFn(listReportOptions);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["exports.jobs", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => list({ data: { workspaceId } }),
    refetchInterval: 5000,
  });

  const { data: reports } = useQuery({
    queryKey: ["exports.reports", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => reportOptions({ data: { workspaceId } }),
  });

  const [form, setForm] = useState({
    name: "",
    dataset: "crm_contacts" as ExportDataset,
    format: "excel" as ExportFormat,
    recurrence: "once" as ExportRecurrence,
    reportId: null as string | null,
    visibility: "private" as "private" | "workspace",
    description: "",
    from: "",
    to: "",
    limit: 5000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          workspaceId,
          name:
            form.name ||
            `${DATASET_CATALOG.find((d) => d.id === form.dataset)?.label} — ${fmtZoned(new Date(), { dateStyle: "medium" })}`,
          description: form.description || undefined,
          dataset: form.dataset,
          format: form.format,
          reportId: form.dataset === "report" ? form.reportId : null,
          recurrence: form.recurrence,
          visibility: form.visibility,
          filters: {
            from: form.from || undefined,
            to: form.to || undefined,
            limit: form.limit,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Export queued", {
        description: "Your file will appear in Download Center in under a minute.",
      });
      qc.invalidateQueries({ queryKey: ["exports.jobs", workspaceId] });
    },
    onError: (e: Error) => toast.error("Could not create export", { description: e.message }),
  });

  const handleDownload = async (id: string) => {
    try {
      const { url, name, format } = await downloadFn({ data: { id } });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.${format === "excel" ? "xlsx" : format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error("Download failed", { description: (e as Error).message });
    }
  };

  const scheduled = useMemo(() => (jobs ?? []).filter((j) => j.recurrence !== "once"), [jobs]);
  const history = useMemo(() => (jobs ?? []).filter((j) => j.recurrence === "once"), [jobs]);
  const datasetGroups = useMemo(() => {
    const g: Record<string, typeof DATASET_CATALOG> = {};
    for (const d of DATASET_CATALOG) (g[d.category] ??= []).push(d);
    return g;
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" /> New export
          </CardTitle>
          <CardDescription>
            Generate a professional PDF, Excel, CSV, or JSON export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ex-name">Name</Label>
            <Input
              id="ex-name"
              placeholder="Q3 Sales — Contacts"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Dataset</Label>
            <Select
              value={form.dataset}
              onValueChange={(v) => setForm({ ...form, dataset: v as ExportDataset })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(datasetGroups).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="px-2 py-1 text-xs uppercase text-muted-foreground">
                      {cat}
                    </div>
                    {items.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <div className="flex flex-col">
                          <span>{d.label}</span>
                          <span className="text-xs text-muted-foreground">{d.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.dataset === "report" && (
            <div className="space-y-2">
              <Label>Report</Label>
              <Select
                value={form.reportId ?? ""}
                onValueChange={(v) => setForm({ ...form, reportId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select report" />
                </SelectTrigger>
                <SelectContent>
                  {(reports ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Format</Label>
            <RadioGroup
              value={form.format}
              onValueChange={(v) => setForm({ ...form, format: v as ExportFormat })}
              className="grid grid-cols-2 gap-2"
            >
              {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((f) => (
                <label
                  key={f}
                  className="flex cursor-pointer items-center gap-2 rounded-control border border-border/60 px-3 py-2 hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem value={f} />
                  <span className="text-sm font-medium">{FORMAT_LABELS[f]}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ex-from">From</Label>
              <DatePicker
                value={form.from ? parseISO(form.from) : undefined}
                onChange={(d) => setForm({ ...form, from: d ? fmtDate(d, "yyyy-MM-dd") : "" })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-to">To</Label>
              <DatePicker
                value={form.to ? parseISO(form.to) : undefined}
                onChange={(d) => setForm({ ...form, to: d ? fmtDate(d, "yyyy-MM-dd") : "" })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recurrence</Label>
            <Select
              value={form.recurrence}
              onValueChange={(v) => setForm({ ...form, recurrence: v as ExportRecurrence })}
              disabled={form.recurrence !== "once" && !canManage}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RECURRENCE_LABELS) as ExportRecurrence[]).map((r) => (
                  <SelectItem key={r} value={r} disabled={r !== "once" && !canManage}>
                    {RECURRENCE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!canManage && (
              <p className="text-xs text-muted-foreground">
                Only admins can schedule recurring exports.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select
              value={form.visibility}
              onValueChange={(v) => setForm({ ...form, visibility: v as "private" | "workspace" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Only me</SelectItem>
                <SelectItem value="workspace">Whole workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ex-desc">Notes</Label>
            <Textarea
              id="ex-desc"
              placeholder="Optional description"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || (form.dataset === "report" && !form.reportId)}
          >
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {form.recurrence === "once" ? "Run export" : "Schedule export"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {scheduled.length > 0 && (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarIcon className="h-4 w-4 text-primary" /> Scheduled exports
              </CardTitle>
              <CardDescription>Automated exports that run on a schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {scheduled.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between rounded-control border border-border/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{j.name}</span>
                      <Badge variant="secondary" className="text-[11px] uppercase">
                        {j.format}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {RECURRENCE_LABELS[j.recurrence as ExportRecurrence]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next run{" "}
                      {j.next_run_at
                        ? formatDistanceToNow(new Date(j.next_run_at), { addSuffix: true })
                        : "—"}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        await cancel({ data: { id: j.id } });
                        qc.invalidateQueries({ queryKey: ["exports.jobs", workspaceId] });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Download center</CardTitle>
            <CardDescription>Every generated export, with signed download links.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px] pr-2">
              {isLoading && <p className="text-sm text-muted-foreground">Loading</p>}
              {!isLoading && history.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No exports yet. Create your first one on the left.
                </p>
              )}
              <div className="space-y-2">
                {history.map((j) => (
                  <div key={j.id} className="rounded-control border border-border/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{j.name}</span>
                          <Badge variant="secondary" className="text-[11px] uppercase">
                            {j.format}
                          </Badge>
                          <StatusPill status={j.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {j.row_count != null ? `${j.row_count.toLocaleString()} rows • ` : ""}
                          {j.file_size ? `${(j.file_size / 1024).toFixed(1)} KB • ` : ""}
                          {j.finished_at
                            ? formatDistanceToNow(new Date(j.finished_at), { addSuffix: true })
                            : "queued"}
                        </p>
                        {j.error && <p className="mt-1 text-xs text-destructive">{j.error}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {j.status === "success" && j.file_path && (
                          <Button size="sm" variant="outline" onClick={() => handleDownload(j.id)}>
                            <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                          </Button>
                        )}
                        {j.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await retry({ data: { id: j.id } });
                              qc.invalidateQueries({ queryKey: ["exports.jobs", workspaceId] });
                            }}
                          >
                            Retry
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            await remove({ data: { id: j.id } });
                            qc.invalidateQueries({ queryKey: ["exports.jobs", workspaceId] });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Separator className="lg:col-span-2" />
      <div className="lg:col-span-2 rounded-control border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Export permissions:</strong> members can create private
        exports. Admins and managers can view every workspace export, schedule recurring exports,
        and download files shared to the workspace. All files are stored in a private bucket with
        short-lived signed URLs.
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    failed: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}
