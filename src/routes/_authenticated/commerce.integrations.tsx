import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { useTenantAccent, accentTint } from "@/lib/themes/tenant-accent";
import {
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Plug,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShoppingBag,
  Receipt,
} from "lucide-react";
import {
  useEcommerceConnections,
  useSaveEcommerceConnection,
  useDeleteEcommerceConnection,
  useEcommerceSyncLogs,
  validateConnection,
  type EcommerceConnection,
  type EcommercePlatform,
  type ConnectionInput,
} from "@/hooks/use-ecommerce-connections";
import {
  testStoreConnection,
  syncStoreProducts,
  fetchStoreOrders,
} from "@/lib/ecommerce/store-sync.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/commerce/integrations")({
  component: StoreIntegrations,
  staticData: { breadcrumb: "Store Integrations" },
  head: () => ({
    meta: [
      { title: "Store Integrations · Commerce" },
      {
        name: "description",
        content:
          "Connect Shopify, WooCommerce and WordPress stores to sync products, orders and customers into your CRM.",
      },
      { property: "og:title", content: "Store Integrations · Commerce" },
      {
        property: "og:description",
        content:
          "Connect Shopify, WooCommerce and WordPress stores to sync products and orders into your CRM.",
      },
    ],
  }),
});

const PLATFORMS: { value: EcommercePlatform; label: string; hint: string }[] = [
  { value: "shopify", label: "Shopify", hint: "https://your-store.myshopify.com" },
  { value: "woocommerce", label: "WooCommerce", hint: "https://your-store.com" },
  { value: "wordpress", label: "WordPress", hint: "https://your-site.com" },
  { value: "custom", label: "Custom REST API", hint: "https://api.your-store.com" },
];

const emptyForm: ConnectionInput = {
  platform: "shopify",
  name: "",
  store_url: "",
  credentials: {},
  sync_settings: { products: true, orders: true, customers: false },
};

function StatusBadge({ status }: { status: EcommerceConnection["status"] }) {
  const map = {
    connected: {
      cls: "bg-emerald-500/15 text-emerald-600",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Connected",
    },
    disconnected: {
      cls: "bg-muted text-muted-foreground",
      icon: <Plug className="h-3 w-3" />,
      label: "Not connected",
    },
    error: {
      cls: "bg-destructive/15 text-destructive",
      icon: <AlertTriangle className="h-3 w-3" />,
      label: "Error",
    },
    syncing: {
      cls: "bg-primary/10 text-primary",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Syncing",
    },
  }[status];
  return (
    <Badge variant="outline" className={`gap-1 ${map.cls}`}>
      {map.icon}
      {map.label}
    </Badge>
  );
}

function StoreIntegrations() {
  const { active: workspace } = useCurrentWorkspace();
  const zonedDate = useZonedDateFormatter();
  const { data: connections = [], isLoading } = useEcommerceConnections();
  const save = useSaveEcommerceConnection();
  const remove = useDeleteEcommerceConnection();

  const test = useServerFn(testStoreConnection);
  const syncProducts = useServerFn(syncStoreProducts);
  const getOrders = useServerFn(fetchStoreOrders);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EcommerceConnection | null>(null);
  const [form, setForm] = useState<ConnectionInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<EcommerceConnection | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<{ connection: string; rows: any[] } | null>(null);
  const { data: logs = [] } = useEcommerceSyncLogs(logsFor);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  };
  const openEdit = (c: EcommerceConnection) => {
    setEditing(c);
    setForm({
      id: c.id,
      platform: c.platform,
      name: c.name,
      store_url: c.store_url,
      credentials: c.credentials ?? {},
      sync_settings: c.sync_settings ?? {},
    });
    setErrors({});
    setOpen(true);
  };

  const setCred = (key: string, value: string) =>
    setForm((f) => ({ ...f, credentials: { ...f.credentials, [key]: value } }));

  const submit = async () => {
    const errs = validateConnection(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await save.mutateAsync(form);
      toast.success(editing ? "Store updated" : "Store connected");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save store");
    }
  };

  const runTest = useMutation({
    mutationFn: (c: EcommerceConnection) =>
      test({ data: { connectionId: c.id, workspaceId: workspace!.id } }),
  });
  const runSync = useMutation({
    mutationFn: (c: EcommerceConnection) =>
      syncProducts({ data: { connectionId: c.id, workspaceId: workspace!.id } }),
  });

  const handleTest = async (c: EcommerceConnection) => {
    setBusyId(c.id);
    try {
      const res = await runTest.mutateAsync(c);
      res.ok ? toast.success(res.message) : toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleSync = async (c: EcommerceConnection) => {
    setBusyId(c.id);
    try {
      const res = await runSync.mutateAsync(c);
      if (res.ok)
        toast.success(
          `Imported ${res.processed} of ${res.fetched} products${res.failed ? `, ${res.failed} failed` : ""}`,
          { description: `${res.pages} page${res.pages === 1 ? "" : "s"} fetched from the store.` },
        );
      else toast.error(res.message ?? "Sync failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleOrders = async (c: EcommerceConnection) => {
    setBusyId(c.id);
    try {
      const res = await getOrders({ data: { connectionId: c.id, workspaceId: workspace!.id } });
      if (res.ok) {
        setOrders({ connection: c.name, rows: res.orders });
        toast.success(`Fetched ${res.orders.length} orders`);
      } else toast.error(res.message ?? "Failed to fetch orders");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to fetch orders");
    } finally {
      setBusyId(null);
    }
  };

  const { accent } = useTenantAccent();
  const platformHint = PLATFORMS.find((p) => p.value === form.platform)?.hint ?? "";

  return (
    <>
      <AppTopbar
        title="Store Integrations"
        subtitle="Connect Shopify, WooCommerce or WordPress and sync your catalog and orders into the CRM."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Connect store
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading ? (
          <Card className="p-10 text-center text-muted-foreground">Loading stores</Card>
        ) : connections.length === 0 ? (
          <Card className="p-10 text-center space-y-3">
            <ShoppingBag className="h-8 w-8 mx-auto" style={{ color: accent }} />
            <p className="font-medium">No stores connected yet</p>
            <p className="text-sm text-muted-foreground">
              Connect your first online store to pull products, orders and customers.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Connect store
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {connections.map((c) => (
              <Card
                key={c.id}
                className="p-4 space-y-3 border-t-2"
                style={{ borderTopColor: accent }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <a
                      href={c.store_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:underline break-all"
                    >
                      {c.store_url}
                    </a>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="capitalize">
                    {c.platform}
                  </Badge>
                  <span>{c.products_synced} products</span>
                  {c.last_sync_at && (
                    <span>
                      · synced{" "}
                      {zonedDate(c.last_sync_at, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  )}
                </div>
                {c.last_error && (
                  <p className="text-xs text-destructive break-words">{c.last_error}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => handleTest(c)}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Plug className="h-3.5 w-3.5 " />
                    )}
                    Test
                  </Button>
                  <Button size="sm" disabled={busyId === c.id} onClick={() => handleSync(c)}>
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1 ${busyId === c.id ? "animate-spin" : ""}`}
                    />
                    Sync products
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => handleOrders(c)}
                  >
                    <Receipt className="h-3.5 w-3.5 " />
                    Orders
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLogsFor(logsFor === c.id ? undefined : c.id)}
                  >
                    History
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setConfirmDelete(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {logsFor === c.id && (
                  <div className="border-t pt-2 space-y-1 max-h-48 overflow-auto">
                    {logs.length === 0 && (
                      <p className="text-xs text-muted-foreground">No sync history yet.</p>
                    )}
                    {logs.map((l) => (
                      <div key={l.id} className="text-xs flex items-center justify-between gap-2">
                        <span className="truncate">
                          {l.resource} · {l.message ?? l.status}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {zonedDate(l.started_at, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {orders && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Recent orders · {orders.connection}</h2>
              <Button size="sm" variant="ghost" onClick={() => setOrders(null)}>
                Close
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left p-2">Order</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.rows.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-2">#{o.number}</td>
                      <td className="p-2">{o.customer}</td>
                      <td className="p-2 capitalize">{o.status}</td>
                      <td className="p-2 text-right">
                        {o.total} {o.currency}
                      </td>
                    </tr>
                  ))}
                  {orders.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        No orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!save.isPending) setOpen(v);
        }}
      >
        <DialogContent
          className="max-w-lg"
          onInteractOutside={(e) => {
            if (save.isPending) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (save.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit store connection" : "Connect a store"}</DialogTitle>
            <DialogDescription>
              Credentials are stored securely and only used server-side.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select
                value={form.platform}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, platform: v as EcommercePlatform, credentials: {} }))
                }
                disabled={save.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Store name</Label>
              <Input
                value={form.name}
                disabled={save.isPending}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Shop"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Store URL</Label>
              <Input
                value={form.store_url}
                disabled={save.isPending}
                onChange={(e) => setForm((f) => ({ ...f, store_url: e.target.value }))}
                placeholder={platformHint}
              />
              {errors.store_url && <p className="text-xs text-destructive">{errors.store_url}</p>}
            </div>

            {form.platform === "shopify" && (
              <div className="space-y-1.5">
                <Label>Admin API access token</Label>
                <Input
                  type="password"
                  value={form.credentials.access_token ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setCred("access_token", e.target.value)}
                  placeholder="shpat_"
                />
                {errors.access_token && (
                  <p className="text-xs text-destructive">{errors.access_token}</p>
                )}
              </div>
            )}
            {form.platform === "woocommerce" && (
              <>
                <div className="space-y-1.5">
                  <Label>Consumer key</Label>
                  <Input
                    value={form.credentials.consumer_key ?? ""}
                    disabled={save.isPending}
                    onChange={(e) => setCred("consumer_key", e.target.value)}
                    placeholder="ck_"
                  />
                  {errors.consumer_key && (
                    <p className="text-xs text-destructive">{errors.consumer_key}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Consumer secret</Label>
                  <Input
                    type="password"
                    value={form.credentials.consumer_secret ?? ""}
                    disabled={save.isPending}
                    onChange={(e) => setCred("consumer_secret", e.target.value)}
                    placeholder="cs_"
                  />
                  {errors.consumer_secret && (
                    <p className="text-xs text-destructive">{errors.consumer_secret}</p>
                  )}
                </div>
              </>
            )}
            {form.platform === "wordpress" && (
              <>
                <div className="space-y-1.5">
                  <Label>WordPress username</Label>
                  <Input
                    value={form.credentials.username ?? ""}
                    disabled={save.isPending}
                    onChange={(e) => setCred("username", e.target.value)}
                  />
                  {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Application password</Label>
                  <Input
                    type="password"
                    value={form.credentials.app_password ?? ""}
                    disabled={save.isPending}
                    onChange={(e) => setCred("app_password", e.target.value)}
                  />
                  {errors.app_password && (
                    <p className="text-xs text-destructive">{errors.app_password}</p>
                  )}
                </div>
              </>
            )}
            {form.platform === "custom" && (
              <div className="space-y-1.5">
                <Label>API key (optional)</Label>
                <Input
                  type="password"
                  value={form.credentials.api_key ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setCred("api_key", e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2 pt-1">
              <Label className="text-xs uppercase text-muted-foreground">Sync</Label>
              {(["products", "orders", "customers"] as const).map((key) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{key}</span>
                  <Switch
                    checked={!!form.sync_settings?.[key]}
                    disabled={save.isPending}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, sync_settings: { ...f.sync_settings, [key]: v } }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save changes" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Remove store connection?"
        description={`${confirmDelete?.name ?? ""} will be disconnected. Imported products stay in your catalog.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Store disconnected");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to remove store");
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </>
  );
}
