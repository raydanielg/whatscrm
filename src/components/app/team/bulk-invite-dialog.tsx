import { useMemo, useRef, useState } from "react";
import { Upload, FileDown, Loader2, CheckCircle2, XCircle, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCreateInvitation, type WorkspaceRole } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { sbAny } from "@/lib/supabase/untyped";
import { useCanAct } from "@/hooks/use-permissions";
import {
  PermissionRoleSelect,
  defaultAssignableRole,
  useAssignableRoles,
  type AssignableRole,
} from "./permission-role-select";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RowStatus = "pending" | "sending" | "success" | "error" | "invalid" | "skipped";
type Row = {
  id: number;
  email: string;
  role: WorkspaceRole;
  permissionRoleId: string;
  status: RowStatus;
  message?: string;
};

function parseCsv(text: string, roles: AssignableRole[], fallback: AssignableRole): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  // Detect header
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("email");
  const data = hasHeader ? lines.slice(1) : lines;
  return data.map((line, idx) => {
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ""));
    const email = (parts[0] || "").toLowerCase();
    const roleRaw = (parts[1] || "").toLowerCase();
    const selected =
      roles.find(
        (role) => role.key.toLowerCase() === roleRaw || role.name.toLowerCase() === roleRaw,
      ) ?? fallback;
    const valid = EMAIL_RE.test(email);
    return {
      id: idx,
      email,
      role: selected.workspaceRole,
      permissionRoleId: selected.id,
      status: valid ? "pending" : "invalid",
      message: valid ? undefined : "Invalid email",
    };
  });
}

export function BulkInviteDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
}) {
  const { roles } = useAssignableRoles();
  const [defaultRoleId, setDefaultRoleId] = useState<string>();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateInvitation(workspaceId);
  const canInvite = useCanAct("members.invite");

  const stats = useMemo(() => {
    const s = { total: rows.length, pending: 0, success: 0, error: 0, invalid: 0, skipped: 0 };
    for (const r of rows) {
      if (r.status === "pending" || r.status === "sending") s.pending++;
      else if (r.status === "success") s.success++;
      else if (r.status === "error") s.error++;
      else if (r.status === "invalid") s.invalid++;
      else if (r.status === "skipped") s.skipped++;
    }
    return s;
  }, [rows]);

  async function handleFile(file: File) {
    if (file.size > 1024 * 1024) {
      toast.error("File too large — 1MB maximum");
      return;
    }
    const text = await file.text();
    const fallback =
      roles.find((role) => role.id === defaultRoleId) ?? defaultAssignableRole(roles);
    if (!fallback) {
      toast.error("No assignable role is available");
      return;
    }
    const parsed = parseCsv(text, roles, fallback);
    if (!parsed.length) {
      toast.error("No rows found in CSV");
      return;
    }
    // Dedupe by email, keep first occurrence
    const seen = new Set<string>();
    const deduped: Row[] = [];
    for (const r of parsed) {
      if (!r.email || seen.has(r.email)) {
        if (seen.has(r.email))
          deduped.push({ ...r, status: "skipped", message: "Duplicate in file" });
        continue;
      }
      seen.add(r.email);
      deduped.push(r);
    }
    setRows(deduped);
  }

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function run() {
    if (!rows.length || running) return;
    if (!canInvite) {
      toast.error("You don't have permission to invite members");
      return;
    }
    setRunning(true);

    // Preload existing invitations + members to skip duplicates
    const existingEmails = new Set<string>();
    try {
      const [inv, mem] = await Promise.all([
        sbAny(supabase)
          .from("workspace_invitations")
          .select("email,status")
          .eq("workspace_id", workspaceId)
          .eq("status", "pending"),
        sbAny(supabase)
          .from("workspace_members")
          .select("profiles:profiles(email)")
          .eq("workspace_id", workspaceId),
      ]);
      for (const r of inv?.data ?? [])
        if (r?.email) existingEmails.add(String(r.email).toLowerCase());
      for (const r of mem?.data ?? []) {
        const em = r?.profiles?.email;
        if (em) existingEmails.add(String(em).toLowerCase());
      }
    } catch {
      // non-fatal
    }

    for (const row of rows) {
      if (row.status !== "pending") continue;
      if (existingEmails.has(row.email)) {
        updateRow(row.id, { status: "skipped", message: "Already invited or a member" });
        continue;
      }
      updateRow(row.id, { status: "sending" });
      try {
        await create.mutateAsync({
          email: row.email,
          role: row.role,
          permissionRoleId: row.permissionRoleId,
        });
        updateRow(row.id, { status: "success", message: "Invitation sent" });
      } catch (err) {
        updateRow(row.id, {
          status: "error",
          message: err instanceof Error ? err.message : "Failed to send",
        });
      }
    }

    setRunning(false);
    toast.success("Bulk invite finished");
  }

  function reset() {
    setRows([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    const csv =
      "email,role\njane@example.com,agent\njohn@example.com,viewer\nadmin@example.com,admin\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invite-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function retryFailed() {
    setRows((prev) =>
      prev.map((r) => (r.status === "error" ? { ...r, status: "pending", message: undefined } : r)),
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!running) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk invite from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-control border border-border p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">CSV file</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={running}
                    className="gap-1.5"
                  >
                    <Upload className="h-4 w-4" /> Choose CSV
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={downloadTemplate}
                    className="gap-1.5"
                  >
                    <FileDown className="h-4 w-4" /> Download template
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 sm:w-48">
                <label className="text-xs font-medium text-muted-foreground">Default role</label>
                <PermissionRoleSelect
                  value={defaultRoleId ?? defaultAssignableRole(roles)?.id}
                  onChange={(role) => setDefaultRoleId(role.id)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Format: <code className="text-foreground">email,role</code> — one per line. Role is
              optional; falls back to the default. Role may be any available system or custom role
              key/name.
            </p>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{stats.total} total</Badge>
                {stats.pending > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {stats.pending} pending
                  </Badge>
                )}
                {stats.success > 0 && (
                  <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600/30">
                    <CheckCircle2 className="h-3 w-3" />
                    {stats.success} sent
                  </Badge>
                )}
                {stats.error > 0 && (
                  <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                    <XCircle className="h-3 w-3" />
                    {stats.error} failed
                  </Badge>
                )}
                {stats.invalid > 0 && (
                  <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                    {stats.invalid} invalid
                  </Badge>
                )}
                {stats.skipped > 0 && <Badge variant="outline">{stats.skipped} skipped</Badge>}
              </div>

              <div className="max-h-80 overflow-auto rounded-control border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium w-32">Role</th>
                      <th className="px-3 py-2 font-medium w-40">Status</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-[220px]">
                          {r.email || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <PermissionRoleSelect
                            value={r.permissionRoleId}
                            onChange={(role) =>
                              updateRow(r.id, {
                                role: role.workspaceRole,
                                permissionRoleId: role.id,
                              })
                            }
                            disabled={running || r.status === "success" || r.status === "sending"}
                            className="h-9"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={r.status} />
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-xs truncate max-w-[240px]",
                            r.status === "error" || r.status === "invalid"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {r.message ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {!running && r.status !== "success" && (
                            <button
                              type="button"
                              onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Remove row"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <div className="mr-auto flex gap-2">
            {rows.length > 0 && !running && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Clear
              </Button>
            )}
            {stats.error > 0 && !running && (
              <Button type="button" variant="outline" size="sm" onClick={retryFailed}>
                Retry failed
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            {stats.success > 0 ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={!canInvite || running || stats.pending === 0}
          >
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            Send {stats.pending > 0 ? `${stats.pending} ` : ""}invitation
            {stats.pending === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: "Pending",
      className: "text-muted-foreground border-border",
      icon: <Clock className="h-3 w-3" />,
    },
    sending: {
      label: "Sending",
      className: "text-foreground border-border",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    success: {
      label: "Sent",
      className: "text-emerald-600 border-emerald-600/30",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    error: {
      label: "Failed",
      className: "text-destructive border-destructive/30",
      icon: <XCircle className="h-3 w-3" />,
    },
    invalid: {
      label: "Invalid",
      className: "text-destructive border-destructive/30",
      icon: <XCircle className="h-3 w-3" />,
    },
    skipped: {
      label: "Skipped",
      className: "text-muted-foreground border-border",
      icon: <X className="h-3 w-3" />,
    },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-xs",
        s.className,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}
