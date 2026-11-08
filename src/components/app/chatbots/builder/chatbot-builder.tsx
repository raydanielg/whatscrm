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
  useNodesState,
  applyEdgeChanges,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Undo2,
  Redo2,
  LayoutTemplate,
  Rocket,
  Play,
  ArrowLeft,
  Save,
  History,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Copy as CopyIcon,
  Download,
  Upload,
  X,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFlowHistory } from "@/hooks/use-flow-history";
import {
  EMPTY_FLOW,
  NODE_DEF_BY_TYPE,
  validateFlow,
  genFlowId,
  type ChatbotFlow,
  type ChatbotNode,
  type ChatbotEdge,
  type ChatbotNodeDef,
  type ChatbotFlowTemplate,
} from "@/lib/chatbots/flow-types";
import { ChatbotFlowNode, type ChatbotNodeData } from "./chatbot-node";
import { ChatbotNodePalette } from "./chatbot-node-palette";
import { ChatbotNodeInspector } from "./chatbot-node-inspector";
import { ChatbotTemplatesDialog } from "./chatbot-templates-dialog";
import { ChatbotTestDrawer } from "./chatbot-test-drawer";
import { Button } from "@/components/ui/button";
import { sbAny } from "@/lib/supabase/untyped";
import { ScrollArea } from "@/components/ui/scroll-area";

const nodeTypes = { cb: ChatbotFlowNode };

function toRF(
  flow: ChatbotFlow,
  invalidIds: Set<string>,
  selectedId: string | null,
): { nodes: Node<ChatbotNodeData>[]; edges: Edge[] } {
  return {
    nodes: flow.nodes.map((n) => ({
      id: n.id,
      type: "cb",
      position: n.position,
      selected: n.id === selectedId,
      data: { type: n.type, label: n.label, config: n.config, hasError: invalidIds.has(n.id) },
    })),
    edges: flow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      label: e.label,
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
    })),
  };
}

function fromRF(nodes: Node<ChatbotNodeData>[], edges: Edge[]): ChatbotFlow {
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
      sourceHandle: (e.sourceHandle as string | null | undefined) ?? undefined,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
  };
}

export function ChatbotBuilder({ botId }: { botId: string }) {
  return (
    <ReactFlowProvider>
      <BuilderInner botId={botId} />
    </ReactFlowProvider>
  );
}

type BotRow = {
  id: string;
  name: string;
  workspace_id: string;
  flow: unknown;
  status: string;
  updated_at: string;
};

function BuilderInner({ botId }: { botId: string }) {
  const fmtZoned = useZonedDateFormatter();
  const qc = useQueryClient();
  const rf = useReactFlow();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: bot, isLoading } = useQuery({
    queryKey: ["chatbot", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbots")
        .select("id, name, workspace_id, flow, status, updated_at")
        .eq("id", botId)
        .single();
      if (error) throw error;
      return data as BotRow;
    },
  });

  const versionsQ = useQuery({
    queryKey: ["chatbot-versions", botId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_flow_versions")
        .select("id, version, label, published, created_at")
        .eq("chatbot_id", botId)
        .order("version", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const history = useFlowHistory<ChatbotFlow>(EMPTY_FLOW);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [showTest, setShowTest] = React.useState(false);
  const [showVersions, setShowVersions] = React.useState(false);
  const clipboard = React.useRef<ChatbotNode | null>(null);
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!bot || initialized.current) return;
    initialized.current = true;
    const f = (bot.flow as ChatbotFlow | null) ?? EMPTY_FLOW;
    history.reset(f);
    if ((f.nodes ?? []).length === 0) setShowTemplates(true);
  }, [bot, history]);

  const issues = React.useMemo(() => validateFlow(history.state), [history.state]);
  const invalidIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const i of issues) if (i.nodeId && i.level === "error") s.add(i.nodeId);
    return s;
  }, [issues]);
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warning").length;

  const { nodes, edges } = React.useMemo(
    () => toRF(history.state, invalidIds, selectedId),
    [history.state, invalidIds, selectedId],
  );
  const selectedNode = selectedId
    ? (history.state.nodes.find((n) => n.id === selectedId) ?? null)
    : null;

  // Autosave (debounced)
  React.useEffect(() => {
    if (!initialized.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("chatbots")
        .update({ flow: history.state as unknown as never })
        .eq("id", botId);
      setSaveState(error ? "error" : "saved");
      if (error) toast.error("Autosave failed");
    }, 900);
    return () => clearTimeout(t);
  }, [history.state, botId]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (
        mod &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        history.redo();
      } else if (mod && e.key.toLowerCase() === "c" && selectedNode) {
        clipboard.current = selectedNode;
        toast.success("Node copied");
      } else if (mod && e.key.toLowerCase() === "v" && clipboard.current) {
        const src = clipboard.current;
        const copy: ChatbotNode = {
          ...src,
          id: genFlowId(),
          position: { x: src.position.x + 40, y: src.position.y + 40 },
        };
        history.commit((g) => ({ ...g, nodes: [...g.nodes, copy] }));
        setSelectedId(copy.id);
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
  }, [selectedId, selectedNode]);

  // Drag and drop run on local React Flow state so every frame stays smooth and a
  // freshly dropped node is never overwritten by a stale snapshot. History is written
  // only on drag stop and on removal, the same pattern as the Advanced Workflow builder.
  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState(nodes);
  React.useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      onRfNodesChange(changes);
      if (changes.some((c) => c.type === "remove")) {
        const next = applyNodeChanges(changes, rfNodes);
        history.commit(fromRF(next, edges));
      }
    },
    [rfNodes, edges, history, onRfNodesChange],
  );
  const onNodeDragStop = React.useCallback(
    (_: React.MouseEvent, dragged: { id: string; position: { x: number; y: number } }) => {
      const next = rfNodes.map((n) =>
        n.id === dragged.id ? { ...n, position: dragged.position } : n,
      );
      history.commit(fromRF(next, edges));
    },
    [rfNodes, edges, history],
  );
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, edges);
      history.commit(fromRF(nodes, next));
    },
    [nodes, edges, history],
  );
  const onConnect = React.useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const label =
        conn.sourceHandle === "true" ? "true" : conn.sourceHandle === "false" ? "false" : undefined;
      const next = addEdge(
        {
          ...conn,
          id: `e_${Math.random().toString(36).slice(2, 9)}`,
          type: "smoothstep",
          animated: true,
          label,
          markerEnd: { type: MarkerType.ArrowClosed },
        },
        edges,
      );
      history.commit(fromRF(nodes, next));
    },
    [edges, nodes, history],
  );

  const addNode = React.useCallback(
    (def: ChatbotNodeDef, pos?: { x: number; y: number }) => {
      const position = pos ?? { x: 200 + Math.random() * 240, y: 160 + Math.random() * 140 };
      const node: ChatbotNode = {
        id: genFlowId(),
        type: def.type,
        position,
        config: { ...def.defaults },
      };
      history.commit((g) => ({ ...g, nodes: [...g.nodes, node] }));
      setSelectedId(node.id);
    },
    [history],
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow");
      const def = NODE_DEF_BY_TYPE[type as keyof typeof NODE_DEF_BY_TYPE];
      if (!def || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = rf.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
      addNode(def, position);
    },
    [rf, addNode],
  );

  const patchNode = (id: string, patch: Partial<ChatbotNode>) => {
    history.commit((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  };
  const deleteNode = (id: string) => {
    history.commit((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateNode = (id: string) => {
    const src = history.state.nodes.find((n) => n.id === id);
    if (!src) return;
    const copy: ChatbotNode = {
      ...src,
      id: genFlowId(),
      position: { x: src.position.x + 40, y: src.position.y + 40 },
    };
    history.commit((g) => ({ ...g, nodes: [...g.nodes, copy] }));
    setSelectedId(copy.id);
  };

  const applyTemplate = (t: ChatbotFlowTemplate) => {
    const idMap = new Map<string, string>();
    const newNodes: ChatbotNode[] = t.flow.nodes.map((n) => {
      const nid = genFlowId();
      idMap.set(n.id, nid);
      return { ...n, id: nid };
    });
    const newEdges: ChatbotEdge[] = t.flow.edges.map((e) => ({
      id: `e_${Math.random().toString(36).slice(2, 9)}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      sourceHandle: e.sourceHandle,
      label: e.label,
    }));
    history.commit({ nodes: newNodes, edges: newEdges });
    setShowTemplates(false);
    toast.success(`Applied "${t.name}"`);
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!bot) throw new Error("bot missing");
      const nextVersion = ((versionsQ.data?.[0]?.version ?? 0) as number) + 1;
      const { error } = await sbAny(supabase)
        .from("chatbot_flow_versions")
        .insert({
          chatbot_id: bot.id,
          workspace_id: bot.workspace_id,
          version: nextVersion,
          flow: history.state as unknown as never,
          published: true,
          label: `v${nextVersion}`,
        });
      if (error) throw error;
      await sbAny(supabase).from("chatbots").update({ status: "active" }).eq("id", bot.id);
      return nextVersion;
    },
    onSuccess: (v) => {
      toast.success(`Published v${v}`);
      qc.invalidateQueries({ queryKey: ["chatbot-versions", botId] });
      qc.invalidateQueries({ queryKey: ["chatbot", botId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveVersion = useMutation({
    mutationFn: async () => {
      if (!bot) throw new Error("bot missing");
      const nextVersion = ((versionsQ.data?.[0]?.version ?? 0) as number) + 1;
      const { error } = await sbAny(supabase)
        .from("chatbot_flow_versions")
        .insert({
          chatbot_id: bot.id,
          workspace_id: bot.workspace_id,
          version: nextVersion,
          flow: history.state as unknown as never,
          label: `Snapshot v${nextVersion}`,
        });
      if (error) throw error;
      return nextVersion;
    },
    onSuccess: () => {
      toast.success("Snapshot saved");
      qc.invalidateQueries({ queryKey: ["chatbot-versions", botId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreVersion = async (versionId: string) => {
    const { data, error } = await sbAny(supabase)
      .from("chatbot_flow_versions")
      .select("flow, version")
      .eq("id", versionId)
      .single();
    if (error || !data) {
      toast.error("Failed to restore");
      return;
    }
    history.commit(data.flow as unknown as ChatbotFlow);
    toast.success(`Restored v${data.version}`);
    setShowVersions(false);
  };

  const cloneBot = useMutation({
    mutationFn: async () => {
      if (!bot) throw new Error("bot missing");
      const { data, error } = await sbAny(supabase)
        .from("chatbots")
        .insert({
          workspace_id: bot.workspace_id,
          name: `${bot.name} (copy)`,
          flow: history.state as unknown as never,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newId) => {
      toast.success("Cloned");
      window.location.href = `/chatbots/${newId}/builder`;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(history.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bot?.name ?? "chatbot"}-flow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as ChatbotFlow;
        if (!parsed.nodes || !parsed.edges) throw new Error("Invalid file");
        history.commit(parsed);
        toast.success("Imported");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      }
    };
    reader.readAsText(file);
  };

  if (isLoading || !bot) {
    return (
      <div className="h-content grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-content flex flex-col bg-background">
      {/* Toolbar */}
      <div className="h-12 border-b border-border bg-surface flex items-center px-3 gap-2 shrink-0">
        <Link
          to="/chatbots/$botId"
          params={{ botId }}
          className="p-1.5 rounded-control hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="text-sm font-semibold truncate max-w-[220px]">{bot.name}</div>
        <span className="text-[11px] rounded-control border border-border px-1.5 py-0.5 text-muted-foreground">
          {bot.status}
        </span>
        <SaveIndicator state={saveState} />

        <div className="ml-auto flex items-center gap-1">
          <ToolbarBtn
            onClick={history.undo}
            icon={<Undo2 className="w-3.5 h-3.5" />}
            label="Undo"
            hotkey="⌘Z"
          />
          <ToolbarBtn
            onClick={history.redo}
            icon={<Redo2 className="w-3.5 h-3.5" />}
            label="Redo"
            hotkey="⌘⇧Z"
          />
          <div className="w-px h-5 bg-border mx-1" />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More actions"
                title="More actions"
                className="inline-flex items-center px-2 py-1.5 rounded-control hover:bg-muted text-muted-foreground hover:text-foreground transition"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setShowTemplates(true)}>
                <LayoutTemplate className="w-3.5 h-3.5 mr-2" /> Templates
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowVersions(true)}>
                <History className="w-3.5 h-3.5 mr-2" /> History
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => saveVersion.mutate()}>
                <Save className="w-3.5 h-3.5 mr-2" /> Snapshot
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportJson}>
                <Download className="w-3.5 h-3.5 mr-2" /> Export
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-2" /> Import
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cloneBot.mutate()}>
                <CopyIcon className="w-3.5 h-3.5 mr-2" /> Clone
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-px h-5 bg-border mx-1" />
          <ValidationBadge errors={errorCount} warnings={warnCount} />
          <button
            onClick={() => setShowTest(true)}
            disabled={errorCount > 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs font-medium hover:bg-muted disabled:opacity-50 transition"
          >
            <Play className="w-3.5 h-3.5" /> Test
          </button>
          <button
            onClick={() => publishMutation.mutate()}
            disabled={errorCount > 0 || publishMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {publishMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Rocket className="w-3.5 h-3.5" />
            )}
            Publish
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <ChatbotNodePalette onAdd={(d) => addNode(d)} />

        <div
          ref={wrapperRef}
          className="flex-1 relative"
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2.2}
            defaultEdgeOptions={{ type: "smoothstep", animated: true }}
            className="bg-background"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              className="!bg-background opacity-60"
            />
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
              nodeColor={(n) =>
                NODE_DEF_BY_TYPE[(n.data as ChatbotNodeData)?.type]?.accent ?? "#64748b"
              }
              maskColor="hsl(var(--background) / 0.6)"
            />

            {history.state.nodes.length === 0 && (
              <Panel position="top-center" className="mt-16">
                <div className="rounded-control border border-dashed border-border bg-surface/80 backdrop-blur px-5 py-4 text-center shadow-sm">
                  <div className="text-sm font-semibold">Start building your chatbot</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Drag a node from the left or pick a template.
                  </div>
                  <Button size="sm" className="mt-3" onClick={() => setShowTemplates(true)}>
                    <LayoutTemplate className="w-3.5 h-3.5 " /> Browse templates
                  </Button>
                </div>
              </Panel>
            )}
          </ReactFlow>

          {issues.length > 0 && (
            <div className="absolute left-3 top-3 max-w-xs">
              <details className="rounded-control border border-border bg-surface/95 backdrop-blur shadow-sm text-xs">
                <summary className="px-3 py-2 cursor-pointer font-medium flex items-center gap-2">
                  {errorCount > 0 ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
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
                        className={`px-3 py-1.5 border-b last:border-b-0 border-border/60 ${i.level === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}
                      >
                        {i.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </details>
            </div>
          )}
        </div>

        <ChatbotNodeInspector
          node={selectedNode}
          onChange={(patch) => selectedId && patchNode(selectedId, patch)}
          onDelete={() => selectedId && deleteNode(selectedId)}
          onDuplicate={() => selectedId && duplicateNode(selectedId)}
          onClose={() => setSelectedId(null)}
        />
      </div>

      <ChatbotTemplatesDialog
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onPick={applyTemplate}
      />
      <ChatbotTestDrawer open={showTest} onClose={() => setShowTest(false)} flow={history.state} />

      {showVersions && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowVersions(false)}
        >
          <div
            className="bg-surface border border-border rounded-control w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-12 border-b border-border flex items-center px-4">
              <div className="text-sm font-semibold flex-1">Version history</div>
              <button onClick={() => setShowVersions(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ScrollArea type="hover" viewportClassName="max-h-[60vh] [&>div]:!block">
              <div className="divide-y divide-border">
                {(versionsQ.data ?? []).map((v) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        v{v.version}
                        {v.published && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-control bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                            Published
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.label ?? "Snapshot"} ·{" "}
                        {fmtZoned(new Date(v.created_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restoreVersion(v.id)}>
                      Restore
                    </Button>
                  </div>
                ))}
                {(versionsQ.data ?? []).length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No snapshots yet.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick,
  icon,
  label,
  hotkey,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hotkey?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-control hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition"
      title={hotkey ? `${label} (${hotkey})` : label}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function ValidationBadge({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors === 0 && warnings === 0) {
    return (
      <span className="text-[11px] rounded-control px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Valid
      </span>
    );
  }
  return (
    <span
      className={`text-[11px] rounded-control px-2 py-0.5 flex items-center gap-1 border ${errors > 0 ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-amber-500/10 text-amber-600 border-amber-500/30"}`}
    >
      <AlertTriangle className="w-3 h-3" />{" "}
      {errors > 0 ? `${errors} errors` : `${warnings} warnings`}
    </span>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const map = {
    saving: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      text: "Saving",
      cls: "text-muted-foreground",
    },
    saved: { icon: <CheckCircle2 className="w-3 h-3" />, text: "Saved", cls: "text-emerald-600" },
    error: {
      icon: <AlertTriangle className="w-3 h-3" />,
      text: "Save failed",
      cls: "text-destructive",
    },
  } as const;
  const s = map[state];
  return (
    <span className={`ml-2 inline-flex items-center gap-1 text-[11px] ${s.cls}`}>
      {s.icon}
      {s.text}
    </span>
  );
}
