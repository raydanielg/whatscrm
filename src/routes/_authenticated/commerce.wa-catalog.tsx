import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  RefreshCw,
  Package,
  ShoppingBag,
  Share2,
  Sparkles,
  Search,
  Star,
  Trash2,
  Plus,
  Send,
  AlertCircle,
  RotateCw,
  Download,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import {
  getCatalogConfig,
  saveCatalogConfig,
  runCatalogSync,
  listSyncLogs,
  previewCatalog,
  listCollections,
  upsertCollection,
  deleteCollection,
  sendCatalogMessage,
  getCatalogAnalytics,
  getRecommendations,
  listCatalogPhoneNumbers,
  importFromMetaCatalog,
} from "@/lib/commerce/wa-catalog.functions";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/commerce/wa-catalog")({
  component: WaCatalogPage,
  staticData: { breadcrumb: "WhatsApp Catalog" },
  head: () => ({
    meta: [
      { title: "WhatsApp Catalog" },
      {
        name: "description",
        content: "Sync your product catalog with WhatsApp: collections, sharing, analytics.",
      },
    ],
  }),
});

function WaCatalogPage() {
  const brandName = useBrandName();
  const tenantCurrency = useTenantCurrency();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const zonedDate = useZonedDateFormatter();
  const qc = useQueryClient();

  const fnConfig = useServerFn(getCatalogConfig);
  const fnSave = useServerFn(saveCatalogConfig);
  const fnSync = useServerFn(runCatalogSync);
  const fnLogs = useServerFn(listSyncLogs);
  const fnPreview = useServerFn(previewCatalog);
  const fnCols = useServerFn(listCollections);
  const fnUpsertCol = useServerFn(upsertCollection);
  const fnDelCol = useServerFn(deleteCollection);
  const fnSend = useServerFn(sendCatalogMessage);
  const fnAnalytics = useServerFn(getCatalogAnalytics);
  const fnRecs = useServerFn(getRecommendations);
  const fnNumbers = useServerFn(listCatalogPhoneNumbers);

  const cfgQ = useQuery({
    queryKey: ["wa-cat-cfg", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fnConfig({ data: { workspaceId: workspaceId! } }),
  });
  const logsQ = useQuery({
    queryKey: ["wa-cat-logs", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fnLogs({ data: { workspaceId: workspaceId! } }),
  });
  const [search, setSearch] = useState("");
  const previewQ = useQuery({
    queryKey: ["wa-cat-preview", workspaceId, search],
    enabled: !!workspaceId,
    queryFn: () => fnPreview({ data: { workspaceId: workspaceId!, search: search || undefined } }),
  });
  const colsQ = useQuery({
    queryKey: ["wa-cat-cols", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fnCols({ data: { workspaceId: workspaceId! } }),
  });
  const analyticsQ = useQuery({
    queryKey: ["wa-cat-analytics", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fnAnalytics({ data: { workspaceId: workspaceId!, days: 30 } }),
  });
  const recsQ = useQuery({
    queryKey: ["wa-cat-recs", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fnRecs({ data: { workspaceId: workspaceId!, limit: 6 } }),
  });
  const numbersQ = useQuery({
    queryKey: ["wa-cat-numbers", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fnNumbers({ data: { workspaceId: workspaceId! } }),
  });

  const saveM = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      fnSave({ data: { workspaceId: workspaceId!, ...patch } as any }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["wa-cat-cfg"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });
  const syncM = useMutation({
    mutationFn: (args: {
      kind: "full" | "products" | "inventory" | "prices" | "images" | "categories";
      productIds?: string[];
    }) =>
      fnSync({
        data: { workspaceId: workspaceId!, kind: args.kind, productIds: args.productIds } as any,
      }),
    onSuccess: (r: any) => {
      if (!r.canPush) {
        toast.error(`Catalog not synced: ${r.reason}`);
      } else if (r.failed > 0) {
        toast.error(
          `${r.failed} of ${r.total} products did not sync: ${r.error ?? "unknown error"}`,
        );
      } else {
        toast.success(`Synced ${r.succeeded}/${r.total} products to WhatsApp`);
      }
      qc.invalidateQueries({ queryKey: ["wa-cat-logs"] });
      qc.invalidateQueries({ queryKey: ["wa-cat-preview"] });
      qc.invalidateQueries({ queryKey: ["wa-cat-cfg"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const fnImport = useServerFn(importFromMetaCatalog);
  const importM = useMutation({
    mutationFn: () => fnImport({ data: { workspaceId: workspaceId! } }),
    onSuccess: (r) => {
      if (r.error && !r.imported) {
        toast.error(`Import from Meta failed: ${r.error}`);
      } else if (r.failed > 0) {
        toast.error(`Imported ${r.imported}, ${r.failed} failed: ${r.error ?? "unknown error"}`);
      } else if (r.imported === 0) {
        toast.success(`Already up to date — all ${r.total} Meta items are in ${brandName}`);
      } else {
        toast.success(`Imported ${r.imported} new product(s) from Meta`);
      }
      qc.invalidateQueries({ queryKey: ["wa-cat-logs"] });
      qc.invalidateQueries({ queryKey: ["wa-cat-preview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Import from Meta failed"),
  });

  const cfg = cfgQ.data ?? null;

  // "Connected" only once Meta has accepted a push. Older rows could hold "ok"
  // from local-only syncs, so the latest pushed sync must also have succeeded.
  const lastPush = ((logsQ.data ?? []) as any[]).find((l) => l?.details?.canPush === true);
  const catalogStatus: { label: string; healthy: boolean } = !cfg?.catalog_id
    ? { label: "Not linked", healthy: false }
    : cfg.last_sync_status === "ok" && lastPush?.status === "success"
      ? { label: "Connected", healthy: true }
      : cfg.last_sync_status === "not_configured"
        ? { label: "Not configured", healthy: false }
        : cfg.last_sync_status === "error" || cfg.last_sync_status === "partial"
          ? { label: "Sync failed", healthy: false }
          : { label: "Not verified", healthy: false };

  return (
    <div className="flex-1 flex flex-col">
      <AppTopbar
        title="WhatsApp Catalog"
        subtitle="Keep products, prices, inventory, and imagery in sync with your WhatsApp catalog."
        actions={
          <ActionBar
            primary={[
              <Button
                key="full-sync"
                size="sm"
                onClick={() => syncM.mutate({ kind: "full" })}
                disabled={syncM.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Full sync
              </Button>,
              <Button
                key="import-meta"
                variant="outline"
                size="sm"
                onClick={() => importM.mutate()}
                disabled={importM.isPending || syncM.isPending}
                title="Add products that exist only in Meta Commerce Manager"
              >
                <Download className="h-4 w-4 mr-2" />
                {importM.isPending ? "Importing" : "Import from Meta"}
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem key="csv-import" asChild>
                <Link to="/commerce/import">
                  <Package className="h-4 w-4 mr-2" /> CSV import
                </Link>
              </DropdownMenuItem>,
              <DropdownMenuItem
                key="inventory"
                disabled={syncM.isPending}
                onClick={() => syncM.mutate({ kind: "inventory" })}
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Inventory
              </DropdownMenuItem>,
              <DropdownMenuItem
                key="prices"
                disabled={syncM.isPending}
                onClick={() => syncM.mutate({ kind: "prices" })}
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Prices
              </DropdownMenuItem>,
            ]}
          />
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            label="Products"
            value={previewQ.data?.length ?? 0}
            icon={<Package className="h-4 w-4" />}
          />
          <StatCard
            label="Collections"
            value={colsQ.data?.length ?? 0}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <StatCard
            label="Last sync"
            value={
              cfg?.last_full_sync_at
                ? zonedDate(cfg.last_full_sync_at, { dateStyle: "short" })
                : "—"
            }
            icon={<RefreshCw className="h-4 w-4" />}
          />
          <StatCard
            label="Catalog status"
            value={
              <span className={catalogStatus.healthy ? undefined : "text-destructive"}>
                {catalogStatus.label}
              </span>
            }
            icon={<ShoppingBag className="h-4 w-4" />}
          />
        </div>

        {cfg?.catalog_id && !catalogStatus.healthy && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {catalogStatus.label === "Not verified"
                ? "Catalog not verified yet"
                : "Products are not reaching WhatsApp"}
            </AlertTitle>
            <AlertDescription>
              {cfg.last_sync_error ??
                "No sync has published to Meta yet. Run a Full sync to check the connection."}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* PREVIEW + SEARCH */}
          <TabsContent value="preview" className="space-y-4">
            <PreviewPanel
              products={previewQ.data ?? []}
              loading={previewQ.isLoading}
              search={search}
              setSearch={setSearch}
              currency={cfg?.currency ?? tenantCurrency}
              onSyncOne={(id: string) => syncM.mutate({ kind: "products", productIds: [id] })}
              onRetryErrors={(ids: string[]) => syncM.mutate({ kind: "products", productIds: ids })}
              syncing={syncM.isPending}
            />
          </TabsContent>

          {/* COLLECTIONS */}
          <TabsContent value="collections" className="space-y-4">
            <CollectionsPanel
              collections={colsQ.data ?? []}
              products={previewQ.data ?? []}
              onSave={async (v) => {
                await fnUpsertCol({ data: { workspaceId: workspaceId!, ...v } });
                toast.success("Collection saved");
                qc.invalidateQueries({ queryKey: ["wa-cat-cols"] });
              }}
              onDelete={async (id) => {
                await fnDelCol({ data: { id, workspaceId: workspaceId! } });
                toast.success("Collection deleted");
                qc.invalidateQueries({ queryKey: ["wa-cat-cols"] });
              }}
            />
          </TabsContent>

          {/* SHARE */}
          <TabsContent value="share" className="space-y-4">
            <SharePanel
              products={previewQ.data ?? []}
              collections={colsQ.data ?? []}
              onSend={async (payload) => {
                const r = await fnSend({ data: { workspaceId: workspaceId!, ...payload } });
                if ((r as any).ok) toast.success("Sent via WhatsApp");
                else toast.warning((r as any).reason ?? "Message staged");
              }}
            />
            <RecommendationsPanel recs={recsQ.data ?? []} />
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics" className="space-y-4">
            <AnalyticsPanel data={analyticsQ.data} logs={logsQ.data ?? []} />
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4">
            <SettingsPanel
              key={cfg?.updated_at ?? "new"}
              cfg={cfg}
              numbers={numbersQ.data ?? []}
              onSave={(patch) => saveM.mutate(patch)}
              saving={saveM.isPending}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

/** Top-level Google product categories, which Meta catalogs understand. */
const CATALOG_CATEGORY_SUGGESTIONS = [
  "Apparel & Accessories",
  "Apparel & Accessories > Clothing",
  "Apparel & Accessories > Shoes",
  "Apparel & Accessories > Jewelry",
  "Electronics",
  "Electronics > Audio > Headphones",
  "Electronics > Communications > Telephony > Mobile Phones",
  "Electronics > Computers",
  "Home & Garden",
  "Home & Garden > Kitchen & Dining > Kitchen Appliances",
  "Home & Garden > Decor",
  "Health & Beauty",
  "Health & Beauty > Personal Care > Cosmetics",
  "Food, Beverages & Tobacco > Food Items",
  "Food, Beverages & Tobacco > Beverages",
  "Baby & Toddler",
  "Toys & Games",
  "Sporting Goods",
  "Luggage & Bags",
  "Furniture",
  "Office Supplies",
  "Media > Books",
  "Arts & Entertainment",
  "Hardware",
  "Vehicles & Parts",
  "Animals & Pet Supplies",
  "Software",
];

const CUSTOM_CATEGORY = "__custom__";

/**
 * A visible dropdown of Meta-friendly categories. A browser datalist only
 * appears once the field is focused, so it read as an empty text box. A value
 * outside the list keeps the field in custom mode.
 */
function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(
    () => !!value && !CATALOG_CATEGORY_SUGGESTIONS.includes(value),
  );
  return (
    <div className="space-y-1">
      <Label htmlFor="wa-cat-default-category">Default category</Label>
      <Select
        value={custom ? CUSTOM_CATEGORY : value || undefined}
        onValueChange={(v) => {
          if (v === CUSTOM_CATEGORY) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(v);
        }}
      >
        <SelectTrigger id="wa-cat-default-category">
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {CATALOG_CATEGORY_SUGGESTIONS.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_CATEGORY}>Other (type your own)</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          autoFocus
          placeholder="Type a category"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Used when a product has no category of its own.
      </p>
    </div>
  );
}

type CatalogNumber = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  phone_number_id: string;
  waba_id: string | null;
  business_id: string | null;
  status: string | null;
  is_default: boolean | null;
};

function SettingsPanel({
  cfg,
  numbers,
  onSave,
  saving,
}: {
  cfg: any;
  numbers: CatalogNumber[];
  onSave: (p: any) => void;
  saving: boolean;
}) {
  const tenantCurrency = useTenantCurrency();
  const [form, setForm] = useState({
    catalog_id: cfg?.catalog_id ?? "",
    business_id: cfg?.business_id ?? "",
    phone_number_id: cfg?.phone_number_id ?? "",
    currency: cfg?.currency ?? tenantCurrency,
    default_category: cfg?.default_category ?? "",
    auto_sync: cfg?.auto_sync ?? false,
    sync_images: cfg?.sync_images ?? true,
    sync_inventory: cfg?.sync_inventory ?? true,
    sync_prices: cfg?.sync_prices ?? true,
  });
  return (
    <Card className="p-6 space-y-4 max-w-2xl">
      <div>
        <h3 className="font-medium">Meta Cloud API</h3>
        <p className="text-sm text-muted-foreground">
          Provide your WhatsApp Business Catalog credentials.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Catalog ID"
          v={form.catalog_id}
          on={(v) => setForm((s) => ({ ...s, catalog_id: v }))}
        />
        <Field
          label="Business ID"
          v={form.business_id}
          on={(v) => setForm((s) => ({ ...s, business_id: v }))}
        />
        <PhoneNumberPicker
          numbers={numbers}
          value={form.phone_number_id}
          onChange={(n) =>
            setForm((s) => ({
              ...s,
              phone_number_id: n.phone_number_id,
              // A Meta Business ID is numeric; only adopt the account's value when it is one.
              business_id: /^\d+$/.test(n.business_id ?? "") ? n.business_id! : s.business_id,
            }))
          }
        />
        <Field
          label="Currency"
          v={form.currency}
          on={(v) => setForm((s) => ({ ...s, currency: v.toUpperCase() }))}
        />
        <CategoryPicker
          value={form.default_category}
          onChange={(v) => setForm((s) => ({ ...s, default_category: v }))}
        />
      </div>
      <Separator />
      <div className="space-y-3">
        <Toggle
          label="Auto sync product changes"
          v={form.auto_sync}
          on={(v) => setForm((s) => ({ ...s, auto_sync: v }))}
        />
        <Toggle
          label="Sync images"
          v={form.sync_images}
          on={(v) => setForm((s) => ({ ...s, sync_images: v }))}
        />
        <Toggle
          label="Sync inventory"
          v={form.sync_inventory}
          on={(v) => setForm((s) => ({ ...s, sync_inventory: v }))}
        />
        <Toggle
          label="Sync prices"
          v={form.sync_prices}
          on={(v) => setForm((s) => ({ ...s, sync_prices: v }))}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(form)} disabled={saving}>
          Save settings
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sync uses the access token secret of the selected WhatsApp number. That token needs the
        catalog_management permission and access to this catalog in Business Settings.
      </p>
    </Card>
  );
}

function PhoneNumberPicker({
  numbers,
  value,
  onChange,
}: {
  numbers: CatalogNumber[];
  value: string;
  onChange: (n: CatalogNumber) => void;
}) {
  const known = numbers.some((n) => n.phone_number_id === value);
  const label = (n: CatalogNumber) =>
    [n.display_name || n.phone_number || n.phone_number_id, n.waba_id ? `WABA ${n.waba_id}` : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="space-y-1">
      <Label>WhatsApp number</Label>
      <Select
        value={known ? value : undefined}
        onValueChange={(v) => {
          const n = numbers.find((x) => x.phone_number_id === v);
          if (n) onChange(n);
        }}
        disabled={numbers.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              numbers.length ? "Choose a connected number" : "No connected WhatsApp number"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {numbers.map((n) => (
            <SelectItem key={n.id} value={n.phone_number_id}>
              {label(n)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && !known ? (
        <p className="text-xs text-destructive">
          Saved ID {value} is not a connected number in this workspace. Choose one above.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Must be the number whose WhatsApp account has this catalog connected.
        </p>
      )}
    </div>
  );
}

function Field({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}

function CollectionsPanel({
  collections,
  products,
  onSave,
  onDelete,
}: {
  collections: any[];
  products: any[];
  onSave: (v: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Group products into collections and mark featured sets.
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 mr-2" />
              New collection
            </Button>
          </DialogTrigger>
          <CollectionDialog
            editing={editing}
            products={products}
            onSubmit={async (v) => {
              await onSave(v);
              setOpen(false);
            }}
          />
        </Dialog>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {c.name}
                  {c.is_featured && (
                    <Badge variant="secondary">
                      <Star className="h-3 w-3 " />
                      Featured
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.wa_catalog_collection_items?.length ?? 0} products
                </div>
                {c.description && <p className="text-sm mt-2">{c.description}</p>}
              </div>
              <div className="flex gap-1">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                  </DialogTrigger>
                  <CollectionDialog
                    editing={c}
                    products={products}
                    onSubmit={async (v) => {
                      await onSave(v);
                    }}
                  />
                </Dialog>
                <Button variant="ghost" size="icon" onClick={() => setDeleting(c)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {collections.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground text-center py-12">
            No collections yet.
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete collection?"
        description={
          deleting
            ? `“${deleting.name}” will be removed from your WhatsApp catalog. Products are kept.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const c = deleting;
          setDeleting(null);
          if (c) await onDelete(c.id);
        }}
      />
    </>
  );
}

function CollectionDialog({
  editing,
  products,
  onSubmit,
}: {
  editing: any;
  products: any[];
  onSubmit: (v: any) => Promise<void>;
}) {
  const initial = editing ?? { name: "", description: "", is_featured: false, cover_url: "" };
  const [form, setForm] = useState<any>(initial);
  const [selected, setSelected] = useState<string[]>(
    editing?.wa_catalog_collection_items?.map((i: any) => i.product_id) ?? [],
  );
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit collection" : "New collection"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Name" v={form.name} on={(v) => setForm((s: any) => ({ ...s, name: v }))} />
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => setForm((s: any) => ({ ...s, description: e.target.value }))}
          />
        </div>
        <Field
          label="Cover URL"
          v={form.cover_url ?? ""}
          on={(v) => setForm((s: any) => ({ ...s, cover_url: v }))}
        />
        <Toggle
          label="Featured collection"
          v={!!form.is_featured}
          on={(v) => setForm((s: any) => ({ ...s, is_featured: v }))}
        />
        <div>
          <Label>Products ({selected.length})</Label>
          <div className="max-h-64 overflow-auto border rounded-control mt-1">
            {products.map((p) => {
              const on = selected.includes(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer"
                >
                  <Checkbox
                    id={`catalog-product-${p.id}`}
                    checked={on}
                    onCheckedChange={() => {
                      setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]));
                    }}
                  />
                  <Label
                    htmlFor={`catalog-product-${p.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {p.name}
                  </Label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit({ id: editing?.id, ...form, productIds: selected })}>
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SharePanel({
  products,
  collections,
  onSend,
}: {
  products: any[];
  collections: any[];
  onSend: (p: any) => Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [bodyText, setBodyText] = useState("Check out these products from our catalog:");
  const [header, setHeader] = useState("Featured products");
  const [selected, setSelected] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState<string>("");

  const displayed = useMemo(() => {
    if (!collectionId) return products;
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return products;
    const ids = new Set((col.wa_catalog_collection_items ?? []).map((i: any) => i.product_id));
    return products.filter((p) => ids.has(p.id));
  }, [products, collectionId, collections]);

  return (
    <Card className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Recipient (E.164)" v={to} on={setTo} />
        <Field label="Header" v={header} on={setHeader} />
      </div>
      <div className="space-y-1">
        <Label>Message</Label>
        <Textarea rows={3} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Collection (optional)</Label>
        <select
          className="w-full h-9 rounded-control border bg-background px-2 text-sm"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
        >
          <option value="">All products</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Products ({selected.length} / 30)</Label>
        <div className="max-h-64 overflow-auto border rounded-control mt-1">
          {displayed.map((p) => {
            const on = selected.includes(p.id);
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer"
              >
                <Checkbox
                  id={`share-product-${p.id}`}
                  checked={on}
                  disabled={!on && selected.length >= 30}
                  onCheckedChange={() =>
                    setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))
                  }
                />
                <Label
                  htmlFor={`share-product-${p.id}`}
                  className="text-sm flex-1 font-normal cursor-pointer"
                >
                  {p.name}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {p.sku ?? p.retailer_id ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setSelected([])}>
          Clear
        </Button>
        <Button
          disabled={!to || !selected.length}
          onClick={() =>
            onSend({
              to,
              bodyText,
              header,
              productIds: selected,
              collectionId: collectionId || undefined,
            })
          }
        >
          <Send className="h-4 w-4 mr-2" />
          {selected.length > 1 ? "Send multi-product" : "Send product"}
        </Button>
      </div>
    </Card>
  );
}

function RecommendationsPanel({ recs }: { recs: any[] }) {
  if (!recs.length) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="font-medium">Recommended products</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {recs.map((p) => (
          <div key={p.id} className="text-center">
            <div className="aspect-square bg-muted rounded-control overflow-hidden">
              {p.image_url && (
                <img src={p.image_url} alt={p.name} className="object-cover w-full h-full" />
              )}
            </div>
            <div className="text-xs mt-1 truncate">{p.name}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AnalyticsPanel({ data, logs }: { data: any; logs: any[] }) {
  const zonedDate = useZonedDateFormatter();
  const t = data?.totals ?? {
    views: 0,
    shares: 0,
    clicks: 0,
    add_to_cart: 0,
    orders: 0,
    revenue: 0,
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-6">
        <StatCard label="Views" value={t.views} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Shares" value={t.shares} icon={<Share2 className="h-4 w-4" />} />
        <StatCard label="Clicks" value={t.clicks} icon={<Package className="h-4 w-4" />} />
        <StatCard
          label="Add-to-cart"
          value={t.add_to_cart}
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <StatCard label="Orders" value={t.orders} icon={<ShoppingBag className="h-4 w-4" />} />
        <StatCard
          label="Revenue"
          value={Number(t.revenue).toFixed(2)}
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>
      <Card className="p-4">
        <div className="font-medium mb-3">Top shared products</div>
        <div className="space-y-2">
          {(data?.topProducts ?? []).map((r: any) => (
            <div key={r.product_id} className="flex items-center justify-between text-sm">
              <span className="truncate">{r.product?.name ?? r.product_id}</span>
              <span className="text-muted-foreground">
                {r.shares} shares · {r.orders} orders · {Number(r.revenue).toFixed(2)}
              </span>
            </div>
          ))}
          {!data?.topProducts?.length && (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <div className="font-medium mb-3">Recent sync activity</div>
        <div className="space-y-2 text-sm">
          {logs.slice(0, 10).map((l: any) => (
            <div key={l.id} className="flex justify-between border-b last:border-0 pb-2">
              <span>
                <Badge
                  variant={
                    l.status === "success"
                      ? "default"
                      : l.status === "error"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {l.status}
                </Badge>
                <span className="ml-2 capitalize">{l.kind}</span>
              </span>
              <span className="text-muted-foreground">
                {l.succeeded}/{l.total_items} ·{" "}
                {zonedDate(l.started_at, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          ))}
          {!logs.length && <div className="text-muted-foreground">No sync runs yet.</div>}
        </div>
      </Card>
    </div>
  );
}

type PreviewProduct = {
  id: string;
  name: string;
  sku?: string | null;
  retailer_id?: string | null;
  price?: number | null;
  sale_price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  stock_quantity?: number | null;
  wa_catalog_status?: string | null;
  wa_catalog_error?: string | null;
  wa_catalog_synced_at?: string | null;
  is_featured?: boolean | null;
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "synced", label: "Synced" },
  { key: "staged", label: "Staged" },
  { key: "error", label: "Errors" },
  { key: "not_synced", label: "Not synced" },
] as const;

function PreviewPanel({
  products,
  loading,
  search,
  setSearch,
  currency,
  onSyncOne,
  onRetryErrors,
  syncing,
}: {
  products: PreviewProduct[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  currency: string;
  onSyncOne: (id: string) => void;
  onRetryErrors: (ids: string[]) => void;
  syncing: boolean;
}) {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["key"]>("all");
  const filtered = useMemo(() => {
    if (status === "all") return products;
    if (status === "not_synced")
      return products.filter((p) => !p.wa_catalog_status || p.wa_catalog_status === "not_synced");
    return products.filter((p) => p.wa_catalog_status === status);
  }, [products, status]);
  const errorIds = useMemo(
    () => products.filter((p) => p.wa_catalog_status === "error").map((p) => p.id),
    [products],
  );
  const counts = useMemo(
    () => ({
      synced: products.filter((p) => p.wa_catalog_status === "synced").length,
      staged: products.filter((p) => p.wa_catalog_status === "staged").length,
      error: errorIds.length,
      not_synced: products.filter(
        (p) => !p.wa_catalog_status || p.wa_catalog_status === "not_synced",
      ).length,
    }),
    [products, errorIds],
  );

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={status === f.key ? "default" : "outline"}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
              {f.key !== "all" && (
                <span className="ml-1.5 text-[11px] opacity-75">
                  {counts[f.key as keyof typeof counts]}
                </span>
              )}
            </Button>
          ))}
        </div>
        {errorIds.length > 0 && (
          <Button
            size="sm"
            variant="destructive"
            disabled={syncing}
            onClick={() => onRetryErrors(errorIds)}
          >
            <RotateCw className="h-4 w-4 mr-2" /> Retry {errorIds.length} error
            {errorIds.length > 1 ? "s" : ""}
          </Button>
        )}
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                ) : (
                  <Package className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="p-3 space-y-1">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.sale_price ?? p.price ?? 0} {p.currency || currency} · Stock{" "}
                  {p.stock_quantity ?? 0}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1">
                    {p.wa_catalog_status === "error" && p.wa_catalog_error ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive" className="cursor-help">
                            <AlertCircle className="h-3 w-3 " /> error
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{p.wa_catalog_error}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant={p.wa_catalog_status === "synced" ? "default" : "secondary"}>
                        {p.wa_catalog_status ?? "not_synced"}
                      </Badge>
                    )}
                    {p.is_featured && (
                      <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={syncing}
                        onClick={() => onSyncOne(p.id)}
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sync this product</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground text-center py-12">
              {products.length === 0
                ? "No products yet. Add products in the catalog to sync them to WhatsApp."
                : "No products match this filter."}
            </div>
          )}
        </div>
      )}
    </TooltipProvider>
  );
}
