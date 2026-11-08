import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Shield, Trash2, Save, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useActiveOrganization } from "@/hooks/use-organization";
import {
  useAllPermissions,
  useRoles,
  useRolePermissions,
  useCreateRole,
  useDeleteRole,
  useSetRolePermissions,
  usePermissions,
} from "@/hooks/use-permissions";
import { PermissionGate } from "@/components/app/permission-gate";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/roles")({
  component: RolesPage,
});

const GROUP_LABELS: Record<string, string> = {
  contacts: "Contacts",
  companies: "Companies",
  deals: "Deals",
  campaigns: "Campaigns",
  automations: "Automations",
  inbox: "Inbox",
  analytics: "Analytics",
  reports: "Reports",
  ai: "AI Studio",
  workspaces: "Workspace",
  billing: "Billing",
  organizations: "Organization",
  roles: "Roles & Permissions",
  api_keys: "API",
  pages: "Pages & Menu",
  members: "Members",
  audit_logs: "Audit Log",
};

function RolesPage() {
  const { active } = useActiveOrganization();
  const orgId = active?.id ?? null;
  const roles = useRoles(orgId);
  const catalog = useAllPermissions();
  const { isSuperAdmin, can } = usePermissions();
  const canManage = isSuperAdmin || can("roles.manage");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0] ?? null;
  const rolePerms = useRolePermissions(selected?.id);

  const [pending, setPending] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof catalog.data>();
    (catalog.data ?? [])
      .filter(
        (p) =>
          !search ||
          p.key.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase()),
      )
      .forEach((p) => {
        const key = p.resource;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      });
    return Array.from(groups.entries());
  }, [catalog.data, search]);

  const effectivePerms = pending ?? new Set(rolePerms.data ?? []);
  const dirty = pending !== null;

  const setRolePerms = useSetRolePermissions();
  const deleteRole = useDeleteRole();

  function togglePerm(id: string) {
    const base = new Set(effectivePerms);
    if (base.has(id)) base.delete(id);
    else base.add(id);
    setPending(base);
  }

  function toggleGroup(ids: string[], on: boolean) {
    const base = new Set(effectivePerms);
    ids.forEach((id) => (on ? base.add(id) : base.delete(id)));
    setPending(base);
  }

  async function save() {
    if (!selected || !pending) return;
    try {
      await setRolePerms.mutateAsync({ roleId: selected.id, permissionIds: Array.from(pending) });
      setPending(null);
      toast.success("Permissions updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppTopbar
        title="Roles & Permissions"
        subtitle="Configure who can do what across the organization"
        actions={
          <PermissionGate permission="roles.manage">
            <CreateRoleDialog orgId={orgId} />
          </PermissionGate>
        }
      />

      <main className="p-6 space-y-6 max-w-[1400px] w-full mx-auto">
        {isSuperAdmin && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Super Admin</AlertTitle>
            <AlertDescription>
              You have platform-wide override — permission checks always pass for your account.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Roles list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roles</CardTitle>
              <CardDescription>{roles.data?.length ?? 0} available</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              {roles.data?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedId(r.id);
                    setPending(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-control hover:bg-muted transition ${selected?.id === r.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{r.name}</span>
                    {r.is_system ? (
                      <Badge variant="secondary" className="text-[11px]">
                        System
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        Custom
                      </Badge>
                    )}
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</p>
                  )}
                </button>
              ))}
              {roles.isLoading && <p className="text-xs text-muted-foreground p-2">Loading</p>}
            </CardContent>
          </Card>

          {/* Permission matrix */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {selected?.name ?? "Select a role"}
                  {selected?.is_system && <Badge variant="secondary">System</Badge>}
                </CardTitle>
                <CardDescription>
                  {selected?.description ?? "Choose a role to view or edit its permission matrix."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter permissions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 w-56"
                  />
                </div>
                {canManage && selected && !selected.is_system && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!confirm(`Delete role "${selected.name}"?`)) return;
                      await deleteRole.mutateAsync(selected.id);
                      setSelectedId(null);
                      toast.success("Role deleted");
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                  </Button>
                )}
                {canManage && selected && dirty && (
                  <Button size="sm" onClick={save} disabled={setRolePerms.isPending}>
                    <Save className="w-3.5 h-3.5 mr-1.5" /> Save changes
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selected && <p className="text-sm text-muted-foreground">No role selected.</p>}
              {selected && (
                <ScrollArea className="h-[calc(100vh-360px)] min-h-[420px] pr-3">
                  <div className="space-y-5">
                    {grouped.map(([resource, perms]) => {
                      const ids = perms!.map((p) => p.id);
                      const allOn = ids.every((id) => effectivePerms.has(id));
                      const someOn = ids.some((id) => effectivePerms.has(id));
                      const disabled = !canManage || selected.is_system;
                      return (
                        <div key={resource} className="border rounded-control p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h3 className="font-medium text-sm">
                                {GROUP_LABELS[resource] ?? resource}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {perms!.length} permissions
                              </p>
                            </div>
                            <Checkbox
                              checked={allOn ? true : someOn ? "indeterminate" : false}
                              disabled={disabled}
                              onCheckedChange={(v) => toggleGroup(ids, !!v)}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {perms!.map((p) => (
                              <label
                                key={p.id}
                                className={`flex items-start gap-2 rounded-control p-2 border text-sm ${effectivePerms.has(p.id) ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-muted"}`}
                              >
                                <Checkbox
                                  checked={effectivePerms.has(p.id)}
                                  disabled={disabled}
                                  onCheckedChange={() => togglePerm(p.id)}
                                  className="mt-0.5"
                                />
                                <div className="min-w-0">
                                  <div className="font-mono text-[11px] text-muted-foreground truncate">
                                    {p.key}
                                  </div>
                                  <div className="text-xs">{p.description ?? p.action}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
              {selected?.is_system && (
                <p className="text-xs text-muted-foreground mt-3">
                  System role permissions are read-only. Duplicate as a custom role to customize.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function CreateRoleDialog({ orgId }: { orgId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateRole();

  async function submit() {
    if (!orgId || !name.trim()) return;
    const key = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    try {
      await create.mutateAsync({ organization_id: orgId, key, name: name.trim(), description });
      toast.success("Role created");
      setOpen(false);
      setName("");
      setDescription("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create custom role</DialogTitle>
          <DialogDescription>Start empty and assign permissions from the matrix.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Regional Manager"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
