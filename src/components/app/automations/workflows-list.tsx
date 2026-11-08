import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { runWorkflow, unpublishWorkflow } from "@/lib/workflows/workflows.functions";
import {
  Play,
  Pause,
  Plus,
  Workflow,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  MoreHorizontal,
  Copy,
  Trash2,
  Archive,
  ArchiveRestore,
  Download,
  Upload,
  Rocket,
  Search,
  PencilLine,
} from "lucide-react";
import { toast } from "sonner";
import { NewFlowDialog } from "./new-flow-dialog";
import { validateGraph } from "@/lib/workflows/validation";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { sbAny } from "@/lib/supabase/untyped";

type AutomationRow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused";
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  runs_count: number;
  last_run_at: string | null;
  last_run_status: string | null;
  updated_at: string;
  archived_at: string | null;
  graph: WorkflowGraph | null;
};

type StatusFilter = "all" | "active" | "paused" | "draft" | "archived";

const EXPORT_FORMAT = "wacrm.workflow/v1" as const;

type ExportedWorkflow = {
  format: typeof EXPORT_FORMAT;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  graph: WorkflowGraph;
};

function parseImported(raw: string): ExportedWorkflow {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const o = json as Partial<ExportedWorkflow>;
  if (!o || typeof o !== "object") throw new Error("Unrecognised workflow file.");
  if (o.format !== EXPORT_FORMAT) throw new Error("Unrecognised workflow file format.");
  if (typeof o.name !== "string" || !o.name.trim())
    throw new Error("Workflow file is missing a name.");
  if (typeof o.trigger_type !== "string" || !o.trigger_type)
    throw new Error("Workflow file is missing a trigger.");
  const graph = o.graph as WorkflowGraph | undefined;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("Workflow file has no valid graph.");
  }
  return {
    format: EXPORT_FORMAT,
    name: o.name.trim().slice(0, 80),
    description: typeof o.description === "string" ? o.description.slice(0, 240) : null,
    trigger_type: o.trigger_type,
    trigger_config: (o.trigger_config ?? {}) as Record<string, unknown>,
    graph,
  };
}

/** Re-key a graph so an imported/duplicated copy never collides with the source. */
function rekeyGraph(graph: WorkflowGraph): WorkflowGraph {
  const rid = () => Math.random().toString(36).slice(2, 10);
  const map = new Map<string, string>();
  const nodes = graph.nodes.map((n) => {
    const id = `n_${rid()}`;
    map.set(n.id, id);
    return { ...n, id };
  });
  const edges = graph.edges
    .filter((e) => map.has(e.source) && map.has(e.target))
    .map((e) => ({
      ...e,
      id: `e_${rid()}`,
      source: map.get(e.source)!,
      target: map.get(e.target)!,
    }));
  return { nodes, edges };
}

export function WorkflowsList() {
  const qc = useQueryClient();
  const runFn = useServerFn(runWorkflow);
  const unpublishFn = useServerFn(unpublishWorkflow);
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id ?? null;
  const fmtZoned = useZonedDateFormatter();

  const [newOpen, setNewOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<AutomationRow | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const listKey = React.useMemo(() => ["workflows", workspaceId] as const, [workspaceId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: listKey,
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select(
          "id, name, description, status, trigger_type, trigger_config, runs_count, last_run_at, last_run_status, updated_at, archived_at, graph",
        )
        .eq("workspace_id", workspaceId!)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AutomationRow[];
    },
  });

  const invalidate = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["workflows"] });
  }, [qc]);

  /* --------------------------- Realtime (scoped) --------------------------- */
  React.useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`workflows-list:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => invalidate(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, invalidate]);

  /* -------------------------------- Mutations ------------------------------- */

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      setPendingId(id);
      return runFn({ data: { automationId: id, triggerSource: "manual", input: {} } });
    },
    onSuccess: (res) => {
      toast.success(
        res.status === "success" ? "Workflow ran successfully" : `Run finished: ${res.status}`,
      );
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingId(null),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: AutomationRow["status"] }) => {
      setPendingId(id);
      if (next === "paused") {
        // Unpublishing also cancels anything still queued for this workflow.
        await unpublishFn({ data: { automationId: id, cancelQueued: true } });
        return next;
      }
      const { error } = await sbAny(supabase)
        .from("automations")
        .update({ status: next })
        .eq("id", id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(
        next === "active"
          ? "Workflow enabled"
          : next === "paused"
            ? "Workflow paused"
            : "Moved to draft",
      );
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingId(null),
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      setPendingId(id);
      // Archiving must never leave a live workflow firing in the background.
      const patch = archive
        ? { archived_at: new Date().toISOString(), status: "paused" as const }
        : { archived_at: null };
      const { error } = await sbAny(supabase).from("automations").update(patch).eq("id", id);
      if (error) throw error;
      return archive;
    },
    onSuccess: (archived) => {
      toast.success(archived ? "Workflow archived" : "Workflow restored");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingId(null),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (row: AutomationRow) => {
      setPendingId(row.id);
      if (!workspaceId) throw new Error("No active workspace");
      const base = `${row.name} (copy)`.slice(0, 80);
      const { data: clashes } = await supabase
        .from("automations")
        .select("name")
        .eq("workspace_id", workspaceId)
        .ilike("name", `${base}%`);
      const taken = new Set((clashes ?? []).map((c) => (c.name as string).toLowerCase()));
      let name = base;
      let n = 2;
      while (taken.has(name.toLowerCase())) name = `${row.name} (copy ${n++})`.slice(0, 80);

      const { data, error } = await supabase
        .from("automations")
        .insert({
          workspace_id: workspaceId,
          name,
          description: row.description,
          trigger_type: row.trigger_type,
          trigger_config: (row.trigger_config ?? {}) as never,
          // Copies always start as drafts — never silently duplicate a live automation.
          status: "draft",
          graph: rekeyGraph(row.graph ?? { nodes: [], edges: [] }) as never,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
    onSuccess: (created) => {
      toast.success(`Duplicated as "${created.name}"`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setPendingId(id);
      const { error } = await sbAny(supabase).from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workflow deleted");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingId(null),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!workspaceId) throw new Error("No active workspace");
      const parsed = parseImported(await file.text());
      const { data: clashes } = await supabase
        .from("automations")
        .select("name")
        .eq("workspace_id", workspaceId)
        .ilike("name", `${parsed.name}%`);
      const taken = new Set((clashes ?? []).map((c) => (c.name as string).toLowerCase()));
      let name = parsed.name;
      let n = 2;
      while (taken.has(name.toLowerCase())) name = `${parsed.name} (${n++})`.slice(0, 80);

      const { data, error } = await supabase
        .from("automations")
        .insert({
          workspace_id: workspaceId,
          name,
          description: parsed.description,
          trigger_type: parsed.trigger_type,
          trigger_config: parsed.trigger_config as never,
          status: "draft",
          graph: rekeyGraph(parsed.graph) as never,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
    onSuccess: (created) => {
      toast.success(`Imported "${created.name}" as a draft`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exportWorkflow = (row: AutomationRow) => {
    const payload: ExportedWorkflow = {
      format: EXPORT_FORMAT,
      name: row.name,
      description: row.description,
      trigger_type: row.trigger_type,
      trigger_config: (row.trigger_config ?? {}) as Record<string, unknown>,
      graph: row.graph ?? { nodes: [], edges: [] },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.name.replace(/[^\w.-]+/g, "-").toLowerCase()}.workflow.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
  };

  /* --------------------------------- Derived -------------------------------- */

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((wf) => {
      const archived = !!wf.archived_at;
      if (statusFilter === "archived" ? !archived : archived) return false;
      if (statusFilter !== "all" && statusFilter !== "archived" && wf.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        wf.name.toLowerCase().includes(q) ||
        (wf.description ?? "").toLowerCase().includes(q) ||
        wf.trigger_type.toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  const counts = React.useMemo(() => {
    const all = data ?? [];
    const live = all.filter((w) => !w.archived_at);
    return {
      all: live.length,
      active: live.filter((w) => w.status === "active").length,
      paused: live.filter((w) => w.status === "paused").length,
      draft: live.filter((w) => w.status === "draft").length,
      archived: all.filter((w) => w.archived_at).length,
    };
  }, [data]);

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "active", label: `Active (${counts.active})` },
    { key: "paused", label: `Paused (${counts.paused})` },
    { key: "draft", label: `Drafts (${counts.draft})` },
    { key: "archived", label: `Archived (${counts.archived})` },
  ];

  return (
    <section aria-label="Workflows" className="space-y-4">
      <NewFlowDialog open={newOpen} onOpenChange={setNewOpen} />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) importMutation.mutate(file);
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Workflows</div>
          <div className="text-xs text-muted-foreground">
            No-code automations for WhatsApp, CRM, AI and integrations.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending || !workspaceId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control border border-border bg-surface text-sm hover:bg-muted disabled:opacity-60 transition"
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            New workflow
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows"
            aria-label="Search workflows"
            className="pl-8 h-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              aria-pressed={statusFilter === f.key}
              className={`px-2.5 py-1.5 rounded-control text-xs border transition ${
                statusFilter === f.key
                  ? "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-control border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-control" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-3 w-1/2" />
              <div className="flex justify-end gap-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-control border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto text-destructive" aria-hidden="true" />
          <div className="mt-2 text-sm font-medium">Could not load workflows</div>
          <div className="text-xs text-muted-foreground mt-1">{(error as Error)?.message}</div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 px-3 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center">
          <Workflow className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden="true" />
          <div className="mt-3 font-medium">
            {search || statusFilter !== "all"
              ? "No workflows match your filters"
              : "No workflows yet"}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {search || statusFilter !== "all"
              ? "Try a different search term or clear the status filter."
              : "Create your first workflow to automate WhatsApp replies, CRM updates and more."}
          </div>
          {(search || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="mt-3 px-3 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((wf) => {
            const graph = (wf.graph ?? { nodes: [], edges: [] }) as WorkflowGraph;
            const issues = validateGraph(graph);
            const errors = issues.filter((i) => i.level === "error").length;
            const warnings = issues.filter((i) => i.level === "warning").length;
            const archived = !!wf.archived_at;
            const busy = pendingId === wf.id;
            const canRun = errors === 0 && graph.nodes.length > 0 && !archived;
            return (
              <article
                key={wf.id}
                className={`rounded-control border border-border bg-surface p-4 shadow-sm hover:shadow-md transition ${archived ? "opacity-70" : ""}`}
              >
                <header className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-control bg-accent/10 text-accent grid place-items-center shrink-0">
                    <Workflow className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/automations/$workflowId"
                      params={{ workflowId: wf.id }}
                      className="font-medium truncate block hover:underline"
                      aria-label={`Open workflow ${wf.name}`}
                    >
                      {wf.name}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate">{wf.trigger_type}</div>
                  </div>
                  {archived ? (
                    <span className="inline-flex items-center rounded-control border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Archived
                    </span>
                  ) : (
                    <StatusPill status={wf.status} />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-1 rounded-control hover:bg-muted text-muted-foreground"
                        aria-label={`Actions for ${wf.name}`}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="w-4 h-4" />
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem asChild>
                        <Link to="/automations/$workflowId" params={{ workflowId: wf.id }}>
                          <PencilLine className="w-4 h-4" /> Edit in builder
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => duplicateMutation.mutate(wf)}
                        disabled={busy}
                      >
                        <Copy className="w-4 h-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => exportWorkflow(wf)}>
                        <Download className="w-4 h-4" /> Export JSON
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {!archived && wf.status !== "active" && (
                        <DropdownMenuItem
                          onSelect={() => statusMutation.mutate({ id: wf.id, next: "active" })}
                          disabled={busy || errors > 0}
                        >
                          <Rocket className="w-4 h-4" /> Enable
                        </DropdownMenuItem>
                      )}
                      {!archived && wf.status === "active" && (
                        <DropdownMenuItem
                          onSelect={() => statusMutation.mutate({ id: wf.id, next: "paused" })}
                          disabled={busy}
                        >
                          <Pause className="w-4 h-4" /> Unpublish / pause
                        </DropdownMenuItem>
                      )}
                      {!archived && wf.status !== "draft" && (
                        <DropdownMenuItem
                          onSelect={() => statusMutation.mutate({ id: wf.id, next: "draft" })}
                          disabled={busy}
                        >
                          <PencilLine className="w-4 h-4" /> Move to draft
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => archiveMutation.mutate({ id: wf.id, archive: !archived })}
                        disabled={busy}
                      >
                        {archived ? (
                          <ArchiveRestore className="w-4 h-4" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                        {archived ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setConfirmDelete(wf)}
                        disabled={busy}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </header>

                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="">{(wf.runs_count ?? 0).toLocaleString()} runs</span>
                  {wf.last_run_at && (
                    <span className="inline-flex items-center gap-1">
                      <LastRunIcon status={wf.last_run_status} />
                      {fmtZoned(new Date(wf.last_run_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                  {errors > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-destructive"
                      title={issues
                        .filter((i) => i.level === "error")
                        .map((i) => i.message)
                        .join("\n")}
                    >
                      <AlertTriangle className="w-3 h-3" /> {errors} error{errors > 1 ? "s" : ""}
                    </span>
                  )}
                  {errors === 0 && warnings > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                      title={issues.map((i) => i.message).join("\n")}
                    >
                      <AlertTriangle className="w-3 h-3" /> {warnings} warning
                      {warnings > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  {archived ? (
                    <button
                      type="button"
                      onClick={() => archiveMutation.mutate({ id: wf.id, archive: false })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted disabled:opacity-60 transition"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({
                            id: wf.id,
                            next: wf.status === "active" ? "paused" : "active",
                          })
                        }
                        disabled={busy || (wf.status !== "active" && errors > 0)}
                        title={
                          wf.status !== "active" && errors > 0
                            ? "Fix validation errors before enabling"
                            : undefined
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition"
                        aria-label={wf.status === "active" ? "Pause workflow" : "Activate workflow"}
                      >
                        {wf.status === "active" ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {wf.status === "active" ? "Pause" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => runMutation.mutate(wf.id)}
                        disabled={busy || !canRun}
                        title={!canRun ? "Fix validation errors before running" : "Run workflow"}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {busy && runMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Run
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the workflow, its version history and queued jobs. This
              cannot be undone — archive it instead if you may need it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Delete workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StatusPill({ status }: { status: AutomationRow["status"] }) {
  const map = {
    active: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    paused: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    draft: "text-muted-foreground bg-muted border-border",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] capitalize ${map[status]}`}
    >
      {status}
    </span>
  );
}

function LastRunIcon({ status }: { status: string | null }) {
  if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5" />;
}
