import { createFileRoute } from "@tanstack/react-router";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Search,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
  UserCog,
  LogIn,
  Building2,
  Filter,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  listTenants,
  getTenantDetail,
  suspendTenant,
  activateTenant,
  deleteTenant,
  transferOwnership,
  impersonateTenant,
  bulkTenantAction,
  createTenant,
} from "@/lib/admin/tenants.functions";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/workspaces")({
  staticData: { breadcrumb: "Tenants" },
  head: () => ({
    meta: [{ title: "Super Admin — Tenants" }, { name: "robots", content: "noindex" }],
  }),
  component: TenantsPage,
});

type StatusFilter = "all" | "active" | "suspended";

function TenantsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTenants);
  const bulkFn = useServerFn(bulkTenantAction);
  const createFn = useServerFn(createTenant);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [planId, setPlanId] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createOwnerEmail, setCreateOwnerEmail] = useState("");
  const [createWorkspaceName, setCreateWorkspaceName] = useState("");
  const [createBillingEmail, setCreateBillingEmail] = useState("");

  const query = useQuery({
    queryKey: ["admin", "tenants", { search, status, planId }],
    queryFn: () => listFn({ data: { search, status, planId } }),
  });

  // Realtime — refetch when organizations change
  useEffect(() => {
    const ch = supabase
      .channel("admin-tenants")
      .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, () => {
        qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Keep the table resilient to malformed or partially serialized server
  // responses. Only an actual array is valid table data.
  const rows = Array.isArray(query.data) ? query.data : [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const bulk = useMutation({
    mutationFn: (action: "suspend" | "activate") =>
      bulkFn({ data: { orgIds: Array.from(selected), action } }),
    onSuccess: (_d, action) => {
      toast.success(`Bulk ${action} applied to ${selected.size} tenant(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: createName.trim(),
          ownerEmail: createOwnerEmail.trim(),
          workspaceName: createWorkspaceName.trim() || undefined,
          billingEmail: createBillingEmail.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(`${createName.trim()} created`);
      setShowCreate(false);
      setCreateName("");
      setCreateOwnerEmail("");
      setCreateWorkspaceName("");
      setCreateBillingEmail("");
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <AdminPageShell
      title="Tenant Management"
      description="Organizations, workspaces, subscriptions, and usage across the platform. Updates in real time."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Create Tenant
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, slug, billing email"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={planId} onValueChange={setPlanId}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Professional</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("suspend")}
            >
              <Pause className="w-3.5 h-3.5 mr-1.5" /> Suspend
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate("activate")}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" /> Activate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-control border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-[36px_2fr_1fr_1fr_120px_100px_120px_44px] px-4 py-3 bg-muted/40 text-xs  text-muted-foreground font-medium">
          <div className="flex items-center">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => {
                if (v) setSelected(new Set(rows.map((r) => r.id)));
                else setSelected(new Set());
              }}
            />
          </div>
          <div>Tenant</div>
          <div>Plan</div>
          <div>Subscription</div>
          <div className="text-right">Members</div>
          <div className="text-right">Seats</div>
          <div>Status</div>
          <div />
        </div>

        {query.isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading tenants</div>
        )}
        {!query.isLoading && rows.length === 0 && (
          <div className="p-12 text-center">
            <Building2 className="w-8 h-8 mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">No tenants match your filters.</p>
          </div>
        )}

        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[36px_2fr_1fr_1fr_120px_100px_120px_44px] px-4 py-3 items-center hover:bg-muted/30 transition-colors group cursor-pointer"
              onClick={() => setOpenId(r.id)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
              </div>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center font-semibold text-sm shrink-0">
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.slug} · {r.billing_email ?? "no billing email"}
                  </div>
                </div>
              </div>
              <div className="text-sm">{r.plan}</div>
              <div>
                <SubscriptionBadge status={r.subscription_status} />
              </div>
              <div className="text-right  text-sm">{r.member_count}</div>
              <div className="text-right  text-sm">{r.seats}</div>
              <div>
                <StatusBadge status={r.status} />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <RowMenu tenantId={r.id} status={r.status} slug={r.slug} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <TenantDetailSheet openId={openId} onClose={() => setOpenId(null)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create tenant</DialogTitle>
            <DialogDescription>
              The owner must already have an account in the app — invite them first if they don't,
              then create the tenant for them here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tenant-name">Organization name</Label>
              <Input
                id="tenant-name"
                placeholder="Acme Inc."
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-owner-email">Owner email</Label>
              <Input
                id="tenant-owner-email"
                type="email"
                placeholder="owner@acme.com"
                value={createOwnerEmail}
                onChange={(e) => setCreateOwnerEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must match an existing user account in this app.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-workspace-name">First workspace name (optional)</Label>
              <Input
                id="tenant-workspace-name"
                placeholder="Defaults to organization name"
                value={createWorkspaceName}
                onChange={(e) => setCreateWorkspaceName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-billing-email">Billing email (optional)</Label>
              <Input
                id="tenant-billing-email"
                type="email"
                placeholder="Defaults to owner email"
                value={createBillingEmail}
                onChange={(e) => setCreateBillingEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              disabled={!createName.trim() || !createOwnerEmail.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Create tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "suspended" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-control text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function SubscriptionBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success",
    trialing: "bg-accent/10 text-accent",
    past_due: "bg-warning/10 text-warning",
    canceled: "bg-muted text-muted-foreground",
    none: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-control text-xs font-medium ${map[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}

function RowMenu({ tenantId, status, slug }: { tenantId: string; status: string; slug: string }) {
  const qc = useQueryClient();
  const suspend = useServerFn(suspendTenant);
  const activate = useServerFn(activateTenant);
  const del = useServerFn(deleteTenant);
  const transfer = useServerFn(transferOwnership);
  const impersonate = useServerFn(impersonateTenant);

  const [showDelete, setShowDelete] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showImpersonate, setShowImpersonate] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [reason, setReason] = useState("");

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(label);
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Tenant actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {status === "suspended" ? (
            <DropdownMenuItem
              onClick={() => run("Tenant activated", () => activate({ data: { orgId: tenantId } }))}
            >
              <Play className="w-4 h-4" /> Activate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => run("Tenant suspended", () => suspend({ data: { orgId: tenantId } }))}
            >
              <Pause className="w-4 h-4" /> Suspend
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setShowTransfer(true)}>
            <UserCog className="w-4 h-4" /> Transfer ownership
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowImpersonate(true)}>
            <LogIn className="w-4 h-4" /> Impersonate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete tenant
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tenant permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This is irreversible. All data — users, conversations, deals, files — will be removed.
              Type the tenant slug <code className="text-foreground font-mono">{slug}</code> to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            placeholder={slug}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmSlug !== slug}
              onClick={() =>
                run("Tenant deleted", () => del({ data: { orgId: tenantId, confirmSlug } }))
              }
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter the email of the new owner. They must already have an account.
          </p>
          <Input
            placeholder="user@example.com"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await run("Ownership transferred", () =>
                  transfer({ data: { orgId: tenantId, newOwnerEmail: newOwner } }),
                );
                setShowTransfer(false);
                setNewOwner("");
              }}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImpersonate} onOpenChange={setShowImpersonate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate tenant</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Impersonation is audited. Provide a reason (min. 8 characters).
          </p>
          <Input
            placeholder="e.g. Investigating billing issue #4821"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImpersonate(false)}>
              Cancel
            </Button>
            <Button
              disabled={reason.length < 8}
              onClick={async () => {
                await run("Impersonation ticket issued", () =>
                  impersonate({ data: { orgId: tenantId, reason } }),
                );
                setShowImpersonate(false);
                setReason("");
              }}
            >
              Start session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TenantDetailSheet({ openId, onClose }: { openId: string | null; onClose: () => void }) {
  const formatZoned = useZonedDateFormatter();
  const getDetail = useServerFn(getTenantDetail);
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["admin", "tenant-detail", openId],
    queryFn: () => getDetail({ data: { orgId: openId! } }),
    enabled: !!openId,
  });

  useEffect(() => {
    if (!openId) return;
    const ch = supabase
      .channel(`tenant-detail-${openId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_logs",
          filter: `organization_id=eq.${openId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "tenant-detail", openId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `organization_id=eq.${openId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "tenant-detail", openId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [openId, qc]);

  const d = detail.data;
  const usage = d?.usage ?? {};
  const meters = useMemo(
    () => [
      { code: "messages", label: "Messages" },
      { code: "ai_tokens", label: "AI tokens" },
      { code: "storage_mb", label: "Storage (MB)" },
      { code: "api_calls", label: "API calls" },
      { code: "workflow_runs", label: "Workflow runs" },
      { code: "active_users", label: "Active users" },
    ],
    [],
  );

  return (
    <Sheet
      open={!!openId}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{d?.organization?.name ?? "Tenant"}</SheetTitle>
          <SheetDescription>{d?.organization?.slug}</SheetDescription>
        </SheetHeader>

        {detail.isLoading && (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading</div>
        )}

        {d && d.organization && (
          <Tabs defaultValue="profile" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="profile" className="flex-1">
                Profile
              </TabsTrigger>
              <TabsTrigger value="subscription" className="flex-1">
                Subscription & Usage
              </TabsTrigger>
              <TabsTrigger value="members" className="flex-1">
                Members
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1">
                Timeline
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-3">
              <ProfileRow label="Name" value={d.organization.name} />
              <ProfileRow label="Slug" value={d.organization.slug} />
              <ProfileRow label="Industry" value={d.organization.industry ?? "—"} />
              <ProfileRow label="Billing email" value={d.organization.billing_email ?? "—"} />
              <ProfileRow label="Contact email" value={d.organization.contact_email ?? "—"} />
              <ProfileRow label="Phone" value={d.organization.phone ?? "—"} />
              <ProfileRow label="Website" value={d.organization.website ?? "—"} />
              <ProfileRow label="Timezone" value={d.organization.timezone} />
              <ProfileRow label="Currency" value={d.organization.currency} />
              <ProfileRow
                label="Created"
                value={formatZoned(new Date(d.organization.created_at), {
                  dateStyle: "short",
                  timeStyle: "medium",
                })}
              />
            </TabsContent>

            <TabsContent value="subscription" className="space-y-4">
              <div className="rounded-control border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Plan</div>
                    <div className="font-bold text-xl">
                      {d.subscription?.plans?.name ?? "No subscription"}
                    </div>
                  </div>
                  <SubscriptionBadge status={d.subscription?.status ?? "none"} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Metric label="Seats" value={d.subscription?.seats ?? 0} />
                  <Metric
                    label="Trial ends"
                    value={
                      d.subscription?.trial_ends_at
                        ? formatZoned(new Date(d.subscription.trial_ends_at), {
                            dateStyle: "short",
                          })
                        : "—"
                    }
                  />
                  <Metric
                    label="Period end"
                    value={
                      d.subscription?.current_period_end
                        ? formatZoned(new Date(d.subscription.current_period_end), {
                            dateStyle: "short",
                          })
                        : "—"
                    }
                  />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Usage · last 30 days</h4>
                <div className="grid grid-cols-2 gap-3">
                  {meters.map((m) => (
                    <Metric
                      key={m.code}
                      label={m.label}
                      value={(usage[m.code] ?? 0).toLocaleString()}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="members">
              <ScrollArea className="h-[420px]">
                <div className="divide-y divide-border">
                  {d.members.map((m) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const p = (m as any).profiles;
                    return (
                      <div key={m.user_id} className="py-2 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">
                            {p?.display_name ?? p?.email ?? m.user_id.slice(0, 8)}
                          </div>
                          <div className="text-xs text-muted-foreground">{p?.email}</div>
                        </div>
                        <Badge variant="outline">{m.role}</Badge>
                      </div>
                    );
                  })}
                  {d.members.length === 0 && (
                    <p className="text-sm text-muted-foreground py-8 text-center">No members.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="timeline">
              <ScrollArea className="h-[420px]">
                <ol className="relative border-l border-border ml-2">
                  {d.audit.map((a) => (
                    <li key={a.id} className="mb-4 ml-4">
                      <div className="absolute w-2 h-2 bg-accent rounded-full -left-1 mt-2" />
                      <time className="text-xs text-muted-foreground">
                        {formatZoned(new Date(a.created_at), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </time>
                      <div className="text-sm font-medium">
                        {a.action}{" "}
                        <span className="text-muted-foreground font-normal">
                          · {a.resource_type}
                        </span>
                      </div>
                      {a.changes && Object.keys(a.changes).length > 0 && (
                        <pre className="text-[11px] text-muted-foreground mt-1 bg-muted/40 rounded p-2 overflow-x-auto">
                          {JSON.stringify(a.changes, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                  {d.audit.length === 0 && (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No activity yet.
                    </p>
                  )}
                </ol>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm py-1.5 border-b border-border/60 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-control border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-xl  mt-0.5">{value}</div>
    </div>
  );
}
