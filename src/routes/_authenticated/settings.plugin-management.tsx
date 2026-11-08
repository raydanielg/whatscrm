import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  getPluginManagementView,
  setPluginStatus,
  upgradePluginVersion,
  rollbackPlugin,
  backupPlugin,
  listPluginBackups,
  restorePluginBackup,
  listPluginLogs,
  updatePluginSettings,
  getPluginHealthHistory,
  listPluginCategories,
} from "@/lib/plugins/management.functions";
import { uninstallPlugin } from "@/lib/plugins/plugins.functions";
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from "@/lib/plugins/permissions";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Activity,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  History,
  Package,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/settings/plugin-management")({
  staticData: { breadcrumb: "Plugin Management" },
  head: () => ({ meta: [{ title: "Plugin Management" }] }),
  component: PluginManagementPage,
});

function PluginManagementPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["plugin-mgmt"],
    queryFn: () => getPluginManagementView({}),
    refetchInterval: 30_000,
  });
  const { data: cats } = useQuery({
    queryKey: ["plugin-categories"],
    queryFn: () => listPluginCategories({}),
  });

  const installs = (data?.installations ?? []) as any[];
  const filtered = useMemo(
    () =>
      category === "all" ? installs : installs.filter((i) => i.plugins?.category === category),
    [installs, category],
  );
  const currentInstall = selected ? installs.find((i) => i.id === selected) : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["plugin-mgmt"] });

  const oneClick =
    <T extends any[]>(fn: (...args: T) => Promise<any>, success: string) =>
    async (...args: T) => {
      try {
        await fn(...args);
        toast.success(success);
        refresh();
      } catch (e: any) {
        toast.error(e?.message ?? "Action failed");
      }
    };

  return (
    <>
      <AppTopbar
        title="Plugin Management"
        subtitle="One-click install, update, disable, uninstall, rollback, backup, and monitor every plugin in your workspace."
        actions={
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
        }
      />
      <main className="mx-auto max-w-7xl w-full p-6 space-y-6">
        <StatsRow installs={installs} />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={category === "all" ? "default" : "outline"}
            onClick={() => setCategory("all")}
          >
            All ({installs.length})
          </Button>
          {(cats?.categories ?? []).map((c: any) => {
            const count = installs.filter((i) => i.plugins?.category === c.slug).length;
            if (count === 0) return null;
            return (
              <Button
                key={c.slug}
                size="sm"
                variant={category === c.slug ? "default" : "outline"}
                onClick={() => setCategory(c.slug)}
              >
                {c.label} ({count})
              </Button>
            );
          })}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              No plugins installed yet. Browse the{" "}
              <a href="/marketplace/plugins" className="underline">
                marketplace
              </a>{" "}
              to add some.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((i) => (
              <PluginCard
                key={i.id}
                install={i}
                onOpen={() => setSelected(i.id)}
                onAction={oneClick}
              />
            ))}
          </div>
        )}

        <Dialog open={!!currentInstall} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            {currentInstall && (
              <PluginDetail
                install={currentInstall}
                onChanged={refresh}
                onClose={() => setSelected(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}

function StatsRow({ installs }: { installs: any[] }) {
  const active = installs.filter((i) => i.status === "active").length;
  const disabled = installs.filter((i) => i.status === "disabled").length;
  const errored = installs.filter((i) => i.status === "error" || i.last_error).length;
  const healthy = installs.filter((i) => i.last_health_status === "healthy").length;
  const stats = [
    { label: "Total installed", value: installs.length, icon: Package, tone: "" },
    { label: "Active", value: active, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Disabled", value: disabled, icon: Power, tone: "text-muted-foreground" },
    { label: "Errored", value: errored, icon: TriangleAlert, tone: "text-destructive" },
    { label: "Healthy", value: healthy, icon: Activity, tone: "text-blue-500" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <s.icon className={`size-5 ${s.tone}`} />
            <div>
              <div className="text-2xl font-bold leading-none">{s.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PluginCard({
  install: i,
  onOpen,
  onAction,
}: {
  install: any;
  onOpen: () => void;
  onAction: any;
}) {
  const isActive = i.status === "active";
  const version = i.plugin_versions?.version ?? "—";
  return (
    <Card className={i.last_error ? "border-destructive/50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {i.plugins?.icon_url ? (
            <img src={i.plugins.icon_url} alt="" className="size-11 rounded-control object-cover" />
          ) : (
            <div className="size-11 rounded-control bg-muted flex items-center justify-center">
              <Package className="size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {i.plugins?.name ?? "Unknown"}
              <Badge variant="outline" className="font-mono text-[11px]">
                v{version}
              </Badge>
              {isActive && !i.last_error && (
                <Badge className="text-[11px] bg-emerald-500 hover:bg-emerald-500">
                  <CheckCircle2 className="size-3 " />
                  Active
                </Badge>
              )}
              {i.status === "disabled" && (
                <Badge variant="secondary" className="text-[11px]">
                  Disabled
                </Badge>
              )}
              {i.last_error && (
                <Badge variant="destructive" className="text-[11px]">
                  <TriangleAlert className="size-3 " />
                  Error
                </Badge>
              )}
              {i.last_health_status && i.last_health_status !== "healthy" && (
                <Badge variant="outline" className="text-[11px] capitalize">
                  {i.last_health_status}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {i.plugins?.tagline ?? i.plugins?.slug}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {i.last_error && <p className="text-xs text-destructive line-clamp-2">{i.last_error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            checked={isActive}
            onCheckedChange={(v) =>
              onAction(
                (s: string) =>
                  setPluginStatus({ data: { installationId: i.id, status: s as any } }),
                v ? "Plugin enabled" : "Plugin disabled",
              )(v ? "active" : "disabled")
            }
            aria-label="Enable"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onAction(
              () => upgradePluginVersion({ data: { installationId: i.id } }),
              "Upgraded to latest",
            )}
          >
            <ArrowUpCircle className="size-3.5 mr-1.5" />
            Update
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!i.previous_version_id}
            onClick={onAction(
              () => rollbackPlugin({ data: { installationId: i.id } }),
              "Rolled back",
            )}
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Rollback
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onAction(
              () => backupPlugin({ data: { installationId: i.id, reason: "manual" } }),
              "Backup created",
            )}
          >
            <Database className="size-3.5 mr-1.5" />
            Backup
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Manage
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive ml-auto"
            onClick={onAction(
              () => uninstallPlugin({ data: { pluginId: i.plugin_id } }),
              "Uninstalled",
            )}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PluginDetail({
  install: i,
  onChanged,
  onClose,
}: {
  install: any;
  onChanged: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Package className="size-5" />
          {i.plugins?.name}{" "}
          <Badge variant="outline" className="font-mono">
            v{i.plugin_versions?.version}
          </Badge>
        </DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="settings" className="mt-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="settings">
            <Shield className="size-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="perms">
            <Shield className="size-3.5 mr-1.5" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="health">
            <Activity className="size-3.5 mr-1.5" />
            Health
          </TabsTrigger>
          <TabsTrigger value="logs">
            <FileText className="size-3.5 mr-1.5" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="backups">
            <Database className="size-3.5 mr-1.5" />
            Backups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab install={i} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="perms" className="mt-4">
          <PermissionsTab install={i} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <HealthTab install={i} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTab install={i} />
        </TabsContent>
        <TabsContent value="backups" className="mt-4">
          <BackupsTab install={i} onChanged={onChanged} onClose={onClose} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function SettingsTab({ install: i, onChanged }: { install: any; onChanged: () => void }) {
  const [text, setText] = useState(JSON.stringify(i.config ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (config: any) => updatePluginSettings({ data: { installationId: i.id, config } }),
    onSuccess: () => {
      toast.success("Settings saved");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Plugin configuration is stored as JSON. Only fields declared in the plugin manifest are
        consumed.
      </p>
      <Textarea
        rows={14}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr(null);
        }}
        className="font-mono text-xs"
      />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex justify-end">
        <Button
          onClick={() => {
            try {
              const parsed = JSON.parse(text);
              save.mutate(parsed);
            } catch (e: any) {
              setErr("Invalid JSON: " + e.message);
            }
          }}
          disabled={save.isPending}
        >
          <Save className="size-4 mr-2" />
          Save settings
        </Button>
      </div>
    </div>
  );
}

function PermissionsTab({ install: i, onChanged }: { install: any; onChanged: () => void }) {
  const [granted, setGranted] = useState<string[]>(i.granted_permissions ?? []);
  const requested = (i.plugin_versions?.permissions ?? []) as string[];
  const save = useMutation({
    mutationFn: () =>
      updatePluginSettings({ data: { installationId: i.id, grantedPermissions: granted } }),
    onSuccess: () => {
      toast.success("Permissions updated");
      onChanged();
    },
  });
  const toggle = (p: string) =>
    setGranted((g) => (g.includes(p) ? g.filter((x) => x !== p) : [...g, p]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The plugin will only be able to use permissions you grant. Missing a permission triggers a
        runtime error and is logged.
      </p>
      {Object.entries(PERMISSION_GROUPS).map(([k, g]) => {
        const relevant = g.permissions.filter((p) =>
          requested.length === 0 ? true : requested.includes(p),
        );
        if (relevant.length === 0) return null;
        return (
          <div key={k} className="border rounded-control p-3 space-y-2">
            <div>
              <p className="font-medium text-sm">{g.label}</p>
              <p className="text-xs text-muted-foreground">{g.description}</p>
            </div>
            <div className="space-y-1.5">
              {relevant.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={granted.includes(p)} onCheckedChange={() => toggle(p)} />
                  <span className="font-mono text-xs">{p}</span>
                  {requested.includes(p) && (
                    <Badge variant="secondary" className="text-[11px]">
                      requested
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="size-4 mr-2" />
          Save permissions
        </Button>
      </div>
    </div>
  );
}

function HealthTab({ install: i }: { install: any }) {
  const formatZoned = useZonedDateFormatter();
  const { data } = useQuery({
    queryKey: ["plugin-health", i.id],
    queryFn: () => getPluginHealthHistory({ data: { installationId: i.id, limit: 30 } }),
    refetchInterval: 30_000,
  });
  const rows = data?.history ?? [];
  const latest = rows[0];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthStat
          label="Status"
          value={latest?.status ?? "unknown"}
          tone={
            latest?.status === "healthy"
              ? "emerald"
              : latest?.status === "failing"
                ? "red"
                : "default"
          }
        />
        <HealthStat
          label="Latency"
          value={latest?.latency_ms != null ? `${latest.latency_ms} ms` : "—"}
        />
        <HealthStat
          label="Error rate"
          value={latest?.error_rate != null ? `${latest.error_rate}%` : "—"}
        />
        <HealthStat
          label="Memory"
          value={latest?.memory_mb != null ? `${latest.memory_mb} MB` : "—"}
        />
      </div>
      <div className="border rounded-control">
        <div className="text-xs font-medium px-3 py-2 border-b bg-muted/40">
          Last {rows.length} checks
        </div>
        <div className="divide-y max-h-64 overflow-y-auto">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No health checks recorded yet.</p>
          )}
          {rows.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="capitalize font-medium">{r.status}</span>
              <span className="text-muted-foreground">{r.latency_ms ?? "—"} ms</span>
              <span className="text-muted-foreground">
                {formatZoned(new Date(r.checked_at), { dateStyle: "short", timeStyle: "medium" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HealthStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "red" | "default";
}) {
  const colour = tone === "emerald" ? "text-emerald-500" : tone === "red" ? "text-destructive" : "";
  return (
    <div className="border rounded-control p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold capitalize ${colour}`}>{value}</p>
    </div>
  );
}

function LogsTab({ install: i }: { install: any }) {
  const formatZoned = useZonedDateFormatter();
  const [levels, setLevels] = useState<string[]>(["info", "warn", "error"]);
  const { data } = useQuery({
    queryKey: ["plugin-logs", i.id, levels.join(",")],
    queryFn: () =>
      listPluginLogs({ data: { installationId: i.id, levels: levels as any, limit: 200 } }),
    refetchInterval: 15_000,
  });
  const rows = data?.logs ?? [];
  const toggle = (l: string) =>
    setLevels((v) => (v.includes(l) ? v.filter((x) => x !== l) : [...v, l]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["debug", "info", "warn", "error"].map((l) => (
          <Button
            key={l}
            size="sm"
            variant={levels.includes(l) ? "default" : "outline"}
            onClick={() => toggle(l)}
            className="capitalize"
          >
            {l}
          </Button>
        ))}
      </div>
      <div className="border rounded-control max-h-96 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No logs match the selected levels.</p>
        ) : (
          rows.map((r: any) => (
            <div key={r.id} className="border-b last:border-0 p-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={
                    r.level === "error"
                      ? "destructive"
                      : r.level === "warn"
                        ? "secondary"
                        : "outline"
                  }
                  className="uppercase text-[11px]"
                >
                  {r.level}
                </Badge>
                <span className="font-mono">{r.event}</span>
                <span className="text-muted-foreground ml-auto">
                  {formatZoned(new Date(r.created_at), { timeStyle: "medium" })}
                </span>
              </div>
              {r.message && <p className="mt-1 text-muted-foreground">{r.message}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BackupsTab({
  install: i,
  onChanged,
  onClose,
}: {
  install: any;
  onChanged: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const formatZoned = useZonedDateFormatter();
  const { data } = useQuery({
    queryKey: ["plugin-backups", i.id],
    queryFn: () => listPluginBackups({ data: { installationId: i.id } }),
  });
  const create = useMutation({
    mutationFn: (reason: string) => backupPlugin({ data: { installationId: i.id, reason } }),
    onSuccess: () => {
      toast.success("Backup created");
      qc.invalidateQueries({ queryKey: ["plugin-backups", i.id] });
    },
  });
  const restore = useMutation({
    mutationFn: (backupId: string) => restorePluginBackup({ data: { backupId } }),
    onSuccess: () => {
      toast.success("Backup restored");
      onChanged();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Restore failed"),
  });
  const [reason, setReason] = useState("");
  const rows = data?.backups ?? [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button onClick={() => create.mutate(reason || "manual")} disabled={create.isPending}>
          <Database className="size-4 mr-2" />
          Create backup
        </Button>
      </div>
      <div className="border rounded-control">
        <div className="text-xs font-medium px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
          <span>Saved snapshots</span>
          <span className="text-muted-foreground">{rows.length}</span>
        </div>
        <div className="divide-y max-h-72 overflow-y-auto">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No backups yet.</p>
          )}
          {rows.map((b: any) => (
            <div key={b.id} className="p-3 flex items-center justify-between text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    v{b.version_string}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{b.reason ?? "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatZoned(new Date(b.created_at), { dateStyle: "short", timeStyle: "medium" })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => restore.mutate(b.id)}
                disabled={restore.isPending}
              >
                <History className="size-3.5 mr-1.5" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ClipboardList className="size-3.5" /> Restoring reverts the plugin to the snapshot's
        version, config, permissions, and storage.
      </p>
    </div>
  );
}
