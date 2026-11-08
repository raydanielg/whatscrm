import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  Archive,
  ShieldCheck,
  ShieldAlert,
  Database,
  HardDrive,
  Image as ImageIcon,
  Settings2,
  Layers,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCcw,
  Cloud,
  Lock,
  Bell,
  XCircle,
  History,
  Calendar,
  Server,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  getBackupOverview,
  createBackup,
  cancelBackup,
  deleteBackup,
  verifyBackup,
  listBackupSchedules,
  upsertBackupSchedule,
  deleteBackupSchedule,
  toggleBackupSchedule,
  listRestoreOperations,
  previewRestore,
  executeRestore,
  listBackupNotifications,
  markNotificationRead,
  type BackupScope,
  type BackupType,
  type BackupDestination,
  type BackupJob,
  type BackupSchedule,
  type RestoreOperation,
} from "@/lib/backup/backup-manager.functions";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/backup-management")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  head: () => ({
    meta: [
      { title: "Backup Management" },
      {
        name: "description",
        content:
          "Automated backups, verification, point-in-time recovery, and multi-cloud destinations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackupManagementPage,
});

const SCOPES: { v: BackupScope; l: string; icon: React.ElementType }[] = [
  { v: "full", l: "Full workspace", icon: Layers },
  { v: "database", l: "Database", icon: Database },
  { v: "storage", l: "Storage", icon: HardDrive },
  { v: "media", l: "Media", icon: ImageIcon },
  { v: "config", l: "Configuration", icon: Settings2 },
];

const DESTINATIONS: { v: BackupDestination; l: string }[] = [
  { v: "s3", l: "Amazon S3" },
  { v: "r2", l: "Cloudflare R2" },
  { v: "gcs", l: "Google Cloud Storage" },
  { v: "azure_blob", l: "Azure Blob Storage" },
  { v: "wasabi", l: "Wasabi" },
  { v: "backblaze", l: "Backblaze B2" },
  { v: "local", l: "Local / on-prem" },
];

function formatBytes(n: number) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function statusBadge(status: string) {
  const map: Record<
    string,
    { v: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
  > = {
    completed: { v: "default", icon: CheckCircle2 },
    verified: { v: "default", icon: ShieldCheck },
    running: { v: "secondary", icon: Clock },
    queued: { v: "secondary", icon: Clock },
    failed: { v: "destructive", icon: XCircle },
    cancelled: { v: "outline", icon: XCircle },
    restoring: { v: "secondary", icon: RotateCcw },
    restored: { v: "default", icon: CheckCircle2 },
    verifying: { v: "secondary", icon: ShieldCheck },
  };
  const m = map[status] ?? { v: "outline" as const, icon: Clock };
  const Icon = m.icon;
  return (
    <Badge variant={m.v} className="capitalize gap-1">
      <Icon className="h-3 w-3" /> {status}
    </Badge>
  );
}

function BackupManagementPage() {
  const fetchOverview = useServerFn(getBackupOverview);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["backup-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
  });

  const score = data?.health_score ?? 0;
  const posture = data?.posture ?? "critical";
  const gradient = useMemo(() => {
    if (posture === "healthy") return "from-emerald-500/20 via-emerald-500/5 to-transparent";
    if (posture === "at-risk") return "from-amber-500/20 via-amber-500/5 to-transparent";
    return "from-destructive/25 via-destructive/5 to-transparent";
  }, [posture]);

  return (
    <>
      <AppTopbar
        title="Backup Management"
        subtitle="Backup jobs, schedules and restore operations for this workspace"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <NewBackupDialog />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {data && !data.engine.available && (
          <div
            role="alert"
            className="rounded-control border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
          >
            <div className="font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
              No backup engine is connected on this deployment
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Creating backups, saving schedules, verifying and restoring are turned off so this
              page never reports a backup that does not exist. Reason: {data.engine.reason}
            </p>
          </div>
        )}

        {/* Health hero */}
        <Card className="relative overflow-hidden border-border/60">
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
          <CardContent className="relative p-6 md:p-8 grid md:grid-cols-3 gap-6 items-center">
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    className="stroke-muted/40"
                    fill="none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(score / 100) * 264} 264`}
                    className={
                      posture === "healthy"
                        ? "stroke-emerald-500"
                        : posture === "at-risk"
                          ? "stroke-amber-500"
                          : "stroke-destructive"
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold ">{isLoading ? "--" : score}</div>
                  <div className="text-xs text-muted-foreground ">Health</div>
                </div>
              </div>
              <Badge
                className="mt-3"
                variant={
                  posture === "healthy"
                    ? "default"
                    : posture === "at-risk"
                      ? "secondary"
                      : "destructive"
                }
              >
                {posture === "healthy" ? (
                  <ShieldCheck className="h-3 w-3 " />
                ) : (
                  <ShieldAlert className="h-3 w-3 " />
                )}
                {posture.replace("-", " ").toUpperCase()}
              </Badge>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Archive} label="Total backups" value={data?.metrics.total_backups} />
              <Stat
                icon={CheckCircle2}
                label="Success 30d"
                value={data?.metrics.successful_last_30d}
              />
              <Stat
                icon={XCircle}
                label="Failed 30d"
                value={data?.metrics.failed_last_30d}
                tone={(data?.metrics.failed_last_30d ?? 0) > 0 ? "danger" : undefined}
              />
              <Stat icon={ShieldCheck} label="Verified" value={data?.metrics.verified_backups} />
              <Stat icon={Lock} label="Encrypted" value={data?.metrics.encrypted_backups} />
              <Stat
                icon={Calendar}
                label="Active schedules"
                value={data?.metrics.active_schedules}
              />
              <Stat
                icon={RotateCcw}
                label="Restores 30d"
                value={data?.metrics.restore_operations_30d}
              />
              <div className="p-3 rounded-control border bg-card/70">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Server className="h-3.5 w-3.5" /> Total size
                </div>
                <div className="text-2xl font-semibold  mt-1">
                  {formatBytes(data?.metrics.total_size_bytes ?? 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="history" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-5  ">
            <TabsTrigger value="history">
              <History className="h-4 w-4 " /> History
            </TabsTrigger>
            <TabsTrigger value="schedules">
              <Calendar className="h-4 w-4 " /> Scheduler
            </TabsTrigger>
            <TabsTrigger value="restore">
              <RotateCcw className="h-4 w-4 " /> Restore
            </TabsTrigger>
            <TabsTrigger value="destinations">
              <Cloud className="h-4 w-4 " /> Destinations
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 " /> Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <HistoryPanel jobs={data?.recent_jobs ?? []} />
          </TabsContent>
          <TabsContent value="schedules">
            <SchedulesPanel />
          </TabsContent>
          <TabsContent value="restore">
            <RestorePanel jobs={data?.recent_jobs ?? []} />
          </TabsContent>
          <TabsContent value="destinations">
            <DestinationsPanel data={data} />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

/* -------- Stats -------- */

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  tone?: "danger";
}) {
  const color = tone === "danger" && (value ?? 0) > 0 ? "text-destructive" : "";
  return (
    <div className="p-3 rounded-control border bg-card/70 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold  mt-1 ${color}`}>{value ?? "--"}</div>
    </div>
  );
}

/* -------- New backup dialog -------- */

function NewBackupDialog() {
  const createFn = useServerFn(createBackup);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    scope: "full" as BackupScope,
    backup_type: "full" as BackupType,
    destination: "local" as BackupDestination,
    is_encrypted: true,
  });
  const mut = useMutation({
    mutationFn: (payload: typeof form) => createFn({ data: payload }),
    onSuccess: () => {
      toast.success("Backup queued");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["backup-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Play className="h-4 w-4 " /> Run backup
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New backup</DialogTitle>
          <DialogDescription>Trigger a manual backup with encryption at rest.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Scope</Label>
            <Select
              value={form.scope}
              onValueChange={(v) => setForm({ ...form, scope: v as BackupScope })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.v} value={s.v}>
                    {s.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select
              value={form.backup_type}
              onValueChange={(v) => setForm({ ...form, backup_type: v as BackupType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full backup</SelectItem>
                <SelectItem value="incremental">Incremental</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Destination</Label>
            <Select
              value={form.destination}
              onValueChange={(v) => setForm({ ...form, destination: v as BackupDestination })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESTINATIONS.map((d) => (
                  <SelectItem key={d.v} value={d.v}>
                    {d.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Encrypt at rest (AES-256-GCM)
            </Label>
            <Switch
              checked={form.is_encrypted}
              onCheckedChange={(v) => setForm({ ...form, is_encrypted: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
            <Play className="h-4 w-4 " /> Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- History -------- */

function HistoryPanel({ jobs }: { jobs: BackupJob[] }) {
  const cancelFn = useServerFn(cancelBackup);
  const deleteFn = useServerFn(deleteBackup);
  const verifyFn = useServerFn(verifyBackup);
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["backup-overview"] });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Backup cancelled");
      invalidate();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Backup deleted");
      invalidate();
    },
  });
  const verifyMut = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Backup verified");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backup history</CardTitle>
        <CardDescription>
          Recent backup runs with verification and encryption status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No backups yet — run your first backup.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Encrypted</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="capitalize">{j.scope}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {j.backup_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.destination}</TableCell>
                  <TableCell>{statusBadge(j.status)}</TableCell>
                  <TableCell className=" text-sm">{formatBytes(j.size_bytes)}</TableCell>
                  <TableCell>
                    {j.is_encrypted ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" /> {j.encryption_algorithm}
                      </Badge>
                    ) : (
                      <span className="text-xs text-destructive">Off</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {["queued", "running"].includes(j.status) && (
                      <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(j.id)}>
                        Cancel
                      </Button>
                    )}
                    {["completed", "verified"].includes(j.status) && !j.verified && (
                      <Button size="sm" variant="outline" onClick={() => verifyMut.mutate(j.id)}>
                        <ShieldCheck className="h-3.5 w-3.5 " /> Verify
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMut.mutate(j.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* -------- Schedules -------- */

const emptySchedule = {
  name: "",
  description: "",
  scope: "full" as BackupScope,
  backup_type: "full" as BackupType,
  cron_expression: "0 3 * * *",
  timezone: "UTC",
  retention_days: 30,
  keep_last_n: 30,
  destination: "local" as BackupDestination,
  is_encrypted: true,
  notify_on_success: false,
  notify_on_failure: true,
  notify_emails: "",
  is_active: true,
};

function SchedulesPanel() {
  const listFn = useServerFn(listBackupSchedules);
  const upsertFn = useServerFn(upsertBackupSchedule);
  const deleteFn = useServerFn(deleteBackupSchedule);
  const toggleFn = useServerFn(toggleBackupSchedule);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["backup-schedules"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptySchedule);
  const [editingId, setEditingId] = useState<string | null>(null);

  const upsertMut = useMutation({
    mutationFn: (payload: typeof form & { id?: string }) => {
      const { notify_emails, id, ...rest } = payload;
      return upsertFn({
        data: {
          ...(id ? { id } : {}),
          ...rest,
          notify_emails: notify_emails
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
    },
    onSuccess: () => {
      toast.success("Schedule saved");
      qc.invalidateQueries({ queryKey: ["backup-schedules"] });
      qc.invalidateQueries({ queryKey: ["backup-overview"] });
      setOpen(false);
      setForm(emptySchedule);
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-schedules"] }),
  });
  const toggleMut = useMutation({
    mutationFn: (p: { id: string; is_active: boolean }) => toggleFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-schedules"] }),
  });

  const openEdit = (s: BackupSchedule) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      description: s.description ?? "",
      scope: s.scope,
      backup_type: s.backup_type,
      cron_expression: s.cron_expression,
      timezone: s.timezone,
      retention_days: s.retention_days,
      keep_last_n: s.keep_last_n,
      destination: s.destination,
      is_encrypted: s.is_encrypted,
      notify_on_success: s.notify_on_success,
      notify_on_failure: s.notify_on_failure,
      notify_emails: (s.notify_emails ?? []).join(", "),
      is_active: s.is_active,
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Backup scheduler</CardTitle>
          <CardDescription>Automated backups with retention and notifications.</CardDescription>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditingId(null);
              setForm(emptySchedule);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 " /> New schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit schedule" : "New backup schedule"}</DialogTitle>
              <DialogDescription>Cron-based automated backups.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nightly full backup"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <RichTextarea
                    rows={2}
                    value={form.description}
                    onChange={(v) => setForm({ ...form, description: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Scope</Label>
                    <Select
                      value={form.scope}
                      onValueChange={(v) => setForm({ ...form, scope: v as BackupScope })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCOPES.map((s) => (
                          <SelectItem key={s.v} value={s.v}>
                            {s.l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={form.backup_type}
                      onValueChange={(v) => setForm({ ...form, backup_type: v as BackupType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full</SelectItem>
                        <SelectItem value="incremental">Incremental</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cron expression</Label>
                    <Input
                      value={form.cron_expression}
                      onChange={(e) => setForm({ ...form, cron_expression: e.target.value })}
                      placeholder="0 3 * * *"
                    />
                  </div>
                  <div>
                    <Label>Timezone</Label>
                    <Input
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Retention (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={form.retention_days}
                      onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Keep last N</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={form.keep_last_n}
                      onChange={(e) => setForm({ ...form, keep_last_n: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Destination</Label>
                  <Select
                    value={form.destination}
                    onValueChange={(v) => setForm({ ...form, destination: v as BackupDestination })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DESTINATIONS.map((d) => (
                        <SelectItem key={d.v} value={d.v}>
                          {d.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notify emails (comma-separated)</Label>
                  <Input
                    value={form.notify_emails}
                    onChange={(e) => setForm({ ...form, notify_emails: e.target.value })}
                    placeholder="ops@example.com, cto@example.com"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Encrypt</Label>
                  <Switch
                    checked={form.is_encrypted}
                    onCheckedChange={(v) => setForm({ ...form, is_encrypted: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Notify on failure</Label>
                  <Switch
                    checked={form.notify_on_failure}
                    onCheckedChange={(v) => setForm({ ...form, notify_on_failure: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Notify on success</Label>
                  <Switch
                    checked={form.notify_on_success}
                    onCheckedChange={(v) => setForm({ ...form, notify_on_success: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => upsertMut.mutate(editingId ? { ...form, id: editingId } : form)}
                disabled={!form.name || upsertMut.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {(data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No schedules yet. Create one to automate backups.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((s: BackupSchedule) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="capitalize">{s.scope}</TableCell>
                  <TableCell className="font-mono text-xs">{s.cron_expression}</TableCell>
                  <TableCell className="text-xs">
                    {s.retention_days}d / N={s.keep_last_n}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.destination}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(v) => toggleMut.mutate({ id: s.id, is_active: v })}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.last_run_at
                      ? formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMut.mutate(s.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* -------- Restore -------- */

function RestorePanel({ jobs }: { jobs: BackupJob[] }) {
  const previewFn = useServerFn(previewRestore);
  const executeFn = useServerFn(executeRestore);
  const listFn = useServerFn(listRestoreOperations);
  const qc = useQueryClient();
  const { data: ops } = useQuery({ queryKey: ["restore-ops"], queryFn: () => listFn() });

  const [backupId, setBackupId] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "in_place" | "new_workspace" | "point_in_time">(
    "preview",
  );
  const [pit, setPit] = useState("");
  const [preview, setPreview] = useState<RestoreOperation | null>(null);

  const previewMut = useMutation({
    mutationFn: () =>
      previewFn({
        data: {
          backup_id: backupId,
          restore_mode: mode,
          point_in_time: mode === "point_in_time" && pit ? new Date(pit).toISOString() : null,
        },
      }),
    onSuccess: (op) => {
      setPreview(op);
      toast.success("Restore preview generated");
      qc.invalidateQueries({ queryKey: ["restore-ops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeMut = useMutation({
    mutationFn: (opId: string) => executeFn({ data: { operation_id: opId, confirm: true } }),
    onSuccess: () => {
      toast.success("Restore started");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["restore-ops"] });
      qc.invalidateQueries({ queryKey: ["backup-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restorable = jobs.filter((j) => ["completed", "verified"].includes(j.status));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restore a backup</CardTitle>
          <CardDescription>
            Preview, then confirm to execute — supports point-in-time recovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Restore mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preview">Dry-run preview</SelectItem>
                <SelectItem value="new_workspace">Restore to new workspace</SelectItem>
                <SelectItem value="in_place">In-place restore (destructive)</SelectItem>
                <SelectItem value="point_in_time">Point-in-time recovery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "point_in_time" ? (
            <div>
              <Label>Point in time (UTC)</Label>
              <DateTimePicker
                value={fromLocalDateTimeString(pit)}
                onChange={(d) => setPit(toLocalDateTimeString(d))}
              />
            </div>
          ) : (
            <div>
              <Label>Source backup</Label>
              <Select value={backupId ?? ""} onValueChange={(v) => setBackupId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a backup" />
                </SelectTrigger>
                <SelectContent>
                  {restorable.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.scope} · {j.backup_type} · {format(new Date(j.created_at), "PPp")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={() => previewMut.mutate()}
            disabled={previewMut.isPending || (mode !== "point_in_time" && !backupId)}
          >
            <RotateCcw className="h-4 w-4 " /> Generate preview
          </Button>

          {preview && (
            <Card className="mt-4 border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Restore preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="capitalize">{preview.restore_mode.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated size</span>
                  <span>
                    {formatBytes(
                      Number((preview.preview_summary as any)?.estimated_size_bytes) || 0,
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated duration</span>
                  <span>
                    {Number((preview.preview_summary as any)?.estimated_duration_minutes) || 0} min
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tables:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {preview.affected_tables.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                {(preview.preview_summary as any)?.warnings?.map((w: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /> {w}
                  </div>
                ))}
                <Button
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => executeMut.mutate(preview.id)}
                  disabled={executeMut.isPending}
                >
                  <Play className="h-3.5 w-3.5 " /> Confirm & execute restore
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent restore operations</CardTitle>
          <CardDescription>Audit trail of restore attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          {(ops?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No restore operations yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {(ops ?? []).map((o: RestoreOperation) => (
                <li key={o.id} className="p-3 rounded border bg-card/50 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusBadge(o.status)}
                      <span className="capitalize">{o.restore_mode.replace("_", " ")}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {o.error && <div className="text-xs text-destructive mt-1">{o.error}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------- Destinations -------- */

function DestinationsPanel({
  data,
}: {
  data: ReturnType<typeof getBackupOverview> extends Promise<infer T> ? T | undefined : never;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage destinations</CardTitle>
          <CardDescription>Distribution across configured backup targets.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {DESTINATIONS.map((d) => {
              const count =
                data?.destination_breakdown.find((b) => b.destination === d.v)?.count ?? 0;
              return (
                <li
                  key={d.v}
                  className="flex items-center justify-between text-sm py-1.5 border-b last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" /> {d.l}
                  </span>
                  <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            External cloud destinations (S3, R2, GCS, Azure, Wasabi, Backblaze) can be wired via
            connectors — the backup engine already supports pluggable destinations.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup scope distribution</CardTitle>
          <CardDescription>What data is being protected.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {SCOPES.map((s) => {
              const row = data?.scope_breakdown.find((b) => b.scope === s.v);
              const Icon = s.icon;
              return (
                <li
                  key={s.v}
                  className="flex items-center justify-between text-sm py-1.5 border-b last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" /> {s.l}
                  </span>
                  <span className="text-xs text-muted-foreground ">
                    {row?.count ?? 0} backups · {formatBytes(row?.total_size ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------- Notifications -------- */

function NotificationsPanel() {
  const listFn = useServerFn(listBackupNotifications);
  const readFn = useServerFn(markNotificationRead);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["backup-notifications"], queryFn: () => listFn() });
  const readMut = useMutation({
    mutationFn: (id: string) => readFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-notifications"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backup notifications</CardTitle>
        <CardDescription>
          Alerts about failed backups, verification issues, and restore events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No notifications.</p>
        ) : (
          <ul className="space-y-2">
            {(data ?? []).map((n: any) => (
              <li
                key={n.id}
                className={`p-3 rounded border flex items-start gap-3 ${n.is_read ? "bg-card/40" : "bg-card"}`}
              >
                <div
                  className={`mt-1 h-2 w-2 rounded-full ${
                    n.severity === "error"
                      ? "bg-destructive"
                      : n.severity === "warning"
                        ? "bg-amber-500"
                        : n.severity === "success"
                          ? "bg-emerald-500"
                          : "bg-primary"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">{n.title}</div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {n.body && <div className="text-sm text-muted-foreground mt-0.5">{n.body}</div>}
                </div>
                {!n.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => readMut.mutate(n.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
