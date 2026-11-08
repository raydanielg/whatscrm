import { createFileRoute } from "@tanstack/react-router";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Search,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
  KeyRound,
  LogOut,
  MailCheck,
  ShieldCheck,
  RefreshCw,
  ShieldOff,
  Filter,
} from "lucide-react";
import {
  listPlatformUsers,
  getPlatformUserDetail,
  suspendPlatformUser,
  activatePlatformUser,
  deletePlatformUser,
  resetPlatformUserPassword,
  forceLogoutPlatformUser,
  verifyPlatformUserEmail,
  setPlatformRole,
  revokeUserSession,
  bulkUserAction,
} from "@/lib/admin/users.functions";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/users")({
  staticData: { breadcrumb: "Users" },
  head: () => ({
    meta: [{ title: "Super Admin — Users" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersAdminPage,
});

type StatusFilter = "all" | "active" | "suspended" | "unverified";
type RoleFilter = "all" | "superadmin" | "support";

function initials(name?: string | null, email?: string | null) {
  const s = (name || email || "?").trim();
  return (
    s
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleString() : "—";
}

function UsersAdminPage() {
  const formatZonedBase = useZonedDateFormatter();
  const fmt = (d?: string | null) =>
    d ? formatZonedBase(new Date(d), { dateStyle: "short", timeStyle: "medium" }) : "—";
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformUsers);
  const bulkFn = useServerFn(bulkUserAction);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "users", { search, status, role }],
    queryFn: () => listFn({ data: { search, status, role, limit: 200 } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "users"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "users"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "users"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Treat server data as untrusted at the route boundary. A malformed or
  // partially serialized response must render the empty state, not crash the
  // entire admin shell when array methods are called below.
  const users = Array.isArray(query.data?.users) ? query.data.users : [];
  const allSelected = users.length > 0 && users.every((u) => selected.has(u.id));

  const bulk = useMutation({
    mutationFn: (
      action: "suspend" | "activate" | "force_logout" | "verify_email" | "reset_password",
    ) => bulkFn({ data: { userIds: Array.from(selected), action } }),
    onSuccess: (r, action) => {
      toast.success(`Bulk ${action.replace("_", " ")}: ${r.count} user(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <AdminPageShell
      title="Users"
      description="Platform-wide directory. Search, manage sessions, roles, and lifecycle."
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name, or user id"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 " />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="superadmin">Superadmin</SelectItem>
            <SelectItem value="support">Support</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin", "users"] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 rounded-control border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("verify_email")}>
              <MailCheck className="h-4 w-4 " />
              Verify email
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("reset_password")}>
              <KeyRound className="h-4 w-4 " />
              Reset password
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("force_logout")}>
              <LogOut className="h-4 w-4 " />
              Force logout
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("activate")}>
              <Play className="h-4 w-4 " />
              Activate
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulk.mutate("suspend")}>
              <Pause className="h-4 w-4 " />
              Suspend
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-control border bg-card overflow-hidden">
        <div className="grid grid-cols-[36px_1.6fr_1fr_1fr_120px_120px_40px] items-center gap-2 px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => setSelected(v ? new Set(users.map((u) => u.id)) : new Set())}
          />
          <div>User</div>
          <div>Organizations</div>
          <div>Last sign-in</div>
          <div>MFA</div>
          <div>Status</div>
          <div />
        </div>
        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading users</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No users match.</div>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[36px_1.6fr_1fr_1fr_120px_120px_40px] items-center gap-2 px-3 py-2 border-b last:border-0 hover:bg-muted/30 transition-colors"
            >
              <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
              <button className="flex items-center gap-3 text-left" onClick={() => setOpenId(u.id)}>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={u.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(u.display_name, u.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {u.display_name ?? u.email ?? u.id}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</div>
                </div>
                {u.platform_roles.length > 0 && (
                  <Badge variant="secondary" className="ml-1 uppercase text-[11px]">
                    {u.platform_roles[0]}
                  </Badge>
                )}
                {!u.email_confirmed_at && (
                  <Badge variant="outline" className="text-[11px]">
                    Unverified
                  </Badge>
                )}
              </button>
              <div className="text-xs text-muted-foreground truncate">
                {u.organizations.length === 0
                  ? "—"
                  : u.organizations
                      .slice(0, 2)
                      .map((o) => o.name)
                      .filter(Boolean)
                      .join(", ")}
                {u.organizations.length > 2 ? ` +${u.organizations.length - 2}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">{fmt(u.last_sign_in_at)}</div>
              <div>
                {u.mfa_enabled ? (
                  <Badge variant="secondary">
                    <ShieldCheck className="h-3 w-3 " />
                    On
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <ShieldOff className="h-3 w-3 " />
                    Off
                  </Badge>
                )}
              </div>
              <div>
                <Badge
                  variant={u.status === "suspended" ? "destructive" : "secondary"}
                  className="capitalize"
                >
                  {u.status}
                </Badge>
              </div>
              <UserRowMenu user={u} onOpen={() => setOpenId(u.id)} />
            </div>
          ))
        )}
      </div>

      <UserDetailSheet userId={openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </AdminPageShell>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UserRowMenu({ user, onOpen }: { user: any; onOpen: () => void }) {
  const qc = useQueryClient();
  const suspend = useServerFn(suspendPlatformUser);
  const activate = useServerFn(activatePlatformUser);
  const reset = useServerFn(resetPlatformUserPassword);
  const forceLogout = useServerFn(forceLogoutPlatformUser);
  const verify = useServerFn(verifyPlatformUserEmail);
  const del = useServerFn(deletePlatformUser);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Manage</DropdownMenuLabel>
          <DropdownMenuItem onClick={onOpen}>View profile</DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.status === "suspended" ? (
            <DropdownMenuItem
              onClick={() => run(() => activate({ data: { userId: user.id } }), "User activated")}
            >
              <Play className="h-4 w-4" />
              Activate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => run(() => suspend({ data: { userId: user.id } }), "User suspended")}
            >
              <Pause className="h-4 w-4" />
              Suspend
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              run(() => forceLogout({ data: { userId: user.id } }), "Sessions revoked")
            }
          >
            <LogOut className="h-4 w-4" />
            Force logout
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run(() => reset({ data: { userId: user.id } }), "Password reset issued")}
          >
            <KeyRound className="h-4 w-4" />
            Reset password
          </DropdownMenuItem>
          {!user.email_confirmed_at && (
            <DropdownMenuItem
              onClick={() => run(() => verify({ data: { userId: user.id } }), "Email verified")}
            >
              <MailCheck className="h-4 w-4" />
              Verify email
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes <span className="font-mono">{user.email}</span> and all associated auth
              data. Type the email to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={user.email ?? ""}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={emailInput !== user.email}
              onClick={() =>
                run(
                  () => del({ data: { userId: user.id, confirmEmail: emailInput } }),
                  "User deleted",
                )
              }
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UserDetailSheet({
  userId,
  onOpenChange,
}: {
  userId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const formatZonedBase = useZonedDateFormatter();
  const fmt = (d?: string | null) =>
    d ? formatZonedBase(new Date(d), { dateStyle: "short", timeStyle: "medium" }) : "—";
  const qc = useQueryClient();
  const detailFn = useServerFn(getPlatformUserDetail);
  const setRole = useServerFn(setPlatformRole);
  const revokeSess = useServerFn(revokeUserSession);

  const detail = useQuery({
    queryKey: ["admin", "user-detail", userId],
    queryFn: () => detailFn({ data: { userId: userId! } }),
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`admin-user-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "login_history", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  const d = detail.data;
  const platformRoleSet = useMemo(() => new Set((d?.platformRoles ?? []).map((r) => r.role)), [d]);

  const toggleRole = async (role: "superadmin" | "support") => {
    if (!userId) return;
    const grant = !platformRoleSet.has(role);
    try {
      await setRole({ data: { userId, role, grant } });
      toast.success(grant ? `Granted ${role}` : `Revoked ${role}`);
      qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Sheet open={!!userId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-hidden p-0 flex flex-col">
        <SheetHeader className="p-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={d?.profile?.avatar_url ?? undefined} />
              <AvatarFallback>{initials(d?.profile?.display_name, d?.user?.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate">{d?.profile?.display_name ?? d?.user?.email ?? "User"}</div>
              <div className="text-xs font-normal text-muted-foreground truncate">
                {d?.user?.email}
              </div>
            </div>
          </SheetTitle>
          <SheetDescription className="flex flex-wrap gap-1 pt-1">
            {d?.user?.status && (
              <Badge variant={d.user.status === "suspended" ? "destructive" : "secondary"}>
                {d.user.status}
              </Badge>
            )}
            {d?.user?.email_confirmed_at ? (
              <Badge variant="outline">Email verified</Badge>
            ) : (
              <Badge variant="outline">Email unverified</Badge>
            )}
            {d?.mfa?.enabled ? (
              <Badge variant="secondary">
                <ShieldCheck className="h-3 w-3 " />
                MFA {d.mfa.method}
              </Badge>
            ) : (
              <Badge variant="outline">
                <ShieldOff className="h-3 w-3 " />
                No MFA
              </Badge>
            )}
            {(d?.platformRoles ?? []).map((r) => (
              <Badge key={r.id} className="uppercase text-[11px]">
                {r.role}
              </Badge>
            ))}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="profile" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-3 self-start">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="orgs">Organizations</TabsTrigger>
            <TabsTrigger value="sessions">Sessions & devices</TabsTrigger>
            <TabsTrigger value="logins">Login history</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="profile" className="p-6 pt-4 space-y-2">
              <Row k="User ID" v={<span className="font-mono text-xs">{d?.user?.id}</span>} />
              <Row k="Email" v={d?.user?.email ?? "—"} />
              <Row k="Phone" v={d?.user?.phone ?? "—"} />
              <Row k="Created" v={fmt(d?.user?.created_at)} />
              <Row k="Last sign-in" v={fmt(d?.user?.last_sign_in_at)} />
              <Row k="Last seen" v={fmt(d?.profile?.last_seen_at)} />
              <Row k="Timezone" v={d?.profile?.timezone ?? "—"} />
              <Row k="Language" v={d?.profile?.language ?? "—"} />
              <Row k="Job title" v={d?.profile?.job_title ?? "—"} />
            </TabsContent>

            <TabsContent value="orgs" className="p-6 pt-4 space-y-2">
              {(d?.organizations ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Not a member of any organization.</p>
              ) : (
                (d?.organizations ?? []).map((m, i) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const org = (m as any).organizations;
                  const sub = Array.isArray(org?.subscriptions)
                    ? org.subscriptions[0]
                    : org?.subscriptions;
                  return (
                    <div
                      key={i}
                      className="rounded-control border p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium">{org?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          /{org?.slug} · joined {fmt(m.joined_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">{m.role}</Badge>
                        {sub && (
                          <Badge variant="secondary">
                            {sub?.plans?.name ?? sub?.plan_id ?? "plan"} · {sub.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="sessions" className="p-6 pt-4 space-y-2">
              {(d?.sessions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions recorded.</p>
              ) : (
                (d?.sessions ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="rounded-control border p-3 flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-medium">{s.device ?? "Unknown device"}</div>
                      <div className="text-xs text-muted-foreground">{s.user_agent ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.ip_address ?? "—"} · {s.location ?? "—"} · last seen{" "}
                        {fmt(s.last_seen_at)}
                      </div>
                    </div>
                    {s.revoked_at ? (
                      <Badge variant="outline">Revoked</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await revokeSess({ data: { userId: userId!, sessionId: s.id } });
                            toast.success("Session revoked");
                            qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] });
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="logins" className="p-6 pt-4 space-y-1">
              {(d?.loginHistory ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No login events recorded.</p>
              ) : (
                (d?.loginHistory ?? []).map((l) => (
                  <div
                    key={l.id}
                    className="rounded-control border px-3 py-2 flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            l.event === "failed" || l.event === "mfa_failed" || l.event === "locked"
                              ? "destructive"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {l.event.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{fmt(l.created_at)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.ip_address ?? "—"} · {l.device ?? "—"} · {l.location ?? "—"}
                      </div>
                      {l.failure_reason && (
                        <div className="text-xs text-destructive">{l.failure_reason}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="roles" className="p-6 pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Platform roles grant access to the Super Admin console. Only superadmin can modify
                these.
              </p>
              {(["superadmin", "support"] as const).map((r) => (
                <div key={r} className="flex items-center justify-between rounded-control border p-3">
                  <div>
                    <div className="text-sm font-medium capitalize">{r}</div>
                    <div className="text-xs text-muted-foreground">
                      {r === "superadmin"
                        ? "Full platform control including destructive actions."
                        : "Read-only + limited tenant operations."}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={platformRoleSet.has(r) ? "destructive" : "default"}
                    onClick={() => toggleRole(r)}
                  >
                    {platformRoleSet.has(r) ? "Revoke" : "Grant"}
                  </Button>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="audit" className="p-6 pt-4 space-y-1">
              {(d?.audit ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit events for this user.</p>
              ) : (
                (d?.audit ?? []).map((a) => (
                  <div key={a.id} className="rounded-control border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.action}</Badge>
                      <span className="text-xs text-muted-foreground">{a.resource_type}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {fmt(a.created_at)}
                      </span>
                    </div>
                    {a.changes && Object.keys(a.changes).length > 0 && (
                      <pre className="text-xs mt-1 text-muted-foreground whitespace-pre-wrap break-all">
                        {JSON.stringify(a.changes, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="text-sm text-right min-w-0 truncate">{v}</div>
    </div>
  );
}
