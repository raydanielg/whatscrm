import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Fingerprint,
  Globe2,
  MonitorSmartphone,
  ShieldAlert,
  UserCog,
  Clock,
  Plus,
  Loader2,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listActiveDevices,
  listTopIps,
  listSuspiciousActivity,
  listPermissionChanges,
  listRetentionPolicies,
  upsertRetentionPolicy,
  deleteRetentionPolicy,
} from "@/lib/admin/audit.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={cn("mt-2 text-2xl font-display font-semibold", toneCls)}>{value}</div>
    </Card>
  );
}

export function SecurityCenter() {
  const [tab, setTab] = useState("overview");
  const formatZoned = useZonedDateFormatter();
  const runSuspicious = useServerFn(listSuspiciousActivity);
  const runDevices = useServerFn(listActiveDevices);
  const runIps = useServerFn(listTopIps);
  const runPerms = useServerFn(listPermissionChanges);
  const runRetention = useServerFn(listRetentionPolicies);

  const suspicious = useQuery({
    queryKey: ["admin-suspicious"],
    queryFn: () => runSuspicious({ data: { hours: 24, limit: 100 } }),
    refetchInterval: 20000,
  });
  const devices = useQuery({
    queryKey: ["admin-devices"],
    queryFn: () => runDevices({ data: { limit: 100 } }),
    refetchInterval: 30000,
  });
  const ips = useQuery({
    queryKey: ["admin-ips"],
    queryFn: () => runIps({ data: { hours: 24, limit: 25 } }),
    refetchInterval: 30000,
  });
  const perms = useQuery({
    queryKey: ["admin-perms"],
    queryFn: () => runPerms({ data: { limit: 100 } }),
    refetchInterval: 30000,
  });
  const retention = useQuery({ queryKey: ["admin-retention"], queryFn: () => runRetention() });

  const suspiciousRows = Array.isArray(suspicious.data) ? suspicious.data : [];
  const deviceRows = Array.isArray(devices.data) ? devices.data : [];
  const ipRows = Array.isArray(ips.data) ? ips.data : [];
  const permissionRows = Array.isArray(perms.data) ? perms.data : [];
  const retentionRows = Array.isArray(retention.data) ? retention.data : [];

  const criticalCount = suspiciousRows.filter((x) => x.severity === "critical").length;
  const errorCount = suspiciousRows.filter((x) => x.severity === "error").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={ShieldAlert}
          label="Critical (24h)"
          value={criticalCount}
          tone={criticalCount > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Errors (24h)"
          value={errorCount}
          tone={errorCount > 0 ? "warn" : "default"}
        />
        <StatCard icon={MonitorSmartphone} label="Active sessions" value={deviceRows.length} />
        <StatCard icon={Globe2} label="Unique IPs (24h)" value={ipRows.length} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            Suspicious activity
          </TabsTrigger>
          <TabsTrigger value="ips">
            <Globe2 className="w-3.5 h-3.5 mr-1.5" />
            IP tracking
          </TabsTrigger>
          <TabsTrigger value="devices">
            <Fingerprint className="w-3.5 h-3.5 mr-1.5" />
            Device tracking
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <UserCog className="w-3.5 h-3.5 mr-1.5" />
            Permission changes
          </TabsTrigger>
          <TabsTrigger value="retention">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Retention policies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="overflow-hidden">
            <div className="p-3 flex items-center justify-between border-b border-border">
              <div className="text-sm font-medium">Suspicious activity · last 24h</div>
              <Button variant="ghost" size="sm" onClick={() => suspicious.refetch()}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Severity</th>
                    <th className="p-2 text-left">Kind</th>
                    <th className="p-2 text-left">Actor</th>
                    <th className="p-2 text-left">IP</th>
                    <th className="p-2 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {suspiciousRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No suspicious activity detected in the last 24h.
                      </td>
                    </tr>
                  )}
                  {suspiciousRows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs whitespace-nowrap">
                        {formatZoned(new Date(r.timestamp), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            r.severity === "critical"
                              ? "bg-red-600/20 text-red-700 border-red-600/40"
                              : r.severity === "error"
                                ? "bg-red-500/10 text-red-600 border-red-500/20"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                          )}
                        >
                          {r.severity}
                        </Badge>
                      </td>
                      <td className="p-2 font-medium">{r.kind}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[160px]">
                        {r.actor ?? "—"}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[320px]">
                        {r.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ips" className="mt-4">
          <Card className="overflow-hidden">
            <div className="p-3 border-b border-border text-sm font-medium">
              Top IPs by auth activity · last 24h
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">IP address</th>
                    <th className="p-2 text-left">Events</th>
                    <th className="p-2 text-left">Distinct users</th>
                    <th className="p-2 text-left">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {ipRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        No IP activity recorded.
                      </td>
                    </tr>
                  )}
                  {ipRows.map((r) => (
                    <tr key={r.ip} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{r.ip}</td>
                      <td className="p-2">{r.count}</td>
                      <td className="p-2">
                        {r.distinct_users}{" "}
                        {r.distinct_users >= 5 && (
                          <Badge
                            variant="outline"
                            className="ml-1 bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs"
                          >
                            shared
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">
                        {formatZoned(new Date(r.last_seen), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="mt-4">
          <Card className="overflow-hidden">
            <div className="p-3 border-b border-border text-sm font-medium">
              Active sessions & devices
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">User</th>
                    <th className="p-2 text-left">Device</th>
                    <th className="p-2 text-left">IP</th>
                    <th className="p-2 text-left">Location</th>
                    <th className="p-2 text-left">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No active sessions.
                      </td>
                    </tr>
                  )}
                  {deviceRows.map((r) => (
                    <tr key={r.session_id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs truncate max-w-[160px]">{r.user_id}</td>
                      <td className="p-2 text-xs">
                        <div className="font-medium">{r.device ?? "Unknown"}</div>
                        <div className="text-muted-foreground truncate max-w-[260px]">
                          {r.user_agent ?? ""}
                        </div>
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{r.location ?? "—"}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">
                        {r.last_seen_at
                          ? formatZoned(new Date(r.last_seen_at), {
                              dateStyle: "short",
                              timeStyle: "medium",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <Card className="overflow-hidden">
            <div className="p-3 border-b border-border text-sm font-medium">
              Role & permission changes
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Action</th>
                    <th className="p-2 text-left">Resource</th>
                    <th className="p-2 text-left">Target</th>
                    <th className="p-2 text-left">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No permission changes recorded.
                      </td>
                    </tr>
                  )}
                  {permissionRows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs whitespace-nowrap">
                        {formatZoned(new Date(r.timestamp), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                      <td className="p-2 font-medium">{r.action}</td>
                      <td className="p-2">{r.resource}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                        {r.target ?? "—"}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[160px]">
                        {r.actor ?? "system"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="mt-4">
          <RetentionPoliciesPanel
            onChanged={() => retention.refetch()}
            rows={retentionRows}
            loading={retention.isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RetentionPoliciesPanel({
  rows,
  loading,
  onChanged,
}: {
  rows: Awaited<ReturnType<typeof listRetentionPolicies>>;
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [resource, setResource] = useState("audit_logs");
  const [days, setDays] = useState(90);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const upsert = useServerFn(upsertRetentionPolicy);
  const remove = useServerFn(deleteRetentionPolicy);
  const formatZoned = useZonedDateFormatter();

  function openCreate() {
    setEditingId(null);
    setWorkspaceId("");
    setResource("audit_logs");
    setDays(90);
    setActive(true);
    setOpen(true);
  }

  function openEdit(row: (typeof rows)[number]) {
    setEditingId(row.id);
    setWorkspaceId(row.workspace_id);
    setResource(row.resource);
    setDays(row.retention_days);
    setActive(row.is_active);
    setOpen(true);
  }

  async function save() {
    if (!workspaceId) {
      toast.error("workspace_id required");
      return;
    }
    if (days < 1) {
      toast.error("Retention must be at least 1 day");
      return;
    }
    setSaving(true);
    try {
      await upsert({
        data: {
          id: editingId ?? undefined,
          workspace_id: workspaceId,
          resource,
          retention_days: days,
          is_active: active,
        },
      });
      toast.success(editingId ? "Retention policy updated" : "Retention policy saved");
      onChanged();
      setOpen(false);
      setEditingId(null);
      setWorkspaceId("");
      setDays(90);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove_(id: string) {
    if (!window.confirm("Delete this retention policy? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await remove({ data: { id } });
      toast.success("Retention policy deleted");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-3 flex items-center justify-between border-b border-border">
        <div className="text-sm font-medium">Data retention policies</div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditingId(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New policy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit retention policy" : "New retention policy"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Workspace ID</Label>
                <Input
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  placeholder="uuid"
                  disabled={!!editingId}
                />
              </div>
              <div>
                <Label>Resource</Label>
                <Input
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  placeholder="audit_logs, messages, webhook_events"
                />
              </div>
              <div>
                <Label>Retention (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Save policy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="max-h-[55vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Resource</th>
              <th className="p-2 text-left">Workspace</th>
              <th className="p-2 text-left">Retention</th>
              <th className="p-2 text-left">Active</th>
              <th className="p-2 text-left">Last run</th>
              <th className="p-2 text-left">Last deleted</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No retention policies configured.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-2 font-medium">{r.resource}</td>
                <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[220px]">
                  {r.workspace_id}
                </td>
                <td className="p-2">{r.retention_days} days</td>
                <td className="p-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      r.is_active
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-muted",
                    )}
                  >
                    {r.is_active ? "Active" : "Paused"}
                  </Badge>
                </td>
                <td className="p-2 font-mono text-xs text-muted-foreground">
                  {r.last_run_at
                    ? formatZoned(new Date(r.last_run_at), {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })
                    : "—"}
                </td>
                <td className="p-2 text-muted-foreground">{r.last_deleted_count ?? 0}</td>
                <td className="p-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={deletingId === r.id}
                      onClick={() => remove_(r.id)}
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
