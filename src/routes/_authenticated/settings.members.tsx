import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useCurrentWorkspace,
  useWorkspaceRole,
  useWorkspaceMembers,
  useWorkspaceInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  useResendInvitation,
  useUpdateMemberRole,
  useRemoveMember,
  type WorkspaceRole,
} from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/settings/members")({
  component: MembersSettings,
  head: () => ({
    meta: [
      { title: "Members — Workspace Settings" },
      {
        name: "description",
        content: "Invite teammates, manage roles, and remove members from your workspace.",
      },
    ],
  }),
});

const ROLES: WorkspaceRole[] = ["admin", "agent", "viewer"];

function MembersSettings() {
  const { data: ws } = useCurrentWorkspace();
  const { data: role } = useWorkspaceRole(ws?.id);
  const canManage = role === "owner" || role === "admin";
  const formatZoned = useZonedDateFormatter();
  const members = useWorkspaceMembers(ws?.id);
  const invites = useWorkspaceInvitations(ws?.id);
  const invite = useCreateInvitation(ws?.id);
  const revoke = useRevokeInvitation(ws?.id);
  const resend = useResendInvitation(ws?.id);
  const updateRole = useUpdateMemberRole(ws?.id);
  const remove = useRemoveMember(ws?.id);
  const canInvite = useCanAct("members.invite");
  const canRemove = useCanAct("members.remove");

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("agent");

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canInvite) {
      toast.error("You don't have permission to invite members");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    try {
      await invite.mutateAsync({ email, role: inviteRole });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }
  }

  return (
    <>
      <AppTopbar title="Members" subtitle="Invite teammates and manage roles" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {canManage && (
          <PermissionGate permission="members.invite">
            <Card>
              <CardHeader>
                <CardTitle>Invite a teammate</CardTitle>
                <CardDescription>They will receive an email invitation link.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onInvite} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 grid gap-1">
                    <Label htmlFor="email" className="sr-only">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="teammate@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as WorkspaceRole)}
                  >
                    <SelectTrigger className="sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={invite.isPending}>
                    {invite.isPending ? "Sending" : "Send invite"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </PermissionGate>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Members ({members.data?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {members.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading</p>
            ) : members.error ? (
              <p className="text-sm text-destructive">Failed to load members.</p>
            ) : (members.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data!.map((m) => (
                    <TableRow key={m.user_id}>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </TableCell>
                      <TableCell>
                        {canManage && m.role !== "owner" ? (
                          <Select
                            value={m.role}
                            onValueChange={(v) =>
                              updateRole.mutate({ userId: m.user_id, role: v as WorkspaceRole })
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r} value={r} className="capitalize">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="capitalize">
                            {m.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={m.status === "active" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && m.role !== "owner" && (
                          <PermissionGate permission="members.remove">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive">
                                  Remove
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove member?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    They will lose access immediately.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      if (!canRemove) return;
                                      remove.mutate(m.user_id);
                                    }}
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </PermissionGate>
                        )}
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
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {invites.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading</p>
            ) : (invites.data ?? []).filter((i) => i.status === "pending").length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites
                    .data!.filter((i) => i.status === "pending")
                    .map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="text-sm">{i.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {i.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatZoned(new Date(i.expires_at), { dateStyle: "short" })}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {canManage && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => resend.mutate(i.id)}>
                                Resend
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => revoke.mutate(i.id)}
                              >
                                Revoke
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
