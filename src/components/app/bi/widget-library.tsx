import { useState } from "react";
import { X, Search, Plus } from "lucide-react";
import { AVAILABLE_METRICS_UI, type MetricCatalogItem } from "./metrics-catalog";
import type { WidgetType } from "@/lib/bi/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (widget: { title: string; type: WidgetType; dataSource: string; unit: string }) => void;
}

const CHART_TYPES: Array<{ id: WidgetType; label: string }> = [
  { id: "kpi", label: "KPI Number" },
  { id: "line", label: "Line Chart" },
  { id: "area", label: "Area Chart" },
  { id: "bar", label: "Bar Chart" },
];

const CATEGORY_LABELS: Record<MetricCatalogItem["category"], string> = {
  conversations: "Conversations & Messaging",
  sales: "Sales & Revenue",
  marketing: "Marketing",
  ai: "AI",
  workflow: "Automation",
  crm: "CRM",
};

export function WidgetLibrary({ open, onClose, onAdd }: Props) {
  const [q, setQ] = useState("");
  const [chart, setChart] = useState<WidgetType>("kpi");

  if (!open) return null;

  const filtered = AVAILABLE_METRICS_UI.filter((m) =>
    !q || m.label.toLowerCase().includes(q.toLowerCase()) || m.key.toLowerCase().includes(q.toLowerCase())
  );
  const grouped = filtered.reduce<Record<string, MetricCatalogItem[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-surface border-l border-border shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold">Widget Library</h3>
            <p className="text-xs text-muted-foreground">Pick a metric and chart type</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-elevated rounded-control"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search widgets" className="w-full rounded-control border border-border bg-background pl-9 pr-3 py-2 text-sm" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {CHART_TYPES.map((c) => (
              <button
                key={c.id}
                onClick={() => setChart(c.id)}
                className={`px-3 py-1 rounded-control text-xs border transition-colors ${chart === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-surface-elevated"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat}>
              <p className="text-xs font-medium uppercase text-muted-foreground mb-2">{CATEGORY_LABELS[cat as MetricCatalogItem["category"]]}</p>
              <ul className="space-y-1">
                {items.map((m) => (
                  <li key={m.key}>
                    <button
                      onClick={() => onAdd({ title: m.label, type: chart, dataSource: m.key, unit: m.unit })}
                      className="w-full flex items-center justify-between rounded-control border border-border bg-background px-3 py-2 text-left text-sm hover:bg-surface-elevated hover:border-primary/40 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground">{m.key} · {m.unit}</p>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No widgets match "{q}"</p>}
        </div>
      </div>
    </div>
  );
}
