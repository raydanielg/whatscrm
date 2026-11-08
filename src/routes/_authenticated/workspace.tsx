import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Users,
  Mail,
  Settings2,
  Bell,
  ScrollText,
  ShieldAlert,
  Archive,
  Loader2,
  Copy,
  X,
} from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useCurrentWorkspace,
  useWorkspaceRole,
  useWorkspaceMembers,
  useWorkspaceInvitations,
  useWorkspaceAuditLog,
  useUpdateWorkspace,
  useCreateInvitation,
  useRevokeInvitation,
  useUpdateMemberRole,
  useRemoveMember,
  useTransferWorkspaceOwnership,
  useArchiveWorkspace,
  useDeleteWorkspace,
  type WorkspaceRow,
  type WorkspaceRole,
} from "@/hooks/use-workspace";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/workspace")({
  component: WorkspacePage,
});

const ROLES: WorkspaceRole[] = ["owner", "admin", "agent", "viewer"];

function WorkspacePage() {
  const { active: ws, isLoading } = useCurrentWorkspace();
  const { data: myRole } = useWorkspaceRole(ws?.id);
  const canEdit = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  return (
    <>
      <AppTopbar
        title="Workspace"
        subtitle={ws ? `${ws.name} · ${myRole ?? "member"}` : "Loading"}
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading || !ws ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading workspace
          </div>
        ) : (
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="flex flex-wrap gap-0.5 p-0.75 w-max justify-start">
              <TabsTrigger value="general" className="gap-1.5">
                <Building2 className="h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5">
                <Users className="h-4 w-4" />
                Members
              </TabsTrigger>
              <TabsTrigger value="invitations" className="gap-1.5">
                <Mail className="h-4 w-4" />
                Invitations
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-1.5">
                <Settings2 className="h-4 w-4" />
                Preferences
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5">
                <Bell className="h-4 w-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <ScrollText className="h-4 w-4" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="danger" className="gap-1.5">
                <ShieldAlert className="h-4 w-4" />
                Danger zone
              </TabsTrigger>
            </TabsList>

            <div className="mt-6 rounded-control border border-border bg-surface p-6 shadow-sm">
              <TabsContent value="general">
                <GeneralTab ws={ws} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="members">
                <MembersTab ws={ws} canEdit={canEdit} isOwner={isOwner} myRole={myRole ?? null} />
              </TabsContent>
              <TabsContent value="invitations">
                <InvitationsTab ws={ws} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="preferences">
                <PreferencesTab ws={ws} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="notifications">
                <NotificationsTab ws={ws} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityTab wsId={ws.id} />
              </TabsContent>
              <TabsContent value="danger">
                <DangerTab ws={ws} isOwner={isOwner} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>
    </>
  );
}

/* ------------------------------ General ------------------------------ */

function GeneralTab({ ws, canEdit }: { ws: WorkspaceRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    name: ws.name,
    description: ws.description ?? "",
    avatar_url: ws.avatar_url ?? "",
  });
  const mut = useUpdateWorkspace(ws.id);

  async function save() {
    try {
      await mut.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
      });
      toast.success("Workspace updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Basic information about this workspace.</p>
      </div>

      <div className="flex items-start gap-4">
        <Avatar className="h-20 w-20 rounded-control">
          <AvatarImage src={form.avatar_url || undefined} alt={form.name} />
          <AvatarFallback className="rounded-control bg-gradient-accent font-display text-2xl text-accent-foreground">
            {form.name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="w-avatar">Avatar URL</Label>
          <Input
            id="w-avatar"
            value={form.avatar_url}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
            placeholder="https:///avatar.png"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-name">Workspace name</Label>
        <Input
          id="w-name"
          value={form.name}
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-desc">Description</Label>
        <Textarea
          id="w-desc"
          value={form.description}
          disabled={!canEdit}
          rows={3}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What is this workspace for?"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Slug</Label>
        <Input value={ws.slug} readOnly disabled className="font-mono" />
      </div>

      {canEdit && (
        <Button onClick={save} disabled={mut.isPending || !form.name.trim()}>
          {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Members ------------------------------ */

function MembersTab({
  ws,
  canEdit,
  isOwner,
  myRole,
}: {
  ws: WorkspaceRow;
  canEdit: boolean;
  isOwner: boolean;
  myRole: WorkspaceRole | null;
}) {
  const { data: members = [], isLoading } = useWorkspaceMembers(ws.id);
  const updateRole = useUpdateMemberRole(ws.id);
  const removeMember = useRemoveMember(ws.id);
  const canRemove = useCanAct("members.remove");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Members</h2>
        <p className="text-sm text-muted-foreground">People with access to this workspace.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : (
        <div className="rounded-control border border-border">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center gap-3 border-b border-border p-3 last:border-b-0"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={m.avatar_url ?? undefined} />
                <AvatarFallback>
                  {(m.display_name ?? m.user_id).slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.display_name ?? "Unnamed"}</div>
                <div className="truncate text-xs text-muted-foreground font-mono">
                  {m.user_id.slice(0, 8)}
                </div>
              </div>
              {canEdit && m.role !== "owner" ? (
                <Select
                  value={m.role}
                  onValueChange={async (v) => {
                    try {
                      await updateRole.mutateAsync({ userId: m.user_id, role: v as WorkspaceRole });
                      toast.success("Role updated");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Update failed");
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter((r) => r !== "owner" || isOwner).map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
              )}
              {canEdit && m.role !== "owner" && (
                <PermissionGate permission="members.remove">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>
                          They will immediately lose access to this workspace.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            if (!canRemove) return;
                            try {
                              await removeMember.mutateAsync(m.user_id);
                              toast.success("Member removed");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Remove failed");
                            }
                          }}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </PermissionGate>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No members yet.</div>
          )}
        </div>
      )}

      <RolesLegend myRole={myRole} />
    </div>
  );
}

function RolesLegend({ myRole }: { myRole: WorkspaceRole | null }) {
  const rows: [WorkspaceRole, string][] = [
    ["owner", "Full control including delete and transfer."],
    ["admin", "Manage workspace settings, members and invitations."],
    ["agent", "Work with data (contacts, deals, conversations)."],
    ["viewer", "Read-only access."],
  ];
  return (
    <div className="rounded-control border border-dashed border-border p-4 text-sm">
      <div className="mb-2 font-medium">Permissions</div>
      <ul className="space-y-1 text-muted-foreground">
        {rows.map(([r, desc]) => (
          <li key={r} className="flex gap-2">
            <Badge variant="secondary" className="min-w-14 justify-center">
              {r}
            </Badge>
            <span>{desc}</span>
            {myRole === r && <Badge className="ml-auto">you</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ Invitations ------------------------------ */

function InvitationsTab({ ws, canEdit }: { ws: WorkspaceRow; canEdit: boolean }) {
  const { data: invs = [], isLoading } = useWorkspaceInvitations(ws.id);
  const create = useCreateInvitation(ws.id);
  const revoke = useRevokeInvitation(ws.id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("agent");
  const canInvite = useCanAct("members.invite");

  async function send() {
    if (!email.trim()) return;
    if (!canInvite) {
      toast.error("You don't have permission to invite members");
      return;
    }
    try {
      const inv = await create.mutateAsync({ email, role });
      const link = `${window.location.origin}/invite/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success("Invitation created — link copied");
      setEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create invitation");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Invitations</h2>
        <p className="text-sm text-muted-foreground">
          Invite team members with a shareable link. Links expire after 14 days.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2 rounded-control border border-border p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div className="w-full sm:w-36 space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r !== "owner").map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={send} disabled={!canInvite || create.isPending || !email.trim()}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send invite
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : invs.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No invitations yet.
        </div>
      ) : (
        <div className="rounded-control border border-border">
          {invs.map((inv) => {
            const link = `${window.location.origin}/invite/${inv.token}`;
            return (
              <div
                key={inv.id}
                className="flex flex-wrap items-center gap-3 border-b border-border p-3 last:border-b-0"
              >
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant={inv.status === "pending" ? "default" : "secondary"}>
                  {inv.status}
                </Badge>
                {inv.status === "pending" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(link);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={async () => {
                          try {
                            await revoke.mutateAsync(inv.id);
                            toast.success("Invitation revoked");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Revoke failed");
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Preferences ------------------------------ */

function PreferencesTab({ ws, canEdit }: { ws: WorkspaceRow; canEdit: boolean }) {
  const prefs = (ws.preferences ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    default_view: (prefs.default_view as string) ?? "dashboard",
    density: (prefs.density as string) ?? "comfortable",
    week_start: (prefs.week_start as string) ?? "monday",
  });
  const mut = useUpdateWorkspace(ws.id);

  async function save() {
    try {
      await mut.mutateAsync({ preferences: { ...prefs, ...form } });
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Preferences</h2>
        <p className="text-sm text-muted-foreground">Defaults applied to this workspace.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Default landing</Label>
          <Select
            value={form.default_view}
            onValueChange={(v) => setForm({ ...form, default_view: v })}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dashboard">Dashboard</SelectItem>
              <SelectItem value="inbox">Inbox</SelectItem>
              <SelectItem value="contacts">Contacts</SelectItem>
              <SelectItem value="deals">Deals</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>UI density</Label>
          <Select
            value={form.density}
            onValueChange={(v) => setForm({ ...form, density: v })}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Week starts on</Label>
          <Select
            value={form.week_start}
            onValueChange={(v) => setForm({ ...form, week_start: v })}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monday">Monday</SelectItem>
              <SelectItem value="sunday">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {canEdit && (
        <Button onClick={save} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save preferences
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Notifications ------------------------------ */

function NotificationsTab({ ws, canEdit }: { ws: WorkspaceRow; canEdit: boolean }) {
  const mut = useUpdateWorkspace(ws.id);
  const prefs = (ws.preferences ?? {}) as Record<string, unknown>;
  const notif = (prefs.notifications as Record<string, boolean>) ?? {};
  const [state, setState] = useState({
    workspace_enabled: ws.notifications_enabled,
    mentions: notif.mentions ?? true,
    assignments: notif.assignments ?? true,
    digest: notif.digest ?? false,
  });

  async function save() {
    try {
      await mut.mutateAsync({
        notifications_enabled: state.workspace_enabled,
        preferences: {
          ...prefs,
          notifications: {
            mentions: state.mentions,
            assignments: state.assignments,
            digest: state.digest,
          },
        },
      });
      toast.success("Notification settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  const rows: [keyof typeof state, string, string][] = [
    ["workspace_enabled", "Workspace notifications", "Master switch for this workspace."],
    ["mentions", "Mentions", "Notify me when I'm @mentioned."],
    ["assignments", "Assignments", "Notify me when work is assigned to me."],
    ["digest", "Weekly digest", "Summary of workspace activity every Monday."],
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Control what this workspace notifies members about.
        </p>
      </div>

      <div className="divide-y divide-border rounded-control border border-border">
        {rows.map(([key, title, desc]) => (
          <div key={key} className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
            <Switch
              checked={Boolean(state[key])}
              onCheckedChange={(v) => setState({ ...state, [key]: v })}
              disabled={!canEdit}
            />
          </div>
        ))}
      </div>

      {canEdit && (
        <Button onClick={save} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Activity ------------------------------ */

const ACTIVITY_PAGE_SIZE = 50;

function ActivityTab({ wsId }: { wsId: string }) {
  const [limit, setLimit] = useState(ACTIVITY_PAGE_SIZE);
  const { data = [], isLoading, isFetching } = useWorkspaceAuditLog(wsId, limit);
  const hasMore = data.length === limit;
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Activity log</h2>
      <p className="mb-4 text-sm text-muted-foreground">Events in this workspace.</p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : data.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-control border border-border">
            {data.map((row) => (
              <li key={row.id} className="flex items-start gap-3 p-3 text-sm">
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {row.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {row.resource_type} <span className="font-normal text-muted-foreground">·</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{row.resource_id}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
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

/* ------------------------------ Danger zone ------------------------------ */

function DangerTab({ ws, isOwner }: { ws: WorkspaceRow; isOwner: boolean }) {
  const archive = useArchiveWorkspace(ws.id);
  const del = useDeleteWorkspace(ws.id);
  const transfer = useTransferWorkspaceOwnership(ws.id);
  const { data: members = [] } = useWorkspaceMembers(ws.id);
  const transferable = useMemo(() => members.filter((m) => m.role !== "owner"), [members]);
  const [newOwner, setNewOwner] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const navigate = useNavigate();

  if (!isOwner) {
    return (
      <div className="rounded-control border border-dashed border-border p-6 text-sm text-muted-foreground">
        Only the workspace owner can archive, transfer or delete the workspace.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Archive */}
      <div className="rounded-control border border-border p-5">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display font-semibold">
            {ws.archived_at ? "Restore workspace" : "Archive workspace"}
          </h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {ws.archived_at
            ? "This workspace is archived. Restore it to bring it back to normal state."
            : "Archived workspaces are hidden from the switcher and read-only for members. You can restore later."}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          disabled={archive.isPending}
          onClick={async () => {
            try {
              await archive.mutateAsync(!ws.archived_at);
              toast.success(ws.archived_at ? "Workspace restored" : "Workspace archived");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          }}
        >
          {archive.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {ws.archived_at ? "Restore workspace" : "Archive workspace"}
        </Button>
      </div>

      {/* Transfer */}
      <div className="rounded-control border border-border p-5">
        <h3 className="font-display font-semibold">Transfer ownership</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The new owner gets full control. You'll be demoted to admin.
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label>New owner</Label>
            <Select value={newOwner} onValueChange={setNewOwner}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {transferable.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.display_name ?? m.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={transfer.isPending || !newOwner}
            onClick={async () => {
              try {
                await transfer.mutateAsync(newOwner);
                toast.success("Ownership transferred");
                setNewOwner("");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Transfer failed");
              }
            }}
          >
            {transfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Transfer ownership
          </Button>
        </div>
      </div>

      {/* Delete */}
      <div className="rounded-control border border-destructive/40 bg-destructive/5 p-5">
        <h3 className="font-display font-semibold text-destructive">Delete workspace</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently deletes this workspace and all its contacts, deals, conversations, messages
          and files. This cannot be undone.
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label>
              Type <code className="rounded bg-muted px-1 py-0.5 text-xs">{ws.name}</code> to
              confirm
            </Label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={ws.name}
            />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={confirmName !== ws.name || del.isPending}>
                {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete workspace permanently
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{ws.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  All data in this workspace will be permanently removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await del.mutateAsync();
                      toast.success("Workspace deleted");
                      navigate({ to: "/dashboard", replace: true });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Delete failed");
                    }
                  }}
                >
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
