import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listShippingZones,
  upsertShippingZone,
  upsertShippingRate,
  deleteShippingZone,
  deleteShippingRate,
  toggleShippingZoneActive,
  toggleShippingRateActive,
} from "@/lib/commerce/catalog.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { Plus, Globe, Truck, Pencil, Trash2, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { useTenantCurrency } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/commerce/shipping")({
  component: Shipping,
  staticData: { breadcrumb: "Shipping" },
  head: () => ({ meta: [{ title: "Shipping · Commerce" }] }),
});

type Rate = {
  id: string;
  name: string;
  rate_type: string;
  price: number;
  currency: string;
  is_active: boolean;
  min_order_total: number | null;
  max_order_total: number | null;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
  zone_id: string;
};
type Zone = {
  id: string;
  name: string;
  countries: string[];
  is_active: boolean;
  commerce_shipping_rates: Rate[];
};

const emptyZone = { id: undefined as string | undefined, name: "", countries: "", is_active: true };
const emptyRate = {
  id: undefined as string | undefined,
  name: "",
  rate_type: "flat",
  price: "",
  currency: "USD",
  min_order_total: "",
  max_order_total: "",
  estimated_days_min: "",
  estimated_days_max: "",
  is_active: true,
};

function Shipping() {
  const tenantCurrency = useTenantCurrency();
  // `emptyRate` is module scope; a new rate still has to start in the tenant currency.
  const blankRate = useMemo(() => ({ ...emptyRate, currency: tenantCurrency }), [tenantCurrency]);
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const fetch = useServerFn(listShippingZones);
  const saveZoneFn = useServerFn(upsertShippingZone);
  const saveRateFn = useServerFn(upsertShippingRate);
  const delZoneFn = useServerFn(deleteShippingZone);
  const delRateFn = useServerFn(deleteShippingRate);
  const toggleZoneFn = useServerFn(toggleShippingZoneActive);
  const toggleRateFn = useServerFn(toggleShippingRateActive);

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["ship-zones", workspace?.id],
    queryFn: () => fetch({ data: { workspaceId: workspace!.id } }) as any,
    enabled: !!workspace?.id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ship-zones"] });

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const filteredZones = useMemo(() => {
    const q = search.trim().toLowerCase();
    return zones.filter((z) => {
      if (status === "active" && !z.is_active) return false;
      if (status === "inactive" && z.is_active) return false;
      if (!q) return true;
      return (
        z.name.toLowerCase().includes(q) ||
        (z.countries ?? []).some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [zones, search, status]);

  // KPIs
  const kpis = useMemo(() => {
    const totalZones = zones.length;
    const activeZones = zones.filter((z) => z.is_active).length;
    const rates = zones.flatMap((z) => z.commerce_shipping_rates ?? []);
    const activeRates = rates.filter((r) => r.is_active).length;
    return { totalZones, activeZones, totalRates: rates.length, activeRates };
  }, [zones]);

  // Zone dialog
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState(emptyZone);
  const openNewZone = () => {
    setZoneForm(emptyZone);
    setZoneOpen(true);
  };
  const openEditZone = (z: Zone) => {
    setZoneForm({
      id: z.id,
      name: z.name,
      countries: (z.countries ?? []).join(", "),
      is_active: z.is_active,
    });
    setZoneOpen(true);
  };
  const zoneMut = useMutation({
    mutationFn: () =>
      saveZoneFn({
        data: {
          id: zoneForm.id,
          workspaceId: workspace!.id,
          name: zoneForm.name.trim(),
          countries: zoneForm.countries
            .split(",")
            .map((c) => c.trim().toUpperCase())
            .filter((c) => c.length === 2),
          is_active: zoneForm.is_active,
        },
      }),
    onSuccess: () => {
      toast.success(zoneForm.id ? "Zone updated" : "Zone created");
      invalidate();
      setZoneOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save zone"),
  });

  // Rate dialog
  const [rateOpen, setRateOpen] = useState(false);
  const [rateZoneId, setRateZoneId] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState(blankRate);
  const openNewRate = (zoneId: string) => {
    setRateZoneId(zoneId);
    setRateForm(blankRate);
    setRateOpen(true);
  };
  const openEditRate = (zoneId: string, r: Rate) => {
    setRateZoneId(zoneId);
    setRateForm({
      id: r.id,
      name: r.name,
      rate_type: r.rate_type,
      price: String(r.price ?? ""),
      currency: r.currency ?? tenantCurrency,
      min_order_total: r.min_order_total != null ? String(r.min_order_total) : "",
      max_order_total: r.max_order_total != null ? String(r.max_order_total) : "",
      estimated_days_min: r.estimated_days_min != null ? String(r.estimated_days_min) : "",
      estimated_days_max: r.estimated_days_max != null ? String(r.estimated_days_max) : "",
      is_active: r.is_active,
    });
    setRateOpen(true);
  };
  const rateMut = useMutation({
    mutationFn: () => {
      const num = (v: string) => (v === "" ? undefined : Number(v));
      const intNum = (v: string) => (v === "" ? undefined : parseInt(v, 10));
      return saveRateFn({
        data: {
          id: rateForm.id,
          workspaceId: workspace!.id,
          zoneId: rateZoneId!,
          name: rateForm.name.trim(),
          rate_type: rateForm.rate_type,
          price: Number(rateForm.price || 0),
          currency: rateForm.currency.toUpperCase(),
          min_order_total: num(rateForm.min_order_total),
          max_order_total: num(rateForm.max_order_total),
          estimated_days_min: intNum(rateForm.estimated_days_min),
          estimated_days_max: intNum(rateForm.estimated_days_max),
        },
      });
    },
    onSuccess: () => {
      toast.success(rateForm.id ? "Rate updated" : "Rate created");
      invalidate();
      setRateOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save rate"),
  });

  // Toggles
  const toggleZone = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      toggleZoneFn({ data: { workspaceId: workspace!.id, ...v } }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const toggleRate = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      toggleRateFn({ data: { workspaceId: workspace!.id, ...v } }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Deletes
  const [confirm, setConfirm] = useState<
    | { kind: "zone"; id: string; name: string; count: number }
    | { kind: "rate"; id: string; name: string }
    | null
  >(null);
  const delZone = useMutation({
    mutationFn: (id: string) => delZoneFn({ data: { workspaceId: workspace!.id, id } }),
    onSuccess: () => {
      toast.success("Zone deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delRate = useMutation({
    mutationFn: (id: string) => delRateFn({ data: { workspaceId: workspace!.id, id } }),
    onSuccess: () => {
      toast.success("Rate deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Export
  const exportCsv = () => {
    const rows: string[] = [
      [
        "Zone",
        "Zone active",
        "Countries",
        "Rate",
        "Rate type",
        "Price",
        "Currency",
        "Min order",
        "Max order",
        "Transit min (d)",
        "Transit max (d)",
        "Rate active",
      ].join(","),
    ];
    for (const z of filteredZones) {
      const countries = (z.countries ?? []).join(" ");
      const rates = z.commerce_shipping_rates ?? [];
      if (rates.length === 0) {
        rows.push(
          [safe(z.name), z.is_active, safe(countries), "", "", "", "", "", "", "", "", ""].join(
            ",",
          ),
        );
      } else {
        for (const r of rates) {
          rows.push(
            [
              safe(z.name),
              z.is_active,
              safe(countries),
              safe(r.name),
              r.rate_type,
              r.price,
              r.currency,
              r.min_order_total ?? "",
              r.max_order_total ?? "",
              r.estimated_days_min ?? "",
              r.estimated_days_max ?? "",
              r.is_active,
            ].join(","),
          );
        }
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shipping-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AppTopbar
        title="Shipping"
        subtitle="Zones and rates for order delivery"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={exportCsv}
              disabled={zones.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button size="sm" className="h-9" onClick={openNewZone}>
              <Plus className="h-4 w-4 mr-2" />
              New Zone
            </Button>
          </>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Zones" value={kpis.totalZones} />
          <Kpi label="Active zones" value={kpis.activeZones} />
          <Kpi label="Rates" value={kpis.totalRates} />
          <Kpi label="Active rates" value={kpis.activeRates} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search zone name or country code"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Zones */}
        <div className="space-y-4">
          {filteredZones.map((z) => (
            <Card key={z.id} className={`p-4 space-y-4 ${!z.is_active ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Globe className="h-5 w-5 text-primary mt-1 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium">{z.name}</div>
                      {!z.is_active && (
                        <Badge variant="outline" className="text-[11px]">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(z.countries ?? []).length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">No countries</span>
                      ) : (
                        z.countries.map((c) => (
                          <Badge key={c} variant="outline" className="text-[11px]">
                            {c}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2 pr-1">
                    <span className="text-[11px] text-muted-foreground">Active</span>
                    <Switch
                      checked={z.is_active}
                      onCheckedChange={(v) => toggleZone.mutate({ id: z.id, is_active: v })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => openEditZone(z)}
                  >
                    <Pencil className="h-3 w-3 " />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => openNewRate(z.id)}
                  >
                    <Plus className="h-3 w-3 " />
                    Rate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-danger hover:text-danger"
                    onClick={() =>
                      setConfirm({
                        kind: "zone",
                        id: z.id,
                        name: z.name,
                        count: (z.commerce_shipping_rates ?? []).length,
                      })
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {(z.commerce_shipping_rates ?? []).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t">
                  {z.commerce_shipping_rates.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-start gap-3 p-3 rounded-control bg-muted/50 ${!r.is_active ? "opacity-60" : ""}`}
                    >
                      <Truck className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-medium truncate">{r.name}</div>
                          {!r.is_active && (
                            <Badge variant="outline" className="text-[11px]">
                              Off
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground capitalize">
                          {r.rate_type} · {r.currency} {Number(r.price).toFixed(2)}
                        </div>
                        {(r.min_order_total != null || r.max_order_total != null) && (
                          <div className="text-[11px] text-muted-foreground">
                            Order {r.min_order_total ?? 0}–{r.max_order_total ?? "∞"}
                          </div>
                        )}
                        {(r.estimated_days_min != null || r.estimated_days_max != null) && (
                          <div className="text-[11px] text-muted-foreground">
                            Transit {r.estimated_days_min ?? "?"}–{r.estimated_days_max ?? "?"} days
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => toggleRate.mutate({ id: r.id, is_active: v })}
                        />
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditRate(z.id, r)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-danger hover:text-danger"
                            onClick={() => setConfirm({ kind: "rate", id: r.id, name: r.name })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {filteredZones.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              {zones.length === 0 ? "No shipping zones yet." : "No zones match your filters."}
            </p>
          )}
        </div>

        {/* Zone dialog */}
        <Dialog open={zoneOpen} onOpenChange={setZoneOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{zoneForm.id ? "Edit Zone" : "New Shipping Zone"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Zone name (e.g. Europe)"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              />
              <Input
                placeholder="Country codes, comma-separated (US, CA, GB)"
                value={zoneForm.countries}
                onChange={(e) => setZoneForm({ ...zoneForm, countries: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={zoneForm.is_active}
                  onCheckedChange={(v) => setZoneForm({ ...zoneForm, is_active: v })}
                />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button
                onClick={() => zoneMut.mutate()}
                disabled={!zoneForm.name.trim() || zoneMut.isPending}
              >
                {zoneMut.isPending ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rate dialog */}
        <Dialog open={rateOpen} onOpenChange={setRateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{rateForm.id ? "Edit Rate" : "New Shipping Rate"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Rate name (e.g. Standard)"
                value={rateForm.name}
                onChange={(e) => setRateForm({ ...rateForm, name: e.target.value })}
              />
              <Select
                value={rateForm.rate_type}
                onValueChange={(v) => setRateForm({ ...rateForm, rate_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat rate</SelectItem>
                  <SelectItem value="weight">By weight</SelectItem>
                  <SelectItem value="price">By order price</SelectItem>
                  <SelectItem value="free">Free shipping</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={rateForm.price}
                  onChange={(e) => setRateForm({ ...rateForm, price: e.target.value })}
                />
                <Input
                  placeholder="Currency"
                  value={rateForm.currency}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, currency: e.target.value.toUpperCase() })
                  }
                  maxLength={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Min order total"
                  value={rateForm.min_order_total}
                  onChange={(e) => setRateForm({ ...rateForm, min_order_total: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Max order total"
                  value={rateForm.max_order_total}
                  onChange={(e) => setRateForm({ ...rateForm, max_order_total: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Transit min (days)"
                  value={rateForm.estimated_days_min}
                  onChange={(e) => setRateForm({ ...rateForm, estimated_days_min: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Transit max (days)"
                  value={rateForm.estimated_days_max}
                  onChange={(e) => setRateForm({ ...rateForm, estimated_days_max: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => rateMut.mutate()}
                disabled={!rateForm.name.trim() || rateMut.isPending}
              >
                {rateMut.isPending ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(v) => !v && setConfirm(null)}
          destructive
          title={
            confirm?.kind === "zone"
              ? `Delete zone "${confirm.name}"?`
              : `Delete rate "${confirm?.name}"?`
          }
          description={
            confirm?.kind === "zone"
              ? `This removes the zone and its ${confirm.count} rate${confirm.count === 1 ? "" : "s"}. This action cannot be undone.`
              : "This rate will be permanently removed."
          }
          confirmLabel="Delete"
          onConfirm={async () => {
            if (!confirm) return;
            if (confirm.kind === "zone") await delZone.mutateAsync(confirm.id);
            else await delRate.mutateAsync(confirm.id);
            setConfirm(null);
          }}
        />
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </Card>
  );
}

function safe(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
