import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Copy, Ban, Plus, AlertCircle, Loader2, Eye, EyeOff, ShieldAlert, Pencil, RefreshCw, Search, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  listApiKeys, createApiKey, revokeApiKey, updateApiKey, rotateApiKey, getApiKeyStats,
} from "@/lib/developer/api-keys.functions";
import { useActiveOrganization } from "@/hooks/use-organization";
import { usePermissions } from "@/hooks/use-permissions";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
import { describeApiKeyError, type ApiKeyErrorInfo } from "@/lib/developer/api-key-errors";
import { API_SCOPES, SCOPE_GROUPS } from "@/lib/api/scopes";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Shared API key manager used by both the Developer Center and
 * Settings → API keys, so the two surfaces never drift apart.
 *
 * Supports the full key lifecycle: create, search/filter, edit (name,
 * description, scopes, expiry, IP allowlist), rotate and revoke.
 */

export const AVAILABLE_SCOPES: string[] = API_SCOPES as unknown as string[];

type StatusFilter = "all" | "active" | "expired" | "revoked";

function keyStatus(k: any): Exclude<StatusFilter, "all"> {
  if (k.revoked_at) return "revoked";
  if (k.expires_at && new Date(k.expires_at) < new Date()) return "expired";
  return "active";
}

function parseIpList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** Grouped scope checkbox picker shared by the create and edit dialogs. */
function ScopePicker({
  scopes,
  setScopes,
  onChange,
  error,
}: {
  scopes: string[];
  setScopes: (fn: (prev: string[]) => string[]) => void;
  onChange?: () => void;
  error?: string | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Permissions</Label>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground underline"
          onClick={() => {
            onChange?.();
            setScopes((prev) => (prev.length === API_SCOPES.length ? [] : [...API_SCOPES]));
          }}
        >
          {scopes.length === API_SCOPES.length ? "Clear all" : "Select all"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        The key can only call endpoints covered by the scopes you grant here.
      </p>
      <ScrollArea type="hover" className="mt-2" viewportClassName="max-h-[260px] [&>div]:!block">
        <div className="space-y-3 pr-1">
          {SCOPE_GROUPS.map((group) => {
            const groupScopes = group.scopes.map((s) => s.scope);
            const allOn = groupScopes.every((sc) => scopes.includes(sc));
            return (
              <div key={group.key} className="rounded border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{group.label}</p>
                    <p className="text-[11px] text-muted-foreground">{group.description}</p>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground underline shrink-0"
                    onClick={() => {
                      onChange?.();
                      setScopes((prev) =>
                        allOn
                          ? prev.filter((sc) => !groupScopes.includes(sc as any))
                          : Array.from(new Set([...prev, ...groupScopes])),
                      );
                    }}
                  >
                    {allOn ? "None" : "All"}
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.scopes.map((item) => {
                    const on = scopes.includes(item.scope);
                    const id = `scope-${item.scope}`;
                    return (
                      <label
                        key={item.scope}
                        htmlFor={id}
                        className="flex items-start gap-2 rounded border border-border p-2 cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          id={id}
                          checked={on}
                          onCheckedChange={() => {
                            onChange?.();
                            setScopes((prev) =>
                              on ? prev.filter((x) => x !== item.scope) : [...prev, item.scope],
                            );
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium">{item.label}</span>
                          <span className="block text-[11px] font-mono text-muted-foreground break-all">
                            {item.scope}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ApiKeysManager() {
  const { active: org } = useActiveOrganization();
  const { orgRole, platformRole } = usePermissions();
  const isAuthorized = orgRole === "owner" || orgRole === "admin" || platformRole === "superadmin";
  const organizationId = org?.id ?? null;
  const qc = useQueryClient();
  const listFn = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const update = useServerFn(updateApiKey);
  const rotate = useServerFn(rotateApiKey);
  const stats = useServerFn(getApiKeyStats);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealedTitle, setRevealedTitle] = useState("Copy your key");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<ApiKeyErrorInfo | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; info: ApiKeyErrorInfo } | null>(null);
  const [confirmRevokeKey, setConfirmRevokeKey] = useState<any | null>(null);
  const [confirmRotateKey, setConfirmRotateKey] = useState<any | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Edit dialog state
  const [editKey, setEditKey] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [editIps, setEditIps] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [editError, setEditError] = useState<ApiKeyErrorInfo | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const keysQ = useQuery({
    queryKey: ["developer", "api-keys", organizationId],
    queryFn: () => listFn({ data: { organizationId: organizationId! } }) as Promise<{ keys: any[] }>,
    enabled: !!organizationId,
  });

  const statsQ = useQuery({
    queryKey: ["developer", "api-key-stats", organizationId, editKey?.id],
    queryFn: () =>
      stats({ data: { organizationId: organizationId!, id: editKey!.id, days: 7 } }) as Promise<any>,
    enabled: !!organizationId && !!editKey?.id,
  });

  const allKeys = keysQ.data?.keys ?? [];
  const keys = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allKeys.filter((k: any) => {
      if (statusFilter !== "all" && keyStatus(k) !== statusFilter) return false;
      if (!q) return true;
      return (
        (k.name ?? "").toLowerCase().includes(q) ||
        (k.description ?? "").toLowerCase().includes(q) ||
        (k.prefix ?? "").toLowerCase().includes(q) ||
        (k.scopes ?? []).some((s: string) => s.toLowerCase().includes(q))
      );
    });
  }, [allKeys, search, statusFilter]);

  async function handleCreate() {
    setCreateError(null);
    if (!organizationId) {
      const info: ApiKeyErrorInfo = {
        title: "No workspace selected",
        detail: "Pick a workspace from the switcher at the top before creating a key.",
        field: null,
        raw: "missing organizationId",
      };
      setCreateError(info);
      toast.error(info.title, { description: info.detail });
      return;
    }
    if (!name.trim()) {
      const info: ApiKeyErrorInfo = {
        title: "Name is required",
        detail: "Give the key a name so you can recognise it later.",
        field: "name",
        raw: "empty name",
      };
      setCreateError(info);
      toast.error(info.title, { description: info.detail });
      return;
    }
    if (scopes.length === 0) {
      const info: ApiKeyErrorInfo = {
        title: "Select at least one permission",
        detail: "A key with no scopes cannot call any endpoint. Grant at least one permission below.",
        field: "scopes",
        raw: "empty scopes",
      };
      setCreateError(info);
      toast.error(info.title, { description: info.detail });
      return;
    }
    const days = expiresInDays ? Number(expiresInDays) : null;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      const info: ApiKeyErrorInfo = {
        title: "Expiry isn't valid",
        detail: "Enter a whole number of days between 1 and 3650, or leave it empty for a key that never expires.",
        field: "expiresInDays",
        raw: `invalid expiresInDays: ${expiresInDays}`,
      };
      setCreateError(info);
      toast.error(info.title, { description: info.detail });
      return;
    }
    setBusy(true);
    try {
      const res: any = await create({
        data: {
          organizationId,
          name: name.trim(),
          description: description.trim() || undefined,
          scopes,
          expiresInDays: days,
          ipAllowlist: parseIpList(ipAllowlist),
        },
      });
      setRevealedTitle("Copy your key");
      setRevealed(res.secret);
      setSecretVisible(false);
      setCopied(false);
      setName(""); setScopes([]); setExpiresInDays(""); setDescription(""); setIpAllowlist("");
      toast.success("API key created", { description: "Copy the secret now — it won't be shown again." });
      await qc.invalidateQueries({ queryKey: ["developer", "api-keys"] });
    } catch (e) {
      const info = describeApiKeyError(e, "create");
      setCreateError(info);
      toast.error(info.title, { description: info.detail });
    } finally { setBusy(false); }
  }

  function openEdit(k: any) {
    setRowError(null);
    setEditError(null);
    setEditKey(k);
    setEditName(k.name ?? "");
    setEditDescription(k.description ?? "");
    setEditScopes([...(k.scopes ?? [])]);
    setEditIps((k.ip_allowlist ?? []).join("\n"));
    setEditExpiry("");
  }

  async function handleSaveEdit() {
    if (!organizationId || !editKey) return;
    setEditError(null);
    if (!editName.trim()) {
      const info: ApiKeyErrorInfo = {
        title: "Name is required",
        detail: "Give the key a name so you can recognise it later.",
        field: "name",
        raw: "empty name",
      };
      setEditError(info);
      toast.error(info.title, { description: info.detail });
      return;
    }
    if (editScopes.length === 0) {
      const info: ApiKeyErrorInfo = {
        title: "Select at least one permission",
        detail: "A key with no scopes cannot call any endpoint.",
        field: "scopes",
        raw: "empty scopes",
      };
      setEditError(info);
      toast.error(info.title, { description: info.detail });
      return;
    }
    let expiresInDays: number | null | undefined;
    if (editExpiry.trim() === "") {
      expiresInDays = undefined; // leave expiry untouched
    } else if (editExpiry.trim() === "0") {
      expiresInDays = null; // clear expiry
    } else {
      const n = Number(editExpiry);
      if (!Number.isInteger(n) || n < 1 || n > 3650) {
        const info: ApiKeyErrorInfo = {
          title: "Expiry isn't valid",
          detail: "Enter a whole number of days between 1 and 3650, 0 to remove the expiry, or leave it empty to keep it unchanged.",
          field: "expiresInDays",
          raw: `invalid expiresInDays: ${editExpiry}`,
        };
        setEditError(info);
        toast.error(info.title, { description: info.detail });
        return;
      }
      expiresInDays = n;
    }
    setSavingEdit(true);
    try {
      await update({
        data: {
          organizationId,
          id: editKey.id,
          name: editName.trim(),
          description: editDescription.trim(),
          scopes: editScopes,
          ipAllowlist: parseIpList(editIps),
          ...(expiresInDays === undefined ? {} : { expiresInDays }),
        },
      });
      toast.success("Key updated", { description: `Changes to “${editName.trim()}” are live immediately.` });
      setEditKey(null);
      await qc.invalidateQueries({ queryKey: ["developer", "api-keys"] });
    } catch (e) {
      const info = describeApiKeyError(e, "create");
      setEditError(info);
      toast.error(info.title, { description: info.detail });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRotate(k: any) {
    if (!organizationId) return;
    setRowError(null);
    setRotatingId(k.id);
    try {
      const res: any = await rotate({ data: { organizationId, id: k.id } });
      setConfirmRotateKey(null);
      setRevealedTitle("Copy your rotated key");
      setRevealed(res.secret);
      setSecretVisible(false);
      setCopied(false);
      setDialogOpen(true);
      toast.success("Key rotated", {
        description: "The old key is revoked. Copy the new secret now — it won't be shown again.",
      });
      await qc.invalidateQueries({ queryKey: ["developer", "api-keys"] });
    } catch (e) {
      const info = describeApiKeyError(e, "create");
      setRowError({ id: k.id, info });
      toast.error(info.title, { description: info.detail });
    } finally {
      setRotatingId(null);
    }
  }

  function requestRevoke(k: any) {
    setRowError(null);
    if (k.revoked_at) {
      toast.warning("Key already revoked", {
        description: `${k.name} was revoked on ${new Date(k.revoked_at).toLocaleString()}. No further action is needed.`,
      });
      return;
    }
    setConfirmRevokeKey(k);
  }

  async function handleRevoke(k: any) {
    setRowError(null);
    if (!organizationId) {
      toast.error("No workspace selected", {
        description: "Pick a workspace from the switcher at the top before revoking a key.",
      });
      return;
    }
    // Re-check against the freshest list in case another tab revoked it meanwhile.
    const current = (keysQ.data?.keys ?? []).find((row: any) => row.id === k.id);
    if (current?.revoked_at) {
      toast.warning("Key already revoked", {
        description: `${current.name} was revoked on ${new Date(current.revoked_at).toLocaleString()}.`,
      });
      setConfirmRevokeKey(null);
      return;
    }
    const id = k.id;
    setRevokingId(id);
    try {
      await revoke({ data: { organizationId, id } });
      toast.success("Key revoked", { description: "Any requests using it will now be rejected." });
      setConfirmRevokeKey(null);
      await qc.invalidateQueries({ queryKey: ["developer", "api-keys"] });
    } catch (e) {
      const info = describeApiKeyError(e, "revoke");
      setRowError({ id, info });
      toast.error(info.title, { description: info.detail });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">API keys</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Keys are scoped to <span className="font-medium text-foreground">{org?.name ?? "your organization"}</span>. Use with{" "}
              <code className="text-[11px]">Authorization: Bearer wdf_live_</code>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <DeveloperOrgSwitcher />
          <Dialog
            open={dialogOpen}
            onOpenChange={(o) => {
              if (!o && revealed && !copied) { setConfirmClose(true); return; }
              setDialogOpen(o);
              if (!o) { setRevealed(null); setCreateError(null); setSecretVisible(false); setCopied(false); }
            }}
          >
            {isAuthorized && (
              <DialogTrigger asChild>
                <Button size="sm" disabled={!organizationId}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />New key
                </Button>
              </DialogTrigger>
            )}
            <DialogContent>
              {revealed ? (
                <>
                  <DialogHeader>
                    <DialogTitle>{revealedTitle}</DialogTitle>
                    <DialogDescription>
                      This is the only time you'll see it. Store it somewhere safe.
                    </DialogDescription>
                  </DialogHeader>
                  <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Treat this like a password</AlertTitle>
                    <AlertDescription>
                      Anyone with this secret can call your workspace API with the scopes you granted.
                      Make sure nobody can see your screen before revealing it.
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-control border border-border bg-muted/50 p-3 font-mono text-xs break-all">
                    {secretVisible ? revealed : "•".repeat(Math.min(revealed.length, 48))}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => (secretVisible ? setSecretVisible(false) : setConfirmReveal(true))}
                    >
                      {secretVisible
                        ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide</>
                        : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Reveal</>}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(revealed);
                        setCopied(true);
                        toast.success("Copied", { description: "Store the key in your secret manager now." });
                      }}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                    </Button>
                    <Button onClick={() => (copied ? setDialogOpen(false) : setConfirmClose(true))}>Done</Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Create API key</DialogTitle>
                    <DialogDescription>Scoped keys for server-to-server access.</DialogDescription>
                  </DialogHeader>
                  <ScrollArea type="hover" viewportClassName="max-h-[65vh] [&>div]:!block">
                    <div className="space-y-3 pr-1">
                      {createError && (
                        <Alert variant="destructive" role="alert">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>{createError.title}</AlertTitle>
                          <AlertDescription className="break-words">{createError.detail}</AlertDescription>
                        </Alert>
                      )}
                      <div>
                        <Label htmlFor="key-name">Name</Label>
                        <Input
                          id="key-name"
                          value={name}
                          onChange={(e) => { setName(e.target.value); if (createError?.field === "name") setCreateError(null); }}
                          placeholder="Production server"
                          aria-invalid={createError?.field === "name"}
                          aria-describedby={createError?.field === "name" ? "key-name-error" : undefined}
                          className={createError?.field === "name" ? "border-destructive focus-visible:ring-destructive" : undefined}
                        />
                        {createError?.field === "name" && (
                          <p id="key-name-error" className="mt-1 text-xs text-destructive">{createError.detail}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="key-desc">Description — optional</Label>
                        <Textarea
                          id="key-desc"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="What this key is used for, and who owns it."
                          rows={2}
                        />
                      </div>
                      <ScopePicker
                        scopes={scopes}
                        setScopes={setScopes}
                        onChange={() => setCreateError((e) => (e?.field === "scopes" ? null : e))}
                        error={createError?.field === "scopes" ? createError.detail : null}
                      />
                      <div>
                        <Label htmlFor="key-exp">Expires in (days) — optional</Label>
                        <Input
                          id="key-exp"
                          type="number"
                          min={1}
                          max={3650}
                          value={expiresInDays}
                          onChange={(e) => { setExpiresInDays(e.target.value); if (createError?.field === "expiresInDays") setCreateError(null); }}
                          placeholder="Leave empty for no expiry"
                          aria-invalid={createError?.field === "expiresInDays"}
                          aria-describedby={createError?.field === "expiresInDays" ? "key-exp-error" : undefined}
                          className={createError?.field === "expiresInDays" ? "border-destructive focus-visible:ring-destructive" : undefined}
                        />
                        {createError?.field === "expiresInDays" && (
                          <p id="key-exp-error" className="mt-1 text-xs text-destructive">{createError.detail}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="key-ips">IP allowlist — optional</Label>
                        <Textarea
                          id="key-ips"
                          value={ipAllowlist}
                          onChange={(e) => setIpAllowlist(e.target.value)}
                          placeholder="One IP or CIDR per line. Leave empty to allow all."
                          rows={2}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  </ScrollArea>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={busy}>{busy ? "Creating" : "Create key"}</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
          </div>
        </CardHeader>

        <div className="flex flex-col sm:flex-row gap-2 px-6 pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, description, prefix or scope"
              className="pl-8"
              aria-label="Search API keys"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keysQ.isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Loading
                </TableCell></TableRow>
              )}
              {keysQ.isError && (
                <TableRow><TableCell colSpan={7} className="text-center text-destructive py-10">
                  {(keysQ.error as Error).message}
                </TableCell></TableRow>
              )}
              {!keysQ.isLoading && !keysQ.isError && allKeys.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No API keys yet. Create your first key to start integrating.
                </TableCell></TableRow>
              )}
              {!keysQ.isLoading && !keysQ.isError && allKeys.length > 0 && keys.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No keys match your search or filter.
                </TableCell></TableRow>
              )}
              {keys.map((k: any) => {
                const revoked = !!k.revoked_at;
                const expired = k.expires_at && new Date(k.expires_at) < new Date();
                return (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">
                      {k.name}
                      {k.description && (
                        <span className="block text-[11px] font-normal text-muted-foreground max-w-[16rem] truncate">
                          {k.description}
                        </span>
                      )}
                      {k.rotated_from && (
                        <span className="block text-[11px] text-muted-foreground">Rotated key</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{k.prefix}</TableCell>
                    <TableCell className="text-xs max-w-xs">{(k.scopes ?? []).join(", ") || <span className="text-muted-foreground">full access</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</TableCell>
                    <TableCell className="text-xs">{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : <span className="text-muted-foreground">Never</span>}</TableCell>
                    <TableCell>
                      {revoked ? <Badge variant="destructive">Revoked</Badge>
                        : expired ? <Badge variant="secondary">Expired</Badge>
                        : <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {revoked ? (
                          <span className="text-[11px] text-muted-foreground">
                            Revoked {new Date(k.revoked_at).toLocaleDateString()}
                          </span>
                        ) : (
                          isAuthorized && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(k)}
                                aria-label={`Edit ${k.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5 " />Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setRowError(null); setConfirmRotateKey(k); }}
                                disabled={rotatingId === k.id}
                                aria-label={`Rotate ${k.name}`}
                              >
                                {rotatingId === k.id
                                  ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                  : <RefreshCw className="w-3.5 h-3.5 " />}
                                {rotatingId === k.id ? "Rotating" : "Rotate"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => requestRevoke(k)}
                                disabled={revokingId === k.id}
                                aria-label={`Revoke ${k.name}`}
                              >
                                {revokingId === k.id
                                  ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                  : <Ban className="w-3.5 h-3.5 " />}
                                {revokingId === k.id ? "Revoking" : "Revoke"}
                              </Button>
                            </div>
                          )
                        )}
                        {rowError?.id === k.id && (
                          <p role="alert" className="text-[11px] text-destructive text-right max-w-[16rem] break-words">
                            {rowError!.info.title}: {rowError!.info.detail}
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit an existing key */}
      <Dialog open={!!editKey} onOpenChange={(o) => { if (!o && !savingEdit) setEditKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit “{editKey?.name}”</DialogTitle>
            <DialogDescription>
              Changes apply immediately to every request made with{" "}
              <span className="font-mono">{editKey?.prefix}</span>. The secret itself never changes —
              use Rotate for that.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea type="hover" viewportClassName="max-h-[60vh] [&>div]:!block">
            <div className="space-y-3 pr-1">
              {editError && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{editError.title}</AlertTitle>
                  <AlertDescription className="break-words">{editError.detail}</AlertDescription>
                </Alert>
              )}
              <div className="rounded border border-border p-3 text-[11px] text-muted-foreground grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div><span className="block text-foreground font-medium">{statsQ.data?.total ?? "—"}</span>Requests (7d)</div>
                <div><span className="block text-foreground font-medium">{statsQ.data?.errors ?? "—"}</span>Errors</div>
                <div><span className="block text-foreground font-medium">{statsQ.data ? `${statsQ.data.avgLatencyMs}ms` : "—"}</span>Avg latency</div>
                <div><span className="block text-foreground font-medium">{statsQ.data ? `${statsQ.data.p95LatencyMs}ms` : "—"}</span>p95 latency</div>
              </div>
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); if (editError?.field === "name") setEditError(null); }}
                  aria-invalid={editError?.field === "name"}
                  className={editError?.field === "name" ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
              </div>
              <div>
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <ScopePicker
                scopes={editScopes}
                setScopes={setEditScopes}
                onChange={() => setEditError((e) => (e?.field === "scopes" ? null : e))}
                error={editError?.field === "scopes" ? editError.detail : null}
              />
              <div>
                <Label htmlFor="edit-exp">Expiry</Label>
                <Input
                  id="edit-exp"
                  type="number"
                  min={0}
                  max={3650}
                  value={editExpiry}
                  onChange={(e) => { setEditExpiry(e.target.value); if (editError?.field === "expiresInDays") setEditError(null); }}
                  placeholder={
                    editKey?.expires_at
                      ? `Currently ${new Date(editKey.expires_at).toLocaleDateString()} — days from now, 0 to remove`
                      : "No expiry — enter days from now to add one"
                  }
                  aria-invalid={editError?.field === "expiresInDays"}
                  className={editError?.field === "expiresInDays" ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Leave empty to keep the current expiry, enter days from now to reset it, or 0 to remove it.
                </p>
              </div>
              <div>
                <Label htmlFor="edit-ips">IP allowlist</Label>
                <Textarea
                  id="edit-ips"
                  value={editIps}
                  onChange={(e) => setEditIps(e.target.value)}
                  placeholder="One IP or CIDR per line. Leave empty to allow all."
                  rows={2}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditKey(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm revealing the plaintext secret */}
      <AlertDialog open={confirmReveal} onOpenChange={setConfirmReveal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Show the secret in plain text?</AlertDialogTitle>
            <AlertDialogDescription>
              The full key will be visible on screen and could be captured by screen shares,
              recordings or anyone nearby. Only reveal it when you're ready to copy it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setSecretVisible(true)}>Reveal key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Warn before closing without copying the one-time secret */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close without copying the key?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't copied this secret yet. It is shown only once — if you close now you'll
              have to revoke this key and create a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                setDialogOpen(false);
                setRevealed(null);
                setSecretVisible(false);
                setCopied(false);
                setCreateError(null);
              }}
            >
              Close anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm rotating a key */}
      <AlertDialog
        open={!!confirmRotateKey}
        onOpenChange={(o) => { if (!o && !rotatingId) setConfirmRotateKey(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate “{confirmRotateKey?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A new secret is issued with the same name, scopes and expiry, and the current key{" "}
              <span className="font-mono">{confirmRotateKey?.prefix}</span> is revoked immediately.
              Anything still using the old secret will start failing with 401 until you deploy the new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!rotatingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRotate(confirmRotateKey); }}
              disabled={!!rotatingId}
            >
              {rotatingId ? "Rotating" : "Rotate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm revoking a key */}
      <AlertDialog
        open={!!confirmRevokeKey}
        onOpenChange={(o) => { if (!o && !revokingId) setConfirmRevokeKey(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{confirmRevokeKey?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Every integration using{" "}
              <span className="font-mono">{confirmRevokeKey?.prefix}</span> will start failing with
              401 immediately
              {confirmRevokeKey?.last_used_at
                ? `. It was last used ${new Date(confirmRevokeKey.last_used_at).toLocaleString()}.`
                : ". It has never been used."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!revokingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRevoke(confirmRevokeKey); }}
              disabled={!!revokingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokingId ? "Revoking" : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
