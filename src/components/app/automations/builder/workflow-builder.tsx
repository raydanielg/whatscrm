import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publishWorkflow, testRunWorkflow } from "@/lib/workflows/workflows.functions";
import { NODE_REGISTRY_BY_TYPE, type NodeDefinition } from "@/lib/workflows/node-registry";
import { validateGraph, type ValidationIssue } from "@/lib/workflows/validation";
import { EMPTY_GRAPH, type WorkflowGraph, type WorkflowNode, type WorkflowEdge } from "@/lib/workflows/types";
import { useWorkflowHistory } from "@/hooks/use-workflow-history";
import { CustomNode, type WFNodeData } from "./custom-node";
import { NodePalette } from "./node-palette";
import { NodeInspector } from "./node-inspector";
import { TemplateGallery } from "./template-gallery";
import { QuickAddPicker } from "./quick-add-picker";
import { SimulateRunDialog } from "./simulate-run-dialog";
import { useLayout } from "@/shared/contexts/layout-context";
import type { WorkflowTemplate } from "@/lib/workflows/templates";
import {
  Undo2, Redo2, Save, Rocket, LayoutTemplate, AlertTriangle, CheckCircle2,
  Loader2, ArrowLeft, History, Copy as CopyIcon, Play, X as XIcon, Zap, Share2, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { readActiveWorkspaceId } from "@/lib/tenant/active-tenant";
import { buildWorkflowShareUrl } from "@/lib/tenant/share-link";
import {
  useWorkflowPermissions,
  WORKFLOW_READONLY_ROLE_REASON,
} from "@/hooks/use-workflow-permissions";
import { ScrollArea } from "@/components/ui/scroll-area";


// Explains, in one sentence, why every editing control is inert. Used for both
// the inline banner and the native tooltip on each disabled button so the
// reason is discoverable by hover and by reading.
const UNAVAILABLE_REASON =
  "This workflow belongs to a different workspace, so it’s read-only here. Switch organization from the sidebar to edit it.";

const nodeTypes = { wf: CustomNode };

function toReactFlow(graph: WorkflowGraph, invalidIds: Set<string>): { nodes: Node<WFNodeData>[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: "wf",
      position: n.position,
      data: { type: n.type, label: n.label, config: n.config, hasError: invalidIds.has(n.id) },
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.branch,
      type: "default",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2, strokeDasharray: "6 4" },
    })),
  };
}

function fromReactFlow(nodes: Node<WFNodeData>[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.type,
      position: n.position,
      config: n.data.config ?? {},
      label: n.data.label,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      branch: typeof e.label === "string" ? e.label : undefined,
    })),
  };
}

const genId = () => `n_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Stable fingerprint of everything we persist. Used to skip no-op writes so
 * opening a workflow (or merely selecting/hovering a node) never issues a
 * database update.
 */
function serialize(graph: WorkflowGraph, name: string): string {
  return JSON.stringify({
    name: name.trim(),
    nodes: [...graph.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => ({ id: n.id, type: n.type, position: n.position, config: n.config ?? {}, label: n.label ?? null })),
    edges: [...graph.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ id: e.id, source: e.source, target: e.target, branch: e.branch ?? null })),
  });
}

/**
 * React Flow emits changes for selection and measured dimensions too. Those
 * are pure view state — committing them would pollute undo history and
 * trigger endless autosaves.
 */
function isPersistentEdgeChange(c: EdgeChange): boolean {
  return c.type !== "select";
}

export function WorkflowBuilder({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <BuilderInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}

function BuilderInner({ workflowId }: { workflowId: string }) {
  const qc = useQueryClient();
  const publishFn = useServerFn(publishWorkflow);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  // The builder needs the width, so the main sidebar collapses while it is open.
  // The user's own sidebar preference is not saved, and it is restored on leave.
  const { sidebarCollapsed, setSidebarCollapsed } = useLayout();
  React.useEffect(() => {
    const wasCollapsed = sidebarCollapsed;
    setSidebarCollapsed(true, { persist: false });
    return () => setSidebarCollapsed(wasCollapsed, { persist: false });
    // Run once on mount and restore on unmount; the saved value is read at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    data: automation,
    isLoading,
    isError,
    error: loadError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["workflow", workflowId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("id, name, description, status, graph, version, updated_at, workspace_id")
        .eq("id", workflowId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  const history = useWorkflowHistory(EMPTY_GRAPH);
  const [name, setName] = React.useState("");
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [showQuickAdd, setShowQuickAdd] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const clipboard = React.useRef<WorkflowNode | null>(null);
  const initialized = React.useRef(false);
  const lastPersisted = React.useRef<string | null>(null);
  const inFlight = React.useRef(false);
  const pendingSave = React.useRef(false);

  // Load automation into history state once
  React.useEffect(() => {
    if (!automation || initialized.current) return;
    initialized.current = true;
    const g = (automation.graph as WorkflowGraph | null) ?? EMPTY_GRAPH;
    history.reset(g);
    setName(automation.name ?? "Untitled");
    lastPersisted.current = serialize(g, automation.name ?? "Untitled");
    if ((g.nodes ?? []).length === 0) setShowTemplates(true);
  }, [automation, history]);

  const issues = React.useMemo<ValidationIssue[]>(() => validateGraph(history.graph), [history.graph]);
  const invalidIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const i of issues) if (i.nodeId && i.level === "error") s.add(i.nodeId);
    return s;
  }, [issues]);
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warning").length;

  const { nodes, edges } = React.useMemo(() => toReactFlow(history.graph, invalidIds), [history.graph, invalidIds]);
  const selectedNode = selectedId ? history.graph.nodes.find((n) => n.id === selectedId) ?? null : null;

  // The workflow may load (RLS allows it) while the active tenant points at a
  // different workspace — every write would then be scoped wrong. Rather than
  // failing silently on click, the builder goes read-only and says why.
  const isUnavailable = React.useMemo(() => {
    if (!automation?.workspace_id) return false;
    const active = readActiveWorkspaceId();
    return Boolean(active) && active !== automation.workspace_id;
  }, [automation?.workspace_id]);

  // Second guard: the tenant may be correct but the user's workspace role may
  // only grant read access. Writes would be rejected by RLS, so disable them.
  const { canEdit, isLoading: permsLoading } = useWorkflowPermissions(automation?.workspace_id ?? null);
  const lacksWritePermission = Boolean(automation) && !permsLoading && !canEdit && !isUnavailable;

  const readOnly = isUnavailable || !canEdit;
  const readOnlyReason = isUnavailable
    ? UNAVAILABLE_REASON
    : lacksWritePermission
      ? WORKFLOW_READONLY_ROLE_REASON
      : undefined;
  const unavailableReason = readOnlyReason;

  // Single choke point for every graph mutation. Kept in a ref so the callbacks
  // below don't have to re-create when permissions resolve, and so drag/drop,
  // keyboard shortcuts and React Flow's own change events all hit the same
  // guard instead of each remembering to check.
  const readOnlyRef = React.useRef(readOnly);
  React.useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  const lastBlockToast = React.useRef(0);
  const allowEdit = React.useCallback((): boolean => {
    if (!readOnlyRef.current) return true;
    // Throttle: a blocked drag fires many change events per second.
    const now = Date.now();
    if (now - lastBlockToast.current > 4000) {
      lastBlockToast.current = now;
      toast.error("Read-only workflow", { description: readOnlyReasonRef.current });
    }
    return false;
  }, []);
  const readOnlyReasonRef = React.useRef(readOnlyReason);
  React.useEffect(() => {
    readOnlyReasonRef.current = readOnlyReason;
  }, [readOnlyReason]);



  // Share links must never carry the *viewer's* active org: they are scoped to
  // the organization owning this workflow's workspace, or org-free when that
  // can't be resolved, so the recipient's own tenant resolution takes over.
  const [copyingLink, setCopyingLink] = React.useState(false);
  const copyShareLink = React.useCallback(async () => {
    setCopyingLink(true);
    try {
      const url = await buildWorkflowShareUrl(workflowId, automation?.workspace_id ?? null);
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: url });
    } catch {
      toast.error("Could not copy the link");
    } finally {
      setCopyingLink(false);
    }
  }, [workflowId, automation?.workspace_id]);


  /* ----------------------------- Persistence ----------------------------- */

  // Single-flight persistence. Never runs concurrently with itself, never
  // writes when nothing changed, and never touches canvas state (viewport,
  // selection or zoom stay exactly where the user left them).
  const persist = React.useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      if (!initialized.current) return false;
      // Read-only in this workspace: never autosave, never surface a failure.
      if (readOnly) return false;
      const snapshot = serialize(history.graph, name);
      if (snapshot === lastPersisted.current) {
        setSaveState("saved");
        return true;
      }
      if (inFlight.current) {
        pendingSave.current = true;
        return false;
      }
      inFlight.current = true;
      setSaveState("saving");
      const { error } = await supabase
        .from("automations")
        .update({ graph: history.graph as unknown as never, name: name.trim() || "Untitled" })
        .eq("id", workflowId);
      inFlight.current = false;

      if (error) {
        setSaveState("error");
        if (!opts?.silent) toast.error(`Save failed: ${error.message}`);
        return false;
      }
      lastPersisted.current = snapshot;
      setSaveState("saved");
      if (pendingSave.current) {
        pendingSave.current = false;
        void persist({ silent: true });
      }
      return true;
    },
    [history.graph, name, workflowId, readOnly],
  );

  const persistRef = React.useRef(persist);
  React.useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const isDirty = initialized.current && serialize(history.graph, name) !== lastPersisted.current;

  // Debounced autosave — only fires when the graph or name actually changed.
  React.useEffect(() => {
    if (!initialized.current) return;
    if (serialize(history.graph, name) === lastPersisted.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      void persistRef.current({ silent: true });
    }, 900);
    return () => clearTimeout(t);
  }, [history.graph, name]);

  // Explicit save — one request, guarded against double submits.
  const saveMutation = useMutation({
    mutationFn: async () => {
      const ok = await persistRef.current();
      if (!ok && saveStateRef.current === "error") throw new Error("Save failed");
      return ok;
    },
    onSuccess: () => {
      toast.success("Workflow saved");
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  const saveStateRef = React.useRef(saveState);
  React.useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  // Warn on unload while unsaved edits are pending.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Flush any pending edits when leaving the builder.
  React.useEffect(
    () => () => {
      void persistRef.current({ silent: true });
    },
    [],
  );


  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      // ⌘S must work even while the name field has focus.
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void persistRef.current();
        return;
      }
      if (inField) return;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowQuickAdd((v) => !v);
        return;
      }

      const canMutate = !readOnlyRef.current;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!canMutate) return;
        e.preventDefault();
        history.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        if (!canMutate) return;
        e.preventDefault();
        history.redo();
      } else if (mod && e.key.toLowerCase() === "c" && selectedNode) {
        clipboard.current = selectedNode;
        toast.success("Node copied");
      } else if (mod && e.key.toLowerCase() === "v" && clipboard.current) {
        if (!allowEdit()) return;
        const src = clipboard.current;
        const newNode: WorkflowNode = {
          ...src,
          id: genId(),
          position: { x: src.position.x + 40, y: src.position.y + 40 },
        };
        history.commit((g) => ({ ...g, nodes: [...g.nodes, newNode] }));
        setSelectedId(newNode.id);
      } else if (mod && e.key.toLowerCase() === "d" && selectedNode) {
        e.preventDefault();
        duplicateNode(selectedNode.id);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteNode(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedNode, history]);

  // React Flow owns node positions while the canvas is open, so drags move
  // smoothly. The saved graph is copied in whenever it changes (load, undo,
  // redo, or after a drag is committed). A drag is written to history on stop.
  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<WFNodeData>(nodes);
  React.useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      if (!allowEdit()) return;
      onRfNodesChange(changes);
      // Deleting a node is a real change, so it goes into history right away.
      if (changes.some((c) => c.type === "remove")) {
        const next = applyNodeChanges(changes, rfNodes);
        history.commit(fromReactFlow(next, edges));
      }
    },
    [rfNodes, edges, history, allowEdit, onRfNodesChange],
  );
  const onNodeDragStop = React.useCallback(
    (_: React.MouseEvent, dragged: Node<WFNodeData>) => {
      if (!allowEdit()) return;
      const next = rfNodes.map((n) => (n.id === dragged.id ? { ...n, position: dragged.position } : n));
      history.commit(fromReactFlow(next, edges));
    },
    [rfNodes, edges, history, allowEdit],
  );
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => {
      if (!allowEdit()) return;
      const persistent = changes.filter(isPersistentEdgeChange);
      if (persistent.length === 0) return;
      const next = applyEdgeChanges(persistent, edges);
      history.commit(fromReactFlow(nodes, next));
    },
    [nodes, edges, history, allowEdit],
  );
  const onConnect = React.useCallback(
    (conn: Connection) => {
      if (!allowEdit()) return;
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const next = addEdge(
        { ...conn, id: `e_${Math.random().toString(36).slice(2, 9)}`, type: "default", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
        edges,
      );
      history.commit(fromReactFlow(nodes, next));
    },
    [edges, nodes, history, allowEdit],
  );

  const addNode = React.useCallback(
    (def: NodeDefinition, position?: { x: number; y: number }) => {
      if (!allowEdit()) return;
      const pos = position ?? { x: 160 + Math.random() * 200, y: 160 + Math.random() * 120 };
      const newNode: WorkflowNode = { id: genId(), type: def.type, position: pos, config: {} };
      history.commit((g) => ({ ...g, nodes: [...g.nodes, newNode] }));
      setSelectedId(newNode.id);
    },
    [history, allowEdit],
  );

  const addPresetNode = React.useCallback(
    (type: string, label: string, config: Record<string, unknown>) => {
      if (!allowEdit()) return;
      const pos = { x: 200 + Math.random() * 220, y: 160 + Math.random() * 140 };
      const newNode: WorkflowNode = { id: genId(), type, position: pos, config, label };
      history.commit((g) => ({ ...g, nodes: [...g.nodes, newNode] }));
      setSelectedId(newNode.id);
      toast.success(`${label} added`);
    },
    [history, allowEdit],
  );


  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow");
      const def = NODE_REGISTRY_BY_TYPE[type];
      if (!def || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = rf.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
      addNode(def, position);
    },
    [rf, addNode],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const patchNode = (id: string, patch: Partial<WorkflowNode>) => {
    if (!allowEdit()) return;
    history.commit((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  };
  const deleteNode = (id: string) => {
    if (!allowEdit()) return;
    history.commit((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateNode = (id: string) => {
    if (!allowEdit()) return;
    const src = history.graph.nodes.find((n) => n.id === id);
    if (!src) return;
    const copy: WorkflowNode = { ...src, id: genId(), position: { x: src.position.x + 40, y: src.position.y + 40 } };
    history.commit((g) => ({ ...g, nodes: [...g.nodes, copy] }));
    setSelectedId(copy.id);
  };

  const applyTemplate = (tpl: WorkflowTemplate) => {
    if (!allowEdit()) return;
    // Regenerate node ids to avoid collision
    const idMap = new Map<string, string>();
    const newNodes: WorkflowNode[] = tpl.graph.nodes.map((n) => {
      const nid = genId();
      idMap.set(n.id, nid);
      return { ...n, id: nid };
    });
    const newEdges: WorkflowEdge[] = tpl.graph.edges.map((e) => ({
      id: `e_${Math.random().toString(36).slice(2, 9)}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      branch: e.branch,
    }));
    history.commit({ nodes: newNodes, edges: newEdges });
    setShowTemplates(false);
    toast.success(`Applied "${tpl.name}"`);
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      // Publish snapshots the stored graph — flush pending edits first so the
      // published version always matches what is on the canvas.
      const saved = await persistRef.current();
      if (!saved) throw new Error("Could not save pending changes — publish aborted");
      return publishFn({ data: { automationId: workflowId, activate: true } });
    },
    onSuccess: (res) => {
      toast.success(`Published v${res.version} — status: ${res.status}`);
      qc.invalidateQueries({ queryKey: ["workflow", workflowId] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testRunFn = useServerFn(testRunWorkflow);
  const [testOpen, setTestOpen] = React.useState(false);
  const [simulateOpen, setSimulateOpen] = React.useState(false);
  const testMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      testRunFn({
        data: {
          automationId: workflowId,
          graph: history.graph as unknown as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] },
          input,
        },
      }),
    onSuccess: () => {
      setSimulateOpen(false);
      setTestOpen(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="h-content grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The workflow could not be read: either it does not exist, or it belongs
  // to an organization the current user is no longer a member of (RLS). Both
  // used to render an endless spinner with no way out.
  if (isError || !automation) {
    return (
      <div className="h-content grid place-items-center p-6">
        <div className="max-w-md w-full rounded-control border border-border bg-surface p-6 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 grid place-items-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-sm font-semibold">This workflow isn’t available</div>
          <p className="text-xs text-muted-foreground">
            {isError
              ? (loadError as Error)?.message ??
                "We couldn’t load this workflow."
              : "It may have been deleted, or it belongs to a different organization than the one you’re currently in. Switch organization from the sidebar and try again."}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-border bg-surface text-xs font-medium hover:bg-muted disabled:opacity-50 transition"
            >
              {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Retry
            </button>
            <Link
              to="/automations"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to workflows
            </Link>
          </div>
        </div>
      </div>
    );
  }


  return (
    // Full viewport height: the builder has its own toolbar and no app header, so the
    // header offset used by h-content would leave a gap at the bottom.
    <div className="h-dvh flex flex-col bg-background">
      {/* Toolbar */}
      {/* Wraps onto a second row on narrow screens instead of pushing the page sideways. */}
      <div className="min-h-12 border-b border-border bg-surface flex flex-wrap items-center px-3 py-2 gap-2 shrink-0 min-w-0">
        <Link
          to="/automations"
          className="p-1.5 rounded-control hover:bg-muted"
          aria-label="Back to workflows"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm font-semibold bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-2 py-1 min-w-[220px]"
        />
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <History className="w-3 h-3" /> v{automation.version ?? 1}
        </div>
        <SaveIndicator state={saveState} />

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              if (saveMutation.isPending || readOnly) return;
              saveMutation.mutate();
            }}
            disabled={readOnly || saveMutation.isPending || saveState === "saving" || !isDirty}
            title={unavailableReason ?? (isDirty ? "Save workflow (⌘S)" : "All changes saved")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saveMutation.isPending || saveState === "saving" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>

          <button
            onClick={() => setShowQuickAdd(true)}
            disabled={readOnly}
            title={unavailableReason ?? "Quick add (⌘K)"}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Quick add</span>
          </button>
          {/* Less common actions live in the menu to keep the bar readable. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface hover:bg-muted transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem disabled={readOnly || !history.canUndo} onSelect={() => history.undo()}>
                <Undo2 className="mr-2 h-3.5 w-3.5" />
                Undo
                <span className="ml-auto text-[11px] text-muted-foreground">⌘Z</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={readOnly || !history.canRedo} onSelect={() => history.redo()}>
                <Redo2 className="mr-2 h-3.5 w-3.5" />
                Redo
                <span className="ml-auto text-[11px] text-muted-foreground">⌘⇧Z</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={readOnly} onSelect={() => setShowTemplates(true)}>
                <LayoutTemplate className="mr-2 h-3.5 w-3.5" />
                Templates
              </DropdownMenuItem>
              {/* Sharing stays available in read-only mode — it never writes. */}
              <DropdownMenuItem disabled={copyingLink} onSelect={() => { void copyShareLink(); }}>
                <Share2 className="mr-2 h-3.5 w-3.5" />
                Copy share link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ValidationBadge errors={errorCount} warnings={warnCount} />
          <button
            onClick={() => setSimulateOpen(true)}
            disabled={readOnly || errorCount > 0 || testMutation.isPending}
            title={
              unavailableReason ??
              (errorCount > 0
                ? `Fix ${errorCount} validation ${errorCount === 1 ? "error" : "errors"} before testing`
                : "Test this workflow with sample input")
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Test / Simulate
          </button>
          <button
            onClick={() => publishMutation.mutate()}
            disabled={readOnly || errorCount > 0 || publishMutation.isPending}
            title={
              unavailableReason ??
              (errorCount > 0
                ? `Fix ${errorCount} validation ${errorCount === 1 ? "error" : "errors"} before publishing`
                : "Publish this workflow")
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {publishMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            Publish
          </button>
        </div>
      </div>

      {/* Inline explanation so the reason is visible without hovering. */}
      {readOnly && readOnlyReason ? (
        <div
          id="workflow-readonly-reason"
          data-testid="workflow-readonly-banner"
          data-readonly-kind={isUnavailable ? "workspace-mismatch" : "no-write-permission"}
          role="status"
          className="shrink-0 flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-semibold">
              {isUnavailable ? "Read-only: not available in this workspace" : "Read-only: view access"}
            </div>
            <p className="text-[11px] opacity-90">
              {readOnlyReason} Saving, publishing, testing and editing are disabled.
            </p>
          </div>
          <Link
            to="/automations"
            className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-control border border-amber-500/40 px-2 py-1 text-[11px] font-medium hover:bg-amber-500/15 transition"
          >
            <ArrowLeft className="w-3 h-3" /> Back to workflows
          </Link>
        </div>
      ) : null}



      <TestRunDrawer
        open={testOpen}
        onClose={() => setTestOpen(false)}
        result={testMutation.data}
        pending={testMutation.isPending}
      />


      <div className="flex-1 flex min-h-0">
        {readOnly ? null : <NodePalette onAdd={(def) => addNode(def)} />}

        <div ref={wrapperRef} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={rfNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesUpdatable={!readOnly}
            deleteKeyCode={readOnly ? null : undefined}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            onlyRenderVisibleElements
            maxZoom={2}
            defaultEdgeOptions={{ type: "default", animated: true }}
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background opacity-60" />
            <Controls
              position="bottom-left"
              className="!bg-surface !border !border-border !rounded-control !shadow-md overflow-hidden"
              showInteractive={false}
            />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              className="!bg-surface !border !border-border !rounded-control overflow-hidden"
              nodeColor={(n) => {
                const kind = NODE_REGISTRY_BY_TYPE[(n.data as WFNodeData)?.type]?.kind ?? "action";
                return kind === "trigger" ? "#10b981" : kind === "logic" ? "#f59e0b" : kind === "ai" ? "#d946ef" : "#0ea5e9";
              }}
              maskColor="hsl(var(--background) / 0.6)"
            />

            {history.graph.nodes.length === 0 && (
              <Panel position="top-center" className="mt-16">
                <div className="rounded-control border border-dashed border-border bg-surface/80 backdrop-blur px-5 py-4 text-center animate-fade-in shadow-sm">
                  <div className="text-sm font-semibold">Start building your workflow</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Drag a node from the left panel or pick a template.
                  </div>
                  <button
                    onClick={() => setShowTemplates(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                  >
                    <LayoutTemplate className="w-3.5 h-3.5" /> Browse templates
                  </button>
                </div>
              </Panel>
            )}
          </ReactFlow>

          {issues.length > 0 && (
            <div className="absolute left-3 top-3 max-w-xs animate-fade-in">
              <details className="rounded-control border border-border bg-surface/95 backdrop-blur shadow-sm text-xs">
                <summary className="px-3 py-2 cursor-pointer font-medium flex items-center gap-2">
                  {errorCount > 0 ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  {errorCount} errors · {warnCount} warnings
                </summary>
                <ScrollArea type="hover" className="border-t border-border" viewportClassName="max-h-56">
                  <ul>
                    {issues.map((i, idx) => (
                      <li
                        key={idx}
                        onClick={() => i.nodeId && setSelectedId(i.nodeId)}
                        className={`px-3 py-1.5 border-b border-border/50 last:border-0 flex items-start gap-1.5 cursor-pointer hover:bg-muted ${
                          i.level === "error" ? "text-rose-600" : "text-amber-600"
                        }`}
                      >
                        <span className="mt-0.5">•</span>
                        <span>{i.message}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </details>
            </div>
          )}
        </div>

        {selectedNode && (
          <NodeInspector
            key={selectedNode.id}
            node={selectedNode}
            onChange={(patch) => patchNode(selectedNode.id, patch)}
            onClose={() => setSelectedId(null)}
            onDelete={() => deleteNode(selectedNode.id)}
            onDuplicate={() => duplicateNode(selectedNode.id)}
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
          />
        )}
      </div>

      <TemplateGallery open={showTemplates} onClose={() => setShowTemplates(false)} onApply={applyTemplate} />
      <QuickAddPicker open={showQuickAdd} onClose={() => setShowQuickAdd(false)} onPick={addPresetNode} />
      <SimulateRunDialog
        open={simulateOpen}
        onClose={() => setSimulateOpen(false)}
        onRun={(input) => testMutation.mutate(input)}
        running={testMutation.isPending}
      />
    </div>
  );
}

function ToolbarBtn({
  onClick, icon, label, hotkey, disabled, disabledReason,
}: {
  onClick: () => void; icon: React.ReactNode; label: string; hotkey?: string;
  disabled?: boolean;
  /** Shown as the tooltip when the button is disabled, explaining why. */
  disabledReason?: string;
}) {
  const tooltip = disabled && disabledReason
    ? disabledReason
    : hotkey ? `${label} (${hotkey})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-describedby={disabled && disabledReason ? "workflow-readonly-reason" : undefined}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-xs hover:bg-muted transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "saving") {
    return (
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1 ml-2">
        <CheckCircle2 className="w-3 h-3" /> Saved
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-[11px] text-rose-600 ml-2">Save error</span>;
  }
  return null;
}

function ValidationBadge({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors === 0 && warnings === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] text-emerald-600 bg-emerald-500/10">
        <CheckCircle2 className="w-3 h-3" /> Valid
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] ${
        errors > 0 ? "text-rose-600 bg-rose-500/10" : "text-amber-600 bg-amber-500/10"
      }`}
    >
      <AlertTriangle className="w-3 h-3" />
      {errors > 0 ? `${errors} error${errors > 1 ? "s" : ""}` : `${warnings} warning${warnings > 1 ? "s" : ""}`}
    </span>
  );
}

type TestRunStep = {
  node_id: string;
  node_type: string;
  status: string;
  output: unknown;
  error: unknown;
  duration_ms: number | null;
  sort_order: number;
};

type TestRunResult = {
  runId: string;
  status: string;
  error?: { message: string; nodeId?: string } | null;
  durationMs?: number;
  steps: TestRunStep[];
};

function TestRunDrawer({
  open,
  onClose,
  result,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  result?: TestRunResult;
  pending: boolean;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-in fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Test run results"
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-surface border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <header className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Test run</span>
            {result && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-control ${
                  result.status === "success"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-rose-500/10 text-rose-600"
                }`}
              >
                {result.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" aria-label="Close">
            <XIcon className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Running
            </div>
          )}
          {result?.error && (
            <div className="rounded-control border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600">
              <div className="font-medium mb-1">Execution failed</div>
              <div>{result.error.message}</div>
            </div>
          )}
          {result && (
            <div className="text-[11px] text-muted-foreground">
              Duration: {result.durationMs ?? 0}ms · {result.steps.length} step
              {result.steps.length === 1 ? "" : "s"} · Dry run — no external side effects.
            </div>
          )}
          <ol className="space-y-2">
            {result?.steps.map((s) => (
              <li key={`${s.sort_order}-${s.node_id}`} className="rounded-control border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium truncate">
                    {s.sort_order + 1}. {s.node_type}
                  </div>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded ${
                      s.status === "success"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : s.status === "failed"
                          ? "bg-rose-500/10 text-rose-600"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {s.node_id} · {s.duration_ms ?? 0}ms
                </div>
                {!!s.output && (
                  <pre className="mt-2 text-[11px] bg-muted/50 rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(s.output, null, 2)}
                  </pre>
                )}
                {!!s.error && (
                  <pre className="mt-2 text-[11px] bg-rose-500/5 text-rose-600 rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(s.error, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </>
  );
}
