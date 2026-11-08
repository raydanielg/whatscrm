/**
 * Super Admin — AI provider registry.
 *
 * Cross-tenant inventory of configured AI providers, their models, health
 * probe state, and 30-day usage/cost. Credentials are never returned by the
 * server — only whether an API key is configured.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Cpu,
  DollarSign,
  KeyRound,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle2,
  Plus,
  Pencil,
  PlayCircle,
  Trash2,
  DownloadCloud,
  Loader2,
} from "lucide-react";

import {
  getAiProviderRegistry,
  setAiProviderState,
  type AiProviderStateInput,
} from "@/lib/admin/platform-modules.functions";
import {
  deletePlatformAiProvider,
  syncPlatformProviderModels,
  testPlatformAiProvider,
  type ProviderTestResult,
} from "@/lib/admin/ai-providers.functions";
import { ProviderEditorDialog, emptyDraft, type ProviderDraft } from "./provider-editor-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

const registryQueryKey = ["admin", "ai-providers"] as const;

function usd(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function compact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

function healthTone(status: string | undefined) {
  if (!status) return "bg-muted text-muted-foreground border-border";
  if (status === "healthy" || status === "ok")
    return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (status === "degraded") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-rose-500/10 text-rose-600 border-rose-500/20";
}

export function AiProvidersConsole() {
  const qc = useQueryClient();
  const fetchRegistry = useServerFn(getAiProviderRegistry);
  const setState = useServerFn(setAiProviderState);

  const [search, setSearch] = React.useState("");
  const [kind, setKind] = React.useState("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [providerToDelete, setProviderToDelete] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: registryQueryKey,
    queryFn: () => fetchRegistry(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const toggle = useMutation({
    mutationFn: (input: AiProviderStateInput) => setState({ data: input }),
    onMutate: (input) => setBusyId(input.id),
    onSuccess: () => {
      toast.success("Provider updated");
      qc.invalidateQueries({ queryKey: ["admin", "ai-providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyId(null),
  });

  // ---- Editor dialog ----------------------------------------------------
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ProviderDraft | null>(null);

  // ---- Test / sync / delete --------------------------------------------
  const runTest = useServerFn(testPlatformAiProvider);
  const runSync = useServerFn(syncPlatformProviderModels);
  const runDelete = useServerFn(deletePlatformAiProvider);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, ProviderTestResult>>({});

  async function handleTest(id: string) {
    setActionId(id);
    try {
      const res = await runTest({ data: { providerId: id } });
      setTestResults((prev) => ({ ...prev, [id]: res }));
      if (res.ok) toast.success(`Provider replied in ${res.latencyMs}ms`);
      else toast.error(res.error ?? "Provider test failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provider test failed");
    } finally {
      setActionId(null);
    }
  }

  async function handleSync(id: string) {
    setActionId(id);
    try {
      const res = await runSync({ data: { providerId: id } });
      toast.success(
        res.count > 0
          ? `Added ${res.count} model${res.count === 1 ? "" : "s"} (${res.source})`
          : "Model catalog already up to date",
      );
      qc.invalidateQueries({ queryKey: ["admin", "ai-providers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Model sync failed");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete() {
    if (!providerToDelete || actionId) return;
    const { id } = providerToDelete;
    setActionId(id);
    try {
      const result = await runDelete({ data: { id } });
      if (result?.ok !== true) {
        throw new Error("The server did not confirm deletion. Please sign in again and retry.");
      }
      // Discard any request that began before deletion. Only show success after
      // a new server registry confirms the provider is actually absent.
      await qc.cancelQueries({ queryKey: registryQueryKey });
      const registry = await fetchRegistry();
      qc.setQueryData(registryQueryKey, registry);
      if (registry.providers.some((provider) => provider.id === id)) {
        throw new Error("Provider is still in the database. Deletion was not confirmed.");
      }
      setProviderToDelete(null);
      toast.success("Provider deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionId(null);
    }
  }

  const providers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.providers ?? []).filter((p) => {
      if (kind !== "all" && p.kind !== kind) return false;
      if (!q) return true;
      return [p.name, p.kind, p.workspace_name, p.base_url ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [data?.providers, search, kind]);

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <AlertTriangle className="w-4 h-4" /> Could not load the AI provider registry
          </div>
          <p className="text-muted-foreground mt-1">{(error as Error).message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const k = data?.kpis;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Configured providers"
          value={isLoading ? null : String(k?.total ?? 0)}
          icon={Sparkles}
          hint={`${k?.enabled ?? 0} enabled · ${k?.models ?? 0} models`}
        />
        <Kpi
          label="Requests (30 days)"
          value={isLoading ? null : compact(k?.usage30d.requests ?? 0)}
          icon={Activity}
          hint={`${compact(k?.usage30d.tokens ?? 0)} tokens`}
        />
        <Kpi
          label="Spend (30 days)"
          value={isLoading ? null : usd(k?.usage30d.costUsd ?? 0)}
          icon={DollarSign}
          tone="text-emerald-600"
          hint={`${compact(k?.usage30d.errors ?? 0)} errors`}
        />
        <Kpi
          label="Needs attention"
          value={isLoading ? null : String((k?.unhealthy ?? 0) + (k?.missingKey ?? 0))}
          icon={AlertTriangle}
          tone="text-amber-600"
          hint={`${k?.unhealthy ?? 0} unhealthy · ${k?.missingKey ?? 0} missing key`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search provider, kind, or workspace"
            className="pl-8"
          />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All provider kinds</SelectItem>
            {(k?.kinds ?? []).map((x) => (
              <SelectItem key={x.kind} value={x.kind}>
                {x.kind} ({x.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh"
          className="w-9 h-9"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <Button
          onClick={() => {
            setDraft({ ...emptyDraft });
            setEditorOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add provider
        </Button>
      </div>

      <ProviderEditorDialog open={editorOpen} onOpenChange={setEditorOpen} draft={draft} />
      <AlertDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !actionId) setProviderToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {providerToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the provider and its models. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={actionId !== null}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {actionId === providerToDelete?.id && <Loader2 className="animate-spin" />}
              Delete provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}

        {!isLoading && providers.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {data?.providers?.length
                ? "No providers match the current filters."
                : "No AI providers have been configured by any tenant yet."}
            </CardContent>
          </Card>
        )}

        {providers.map((p) => {
          const needsKey = !p.has_api_key && p.kind !== "ollama";
          return (
            <Card key={p.id} className={p.enabled ? "" : "opacity-70"}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Cpu className="w-6 h-6 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{p.name}</span>
                      <Badge variant="secondary" className="text-[11px]">
                        {p.kind}
                      </Badge>
                      {p.is_default && (
                        <Badge variant="outline" className="text-[11px]">
                          default
                        </Badge>
                      )}
                      <Badge variant="outline" className={healthTone(p.health?.status)}>
                        {p.health?.status ?? "unprobed"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-x-2">
                      <span>{p.workspace_name}</span>
                      <span>· priority {p.priority}</span>
                      {p.base_url && <span className="break-all">· {p.base_url}</span>}
                      {p.health?.latency_ms != null && <span>· {p.health.latency_ms}ms</span>}
                    </div>
                    {p.health?.last_error && (
                      <div className="text-xs text-rose-600 mt-1 truncate max-w-xl">
                        {p.health.last_error}
                        {p.health.consecutive_failures > 0 &&
                          ` (${p.health.consecutive_failures} consecutive failures)`}
                      </div>
                    )}
                    {needsKey && (
                      <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5" /> No API key configured — requests to
                        this provider will fail.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs inline-flex items-center gap-1 ${p.has_api_key ? "text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {p.has_api_key ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      key
                    </span>
                    <Switch
                      checked={p.enabled}
                      disabled={busyId === p.id}
                      onCheckedChange={(v) => toggle.mutate({ id: p.id, enabled: v })}
                      aria-label={`${p.enabled ? "Disable" : "Enable"} ${p.name}`}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {p.models.length} model{p.models.length === 1 ? "" : "s"}
                  </span>
                  <span>{compact(p.usage30d.requests)} requests / 30d</span>
                  <span>{compact(p.usage30d.tokens)} tokens</span>
                  <span>{usd(p.usage30d.costUsd)}</span>
                  {p.usage30d.errors > 0 && (
                    <span className="text-rose-600">{p.usage30d.errors} errors</span>
                  )}
                </div>

                {p.models.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.models.slice(0, 8).map((m) => (
                      <Badge
                        key={m.id}
                        variant="outline"
                        className={`text-[11px] font-mono ${m.enabled ? "" : "opacity-50 line-through"}`}
                      >
                        {m.display_name || m.model_id}
                        {m.is_default ? " ★" : ""}
                      </Badge>
                    ))}
                    {p.models.length > 8 && (
                      <Badge variant="outline" className="text-[11px]">
                        +{p.models.length - 8} more
                      </Badge>
                    )}
                  </div>
                )}

                {p.models.length === 0 && (
                  <div className="mt-2 text-xs text-amber-600">
                    No models synced — the app falls back to a default model. Run “Sync models”.
                  </div>
                )}

                {testResults[p.id] && (
                  <div
                    className={`mt-2 text-xs rounded-control border px-2 py-1.5 ${
                      testResults[p.id].ok
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                        : "border-rose-500/20 bg-rose-500/10 text-rose-700"
                    }`}
                  >
                    {testResults[p.id].ok
                      ? `Live test passed · ${testResults[p.id].model} · ${testResults[p.id].latencyMs}ms · “${testResults[p.id].reply}”`
                      : `Live test failed · ${testResults[p.id].error}`}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === p.id}
                    onClick={() => handleTest(p.id)}
                  >
                    {actionId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === p.id}
                    onClick={() => handleSync(p.id)}
                  >
                    <DownloadCloud className="w-3.5 h-3.5 mr-1.5" /> Sync models
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft({
                        id: p.id,
                        workspaceId: p.workspace_id,
                        kind: p.kind,
                        name: p.name,
                        baseUrl: p.base_url ?? "",
                        apiKeySecretName: p.api_key_secret_name ?? "",
                        organizationId: p.organization_id ?? "",
                        enabled: p.enabled,
                        isDefault: p.is_default,
                        priority: p.priority,
                      });
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Configure
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={actionId === p.id}
                    onClick={() => setProviderToDelete({ id: p.id, name: p.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${tone ?? "text-muted-foreground"}`} />
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className="text-2xl font-semibold mt-1 ">{value}</div>
        )}
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
