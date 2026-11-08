import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listInventory,
  adjustInventory,
  listInventoryMovements,
  setReorderPoint,
} from "@/lib/commerce/catalog.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  Package,
  Search,
  Download,
  History,
  Settings2,
  Boxes,
  TrendingDown,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/commerce/inventory")({
  component: Inventory,
  head: () => ({
    meta: [
      { title: "Inventory · Commerce" },
      { name: "description", content: "Track stock levels and movements across locations." },
    ],
  }),
});

type MovementType = "receive" | "adjust" | "sale" | "return" | "transfer";

type InventoryRow = {
  id: string;
  product_id: string;
  location: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point: number | null;
  reorder_quantity: number | null;
  updated_at: string;
  workspace_id: string;
  products?: {
    id: string;
    name: string;
    sku: string | null;
    low_stock_threshold: number | null;
  } | null;
};

function Inventory() {
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const fetchInventory = useServerFn(listInventory);
  const adjust = useServerFn(adjustInventory);
  const saveReorder = useServerFn(setReorderPoint);
  const zonedDate = useZonedDateFormatter();

  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const { data: rowsRaw = [], isLoading } = useQuery({
    queryKey: ["commerce-inventory", workspace?.id, lowStockOnly],
    queryFn: () => fetchInventory({ data: { workspaceId: workspace!.id, lowStockOnly } }),
    enabled: !!workspace?.id,
  });

  const rows = rowsRaw as InventoryRow[];

  const locations = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.location));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (locationFilter !== "all" && r.location !== locationFilter) return false;
      if (!q) return true;
      return (
        (r.products?.name ?? "").toLowerCase().includes(q) ||
        (r.products?.sku ?? "").toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q)
      );
    });
  }, [rows, search, locationFilter]);

  const stats = useMemo(() => {
    const skus = new Set<string>();
    let onHand = 0;
    let lowCount = 0;
    filtered.forEach((r) => {
      skus.add(r.product_id);
      onHand += r.quantity_on_hand;
      const threshold = r.products?.low_stock_threshold ?? r.reorder_point ?? 0;
      if (r.quantity_on_hand - r.quantity_reserved <= threshold) lowCount += 1;
    });
    return { skus: skus.size, onHand, lowCount, locations: locations.length };
  }, [filtered, locations.length]);

  // Adjust dialog
  const [adjustRow, setAdjustRow] = useState<InventoryRow | null>(null);
  const [delta, setDelta] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("receive");
  const [note, setNote] = useState("");

  const adjustMut = useMutation({
    mutationFn: () =>
      adjust({
        data: {
          workspaceId: workspace!.id,
          productId: adjustRow!.product_id,
          location: adjustRow!.location,
          delta: Number(delta),
          movementType,
          note: note || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Inventory updated");
      qc.invalidateQueries({ queryKey: ["commerce-inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      setAdjustRow(null);
      setDelta("");
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reorder dialog
  const [reorderRow, setReorderRow] = useState<InventoryRow | null>(null);
  const [rp, setRp] = useState("");
  const [rq, setRq] = useState("");

  const openReorder = (r: InventoryRow) => {
    setReorderRow(r);
    setRp(r.reorder_point?.toString() ?? "");
    setRq(r.reorder_quantity?.toString() ?? "");
  };

  const reorderMut = useMutation({
    mutationFn: () =>
      saveReorder({
        data: {
          id: reorderRow!.id,
          reorderPoint: rp === "" ? null : Number(rp),
          reorderQuantity: rq === "" ? null : Number(rq),
        },
      }),
    onSuccess: () => {
      toast.success("Reorder rule saved");
      qc.invalidateQueries({ queryKey: ["commerce-inventory"] });
      setReorderRow(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // History drawer
  const [historyRow, setHistoryRow] = useState<InventoryRow | null>(null);

  const exportCsv = () => {
    if (!filtered.length) {
      toast.info("Nothing to export");
      return;
    }
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const headers = [
      "product",
      "sku",
      "location",
      "on_hand",
      "reserved",
      "available",
      "reorder_point",
      "reorder_quantity",
      "updated_at",
    ];
    const body = filtered.map((r) =>
      [
        r.products?.name ?? "",
        r.products?.sku ?? "",
        r.location,
        r.quantity_on_hand,
        r.quantity_reserved,
        r.quantity_on_hand - r.quantity_reserved,
        r.reorder_point ?? "",
        r.reorder_quantity ?? "",
        r.updated_at,
      ]
        .map(esc)
        .join(","),
    );
    const csv = [headers.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AppTopbar
        title="Inventory"
        actions={
          <Button variant="outline" className="h-9" onClick={exportCsv}>
            <Download className="h-4 w-4 " />
            Export CSV
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="SKUs" value={stats.skus} icon={<Boxes className="h-4 w-4" />} />
          <Kpi label="Units on hand" value={stats.onHand} icon={<Package className="h-4 w-4" />} />
          <Kpi label="Locations" value={stats.locations} icon={<Warehouse className="h-4 w-4" />} />
          <Kpi
            label="Low stock"
            value={stats.lowCount}
            icon={<TrendingDown className="h-4 w-4" />}
            tone={stats.lowCount ? "danger" : undefined}
          />
        </div>

        <Card className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search product, SKU, location"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 w-64"
            />
          </div>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm ml-2">
            <Switch checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
            <span>Low stock only</span>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary">{filtered.length} rows</Badge>
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const available = r.quantity_on_hand - r.quantity_reserved;
                const threshold = r.products?.low_stock_threshold ?? r.reorder_point ?? 0;
                const low = available <= threshold;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {r.products?.name ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.products?.sku ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.location}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.quantity_on_hand}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.quantity_reserved}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={low ? "text-destructive font-medium" : ""}>{available}</span>
                      {low && <AlertTriangle className="h-3 w-3 text-destructive inline ml-1" />}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {r.reorder_point ?? "—"}
                      {r.reorder_quantity ? ` / +${r.reorder_quantity}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setHistoryRow(r)}
                          title="Movement history"
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => openReorder(r)}
                          title="Reorder rules"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            setAdjustRow(r);
                            setMovementType("receive");
                          }}
                        >
                          Adjust
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No inventory records match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Adjust dialog */}
      <Dialog open={!!adjustRow} onOpenChange={(o) => !o && setAdjustRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust inventory · {adjustRow?.products?.name}</DialogTitle>
            <DialogDescription>
              Location <span className="font-medium">{adjustRow?.location}</span> · current on hand{" "}
              <span className="font-medium">{adjustRow?.quantity_on_hand}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Movement type</Label>
              <Select
                value={movementType}
                onValueChange={(v) => setMovementType(v as MovementType)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receive">Receive stock (+)</SelectItem>
                  <SelectItem value="adjust">Manual adjustment</SelectItem>
                  <SelectItem value="sale">Sale (−)</SelectItem>
                  <SelectItem value="return">Return (+)</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity delta</Label>
              <Input
                type="number"
                placeholder="e.g. 10 or -3"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use a negative number to remove stock.
              </p>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustRow(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => adjustMut.mutate()}
              disabled={!delta || Number.isNaN(Number(delta)) || adjustMut.isPending}
            >
              {adjustMut.isPending ? "Applying" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reorder dialog */}
      <Dialog open={!!reorderRow} onOpenChange={(o) => !o && setReorderRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reorder rules · {reorderRow?.products?.name}</DialogTitle>
            <DialogDescription>
              Trigger a low-stock alert when available quantity falls to or below the reorder point.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Reorder point</Label>
              <Input
                type="number"
                min={0}
                value={rp}
                onChange={(e) => setRp(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label>Reorder quantity</Label>
              <Input
                type="number"
                min={0}
                value={rq}
                onChange={(e) => setRq(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => reorderMut.mutate()} disabled={reorderMut.isPending}>
              {reorderMut.isPending ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement history drawer */}
      <MovementHistoryDrawer
        row={historyRow}
        workspaceId={workspace?.id ?? ""}
        onClose={() => setHistoryRow(null)}
      />
    </>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={tone === "danger" ? "text-destructive" : ""}>{icon}</span>
      </div>
      <div
        className={`text-2xl font-bold mt-1 ${tone === "danger" && value > 0 ? "text-destructive" : ""}`}
      >
        {value.toLocaleString()}
      </div>
    </Card>
  );
}

function MovementHistoryDrawer({
  row,
  workspaceId,
  onClose,
}: {
  row: InventoryRow | null;
  workspaceId: string;
  onClose: () => void;
}) {
  const zonedDate = useZonedDateFormatter();
  const fetchMovements = useServerFn(listInventoryMovements);
  const { data: moves = [], isLoading } = useQuery({
    queryKey: ["inventory-movements", workspaceId, row?.product_id, row?.location],
    queryFn: () =>
      fetchMovements({
        data: {
          workspaceId,
          productId: row!.product_id,
          location: row!.location,
          limit: 100,
        },
      }),
    enabled: !!row && !!workspaceId,
  });

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Movement history</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="mt-2 space-y-4">
            <div className="text-sm">
              <div className="font-medium">{row.products?.name}</div>
              <div className="text-muted-foreground">
                SKU {row.products?.sku ?? "—"} · <Badge variant="outline">{row.location}</Badge>
              </div>
            </div>
            {isLoading && <p className="text-sm text-muted-foreground">Loading</p>}
            {!isLoading && moves.length === 0 && (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            )}
            <div className="space-y-2">
              {moves.map((m) => (
                <div
                  key={m.id}
                  className="border rounded-control p-2 text-sm flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {m.movement_type}
                      </Badge>
                      <span
                        className={`font-medium ${m.quantity_delta >= 0 ? "text-green-600" : "text-destructive"}`}
                      >
                        {m.quantity_delta > 0 ? "+" : ""}
                        {m.quantity_delta}
                      </span>
                    </div>
                    {m.note && <div className="text-muted-foreground mt-1">{m.note}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {zonedDate(m.created_at, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
