import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  Search,
  MoreHorizontal,
  Circle,
  Mail,
  Copy,
  RefreshCw,
  X,
  ShieldCheck,
  Ban,
  UserCheck,
  ScrollText,
  Loader2,
  Globe2,
  Upload,
} from "lucide-react";
import { AutoInvitePanel } from "@/components/app/team/auto-invite-panel";
import { BulkInviteDialog } from "@/components/app/team/bulk-invite-dialog";

import { AppTopbar } from "@/components/app/app-topbar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useCurrentWorkspace,
  useWorkspaceRole,
  useWorkspaceMembers,
  useWorkspaceInvitations,
  useWorkspaceAuditLog,
  useInvitationAuditLog,
  useCreateInvitation,
  useRevokeInvitation,
  useResendInvitation,
  useUpdateMemberRole,
  useRemoveMember,
  useSetMemberStatus,
  useTransferWorkspaceOwnership,
  useWorkspaceRealtime,
  usePresenceHeartbeat,
  type WorkspaceMemberRow,
  type WorkspaceRole,
  type WorkspaceInvitation,
} from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import {
  PermissionRoleSelect,
  defaultAssignableRole,
  useAssignableRoles,
  type AssignableRole,
} from "@/components/app/team/permission-role-select";
import { useOrgRoleAssignments, useCanAct } from "@/hooks/use-permissions";
import { PermissionGate } from "@/components/app/permission-gate";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

function isOnline(last: string | null): boolean {
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < ONLINE_THRESHOLD_MS;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function TeamPage() {
  const { active: ws, isLoading } = useCurrentWorkspace();
  const { data: myRole } = useWorkspaceRole(ws?.id);
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  useWorkspaceRealtime(ws?.id);
  usePresenceHeartbeat(!!ws?.id);

  const { data: members = [], isLoading: mLoading } = useWorkspaceMembers(ws?.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  return (
    <>
      <AppTopbar
        title="Team"
        subtitle={
          ws ? `${members.length} member${members.length === 1 ? "" : "s"} · ${ws.name}` : "Loading"
        }
        actions={
          canManage && (
            <PermissionGate permission="members.invite">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkOpen(true)}
                  className="gap-1.5"
                >
                  <Upload className="h-4 w-4" /> Bulk import
                </Button>
                <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
                  <UserPlus className="h-4 w-4" /> Invite
                </Button>
              </div>
            </PermissionGate>
          )
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading || !ws ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading team
          </div>
        ) : (
          <Tabs defaultValue="directory">
            <TabsList>
              <TabsTrigger value="directory" className="gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Directory
              </TabsTrigger>
              <TabsTrigger value="invitations" className="gap-1.5">
                <Mail className="h-4 w-4" />
                Invitations
              </TabsTrigger>
              <TabsTrigger value="invite-log" className="gap-1.5">
                <ScrollText className="h-4 w-4" />
                Invite log
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <ScrollText className="h-4 w-4" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="auto-invite" className="gap-1.5">
                <Globe2 className="h-4 w-4" />
                Auto-invite
              </TabsTrigger>
            </TabsList>

            <TabsContent value="directory" className="mt-6">
              <MemberDirectory
                members={members}
                loading={mLoading}
                canManage={canManage}
                isOwner={isOwner}
                workspaceId={ws.id}
                organizationId={ws.organization_id ?? undefined}
              />
            </TabsContent>
            <TabsContent value="invitations" className="mt-6">
              <InvitationsPanel workspaceId={ws.id} canManage={canManage} />
            </TabsContent>
            <TabsContent value="invite-log" className="mt-6">
              <InvitationAuditLog workspaceId={ws.id} />
            </TabsContent>
            <TabsContent value="activity" className="mt-6">
              <ActivityTimeline workspaceId={ws.id} />
            </TabsContent>
            <TabsContent value="auto-invite" className="mt-6">
              <AutoInvitePanel workspaceId={ws.id} canManage={canManage} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {ws && (
        <>
          <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} workspaceId={ws.id} />
          <BulkInviteDialog open={bulkOpen} onOpenChange={setBulkOpen} workspaceId={ws.id} />
        </>
      )}
    </>
  );
}

/* ------------------------------ Directory ------------------------------ */

function MemberDirectory({
  members,
  loading,
  canManage,
  isOwner,
  workspaceId,
  organizationId,
}: {
  members: WorkspaceMemberRow[];
  loading: boolean;
  canManage: boolean;
  isOwner: boolean;
  workspaceId: string;
  organizationId?: string;
}) {
  const { data: assignments = [] } = useOrgRoleAssignments(organizationId);
  const { roles } = useAssignableRoles();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "online">(
    "all",
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      const hay = `${m.display_name ?? ""} ${m.email ?? ""} ${m.role}`.toLowerCase();
      if (needle && !hay.includes(needle)) return false;
      if (statusFilter === "active" && m.status !== "active") return false;
      if (statusFilter === "suspended" && m.status !== "suspended") return false;
      if (statusFilter === "online" && !isOnline(m.last_seen_at)) return false;
      return true;
    });
  }, [members, q, statusFilter]);

  const onlineCount = members.filter((m) => isOnline(m.last_seen_at)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or role"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All members</SelectItem>
            <SelectItem value="online">Online now ({onlineCount})</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-control border border-border bg-surface shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.5fr_1fr_100px_120px_140px_40px] items-center gap-3 px-4 py-3 bg-muted/40 text-xs  text-muted-foreground font-medium">
          <div>Member</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Last active</div>
          <div />
        </div>
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No matches.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => (
              <MemberRow
                key={m.user_id}
                m={m}
                canManage={canManage}
                isOwner={isOwner}
                workspaceId={workspaceId}
                permissionRoleId={
                  assignments.find(
                    (assignment) =>
                      assignment.user_id === m.user_id && assignment.workspace_id === workspaceId,
                  )?.role_id ??
                  roles.find((role) =>
                    m.role === "agent" ? role.key === "support_agent" : role.key === m.role,
                  )?.id
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  m,
  canManage,
  isOwner,
  workspaceId,
  permissionRoleId,
}: {
  m: WorkspaceMemberRow;
  canManage: boolean;
  isOwner: boolean;
  workspaceId: string;
  permissionRoleId?: string;
}) {
  const online = isOnline(m.last_seen_at);
  const updateRole = useUpdateMemberRole(workspaceId);
  const setStatus = useSetMemberStatus(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const transfer = useTransferWorkspaceOwnership(workspaceId);
  const [confirm, setConfirm] = useState<null | "remove" | "suspend" | "transfer">(null);
  const canRemove = useCanAct("members.remove");

  const canActOn = canManage && m.role !== "owner";

  async function doAction() {
    try {
      if (confirm === "remove") {
        if (!canRemove) return;
        await removeMember.mutateAsync(m.user_id);
        toast.success("Member removed");
      } else if (confirm === "suspend") {
        await setStatus.mutateAsync({
          userId: m.user_id,
          status: m.status === "suspended" ? "active" : "suspended",
        });
        toast.success(m.status === "suspended" ? "Member reactivated" : "Member suspended");
      } else if (confirm === "transfer") {
        await transfer.mutateAsync(m.user_id);
        toast.success("Ownership transferred");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setConfirm(null);
    }
  }

  return (
    <li className="grid grid-cols-[1fr_40px] md:grid-cols-[1.5fr_1fr_100px_120px_140px_40px] items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative">
          <Avatar className="h-9 w-9">
            <AvatarImage src={m.avatar_url ?? undefined} alt={m.display_name ?? ""} />
            <AvatarFallback>
              {(m.display_name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span
            aria-label={online ? "Online" : "Offline"}
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface",
              online ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{m.display_name ?? "Unnamed"}</div>
          <div className="truncate text-xs text-muted-foreground md:hidden">{m.email ?? "—"}</div>
        </div>
      </div>
      <div className="hidden md:block truncate text-sm text-muted-foreground">{m.email ?? "—"}</div>
      <div className="hidden md:block">
        {canActOn ? (
          <PermissionRoleSelect
            value={permissionRoleId}
            className="h-9 w-44"
            onChange={async (role) => {
              try {
                await updateRole.mutateAsync({
                  userId: m.user_id,
                  role: role.workspaceRole,
                  permissionRoleId: role.id,
                });
                toast.success("Role updated");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Update failed");
              }
            }}
          />
        ) : (
          <Badge variant={m.role === "owner" ? "default" : "secondary"} className="capitalize">
            {m.role}
          </Badge>
        )}
      </div>
      <div className="hidden md:flex items-center gap-1.5 text-xs">
        <Circle
          className={cn(
            "h-2 w-2 fill-current",
            m.status === "suspended"
              ? "text-destructive"
              : online
                ? "text-success"
                : "text-muted-foreground/60",
          )}
        />
        <span className="capitalize">
          {m.status === "suspended" ? "suspended" : online ? "online" : "offline"}
        </span>
      </div>
      <div className="hidden md:block text-xs text-muted-foreground">
        {relativeTime(m.last_seen_at ?? m.last_active_at)}
      </div>

      <div className="justify-self-end">
        {canActOn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Member actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setConfirm("suspend")} className="gap-2">
                {m.status === "suspended" ? (
                  <>
                    <UserCheck className="h-4 w-4" /> Reactivate
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4" /> Suspend access
                  </>
                )}
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuItem onSelect={() => setConfirm("transfer")} className="gap-2">
                  <ShieldCheck className="h-4 w-4" /> Transfer ownership
                </DropdownMenuItem>
              )}
              <PermissionGate permission="members.remove">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setConfirm("remove")}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <X className="h-4 w-4" /> Remove from workspace
                </DropdownMenuItem>
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "remove" && `Remove ${m.display_name ?? "this member"}?`}
              {confirm === "suspend" &&
                (m.status === "suspended" ? "Reactivate member?" : "Suspend member?")}
              {confirm === "transfer" && "Transfer workspace ownership?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "remove" && "They will immediately lose access to this workspace."}
              {confirm === "suspend" &&
                (m.status === "suspended"
                  ? "They will regain access with their existing role."
                  : "They will lose access to workspace data until reactivated. Their role and history are preserved.")}
              {confirm === "transfer" &&
                "You will be demoted to admin. This cannot be undone by you afterwards."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doAction}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/* ------------------------------ Invitations ------------------------------ */

function InvitationsPanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const { data: invs = [], isLoading } = useWorkspaceInvitations(workspaceId);
  const revoke = useRevokeInvitation(workspaceId);
  const resend = useResendInvitation(workspaceId);

  const pending = invs.filter((i) => i.status === "pending");
  const past = invs.filter((i) => i.status !== "pending");

  async function copy(inv: WorkspaceInvitation, token?: string) {
    const link = `${window.location.origin}/invite/${token ?? inv.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title={`Pending (${pending.length})`}
        desc="Invitations waiting for someone to accept."
      >
        {isLoading ? (
          <Loading />
        ) : pending.length === 0 ? (
          <Empty label="No pending invitations." />
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {pending.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <Badge>pending</Badge>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => copy(inv)}>
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={resend.isPending}
                      onClick={async () => {
                        try {
                          const token = await resend.mutateAsync(inv.id);
                          await copy(inv, token);
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Could not regenerate invite link",
                          );
                        }
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        try {
                          await revoke.mutateAsync(inv.id);
                          toast.success("Invitation cancelled");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Cancel failed");
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="History" desc="Accepted, revoked and expired invitations.">
        {past.length === 0 ? (
          <Empty label="Nothing here yet." />
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {past.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.role} ·{" "}
                    {inv.status === "accepted"
                      ? `accepted ${relativeTime(inv.accepted_at)}`
                      : `${inv.status} ${relativeTime(inv.created_at)}`}
                  </div>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {inv.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------ Activity ------------------------------ */

const ACTIVITY_PAGE_SIZE = 50;

function ActivityTimeline({ workspaceId }: { workspaceId: string }) {
  const [limit, setLimit] = useState(ACTIVITY_PAGE_SIZE);
  const { data = [], isLoading, isFetching } = useWorkspaceAuditLog(workspaceId, limit);
  const hasMore = data.length === limit;
  return (
    <div className="rounded-control border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Activity timeline</h2>
          <p className="text-sm text-muted-foreground">Team events, updated live.</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/workspace">Full audit log →</Link>
        </Button>
      </div>
      {isLoading ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty label="No activity yet." />
      ) : (
        <>
          <ol className="relative ml-3 space-y-4 border-l border-border pl-6">
            {data.map((row) => (
              <li key={row.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <Badge variant="secondary" className="capitalize">
                    {row.action}
                  </Badge>
                  <span className="font-medium">{row.resource_type}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground font-mono truncate">
                  {row.resource_id}
                </div>
              </li>
            ))}
          </ol>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetching}
                onClick={() => setLimit((n) => n + ACTIVITY_PAGE_SIZE)}
              >
                {isFetching ? "Loading" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ Invite dialog ------------------------------ */

/* ------------------------------ Invitation audit log ------------------------------ */

const INVITE_ACTION_LABELS: Record<
  string,
  { label: string; tone: "default" | "secondary" | "destructive" | "outline" }
> = {
  invitation_sent: { label: "Sent", tone: "default" },
  invitation_resent: { label: "Resent", tone: "secondary" },
  invitation_accepted: { label: "Accepted", tone: "default" },
  invitation_revoked: { label: "Revoked", tone: "destructive" },
  invitation_expired: { label: "Expired", tone: "outline" },
  invitation_deleted: { label: "Deleted", tone: "destructive" },
  invite: { label: "Invite", tone: "secondary" },
};

function InvitationAuditLog({ workspaceId }: { workspaceId: string }) {
  const { data = [], isLoading } = useInvitationAuditLog(workspaceId, 200);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((row) => {
      if (action !== "all" && row.action !== action) return false;
      if (!needle) return true;
      const c = row.changes ?? {};
      const hay =
        `${row.actor_name ?? ""} ${row.actor_email ?? ""} ${String((c as { email?: string }).email ?? "")} ${String((c as { role?: string }).role ?? "")}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q, action]);

  return (
    <div className="rounded-control border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Invitation audit log</h2>
          <p className="text-sm text-muted-foreground">
            Every invite sent, resent, accepted, revoked, or expired — with timestamps and who
            acted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by email or actor"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="invitation_sent">Sent</SelectItem>
              <SelectItem value="invitation_resent">Resent</SelectItem>
              <SelectItem value="invitation_accepted">Accepted</SelectItem>
              <SelectItem value="invitation_revoked">Revoked</SelectItem>
              <SelectItem value="invitation_expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty label="No invitation events yet." />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((row) => {
            const c = (row.changes ?? {}) as {
              email?: string;
              role?: string;
              from_status?: string;
              to_status?: string;
            };
            const meta = INVITE_ACTION_LABELS[row.action] ?? {
              label: row.action,
              tone: "secondary" as const,
            };
            const inviterLabel = row.actor_name ?? row.actor_email ?? "System";
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Badge variant={meta.tone} className="capitalize">
                  {meta.label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="font-medium">{c.email ?? "—"}</span>
                    {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    by {inviterLabel}
                    {c.from_status && c.to_status && ` · ${c.from_status} → ${c.to_status}`}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Invite dialog ------------------------------ */

function InviteDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
}) {
  const [email, setEmail] = useState("");
  const { roles } = useAssignableRoles();
  const [selectedRole, setSelectedRole] = useState<AssignableRole | undefined>();
  const create = useCreateInvitation(workspaceId);
  const canInvite = useCanAct("members.invite");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!canInvite) {
      toast.error("You don't have permission to invite members");
      return;
    }
    try {
      const chosen = selectedRole ?? defaultAssignableRole(roles);
      if (!chosen) throw new Error("No assignable role is available");
      const inv = await create.mutateAsync({
        email,
        role: chosen.workspaceRole,
        permissionRoleId: chosen.id,
      });
      const link = `${window.location.origin}/invite/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success("Invitation created — link copied to clipboard");
      setEmail("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invitation");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-invite-email">Email</Label>
            <Input
              id="team-invite-email"
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <PermissionRoleSelect
              value={(selectedRole ?? defaultAssignableRole(roles))?.id}
              onChange={setSelectedRole}
            />
            <p className="text-xs text-muted-foreground">
              Invitation links expire after 14 days. Share the copied link by email or chat.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canInvite || create.isPending || !email.trim()}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Bits ------------------------------ */

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Loading() {
  return <div className="p-4 text-sm text-muted-foreground">Loading</div>;
}
function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-control border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
