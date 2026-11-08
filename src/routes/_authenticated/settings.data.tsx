import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/app/app-topbar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace, useDeleteWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { sbAny } from "@/lib/supabase/untyped";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/settings/data")({
  component: DataSettings,
  head: () => ({
    meta: [
      { title: "Data & Privacy — Workspace Settings" },
      {
        name: "description",
        content:
          "Export workspace data, manage retention, submit GDPR requests, and delete the workspace.",
      },
    ],
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

const DATASETS = [
  "contacts",
  "conversations",
  "messages",
  "deals",
  "activities",
  "audit_logs",
] as const;
const RETENTION_RESOURCES = [
  "messages",
  "conversations",
  "media",
  "audit_logs",
  "webhook_events",
  "login_history",
  "activities",
  "notifications",
] as const;
const GDPR_TYPES = ["export", "erasure", "rectification", "portability", "restriction"] as const;

function DataSettings() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const formatZoned = useZonedDateFormatter();
  const { data: ws } = useCurrentWorkspace();
  const { data: role } = useWorkspaceRole(ws?.id);
  const canManage = role === "owner" || role === "admin";
  const isOwner = role === "owner";
  const del = useDeleteWorkspace(ws?.id);

  // Exports
  const [exportDataset, setExportDataset] = useState<string>("contacts");
  const [exportFormat, setExportFormat] = useState<string>("csv");
  const exports = useQuery({
    queryKey: ["export_jobs", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data } = await anyFrom("export_jobs")
        .select("id, name, dataset, format, status, row_count, created_at, file_path")
        .eq("workspace_id", ws!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{
        id: string;
        name: string;
        dataset: string;
        format: string;
        status: string;
        row_count: number | null;
        created_at: string;
        file_path: string | null;
      }>;
    },
  });

  async function createExport() {
    const { data: u } = await supabase.auth.getUser();
    if (!ws || !u.user) return;
    try {
      const { error } = await anyFrom("export_jobs").insert({
        workspace_id: ws.id,
        created_by: u.user.id,
        name: `${exportDataset} export`,
        dataset: exportDataset,
        format: exportFormat,
      });
      if (error) throw error;
      toast.success("Export queued");
      qc.invalidateQueries({ queryKey: ["export_jobs", ws.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  // Retention
  const retention = useQuery({
    queryKey: ["retention", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data } = await anyFrom("data_retention_policies")
        .select("id, resource, retention_days, is_active, last_run_at")
        .eq("workspace_id", ws!.id);
      return (data ?? []) as Array<{
        id: string;
        resource: string;
        retention_days: number;
        is_active: boolean;
        last_run_at: string | null;
      }>;
    },
  });

  async function upsertRetention(resource: string, retention_days: number, is_active: boolean) {
    if (!ws) return;
    try {
      const { error } = await anyFrom("data_retention_policies").upsert(
        {
          workspace_id: ws.id,
          resource,
          retention_days,
          is_active,
        },
        { onConflict: "workspace_id,resource" },
      );
      if (error) throw error;
      toast.success(`Retention updated for ${resource}`);
      qc.invalidateQueries({ queryKey: ["retention", ws.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  // GDPR requests
  const [gdprType, setGdprType] = useState<string>("export");
  const [gdprSubjectId, setGdprSubjectId] = useState("");
  const [gdprSubjectIdentifier, setGdprSubjectIdentifier] = useState("");
  const [gdprReason, setGdprReason] = useState("");
  const gdpr = useQuery({
    queryKey: ["gdpr_requests", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data } = await anyFrom("gdpr_requests")
        .select(
          "id, request_type, status, subject_type, subject_identifier, requested_at, due_at, completed_at",
        )
        .eq("workspace_id", ws!.id)
        .order("requested_at", { ascending: false })
        .limit(30);
      return (data ?? []) as Array<{
        id: string;
        request_type: string;
        status: string;
        subject_type: string;
        subject_identifier: string | null;
        requested_at: string;
        due_at: string;
        completed_at: string | null;
      }>;
    },
  });

  async function submitGdpr() {
    if (!ws) return;
    if (!gdprSubjectId.trim()) {
      toast.error("Subject ID (UUID) is required");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    try {
      const { error } = await anyFrom("gdpr_requests").insert({
        workspace_id: ws.id,
        subject_type: "contact",
        subject_id: gdprSubjectId.trim(),
        subject_identifier: gdprSubjectIdentifier.trim() || null,
        request_type: gdprType,
        reason: gdprReason.trim() || null,
        requested_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("GDPR request submitted");
      setGdprSubjectId("");
      setGdprSubjectIdentifier("");
      setGdprReason("");
      qc.invalidateQueries({ queryKey: ["gdpr_requests", ws.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    }
  }

  // Delete workspace
  const [confirmName, setConfirmName] = useState("");

  return (
    <>
      <AppTopbar
        title="Data & Privacy"
        subtitle="Exports, retention, GDPR, and workspace deletion"
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Export workspace data</CardTitle>
            <CardDescription>
              Queue a dataset export. You'll be notified when it's ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={exportDataset} onValueChange={setExportDataset}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATASETS.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={createExport} disabled={!canManage}>
                Queue export
              </Button>
            </div>
            {exports.data && exports.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.data.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="text-sm">{j.name}</TableCell>
                      <TableCell className="uppercase text-xs">{j.format}</TableCell>
                      <TableCell>
                        <Badge
                          variant={j.status === "completed" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {j.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{j.row_count ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {formatZoned(new Date(j.created_at), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retention policies</CardTitle>
            <CardDescription>Automatically purge older data by resource.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Retention (days)</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Last run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RETENTION_RESOURCES.map((res) => {
                  const p = retention.data?.find((r) => r.resource === res);
                  return (
                    <RetentionRow
                      key={res}
                      resource={res}
                      current={p}
                      disabled={!canManage}
                      onSave={upsertRetention}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>GDPR requests</CardTitle>
            <CardDescription>Submit and track data subject requests.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Request type</Label>
                  <Select value={gdprType} onValueChange={setGdprType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GDPR_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sid">Subject (contact) UUID</Label>
                  <Input
                    id="sid"
                    value={gdprSubjectId}
                    onChange={(e) => setGdprSubjectId(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sident">Subject identifier (email or phone)</Label>
                  <Input
                    id="sident"
                    value={gdprSubjectIdentifier}
                    onChange={(e) => setGdprSubjectIdentifier(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="reason">Reason / notes</Label>
                  <Input
                    id="reason"
                    value={gdprReason}
                    onChange={(e) => setGdprReason(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button onClick={submitGdpr}>Submit request</Button>
                </div>
              </div>
            )}
            {(gdpr.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gdpr.data!.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize">{r.request_type}</TableCell>
                      <TableCell className="text-xs">
                        {r.subject_identifier ?? r.subject_type}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "completed" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatZoned(new Date(r.requested_at), { dateStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatZoned(new Date(r.due_at), { dateStyle: "short" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete this workspace and all associated data. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!isOwner}>
                  Delete workspace
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Type <span className="font-mono font-semibold">{ws?.name}</span> to confirm. All
                    members, conversations, and data will be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={ws?.name ?? ""}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={confirmName !== (ws?.name ?? "")}
                    onClick={async () => {
                      try {
                        await del.mutateAsync();
                        toast.success("Workspace deleted");
                        nav({ to: "/" });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Delete failed");
                      }
                    }}
                  >
                    Delete forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!isOwner && (
              <p className="text-xs text-muted-foreground mt-2">
                Only the workspace owner can delete it.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function RetentionRow({
  resource,
  current,
  disabled,
  onSave,
}: {
  resource: string;
  current: { retention_days: number; is_active: boolean; last_run_at: string | null } | undefined;
  disabled: boolean;
  onSave: (r: string, days: number, active: boolean) => void;
}) {
  const formatZoned = useZonedDateFormatter();
  const [days, setDays] = useState<number>(current?.retention_days ?? 365);
  const [active, setActive] = useState<boolean>(current?.is_active ?? false);
  return (
    <TableRow>
      <TableCell className="capitalize text-sm">{resource.replace("_", " ")}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          max={3650}
          value={days}
          disabled={disabled}
          onChange={(e) => setDays(Number(e.target.value) || 1)}
          onBlur={() => onSave(resource, days, active)}
          className="w-24 h-8"
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={active}
          disabled={disabled}
          onCheckedChange={(v) => {
            setActive(v);
            onSave(resource, days, v);
          }}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {current?.last_run_at
          ? formatZoned(new Date(current.last_run_at), { dateStyle: "short", timeStyle: "medium" })
          : "—"}
      </TableCell>
    </TableRow>
  );
}
