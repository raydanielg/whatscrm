import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listPromotions,
  upsertPromotion,
  setPromotionActive,
  deletePromotion,
  getPromotionsAnalytics,
  duplicatePromotion,
  bulkPromotionAction,
} from "@/lib/commerce/promotions.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Percent,
  DollarSign,
  Truck,
  Gift,
  Package,
  Copy,
  Trash2,
  Pencil,
  Sparkles,
  Users,
  TrendingUp,
  Search,
  Download,
  CopyPlus,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/commerce/promotions")({
  component: PromotionsPage,
  staticData: { breadcrumb: "Promotions" },
  head: () => ({
    meta: [
      { title: "Promotions · Commerce" },
      {
        name: "description",
        content:
          "Coupons, automatic discounts, BXGY, bundles, free shipping and campaign promotions.",
      },
    ],
  }),
});

type FormState = {
  id?: string;
  code: string;
  name: string;
  description: string;
  promo_type: "coupon" | "automatic";
  discount_type: "percent" | "fixed" | "free_shipping" | "bxgy" | "bundle";
  percent_off: string;
  amount_off_cents: string;
  min_order_cents: string;
  max_discount_cents: string;
  buy_qty: string;
  get_qty: string;
  get_discount_percent: string;
  bundle_price_cents: string;
  currency: string;
  applies_to: "all" | "products" | "categories" | "brands";
  customer_scope: "all" | "specific" | "segments";
  starts_at: string;
  ends_at: string;
  usage_limit: string;
  usage_limit_per_customer: string;
  is_active: boolean;
  is_stackable: boolean;
  auto_apply: boolean;
  priority: string;
};

const empty: FormState = {
  code: "",
  name: "",
  description: "",
  promo_type: "coupon",
  discount_type: "percent",
  percent_off: "10",
  amount_off_cents: "",
  min_order_cents: "",
  max_discount_cents: "",
  buy_qty: "1",
  get_qty: "1",
  get_discount_percent: "100",
  bundle_price_cents: "",
  currency: "USD",
  applies_to: "all",
  customer_scope: "all",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
  usage_limit_per_customer: "",
  is_active: true,
  is_stackable: false,
  auto_apply: false,
  priority: "0",
};

const typeIcon = (t: string) => {
  switch (t) {
    case "percent":
      return <Percent className="h-3.5 w-3.5" />;
    case "fixed":
      return <DollarSign className="h-3.5 w-3.5" />;
    case "free_shipping":
      return <Truck className="h-3.5 w-3.5" />;
    case "bxgy":
      return <Gift className="h-3.5 w-3.5" />;
    case "bundle":
      return <Package className="h-3.5 w-3.5" />;
    default:
      return null;
  }
};

const typeLabel: Record<string, string> = {
  percent: "Percentage",
  fixed: "Fixed",
  free_shipping: "Free Shipping",
  bxgy: "Buy X Get Y",
  bundle: "Bundle",
};

function PromotionsPage() {
  const tenantCurrency = useTenantCurrency();
  // `empty` is module scope; a new promotion still has to start in the tenant currency.
  const blank = useMemo<FormState>(
    () => ({ ...empty, currency: tenantCurrency }),
    [tenantCurrency],
  );
  const { active: workspace } = useCurrentWorkspace();
  const zonedDate = useZonedDateFormatter();
  const qc = useQueryClient();
  const list = useServerFn(listPromotions);
  const save = useServerFn(upsertPromotion);
  const setActive = useServerFn(setPromotionActive);
  const remove = useServerFn(deletePromotion);
  const dup = useServerFn(duplicatePromotion);
  const bulk = useServerFn(bulkPromotionAction);
  const analytics = useServerFn(getPromotionsAnalytics);

  const { data: promotions = [] } = useQuery({
    queryKey: ["promotions", workspace?.id],
    queryFn: () => list({ data: { workspaceId: workspace!.id } }),
    enabled: !!workspace?.id,
  });
  const { data: stats } = useQuery({
    queryKey: ["promotions-analytics", workspace?.id],
    queryFn: () => analytics({ data: { workspaceId: workspace!.id } }),
    enabled: !!workspace?.id,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [filter, setFilter] = useState<"all" | "active" | "automatic" | "expired">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<"delete" | null>(null);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const openEdit = (p: Record<string, any>) => {
    setForm({
      id: p.id,
      code: p.code ?? "",
      name: p.name,
      description: p.description ?? "",
      promo_type: p.promo_type,
      discount_type: p.discount_type,
      percent_off: p.percent_off?.toString() ?? "",
      amount_off_cents: p.amount_off_cents?.toString() ?? "",
      min_order_cents: p.min_order_cents?.toString() ?? "",
      max_discount_cents: p.max_discount_cents?.toString() ?? "",
      buy_qty: p.buy_qty?.toString() ?? "1",
      get_qty: p.get_qty?.toString() ?? "1",
      get_discount_percent: p.get_discount_percent?.toString() ?? "100",
      bundle_price_cents: p.bundle_price_cents?.toString() ?? "",
      currency: p.currency ?? tenantCurrency,
      applies_to: p.applies_to,
      customer_scope: p.customer_scope,
      starts_at: p.starts_at?.slice(0, 16) ?? "",
      ends_at: p.ends_at?.slice(0, 16) ?? "",
      usage_limit: p.usage_limit?.toString() ?? "",
      usage_limit_per_customer: p.usage_limit_per_customer?.toString() ?? "",
      is_active: p.is_active,
      is_stackable: p.is_stackable,
      auto_apply: p.auto_apply,
      priority: p.priority?.toString() ?? "0",
    });
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const int = (s: string) => (s.trim() === "" ? null : Math.round(Number(s)));
      return save({
        data: {
          id: form.id,
          workspaceId: workspace!.id,
          code: form.code.trim() || null,
          name: form.name,
          description: form.description || null,
          promo_type: form.promo_type,
          discount_type: form.discount_type,
          percent_off: form.discount_type === "percent" ? num(form.percent_off) : null,
          amount_off_cents: form.discount_type === "fixed" ? int(form.amount_off_cents) : null,
          currency: form.currency,
          min_order_cents: int(form.min_order_cents),
          max_discount_cents: int(form.max_discount_cents),
          buy_qty: form.discount_type === "bxgy" ? int(form.buy_qty) : null,
          get_qty: form.discount_type === "bxgy" ? int(form.get_qty) : null,
          get_discount_percent:
            form.discount_type === "bxgy" ? num(form.get_discount_percent) : null,
          get_product_ids: [],
          bundle_product_ids: [],
          bundle_price_cents: form.discount_type === "bundle" ? int(form.bundle_price_cents) : null,
          applies_to: form.applies_to,
          target_ids: [],
          customer_scope: form.customer_scope,
          customer_ids: [],
          segment_ids: [],
          campaign_id: null,
          starts_at: form.starts_at || null,
          ends_at: form.ends_at || null,
          usage_limit: int(form.usage_limit),
          usage_limit_per_customer: int(form.usage_limit_per_customer),
          is_active: form.is_active,
          is_stackable: form.is_stackable,
          auto_apply: form.auto_apply,
          priority: Number(form.priority) || 0,
          rules: {},
        },
      });
    },
    onSuccess: () => {
      toast.success(form.id ? "Promotion updated" : "Promotion created");
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promotions-analytics"] });
      setOpen(false);
      setForm(blank);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      setActive({ data: { workspaceId: workspace!.id, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { workspaceId: workspace!.id, id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promotions-analytics"] });
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => dup({ data: { workspaceId: workspace!.id, id } }),
    onSuccess: () => {
      toast.success("Promotion duplicated");
      qc.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMut = useMutation({
    mutationFn: (action: "activate" | "deactivate" | "delete") =>
      bulk({ data: { workspaceId: workspace!.id, ids: [...selected], action } }),
    onSuccess: (_d, action) => {
      toast.success(`${selected.size} promotion${selected.size === 1 ? "" : "s"} ${action}d`);
      setSelected(new Set());
      setConfirmBulk(null);
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["promotions-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const now = Date.now();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (promotions as any[]).filter((p) => {
      const expired = p.ends_at && new Date(p.ends_at).getTime() < now;
      if (filter === "active" && !(p.is_active && !expired)) return false;
      if (filter === "automatic" && !(p.auto_apply || p.promo_type === "automatic")) return false;
      if (filter === "expired" && !expired) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [promotions, filter, search, now]);

  const allSelected = filtered.length > 0 && filtered.every((p: any) => selected.has(p.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((p: any) => p.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const exportCsv = () => {
    const rows = [
      [
        "Name",
        "Code",
        "Type",
        "Discount Type",
        "Value",
        "Active",
        "Auto",
        "Starts",
        "Ends",
        "Times Redeemed",
        "Usage Limit",
      ],
    ];
    filtered.forEach((p: any) => {
      const value =
        p.discount_type === "percent"
          ? `${p.percent_off}%`
          : p.discount_type === "fixed"
            ? `$${(p.amount_off_cents / 100).toFixed(2)}`
            : p.discount_type === "free_shipping"
              ? "Free shipping"
              : p.discount_type === "bxgy"
                ? `Buy ${p.buy_qty} Get ${p.get_qty}`
                : p.discount_type === "bundle"
                  ? `Bundle $${((p.bundle_price_cents ?? 0) / 100).toFixed(2)}`
                  : "";
      rows.push([
        p.name,
        p.code ?? "",
        p.promo_type,
        p.discount_type,
        value,
        p.is_active ? "Yes" : "No",
        p.auto_apply ? "Yes" : "No",
        p.starts_at ?? "",
        p.ends_at ?? "",
        String(p.times_redeemed ?? 0),
        p.usage_limit != null ? String(p.usage_limit) : "",
      ]);
    });
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promotions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AppTopbar
        title="Promotions"
        subtitle="Coupons, automatic discounts, BXGY, bundles and free shipping."
        actions={
          <ActionBar
            primary={[
              <Dialog
                key="new-promotion"
                open={open}
                onOpenChange={(v) => {
                  setOpen(v);
                  if (!v) setForm(blank);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9">
                    <Plus className="h-4 w-4 mr-2" />
                    New Promotion
                  </Button>
                </DialogTrigger>
                <PromotionDialog
                  form={form}
                  upd={upd}
                  onSave={() => saveMut.mutate()}
                  saving={saveMut.isPending}
                  editing={!!form.id}
                />
              </Dialog>,
              <Button
                key="export"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={exportCsv}
                disabled={filtered.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem key="redemptions" asChild>
                <Link to="/commerce/promotions/redemptions">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Redemption history
                </Link>
              </DropdownMenuItem>,
            ]}
          />
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="Total"
            value={stats?.total ?? 0}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <StatCard
            label="Active"
            value={stats?.active ?? 0}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Automatic"
            value={stats?.automatic ?? 0}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <StatCard
            label="Redemptions (30d)"
            value={stats?.redemptions30d ?? 0}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="Saved (30d)"
            value={`$${((stats?.revenue_saved_30d ?? 0) / 100).toFixed(2)}`}
            icon={<DollarSign className="h-4 w-4" />}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, code, description"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => bulkMut.mutate("activate")}
                disabled={bulkMut.isPending}
              >
                Activate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => bulkMut.mutate("deactivate")}
                disabled={bulkMut.isPending}
              >
                Deactivate
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-9"
                onClick={() => setConfirmBulk("delete")}
                disabled={bulkMut.isPending}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as typeof filter);
            setSelected(new Set());
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="automatic">Automatic</TabsTrigger>
            <TabsTrigger value="expired">Expired</TabsTrigger>
          </TabsList>
          <TabsContent value={filter} className="mt-4">
            <Card>
              <div className="p-4 border-b text-xs uppercase text-muted-foreground grid grid-cols-12 gap-2 items-center">
                <div className="col-span-1">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </div>
                <div className="col-span-3">Name / Code</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Value</div>
                <div className="col-span-1">Uses</div>
                <div className="col-span-2">Ends</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {filtered.length === 0 && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  {promotions.length === 0
                    ? "No promotions yet. Create your first coupon or automatic discount."
                    : "No promotions match your filters."}
                </div>
              )}
              {filtered.map((p: any) => {
                const expired = p.ends_at && new Date(p.ends_at).getTime() < now;
                const value =
                  p.discount_type === "percent"
                    ? `${p.percent_off}%`
                    : p.discount_type === "fixed"
                      ? `$${(p.amount_off_cents / 100).toFixed(2)}`
                      : p.discount_type === "free_shipping"
                        ? "Free ship"
                        : p.discount_type === "bxgy"
                          ? `Buy ${p.buy_qty} Get ${p.get_qty}`
                          : p.discount_type === "bundle"
                            ? `Bundle $${((p.bundle_price_cents ?? 0) / 100).toFixed(2)}`
                            : "—";
                return (
                  <div
                    key={p.id}
                    className="p-4 border-b last:border-0 grid grid-cols-12 gap-2 items-center hover:bg-muted/40"
                  >
                    <div className="col-span-1">
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                        aria-label={`Select ${p.name}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="flex gap-2 items-center mt-1 flex-wrap">
                        {p.code && (
                          <button
                            className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded inline-flex items-center gap-1 hover:bg-muted-foreground/10"
                            onClick={() => {
                              navigator.clipboard.writeText(p.code);
                              toast.success("Code copied");
                            }}
                          >
                            {p.code}
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                        {(p.auto_apply || p.promo_type === "automatic") && (
                          <Badge variant="secondary" className="text-[11px]">
                            Auto
                          </Badge>
                        )}
                        {p.is_stackable && (
                          <Badge variant="outline" className="text-[11px]">
                            Stackable
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Badge variant="outline" className="gap-1">
                        {typeIcon(p.discount_type)}
                        {typeLabel[p.discount_type]}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-sm">{value}</div>
                    <div className="col-span-1 text-sm">
                      {p.times_redeemed}
                      {p.usage_limit != null ? ` / ${p.usage_limit}` : ""}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      {p.ends_at ? zonedDate(p.ends_at, { dateStyle: "short" }) : "—"}
                      {expired && (
                        <Badge variant="destructive" className="ml-2 text-[11px]">
                          Expired
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-end items-center gap-1">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => activeMut.mutate({ id: p.id, is_active: v })}
                        aria-label="Toggle active"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => openEdit(p)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => dupMut.mutate(p.id)}
                        disabled={dupMut.isPending}
                        aria-label="Duplicate"
                      >
                        <CopyPlus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(o) => {
            if (!o) setConfirmDelete(null);
          }}
          title={`Delete "${confirmDelete?.name}"?`}
          description="This promotion will be permanently removed. Past redemptions and orders are preserved."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (confirmDelete) await delMut.mutateAsync(confirmDelete.id);
          }}
        />

        <ConfirmDialog
          open={confirmBulk === "delete"}
          onOpenChange={(o) => {
            if (!o) setConfirmBulk(null);
          }}
          title={`Delete ${selected.size} promotion${selected.size === 1 ? "" : "s"}?`}
          description="These promotions will be permanently removed. Past redemptions and orders are preserved."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await bulkMut.mutateAsync("delete");
          }}
        />
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function PromotionDialog({
  form,
  upd,
  onSave,
  saving,
  editing,
}: {
  form: FormState;
  upd: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Promotion" : "New Promotion"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="Summer Sale"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select
              value={form.promo_type}
              onValueChange={(v) => upd("promo_type", v as FormState["promo_type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coupon">Coupon code</SelectItem>
                <SelectItem value="automatic">Automatic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.promo_type === "coupon" && (
          <div>
            <Label>Code</Label>
            <div className="flex gap-2">
              <Input
                value={form.code}
                onChange={(e) => upd("code", e.target.value.toUpperCase())}
                placeholder="SUMMER20"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => {
                  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
                  upd("code", `SAVE${rand}`);
                }}
              >
                <Wand2 className="h-4 w-4 " />
                Generate
              </Button>
            </div>
          </div>
        )}

        <div>
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => upd("description", e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Discount Type</Label>
            <Select
              value={form.discount_type}
              onValueChange={(v) => upd("discount_type", v as FormState["discount_type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed amount</SelectItem>
                <SelectItem value="free_shipping">Free shipping</SelectItem>
                <SelectItem value="bxgy">Buy X Get Y</SelectItem>
                <SelectItem value="bundle">Bundle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.discount_type === "percent" && (
            <div>
              <Label>Percent off</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.percent_off}
                onChange={(e) => upd("percent_off", e.target.value)}
              />
            </div>
          )}
          {form.discount_type === "fixed" && (
            <div>
              <Label>Amount off (cents)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount_off_cents}
                onChange={(e) => upd("amount_off_cents", e.target.value)}
              />
            </div>
          )}
          {form.discount_type === "bundle" && (
            <div>
              <Label>Bundle price (cents)</Label>
              <Input
                type="number"
                min={0}
                value={form.bundle_price_cents}
                onChange={(e) => upd("bundle_price_cents", e.target.value)}
              />
            </div>
          )}
        </div>

        {form.discount_type === "bxgy" && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Buy Qty</Label>
              <Input
                type="number"
                min={1}
                value={form.buy_qty}
                onChange={(e) => upd("buy_qty", e.target.value)}
              />
            </div>
            <div>
              <Label>Get Qty</Label>
              <Input
                type="number"
                min={1}
                value={form.get_qty}
                onChange={(e) => upd("get_qty", e.target.value)}
              />
            </div>
            <div>
              <Label>Get % off</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.get_discount_percent}
                onChange={(e) => upd("get_discount_percent", e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Minimum order (cents)</Label>
            <Input
              type="number"
              min={0}
              value={form.min_order_cents}
              onChange={(e) => upd("min_order_cents", e.target.value)}
            />
          </div>
          <div>
            <Label>Maximum discount (cents)</Label>
            <Input
              type="number"
              min={0}
              value={form.max_discount_cents}
              onChange={(e) => upd("max_discount_cents", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Applies to</Label>
            <Select
              value={form.applies_to}
              onValueChange={(v) => upd("applies_to", v as FormState["applies_to"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="products">Specific products</SelectItem>
                <SelectItem value="categories">Specific categories</SelectItem>
                <SelectItem value="brands">Specific brands</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Customer scope</Label>
            <Select
              value={form.customer_scope}
              onValueChange={(v) => upd("customer_scope", v as FormState["customer_scope"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                <SelectItem value="specific">Specific customers</SelectItem>
                <SelectItem value="segments">Customer segments</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Starts at</Label>
            <DateTimePicker
              value={fromLocalDateTimeString(form.starts_at)}
              onChange={(d) => upd("starts_at", toLocalDateTimeString(d))}
            />
          </div>
          <div>
            <Label>Ends at</Label>
            <DateTimePicker
              value={fromLocalDateTimeString(form.ends_at)}
              onChange={(d) => upd("ends_at", toLocalDateTimeString(d))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Total usage limit</Label>
            <Input
              type="number"
              min={1}
              value={form.usage_limit}
              onChange={(e) => upd("usage_limit", e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div>
            <Label>Per-customer limit</Label>
            <Input
              type="number"
              min={1}
              value={form.usage_limit_per_customer}
              onChange={(e) => upd("usage_limit_per_customer", e.target.value)}
              placeholder="Unlimited"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_active} onCheckedChange={(v) => upd("is_active", v)} /> Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.auto_apply} onCheckedChange={(v) => upd("auto_apply", v)} />{" "}
            Auto-apply at checkout
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_stackable} onCheckedChange={(v) => upd("is_stackable", v)} />{" "}
            Stackable with others
          </label>
          <div>
            <Label className="text-xs">Priority</Label>
            <Input
              type="number"
              value={form.priority}
              onChange={(e) => upd("priority", e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSave} disabled={saving || !form.name} className="h-9">
          {saving ? "Saving" : editing ? "Save changes" : "Create promotion"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
