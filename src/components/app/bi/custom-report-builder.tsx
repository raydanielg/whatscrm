import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Play, Download, Trash2, FileBarChart, Star, Copy, Share2,
  Filter, ListOrdered, Layers, Calculator, LineChart as LineIcon,
  BarChart3, Table as TableIcon, PieChart as PieIcon, GripVertical,
  Save, Eye, X, ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  listReports, upsertReport, deleteReport, runReport, exportReport,
  toggleReportFavorite, cloneReport,
} from "@/lib/bi/bi.functions";
import { AVAILABLE_METRICS_UI } from "./metrics-catalog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props { workspaceId: string }

type ChartType = "line" | "bar" | "area" | "table" | "number" | "pie" | "pivot";
type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "starts_with";
type SortDir = "asc" | "desc";
type Visibility = "private" | "workspace" | "public";
type Preset = "last_7d" | "last_30d" | "last_90d" | "mtd" | "ytd";

interface FilterCond { id: string; field: string; op: Op; value: string }
interface SortCond { id: string; field: string; dir: SortDir }
interface CalcField { id: string; name: string; expr: string }

interface ReportConfig {
  metrics: string[];
  fields: string[];
  filters: FilterCond[];
  groupBy: string[];
  sort: SortCond[];
  calculatedFields: CalcField[];
  chartType: ChartType;
  pivot: { rows: string[]; cols: string[]; value: string };
  dateRange: { preset: Preset };
}

interface ReportRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  data_source: string;
  chart_type: string;
  filters: unknown;
  columns: unknown;
  group_by: unknown;
  metrics: unknown;
  sort: unknown;
  date_range: unknown;
  calculated_fields?: unknown;
  visibility?: Visibility;
  is_favorite: boolean;
  updated_at: string;
}

const FIELD_LIBRARY = [
  { key: "date", label: "Date", type: "date" },
  { key: "value", label: "Value", type: "number" },
  { key: "channel", label: "Channel", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "stage", label: "Stage", type: "text" },
  { key: "source", label: "Source", type: "text" },
  { key: "status", label: "Status", type: "text" },
];

const OPS: { value: Op; label: string }[] = [
  { value: "eq", label: "equals" }, { value: "neq", label: "not equals" },
  { value: "gt", label: ">" }, { value: "gte", label: "≥" },
  { value: "lt", label: "<" }, { value: "lte", label: "≤" },
  { value: "contains", label: "contains" }, { value: "starts_with", label: "starts with" },
];

const CHART_OPTS: { type: ChartType; label: string; Icon: typeof LineIcon }[] = [
  { type: "line", label: "Line", Icon: LineIcon },
  { type: "bar", label: "Bar", Icon: BarChart3 },
  { type: "area", label: "Area", Icon: LineIcon },
  { type: "pie", label: "Pie", Icon: PieIcon },
  { type: "table", label: "Table", Icon: TableIcon },
  { type: "pivot", label: "Pivot", Icon: TableIcon },
  { type: "number", label: "KPI", Icon: BarChart3 },
];

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6"];

const DEFAULT_CFG: ReportConfig = {
  metrics: [AVAILABLE_METRICS_UI[0].key],
  fields: ["date", "value"],
  filters: [], groupBy: [], sort: [], calculatedFields: [],
  chartType: "line",
  pivot: { rows: [], cols: [], value: "value" },
  dateRange: { preset: "last_30d" },
};

function rid() { return Math.random().toString(36).slice(2, 10); }

function parseCfg(r: ReportRow): ReportConfig {
  const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
  return {
    metrics: (arr(r.metrics) as string[]).length ? arr(r.metrics) as string[] : [r.data_source],
    fields: arr(r.columns) as string[],
    filters: arr(r.filters) as FilterCond[],
    groupBy: arr(r.group_by) as string[],
    sort: arr(r.sort) as SortCond[],
    calculatedFields: arr(r.calculated_fields) as CalcField[],
    chartType: (r.chart_type as ChartType) || "line",
    pivot: { rows: [], cols: [], value: "value" },
    dateRange: (r.date_range as { preset: Preset }) ?? { preset: "last_30d" },
  };
}

export function CustomReportBuilder({ workspaceId }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listReports);
  const upsert = useServerFn(upsertReport);
  const del = useServerFn(deleteReport);
  const run = useServerFn(runReport);
  const exp = useServerFn(exportReport);
  const fav = useServerFn(toggleReportFavorite);
  const clone = useServerFn(cloneReport);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "favorites" | "shared">("all");
  const [editing, setEditing] = useState<ReportRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [cfg, setCfg] = useState<ReportConfig>(DEFAULT_CFG);
  const [preview, setPreview] = useState<Record<string, { t: string; y: number }[]> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: reports } = useQuery({
    queryKey: ["bi.reports", workspaceId],
    queryFn: () => list({ data: { workspaceId } }) as Promise<ReportRow[]>,
  });

  const filtered = useMemo(() => {
    const all = reports ?? [];
    let out = all.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    if (tab === "favorites") out = out.filter((r) => r.is_favorite);
    if (tab === "shared") out = out.filter((r) => r.visibility === "workspace" || r.visibility === "public");
    return out;
  }, [reports, search, tab]);

  const saveMut = useMutation({
    mutationFn: () => upsert({
      data: {
        id: editing?.id, workspaceId, name, description,
        dataSource: cfg.metrics[0] ?? AVAILABLE_METRICS_UI[0].key,
        chartType: (cfg.chartType === "pivot" ? "table" : cfg.chartType) as "line"|"bar"|"area"|"table"|"number"|"pie",
        metrics: cfg.metrics, columns: cfg.fields,
        filters: cfg.filters, groupBy: cfg.groupBy, sort: cfg.sort,
        calculatedFields: cfg.calculatedFields,
        dateRange: cfg.dateRange, visibility,
        category: "custom",
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] });
      closeEditor();
    },
  });

  const runMut = useMutation({ mutationFn: (id: string) => run({ data: { workspaceId, reportId: id } }) });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] }),
  });
  const favMut = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => fav({ data: { id: v.id, isFavorite: v.on } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] }),
  });
  const cloneMut = useMutation({
    mutationFn: (id: string) => clone({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] }),
  });

  function openNew() {
    setEditing(null); setCreating(true);
    setName(""); setDescription(""); setVisibility("private");
    setCfg(DEFAULT_CFG); setPreview(null);
  }

  function openEdit(r: ReportRow) {
    setEditing(r); setCreating(true);
    setName(r.name); setDescription(r.description ?? "");
    setVisibility(r.visibility ?? "private");
    setCfg(parseCfg(r)); setPreview(null);
  }

  function closeEditor() {
    setCreating(false); setEditing(null); setPreview(null);
  }

  async function handlePreview() {
    setPreviewLoading(true);
    try {
      // Run each metric independently through the analytics engine
      const results: Record<string, { t: string; y: number }[]> = {};
      // Persist temporarily via a synthetic run using the metric endpoint would be ideal.
      // Simpler: create a scratch report? Instead call runReport if editing; else save-and-run.
      if (editing) {
        const res = await run({ data: { workspaceId, reportId: editing.id } }) as {
          results: { metric: string; series: { t: string; y: number }[] }[];
        };
        for (const r of res.results) results[r.metric] = r.series;
      } else {
        // Save draft first, run, then keep saved (user can rename)
        const draft = await upsert({
          data: {
            workspaceId, name: name || "Untitled report", description,
            dataSource: cfg.metrics[0], chartType: (cfg.chartType === "pivot" ? "table" : cfg.chartType) as "line"|"bar"|"area"|"table"|"number"|"pie",
            metrics: cfg.metrics, columns: cfg.fields,
            filters: cfg.filters, groupBy: cfg.groupBy, sort: cfg.sort,
            calculatedFields: cfg.calculatedFields,
            dateRange: cfg.dateRange, visibility, category: "custom",
          },
        }) as { id: string };
        setEditing({ ...(draft as unknown as ReportRow) });
        const res = await run({ data: { workspaceId, reportId: draft.id } }) as {
          results: { metric: string; series: { t: string; y: number }[] }[];
        };
        for (const r of res.results) results[r.metric] = r.series;
        qc.invalidateQueries({ queryKey: ["bi.reports", workspaceId] });
      }
      setPreview(results);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExport(id: string, format: "csv" | "json") {
    const res = await exp({ data: { workspaceId, reportId: id, format } }) as {
      content: string; mimeType: string; filename: string;
    };
    const blob = new Blob([res.content], { type: res.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = res.filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Sidebar */}
      <aside className="rounded-control border border-border bg-surface flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Reports</h3>
            </div>
            <button
              onClick={openNew}
              className="inline-flex items-center gap-1 text-xs rounded-control bg-primary text-primary-foreground px-2.5 py-1.5 hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports"
            className="w-full rounded-control border border-border bg-background px-2.5 py-1.5 text-xs"
          />
          <div className="flex gap-1 text-xs">
            {(["all", "favorites", "shared"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-control px-2 py-1 capitalize transition-colors ${
                  tab === t ? "bg-primary text-primary-foreground" : "hover:bg-surface-elevated"
                }`}
              >{t}</button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.map((r) => (
            <li
              key={r.id}
              className={`group px-3 py-2.5 hover:bg-surface-elevated cursor-pointer transition-colors ${
                editing?.id === r.id ? "bg-surface-elevated" : ""
              }`}
              onClick={() => openEdit(r)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm truncate">{r.name}</p>
                    {r.is_favorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.chart_type} · {r.visibility ?? "private"}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); favMut.mutate({ id: r.id, on: !r.is_favorite }); }}
                    className="p-1 hover:bg-surface rounded" title="Favorite"
                  ><Star className={`h-3.5 w-3.5 ${r.is_favorite ? "fill-amber-400 text-amber-400" : ""}`} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); cloneMut.mutate(r.id); }}
                    className="p-1 hover:bg-surface rounded" title="Clone"
                  ><Copy className="h-3.5 w-3.5" /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); delMut.mutate(r.id); }}
                    className="p-1 hover:bg-surface rounded text-rose-500" title="Delete"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-muted-foreground">
              No reports. Click <span className="font-medium">New</span> to build one.
            </li>
          )}
        </ul>
      </aside>

      {/* Main canvas */}
      <section className="rounded-control border border-border bg-surface min-h-[600px]">
        {!creating ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center h-full gap-3">
            <FileBarChart className="h-12 w-12 opacity-20" />
            <p>Select a report from the sidebar, or create a new one to start building.</p>
            <button onClick={openNew} className="mt-2 inline-flex items-center gap-1 text-sm rounded-control bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90">
              <Plus className="h-4 w-4" /> New report
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Report name"
                  className="flex-1 min-w-0 rounded-control border border-border bg-background px-3 py-1.5 text-sm font-medium"
                />
                <VisibilityBadge value={visibility} onChange={setVisibility} />
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="inline-flex items-center gap-1 text-sm rounded-control border border-border px-3 py-1.5 hover:bg-surface-elevated disabled:opacity-50"
                >
                  <Eye className="h-4 w-4" /> {previewLoading ? "Running" : "Preview"}
                </button>
                <button
                  onClick={() => saveMut.mutate()}
                  disabled={!name || saveMut.isPending}
                  className="inline-flex items-center gap-1 text-sm rounded-control bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Save
                </button>
                {editing && (
                  <>
                    <button onClick={() => runMut.mutate(editing.id)} className="p-1.5 hover:bg-surface-elevated rounded-control" title="Run"><Play className="h-4 w-4" /></button>
                    <button onClick={() => handleExport(editing.id, "csv")} className="p-1.5 hover:bg-surface-elevated rounded-control" title="Export CSV"><Download className="h-4 w-4" /></button>
                  </>
                )}
                <button onClick={closeEditor} className="p-1.5 hover:bg-surface-elevated rounded-control" title="Close"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description"
              className="mx-4 mt-3 rounded-control border border-border bg-background px-3 py-2 text-sm resize-none"
              rows={2}
            />

            {/* Builder body */}
            <div className="grid lg:grid-cols-[280px_1fr] gap-4 p-4">
              <BuilderPalette cfg={cfg} setCfg={setCfg} />
              <div className="space-y-4">
                <ChartTypePicker value={cfg.chartType} onChange={(v) => setCfg({ ...cfg, chartType: v })} />
                <DropZones cfg={cfg} setCfg={setCfg} />
                <FiltersSection cfg={cfg} setCfg={setCfg} />
                <SortSection cfg={cfg} setCfg={setCfg} />
                <CalculatedSection cfg={cfg} setCfg={setCfg} />
                {cfg.chartType === "pivot" && <PivotSection cfg={cfg} setCfg={setCfg} />}
                <DateRangeSection cfg={cfg} setCfg={setCfg} />
                {preview && <PreviewPanel cfg={cfg} data={preview} />}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Sub-components ----------

function VisibilityBadge({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Visibility)}
        className="appearance-none rounded-control border border-border bg-background pl-8 pr-6 py-1.5 text-xs cursor-pointer"
      >
        <option value="private">Private</option>
        <option value="workspace">Shared with team</option>
        <option value="public">Public</option>
      </select>
      <Share2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" />
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" />
    </div>
  );
}

function BuilderPalette({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  function onDragStart(e: React.DragEvent, payload: { kind: "metric" | "field"; key: string }) {
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }
  const grouped = useMemo(() => {
    const g: Record<string, typeof AVAILABLE_METRICS_UI> = {};
    for (const m of AVAILABLE_METRICS_UI) (g[m.category] ??= []).push(m);
    return g;
  }, []);

  return (
    <aside className="rounded-control border border-border bg-surface-elevated p-3 space-y-4 h-fit sticky top-4">
      <div>
        <p className="text-[11px]  text-muted-foreground mb-2 flex items-center gap-1">
          <Layers className="h-3 w-3" /> Data sources
        </p>
        <ScrollArea type="hover" viewportClassName="max-h-64 [&>div]:!block">
          <div className="space-y-2 pr-1">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[11px] uppercase text-muted-foreground px-1">{cat}</p>
                {items.map((m) => {
                  const selected = cfg.metrics.includes(m.key);
                  return (
                    <button
                      key={m.key}
                      draggable
                      onDragStart={(e) => onDragStart(e, { kind: "metric", key: m.key })}
                      onClick={() => setCfg({
                        ...cfg,
                        metrics: selected ? cfg.metrics.filter((k) => k !== m.key) : [...cfg.metrics, m.key],
                      })}
                      className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                        selected ? "bg-primary/10 text-primary" : "hover:bg-surface"
                      }`}
                    >
                      <GripVertical className="h-3 w-3 opacity-40" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div>
        <p className="text-[11px]  text-muted-foreground mb-2">Fields</p>
        <div className="space-y-1">
          {FIELD_LIBRARY.map((f) => (
            <button
              key={f.key}
              draggable
              onDragStart={(e) => onDragStart(e, { kind: "field", key: f.key })}
              className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-surface"
            >
              <GripVertical className="h-3 w-3 opacity-40" />
              <span className="flex-1">{f.label}</span>
              <span className="text-[11px] text-muted-foreground">{f.type}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function DropZones({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  function makeDrop(target: "metrics" | "fields" | "groupBy") {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const p = JSON.parse(raw) as { kind: string; key: string };
      if (target === "metrics" && p.kind === "metric" && !cfg.metrics.includes(p.key)) {
        setCfg({ ...cfg, metrics: [...cfg.metrics, p.key] });
      }
      if (target === "fields" && p.kind === "field" && !cfg.fields.includes(p.key)) {
        setCfg({ ...cfg, fields: [...cfg.fields, p.key] });
      }
      if (target === "groupBy" && p.kind === "field" && !cfg.groupBy.includes(p.key)) {
        setCfg({ ...cfg, groupBy: [...cfg.groupBy, p.key] });
      }
    };
  }
  const allow = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <Zone label="Metrics" icon={<BarChart3 className="h-3 w-3" />} onDrop={makeDrop("metrics")} onDragOver={allow}>
        {cfg.metrics.map((k) => (
          <Chip key={k} label={AVAILABLE_METRICS_UI.find((m) => m.key === k)?.label ?? k}
            onRemove={() => setCfg({ ...cfg, metrics: cfg.metrics.filter((x) => x !== k) })} />
        ))}
        {cfg.metrics.length === 0 && <Empty>Drop metrics here</Empty>}
      </Zone>
      <Zone label="Selected fields" icon={<Layers className="h-3 w-3" />} onDrop={makeDrop("fields")} onDragOver={allow}>
        {cfg.fields.map((k) => (
          <Chip key={k} label={FIELD_LIBRARY.find((f) => f.key === k)?.label ?? k}
            onRemove={() => setCfg({ ...cfg, fields: cfg.fields.filter((x) => x !== k) })} />
        ))}
        {cfg.fields.length === 0 && <Empty>Drop fields here</Empty>}
      </Zone>
      <Zone label="Group by" icon={<Layers className="h-3 w-3" />} onDrop={makeDrop("groupBy")} onDragOver={allow}>
        {cfg.groupBy.map((k) => (
          <Chip key={k} label={FIELD_LIBRARY.find((f) => f.key === k)?.label ?? k}
            onRemove={() => setCfg({ ...cfg, groupBy: cfg.groupBy.filter((x) => x !== k) })} />
        ))}
        {cfg.groupBy.length === 0 && <Empty>Drop dimensions here</Empty>}
      </Zone>
    </div>
  );
}

function Zone({ label, icon, children, onDrop, onDragOver }: {
  label: string; icon: React.ReactNode; children: React.ReactNode;
  onDrop: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDrop={onDrop} onDragOver={onDragOver}
      className="rounded-control border-2 border-dashed border-border bg-surface-elevated p-3 min-h-[80px] transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-1 text-[11px]  text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-control bg-primary/10 text-primary text-xs px-2 py-0.5">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:bg-primary/20 rounded-full">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-muted-foreground italic">{children}</span>;
}

function ChartTypePicker({ value, onChange }: { value: ChartType; onChange: (v: ChartType) => void }) {
  return (
    <div className="rounded-control border border-border p-3">
      <p className="text-[11px]  text-muted-foreground mb-2">Visualization</p>
      <div className="flex flex-wrap gap-1.5">
        {CHART_OPTS.map(({ type, label, Icon }) => (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-xs transition-colors ${
              value === type ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-surface-elevated"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FiltersSection({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  return (
    <Section title="Filters" icon={<Filter className="h-3.5 w-3.5" />}
      onAdd={() => setCfg({ ...cfg, filters: [...cfg.filters, { id: rid(), field: "value", op: "gt", value: "0" }] })}
    >
      {cfg.filters.length === 0 && <Empty>No filters. Add one to narrow the data.</Empty>}
      {cfg.filters.map((f) => (
        <div key={f.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <select value={f.field} onChange={(e) => update(f.id, { field: e.target.value })}
            className="rounded-control border border-border bg-background px-2 py-1 text-xs">
            {FIELD_LIBRARY.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <select value={f.op} onChange={(e) => update(f.id, { op: e.target.value as Op })}
            className="rounded-control border border-border bg-background px-2 py-1 text-xs">
            {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={f.value} onChange={(e) => update(f.id, { value: e.target.value })}
            className="rounded-control border border-border bg-background px-2 py-1 text-xs" />
          <button onClick={() => setCfg({ ...cfg, filters: cfg.filters.filter((x) => x.id !== f.id) })}
            className="p-1 hover:bg-surface-elevated rounded text-rose-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </Section>
  );

  function update(id: string, patch: Partial<FilterCond>) {
    setCfg({ ...cfg, filters: cfg.filters.map((x) => x.id === id ? { ...x, ...patch } : x) });
  }
}

function SortSection({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  return (
    <Section title="Sort" icon={<ListOrdered className="h-3.5 w-3.5" />}
      onAdd={() => setCfg({ ...cfg, sort: [...cfg.sort, { id: rid(), field: "value", dir: "desc" }] })}
    >
      {cfg.sort.length === 0 && <Empty>Data is unsorted.</Empty>}
      {cfg.sort.map((s) => (
        <div key={s.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <select value={s.field} onChange={(e) => setCfg({ ...cfg, sort: cfg.sort.map((x) => x.id === s.id ? { ...x, field: e.target.value } : x) })}
            className="rounded-control border border-border bg-background px-2 py-1 text-xs">
            {FIELD_LIBRARY.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <select value={s.dir} onChange={(e) => setCfg({ ...cfg, sort: cfg.sort.map((x) => x.id === s.id ? { ...x, dir: e.target.value as SortDir } : x) })}
            className="rounded-control border border-border bg-background px-2 py-1 text-xs">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button onClick={() => setCfg({ ...cfg, sort: cfg.sort.filter((x) => x.id !== s.id) })}
            className="p-1 hover:bg-surface-elevated rounded text-rose-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </Section>
  );
}

function CalculatedSection({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  return (
    <Section title="Calculated fields" icon={<Calculator className="h-3.5 w-3.5" />}
      onAdd={() => setCfg({ ...cfg, calculatedFields: [...cfg.calculatedFields, { id: rid(), name: "growth", expr: "value * 1.1" }] })}
    >
      {cfg.calculatedFields.length === 0 && <Empty>Define derived fields with an expression, e.g. <code>value * 1.1</code>.</Empty>}
      {cfg.calculatedFields.map((c) => (
        <div key={c.id} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
          <input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })}
            placeholder="Field name"
            className="rounded-control border border-border bg-background px-2 py-1 text-xs" />
          <input value={c.expr} onChange={(e) => update(c.id, { expr: e.target.value })}
            placeholder="Expression e.g. value * 1.2"
            className="rounded-control border border-border bg-background px-2 py-1 text-xs font-mono" />
          <button onClick={() => setCfg({ ...cfg, calculatedFields: cfg.calculatedFields.filter((x) => x.id !== c.id) })}
            className="p-1 hover:bg-surface-elevated rounded text-rose-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </Section>
  );

  function update(id: string, patch: Partial<CalcField>) {
    setCfg({ ...cfg, calculatedFields: cfg.calculatedFields.map((x) => x.id === id ? { ...x, ...patch } : x) });
  }
}

function PivotSection({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  return (
    <div className="rounded-control border border-border p-3">
      <p className="text-[11px]  text-muted-foreground mb-2 flex items-center gap-1">
        <TableIcon className="h-3.5 w-3.5" /> Pivot layout
      </p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <select multiple size={3} value={cfg.pivot.rows}
          onChange={(e) => setCfg({ ...cfg, pivot: { ...cfg.pivot, rows: Array.from(e.target.selectedOptions).map((o) => o.value) } })}
          className="rounded-control border border-border bg-background px-2 py-1">
          {FIELD_LIBRARY.map((f) => <option key={f.key} value={f.key}>Rows: {f.label}</option>)}
        </select>
        <select multiple size={3} value={cfg.pivot.cols}
          onChange={(e) => setCfg({ ...cfg, pivot: { ...cfg.pivot, cols: Array.from(e.target.selectedOptions).map((o) => o.value) } })}
          className="rounded-control border border-border bg-background px-2 py-1">
          {FIELD_LIBRARY.map((f) => <option key={f.key} value={f.key}>Cols: {f.label}</option>)}
        </select>
        <select value={cfg.pivot.value}
          onChange={(e) => setCfg({ ...cfg, pivot: { ...cfg.pivot, value: e.target.value } })}
          className="rounded-control border border-border bg-background px-2 py-1">
          {FIELD_LIBRARY.filter((f) => f.type === "number").map((f) => (
            <option key={f.key} value={f.key}>Values: {f.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DateRangeSection({ cfg, setCfg }: { cfg: ReportConfig; setCfg: (c: ReportConfig) => void }) {
  const presets: { value: Preset; label: string }[] = [
    { value: "last_7d", label: "Last 7 days" },
    { value: "last_30d", label: "Last 30 days" },
    { value: "last_90d", label: "Last 90 days" },
    { value: "last_90d", label: "Last 90 days (alt)" },
    { value: "mtd", label: "Month to date" },
    { value: "ytd", label: "Year to date" },
  ];
  return (
    <div className="rounded-control border border-border p-3 flex items-center gap-3">
      <p className="text-[11px]  text-muted-foreground">Date range</p>
      <select value={cfg.dateRange.preset}
        onChange={(e) => setCfg({ ...cfg, dateRange: { preset: e.target.value as Preset } })}
        className="rounded-control border border-border bg-background px-2 py-1 text-xs">
        {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    </div>
  );
}

function Section({ title, icon, children, onAdd }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; onAdd?: () => void;
}) {
  return (
    <div className="rounded-control border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px]  text-muted-foreground flex items-center gap-1">
          {icon} {title}
        </p>
        {onAdd && (
          <button onClick={onAdd} className="inline-flex items-center gap-1 text-[11px] rounded-control border border-border px-2 py-0.5 hover:bg-surface-elevated">
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function PreviewPanel({ cfg, data }: { cfg: ReportConfig; data: Record<string, { t: string; y: number }[]> }) {
  const merged = useMemo(() => mergeSeries(data), [data]);
  const withCalc = useMemo(() => applyCalculated(merged, cfg.calculatedFields), [merged, cfg.calculatedFields]);
  const sorted = useMemo(() => applySort(withCalc, cfg.sort), [withCalc, cfg.sort]);
  const filtered = useMemo(() => applyFilters(sorted, cfg.filters), [sorted, cfg.filters]);
  const metricLabels = cfg.metrics.map((k) => ({ key: k, label: AVAILABLE_METRICS_UI.find((m) => m.key === k)?.label ?? k }));

  return (
    <div className="rounded-control border border-border p-3">
      <p className="text-[11px]  text-muted-foreground mb-3">Preview</p>
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No data returned.</p>
      ) : cfg.chartType === "number" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metricLabels.map((m) => {
            const total = (data[m.key] ?? []).reduce((s, p) => s + p.y, 0);
            return (
              <div key={m.key} className="rounded-control border border-border p-3">
                <p className="text-[11px] text-muted-foreground truncate">{m.label}</p>
                <p className="text-2xl font-display font-semibold">{total.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      ) : cfg.chartType === "table" || cfg.chartType === "pivot" ? (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="border-b border-border sticky top-0 bg-surface">
              <tr>
                <th className="text-left py-1.5 px-2">Date</th>
                {metricLabels.map((m) => <th key={m.key} className="text-right py-1.5 px-2">{m.label}</th>)}
                {cfg.calculatedFields.map((c) => <th key={c.id} className="text-right py-1.5 px-2 text-primary">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1 px-2">{row.t}</td>
                  {metricLabels.map((m) => (
                    <td key={m.key} className="py-1 px-2 text-right ">
                      {(row[m.key] as number | undefined)?.toLocaleString() ?? "—"}
                    </td>
                  ))}
                  {cfg.calculatedFields.map((c) => (
                    <td key={c.id} className="py-1 px-2 text-right  text-primary">
                      {typeof row[c.name] === "number" ? (row[c.name] as number).toLocaleString() : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : cfg.chartType === "pie" ? (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={metricLabels.map((m, i) => ({
                name: m.label,
                value: (data[m.key] ?? []).reduce((s, p) => s + p.y, 0),
                fill: PIE_COLORS[i % PIE_COLORS.length],
              }))}
              dataKey="value" nameKey="name" outerRadius={90} label
            >
              {metricLabels.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          {cfg.chartType === "bar" ? (
            <BarChart data={filtered}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {metricLabels.map((m, i) => (
                <Bar key={m.key} dataKey={m.key} name={m.label} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </BarChart>
          ) : cfg.chartType === "area" ? (
            <AreaChart data={filtered}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {metricLabels.map((m, i) => (
                <Area key={m.key} type="monotone" dataKey={m.key} name={m.label}
                  stroke={PIE_COLORS[i % PIE_COLORS.length]}
                  fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.2} />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={filtered}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {metricLabels.map((m, i) => (
                <Line key={m.key} type="monotone" dataKey={m.key} name={m.label}
                  stroke={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------- Data helpers ----------

interface Row { t: string; [key: string]: string | number }

function mergeSeries(data: Record<string, { t: string; y: number }[]>): Row[] {
  const byT = new Map<string, Row>();
  for (const [metric, points] of Object.entries(data)) {
    for (const p of points) {
      const row: Row = byT.get(p.t) ?? { t: p.t };
      row[metric] = p.y;
      byT.set(p.t, row);
    }
  }
  return Array.from(byT.values()).sort((a, b) => (a.t < b.t ? -1 : 1));
}

function applyCalculated(rows: Row[], calcs: CalcField[]): Row[] {
  if (!calcs.length) return rows;
  return rows.map((r) => {
    const out: Row = { ...r };
    for (const c of calcs) {
      try {
        const fn = new Function(...Object.keys(r), `return (${c.expr});`);
        const res = fn(...Object.values(r).map((v) => (typeof v === "number" ? v : 0)));
        if (typeof res === "number" && Number.isFinite(res)) out[c.name] = res;
      } catch { /* skip invalid expressions */ }
    }
    return out;
  });
}

function applyFilters(rows: Row[], filters: FilterCond[]): Row[] {
  if (!filters.length) return rows;
  return rows.filter((r) =>
    filters.every((f) => {
      const cell = r[f.field];
      const num = Number(f.value);
      switch (f.op) {
        case "eq": return String(cell) === f.value;
        case "neq": return String(cell) !== f.value;
        case "gt": return typeof cell === "number" && cell > num;
        case "gte": return typeof cell === "number" && cell >= num;
        case "lt": return typeof cell === "number" && cell < num;
        case "lte": return typeof cell === "number" && cell <= num;
        case "contains": return String(cell).toLowerCase().includes(f.value.toLowerCase());
        case "starts_with": return String(cell).toLowerCase().startsWith(f.value.toLowerCase());
      }
    })
  );
}

function applySort(rows: Row[], sort: SortCond[]): Row[] {
  if (!sort.length) return rows;
  const s = [...rows];
  s.sort((a, b) => {
    for (const cond of sort) {
      const av = a[cond.field]; const bv = b[cond.field];
      if (av === bv) continue;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return cond.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return s;
}
