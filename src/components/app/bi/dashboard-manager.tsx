import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Plus, Trash2, Save, RotateCcw, Copy, Settings2,
  GripVertical, Maximize2, Users, Lock, Globe, Star, Pencil, Check, X, Layers,
} from "lucide-react";
import { BiMetricWidget } from "./bi-metric-widget";
import { WidgetLibrary } from "./widget-library";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import {
  listDashboards, createDashboard, updateDashboard, deleteDashboard, cloneDashboard,
  listWidgets, upsertWidget, deleteWidget, saveDashboardLayout, resetDashboardLayout,
} from "@/lib/bi/bi.functions";
import type { WidgetType, MetricKey } from "@/lib/bi/types";

interface Props { workspaceId: string }

type Widget = {
  id: string;
  title: string;
  type: string;
  data_source: string;
  config: { unit?: string } | null;
  position: { x: number; y: number } | null;
  size: { w: number; h: number } | null;
  sort_order: number;
};

const SIZE_PRESETS: Array<{ id: string; label: string; w: number; h: number }> = [
  { id: "sm", label: "Small", w: 3, h: 2 },
  { id: "md", label: "Medium", w: 4, h: 3 },
  { id: "lg", label: "Large", w: 6, h: 3 },
  { id: "xl", label: "Full width", w: 12, h: 4 },
];

const VIS_ICON = { private: Lock, workspace: Users, public: Globe } as const;

export function DashboardManager({ workspaceId }: Props) {
  const qc = useQueryClient();
  const { isAdmin, canPublishDashboards } = useWorkspaceRole(workspaceId);

  const listD = useServerFn(listDashboards);
  const createD = useServerFn(createDashboard);
  const updateD = useServerFn(updateDashboard);
  const deleteD = useServerFn(deleteDashboard);
  const cloneD = useServerFn(cloneDashboard);
  const listW = useServerFn(listWidgets);
  const upsertW = useServerFn(upsertWidget);
  const deleteW = useServerFn(deleteWidget);
  const saveL = useServerFn(saveDashboardLayout);
  const resetL = useServerFn(resetDashboardLayout);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showNewDashboard, setShowNewDashboard] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"private" | "workspace">("private");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: dashboards } = useQuery({
    queryKey: ["bi.dashboards", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listD({ data: { workspaceId } }),
  });

  useEffect(() => {
    if (!selectedId && dashboards && dashboards.length > 0) setSelectedId(dashboards[0].id);
  }, [dashboards, selectedId]);

  const selected = useMemo(() => (dashboards ?? []).find((d) => d.id === selectedId), [dashboards, selectedId]);

  const { data: widgets } = useQuery({
    queryKey: ["bi.widgets", selectedId],
    enabled: !!selectedId,
    queryFn: () => listW({ data: { dashboardId: selectedId! } }),
  });

  const [localWidgets, setLocalWidgets] = useState<Widget[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setLocalWidgets(((widgets ?? []) as Widget[]).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setDirty(false);
  }, [widgets]);

  const invalidateDashboards = () => qc.invalidateQueries({ queryKey: ["bi.dashboards", workspaceId] });
  const invalidateWidgets = () => qc.invalidateQueries({ queryKey: ["bi.widgets", selectedId] });

  const createMut = useMutation({
    mutationFn: (input: { name: string; visibility: "private" | "workspace" | "public" }) =>
      createD({ data: { workspaceId, name: input.name, visibility: input.visibility } }),
    onSuccess: (row) => {
      setShowNewDashboard(false); setNewName(""); setNewVisibility("private");
      invalidateDashboards();
      setSelectedId(row.id);
    },
  });
  const renameMut = useMutation({
    mutationFn: (input: { id: string; name: string }) => updateD({ data: { id: input.id, name: input.name } }),
    onSuccess: () => { setRenamingId(null); invalidateDashboards(); },
  });
  const setDefaultMut = useMutation({
    mutationFn: (id: string) => updateD({ data: { id, isDefault: true } }),
    onSuccess: invalidateDashboards,
  });
  const setVisibilityMut = useMutation({
    mutationFn: (input: { id: string; visibility: "private" | "workspace" | "public" }) => updateD({ data: { id: input.id, visibility: input.visibility } }),
    onSuccess: invalidateDashboards,
  });
  const deleteDashboardMut = useMutation({
    mutationFn: (id: string) => deleteD({ data: { id } }),
    onSuccess: () => { setSelectedId(null); invalidateDashboards(); },
  });
  const cloneDashboardMut = useMutation({
    mutationFn: (id: string) => cloneD({ data: { id } }),
    onSuccess: (row) => { setSelectedId(row.id); invalidateDashboards(); },
  });

  const addWidgetMut = useMutation({
    mutationFn: (w: { title: string; type: WidgetType; dataSource: string; unit: string }) => {
      const y = Math.max(0, ...localWidgets.map((lw) => (lw.position?.y ?? 0) + (lw.size?.h ?? 3)));
      return upsertW({
        data: {
          workspaceId, dashboardId: selectedId!,
          type: w.type, title: w.title,
          dataSource: w.dataSource as MetricKey,
          config: { unit: w.unit },
          position: { x: 0, y },
          size: { w: 4, h: 3 },
        },
      });
    },
    onSuccess: () => { setLibraryOpen(false); invalidateWidgets(); },
  });

  const deleteWidgetMut = useMutation({
    mutationFn: (id: string) => deleteW({ data: { id } }),
    onSuccess: invalidateWidgets,
  });

  const saveLayoutMut = useMutation({
    mutationFn: () => saveL({
      data: {
        dashboardId: selectedId!,
        widgets: localWidgets.map((w, i) => ({
          id: w.id,
          position: w.position ?? { x: 0, y: 0 },
          size: w.size ?? { w: 4, h: 3 },
          sortOrder: i,
        })),
      },
    }),
    onSuccess: () => { setDirty(false); invalidateWidgets(); },
  });

  const resetLayoutMut = useMutation({
    mutationFn: () => resetL({ data: { dashboardId: selectedId! } }),
    onSuccess: () => { setDirty(false); invalidateWidgets(); },
  });

  const changeSize = (id: string, w: number, h: number) => {
    setLocalWidgets((prev) => prev.map((lw) => lw.id === id ? { ...lw, size: { w, h } } : lw));
    setDirty(true);
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const onDragStart = (id: string) => setDragId(id);
  const onDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setLocalWidgets((prev) => {
      const from = prev.findIndex((w) => w.id === dragId);
      const to = prev.findIndex((w) => w.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragId(null);
    setDirty(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Sidebar */}
      <aside className="rounded-control border border-border bg-surface flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Dashboards</h3>
          </div>
          <button onClick={() => setShowNewDashboard((s) => !s)} className="p-1.5 rounded-control hover:bg-surface-elevated" title="New dashboard">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {showNewDashboard && (
          <div className="p-3 border-b border-border space-y-2 bg-surface-elevated/50">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dashboard name" className="w-full rounded-control border border-border bg-background px-3 py-1.5 text-sm" />
            <div className="flex gap-1">
              <button onClick={() => setNewVisibility("private")} className={`flex-1 inline-flex items-center justify-center gap-1 text-xs rounded-control border py-1.5 ${newVisibility === "private" ? "border-primary bg-primary/10" : "border-border"}`}>
                <Lock className="h-3 w-3" /> Personal
              </button>
              <button
                onClick={() => canPublishDashboards && setNewVisibility("workspace")}
                disabled={!canPublishDashboards}
                title={canPublishDashboards ? "" : "Only admins can create organization dashboards"}
                className={`flex-1 inline-flex items-center justify-center gap-1 text-xs rounded-control border py-1.5 ${newVisibility === "workspace" ? "border-primary bg-primary/10" : "border-border"} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Users className="h-3 w-3" /> Organization
              </button>
            </div>
            <button
              disabled={!newName || createMut.isPending}
              onClick={() => createMut.mutate({ name: newName, visibility: newVisibility })}
              className="w-full rounded-control bg-primary text-primary-foreground py-1.5 text-xs disabled:opacity-50"
            >
              Create dashboard
            </button>
          </div>
        )}
        <ul className="flex-1 overflow-auto py-1">
          {(dashboards ?? []).map((d) => {
            const Icon = VIS_ICON[(d.visibility ?? "workspace") as keyof typeof VIS_ICON];
            const active = d.id === selectedId;
            const canEdit = (d.visibility === "private") || isAdmin;
            return (
              <li key={d.id}>
                <div className={`group flex items-center gap-1 px-3 py-2 text-sm cursor-pointer border-l-2 transition-colors ${active ? "bg-surface-elevated border-primary" : "border-transparent hover:bg-surface-elevated/60"}`}
                     onClick={() => { setSelectedId(d.id); setEditMode(false); }}>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {renamingId === d.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameMut.mutate({ id: d.id, name: renameValue });
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 rounded-control border border-border bg-background px-1 text-xs"
                    />
                  ) : (
                    <span className="flex-1 min-w-0 truncate">{d.name}</span>
                  )}
                  {d.is_default && <Star className="h-3 w-3 text-yellow-500 shrink-0" />}
                  {canEdit && renamingId !== d.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(d.id); setRenameValue(d.name); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-background rounded"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {dashboards && dashboards.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">No dashboards yet.</li>
          )}
        </ul>
      </aside>

      {/* Main */}
      <section className="rounded-control border border-border bg-surface min-h-[70vh] flex flex-col">
        {selected ? (
          <>
            <header className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-display font-semibold truncate">{selected.name}</h2>
                <span className="inline-flex items-center gap-1 text-[11px] uppercase bg-surface-elevated border border-border rounded-control px-2 py-0.5">
                  {selected.visibility === "private" ? <><Lock className="h-3 w-3" />Personal</> :
                   selected.visibility === "workspace" ? <><Users className="h-3 w-3" />Organization</> :
                   <><Globe className="h-3 w-3" />Public</>}
                </span>
                {dirty && <span className="text-[11px] text-amber-500 font-medium">Unsaved changes</span>}
              </div>
              <div className="flex items-center gap-1">
                {editMode && (
                  <>
                    <button onClick={() => setLibraryOpen(true)} className="inline-flex items-center gap-1 text-xs rounded-control border border-border px-3 py-1.5 hover:bg-surface-elevated">
                      <Plus className="h-3.5 w-3.5" /> Widget
                    </button>
                    <button
                      disabled={!dirty || saveLayoutMut.isPending}
                      onClick={() => saveLayoutMut.mutate()}
                      className="inline-flex items-center gap-1 text-xs rounded-control bg-primary text-primary-foreground px-3 py-1.5 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" /> Save layout
                    </button>
                    <button
                      onClick={() => { if (confirm("Restore default layout? This will re-flow widgets to the default grid.")) resetLayoutMut.mutate(); }}
                      className="inline-flex items-center gap-1 text-xs rounded-control border border-border px-3 py-1.5 hover:bg-surface-elevated"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore default
                    </button>
                  </>
                )}
                <button onClick={() => setEditMode((m) => !m)} className={`inline-flex items-center gap-1 text-xs rounded-control px-3 py-1.5 ${editMode ? "bg-primary text-primary-foreground" : "border border-border hover:bg-surface-elevated"}`}>
                  <Settings2 className="h-3.5 w-3.5" /> {editMode ? "Done editing" : "Edit"}
                </button>
                <div className="relative group">
                  <button className="p-1.5 rounded-control hover:bg-surface-elevated"><Layers className="h-4 w-4" /></button>
                  <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block min-w-[180px] rounded-control border border-border bg-surface shadow-lg py-1 text-sm">
                    <button onClick={() => cloneDashboardMut.mutate(selected.id)} className="w-full text-left px-3 py-1.5 hover:bg-surface-elevated inline-flex items-center gap-2"><Copy className="h-3.5 w-3.5" />Clone</button>
                    <button onClick={() => setDefaultMut.mutate(selected.id)} className="w-full text-left px-3 py-1.5 hover:bg-surface-elevated inline-flex items-center gap-2"><Star className="h-3.5 w-3.5" />Set as default</button>
                    {isAdmin && (
                      <>
                        <button onClick={() => setVisibilityMut.mutate({ id: selected.id, visibility: "private" })} className="w-full text-left px-3 py-1.5 hover:bg-surface-elevated inline-flex items-center gap-2"><Lock className="h-3.5 w-3.5" />Make personal</button>
                        <button onClick={() => setVisibilityMut.mutate({ id: selected.id, visibility: "workspace" })} className="w-full text-left px-3 py-1.5 hover:bg-surface-elevated inline-flex items-center gap-2"><Users className="h-3.5 w-3.5" />Share with org</button>
                      </>
                    )}
                    <button onClick={() => { if (confirm(`Delete dashboard "${selected.name}"?`)) deleteDashboardMut.mutate(selected.id); }} className="w-full text-left px-3 py-1.5 hover:bg-surface-elevated inline-flex items-center gap-2 text-rose-500"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                  </div>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto p-4">
              {localWidgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-3">
                  <LayoutDashboard className="h-10 w-10 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium">This dashboard is empty</p>
                    <p className="text-sm text-muted-foreground">Add widgets from the widget library to get started.</p>
                  </div>
                  <button onClick={() => { setEditMode(true); setLibraryOpen(true); }} className="inline-flex items-center gap-1 text-sm rounded-control bg-primary text-primary-foreground px-4 py-2">
                    <Plus className="h-4 w-4" /> Add first widget
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-3 auto-rows-[80px]">
                  <AnimatePresence>
                    {localWidgets.map((w) => {
                      const size = w.size ?? { w: 4, h: 3 };
                      const unit = (w.config?.unit as "count" | "currency" | "percent" | undefined) ?? "count";
                      const chartType = (w.type as "kpi" | "line" | "area" | "bar" | "number") ?? "kpi";
                      return (
                        <motion.div
                          key={w.id}
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          draggable={editMode}
                          onDragStart={() => onDragStart(w.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDropOn(w.id)}
                          className={`relative col-span-${size.w} row-span-${size.h} min-h-[160px]`}
                          style={{ gridColumn: `span ${Math.min(12, size.w)} / span ${Math.min(12, size.w)}`, gridRow: `span ${Math.min(6, size.h)} / span ${Math.min(6, size.h)}` }}
                        >
                          {editMode && (
                            <div className="absolute inset-0 z-10 rounded-control border-2 border-dashed border-primary/40 bg-primary/5 pointer-events-none" />
                          )}
                          <BiMetricWidget
                            workspaceId={workspaceId}
                            metric={w.data_source as MetricKey}
                            title={w.title}
                            chart={chartType}
                            unit={unit}
                            className="h-full"
                          />
                          {editMode && (
                            <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-surface/90 backdrop-blur rounded-control border border-border p-1 shadow-sm">
                              <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
                              <select
                                value={SIZE_PRESETS.find((s) => s.w === size.w && s.h === size.h)?.id ?? "md"}
                                onChange={(e) => {
                                  const p = SIZE_PRESETS.find((s) => s.id === e.target.value);
                                  if (p) changeSize(w.id, p.w, p.h);
                                }}
                                className="text-[11px] bg-background border border-border rounded px-1 py-0.5"
                                title="Resize"
                              >
                                {SIZE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                              </select>
                              <button onClick={() => deleteWidgetMut.mutate(w.id)} className="p-0.5 rounded hover:bg-rose-500/10 text-rose-500" title="Remove widget">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-3 p-6">
            <LayoutDashboard className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Select or create a dashboard to get started.</p>
          </div>
        )}
      </section>

      <WidgetLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onAdd={(w) => addWidgetMut.mutate(w)}
      />
    </div>
  );
}
