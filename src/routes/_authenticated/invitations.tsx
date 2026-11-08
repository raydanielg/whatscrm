import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Copy,
  RefreshCw,
  Search,
  ShieldCheck,
  Loader2,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  UserPlus,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useWorkspaces,
  useMyWorkspaceRoles,
  useInvitationsForWorkspaces,
  useUpdateInvitationRole,
  useRevokeInvitationById,
  useDeleteInvitation,
  useCreateInvitationFor,
  useResendInvitation,
  verifyInvitationToken,
  type WorkspaceRole,
  type WorkspaceInvitation,
  type InvitationVerification,
} from "@/hooks/use-workspace";
import {
  PermissionRoleSelect,
  defaultAssignableRole,
  useAssignableRoles,
  type AssignableRole,
} from "@/components/app/team/permission-role-select";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/invitations")({
  component: InvitationsPage,
  head: () => ({
    meta: [
      { title: "Invitations" },
      {
        name: "description",
        content:
          "Generate, revoke and verify workspace invitations and edit the role each invite grants.",
      },
      { property: "og:title", content: "Invitation management" },
      {
        property: "og:description",
        content:
          "Manage pending workspace invitations and invited roles across all your workspaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const MANAGER_ROLES: WorkspaceRole[] = ["owner", "admin"];

function inviteLink(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

async function copyText(text: string, label = "Invite link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

function statusTone(status: WorkspaceInvitation["status"]) {
  if (status === "pending") return "default" as const;
  if (status === "accepted") return "secondary" as const;
  return "outline" as const;
}

function InvitationsPage() {
  const { data: workspaces = [], isLoading: wsLoading } = useWorkspaces();
  const { data: memberships = [], isLoading: rolesLoading } = useMyWorkspaceRoles();

  const roleByWs = useMemo(
    () => new Map(memberships.map((m) => [m.workspace_id, m.role])),
    [memberships],
  );
  const managed = useMemo(
    () => workspaces.filter((w) => MANAGER_ROLES.includes(roleByWs.get(w.id) as WorkspaceRole)),
    [workspaces, roleByWs],
  );
  const wsName = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name])), [workspaces]);

  const ids = useMemo(() => managed.map((w) => w.id), [managed]);
  const {
    data: invitations = [],
    isLoading: invLoading,
    refetch,
  } = useInvitationsForWorkspaces(ids);

  const [q, setQ] = useState("");
  const [wsFilter, setWsFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invitations.filter((i) => {
      if (wsFilter !== "all" && i.workspace_id !== wsFilter) return false;
      if (!needle) return true;
      return (
        i.email.toLowerCase().includes(needle) ||
        i.role.toLowerCase().includes(needle) ||
        (wsName.get(i.workspace_id) ?? "").toLowerCase().includes(needle)
      );
    });
  }, [invitations, q, wsFilter, wsName]);

  const pending = filtered.filter((i) => i.status === "pending");
  const history = filtered.filter((i) => i.status !== "pending");

  const loading = wsLoading || rolesLoading;

  return (
    <>
      <AppTopbar
        title="Invitations"
        subtitle={
          loading
            ? "Loading"
            : `${pending.length} pending across ${managed.length} workspace${managed.length === 1 ? "" : "s"}`
        }
        actions={
          managed.length > 0 && (
            <PermissionGate permission="members.invite">
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" /> New invitation
              </Button>
            </PermissionGate>
          )
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invitations
          </div>
        ) : managed.length === 0 ? (
          <div className="rounded-control border border-border bg-surface p-8 text-center">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You need to be an owner or admin of a workspace to manage invitations.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by email, role or workspace"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select value={wsFilter} onValueChange={setWsFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All workspaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All workspaces</SelectItem>
                  {managed.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>

            <Tabs defaultValue="pending">
              <TabsList>
                <TabsTrigger value="pending" className="gap-1.5">
                  <Clock className="h-4 w-4" /> Pending ({pending.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5">
                  <Mail className="h-4 w-4" /> History ({history.length})
                </TabsTrigger>
                <TabsTrigger value="verify" className="gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Verify token
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-6">
                <PendingList
                  rows={pending}
                  loading={invLoading}
                  wsName={wsName}
                  roleByWs={roleByWs}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-6">
                <HistoryList rows={history} wsName={wsName} />
              </TabsContent>

              <TabsContent value="verify" className="mt-6">
                <VerifyPanel wsName={wsName} />
              </TabsContent>
            </Tabs>
          </>
        )}

        <CreateInvitationDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          workspaces={managed.map((w) => ({ id: w.id, name: w.name }))}
        />
      </main>
    </>
  );
}

/* ------------------------------ Pending ------------------------------ */

function PendingList({
  rows,
  loading,
  wsName,
  roleByWs,
}: {
  rows: WorkspaceInvitation[];
  loading: boolean;
  wsName: Map<string, string>;
  roleByWs: Map<string, WorkspaceRole>;
}) {
  const updateRole = useUpdateInvitationRole();
  const { roles: assignableRoles } = useAssignableRoles();
  const revoke = useRevokeInvitationById();
  const remove = useDeleteInvitation();
  const qc = useQueryClient();
  const resend = useResendInvitation(undefined);
  const [confirmRevoke, setConfirmRevoke] = useState<WorkspaceInvitation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceInvitation | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-control border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        No pending invitations.
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-control border border-border bg-surface">
        {rows.map((inv) => {
          const expired = new Date(inv.expires_at).getTime() < Date.now();
          // Only owners may hand out the admin role on an invitation.
          const isOwnerHere = roleByWs.get(inv.workspace_id) === "owner";
          const selectedPermissionRole = assignableRoles.find(
            (role) => role.id === inv.permission_role_id,
          );
          return (
            <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{inv.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {wsName.get(inv.workspace_id) ?? "Workspace"} ·{" "}
                  {expired ? "expired" : `expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                </div>
              </div>

              <Badge variant={expired ? "outline" : "default"}>
                {expired ? "expired" : "pending"}
              </Badge>

              <PermissionRoleSelect
                value={selectedPermissionRole?.id}
                onChange={async (selected) => {
                  try {
                    await updateRole.mutateAsync({
                      id: inv.id,
                      role: selected.workspaceRole,
                      permissionRoleId: selected.id,
                    });
                    toast.success(`Role updated to ${selected.name}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not update role");
                  }
                }}
                disabled={!isOwnerHere && selectedPermissionRole?.key === "admin"}
                className="h-8 w-44"
              />

              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => copyText(inviteLink(inv.token))}
              >
                <Copy className="h-3.5 w-3.5" /> Copy link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={resend.isPending}
                onClick={async () => {
                  try {
                    const token = await resend.mutateAsync(inv.id);
                    qc.invalidateQueries({ queryKey: ["workspace-invitations"] });
                    await copyText(inviteLink(token), "New link copied");
                    toast.success("Invitation regenerated");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not resend");
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmRevoke(inv)}
              >
                Revoke
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(inv)}
                aria-label="Delete invitation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!confirmRevoke} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The link sent to {confirmRevoke?.email} stops working immediately. The invitation
              stays in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const inv = confirmRevoke;
                setConfirmRevoke(null);
                if (!inv) return;
                try {
                  await revoke.mutateAsync(inv.id);
                  toast.success("Invitation revoked");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not revoke");
                }
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invitation permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record for {confirmDelete?.email} entirely, including from history.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const inv = confirmDelete;
                setConfirmDelete(null);
                if (!inv) return;
                try {
                  await remove.mutateAsync(inv.id);
                  toast.success("Invitation deleted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------ History ------------------------------ */

function HistoryList({
  rows,
  wsName,
}: {
  rows: WorkspaceInvitation[];
  wsName: Map<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-control border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        No accepted, revoked or expired invitations yet.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-control border border-border bg-surface">
      {rows.map((inv) => (
        <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          {inv.status === "accepted" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{inv.email}</div>
            <div className="truncate text-xs text-muted-foreground">
              {wsName.get(inv.workspace_id) ?? "Workspace"} · {inv.role} ·{" "}
              {new Date(inv.accepted_at ?? inv.created_at).toLocaleString()}
            </div>
          </div>
          <Badge variant={statusTone(inv.status)} className="capitalize">
            {inv.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Verify ------------------------------ */

function VerifyPanel({ wsName }: { wsName: Map<string, string> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InvitationVerification | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await verifyInvitationToken(value));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-control border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Verify an invitation</h2>
        <p className="text-sm text-muted-foreground">
          Paste an invite link or token to check whether it is still valid, who it belongs to and
          what role it grants.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-[240px] flex-1"
          placeholder="https:///invite/abc123 or abc123"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) void run();
          }}
        />
        <Button onClick={() => void run()} disabled={busy || !value.trim()} className="gap-1.5">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}{" "}
          Verify
        </Button>
      </div>

      {result && (
        <div className="space-y-2 rounded-control border border-border p-4 text-sm">
          {!result.found ? (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" /> No invitation matches that token.
            </div>
          ) : (
            <>
              <div
                className={`flex items-center gap-2 font-medium ${result.usable ? "text-primary" : "text-destructive"}`}
              >
                {result.usable ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {result.usable
                  ? "Valid and ready to accept"
                  : result.expired
                    ? "Expired"
                    : `Not usable (${result.status})`}
              </div>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-muted-foreground">
                <dt>Email</dt>
                <dd className="break-all text-foreground">{result.email}</dd>
                <dt>Role</dt>
                <dd className="capitalize text-foreground">{result.role}</dd>
                <dt>Workspace</dt>
                <dd className="text-foreground">
                  {wsName.get(result.workspace_id ?? "") ?? result.workspace_id}
                </dd>
                <dt>Status</dt>
                <dd className="capitalize text-foreground">{result.status}</dd>
                <dt>Expires</dt>
                <dd className="text-foreground">
                  {result.expires_at ? new Date(result.expires_at).toLocaleString() : "—"}
                </dd>
              </dl>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Create ------------------------------ */

function CreateInvitationDialog({
  open,
  onOpenChange,
  workspaces,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaces: { id: string; name: string }[];
}) {
  const create = useCreateInvitationFor();
  const [email, setEmail] = useState("");
  const { roles } = useAssignableRoles();
  const [selectedRole, setSelectedRole] = useState<AssignableRole | undefined>();
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces[0]?.id ?? "");
  const canInvite = useCanAct("members.invite");

  const target = workspaceId || workspaces[0]?.id || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (!canInvite) {
      toast.error("You don't have permission to invite members");
      return;
    }
    try {
      const chosen = selectedRole ?? defaultAssignableRole(roles);
      if (!chosen) throw new Error("No assignable role is available");
      const inv = await create.mutateAsync({
        workspaceId: target,
        email,
        role: chosen.workspaceRole,
        permissionRoleId: chosen.id,
      });
      await copyText(inviteLink(inv.token), "Invitation created — link copied");
      setEmail("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create invitation");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New invitation</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-workspace">Workspace</Label>
            <Select value={target} onValueChange={setWorkspaceId}>
              <SelectTrigger id="inv-workspace">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-role">Role</Label>
            <PermissionRoleSelect
              value={(selectedRole ?? defaultAssignableRole(roles))?.id}
              onChange={setSelectedRole}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The link expires after 14 days and is copied to your clipboard when created. You can
            change the role later from the pending list.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canInvite || create.isPending || !email.trim() || !target}
              className="gap-1.5"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Create invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
