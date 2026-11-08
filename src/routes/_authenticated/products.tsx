import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Star,
  StarOff,
  Package,
  Wrench,
  Repeat,
  Boxes,
  FolderTree,
  Download,
  Upload,
  Pencil,
  Trash2,
  Filter,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { productSource, productSourceLabel } from "@/lib/ecommerce/product-source";
import {
  useProducts,
  useProductCategories,
  useFavorites,
  useToggleFavorite,
  useDeleteProduct,
  useUpsertProduct,
  productsToCsv,
  parseProductsCsv,
  type ProductRow,
  type ProductFilters,
} from "@/hooks/use-products";
import { ProductFormDialog } from "@/components/app/products/product-form-dialog";
import { CategoryManager } from "@/components/app/products/category-manager";
import { useCurrencyFormatter } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
  staticData: { breadcrumb: "Products" },
  head: () => ({
    meta: [
      { title: "Products & Services" },
      {
        name: "description",
        content: "Manage your product and service catalog for quotes and invoices.",
      },
    ],
  }),
});

const KIND_ICONS = {
  product: Package,
  service: Wrench,
  subscription: Repeat,
  bundle: Boxes,
} as const;

function ProductsPage() {
  const money = useCurrencyFormatter();
  const [filters, setFilters] = useState<ProductFilters>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: products, isLoading } = useProducts(filters);
  const { data: cats } = useProductCategories();
  const { data: favs } = useFavorites();
  const toggleFav = useToggleFavorite();
  const del = useDeleteProduct();
  const upsert = useUpsertProduct();

  const catMap = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats]);
  const stats = useMemo(() => {
    const rows = products ?? [];
    return {
      total: rows.length,
      products: rows.filter((p) => p.kind === "product").length,
      services: rows.filter((p) => p.kind === "service").length,
      bundles: rows.filter((p) => p.kind === "bundle").length,
    };
  }, [products]);

  const exportCsv = () => {
    if (!products?.length) {
      toast.error("Nothing to export");
      return;
    }
    const csv = productsToCsv(products);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${products.length} products`);
  };

  const onImportFile = async (f: File) => {
    try {
      const text = await f.text();
      const rows = parseProductsCsv(text);
      if (!rows.length) {
        toast.error("No rows found");
        return;
      }
      let ok = 0;
      for (const r of rows) {
        if (!r.name) continue;
        await upsert.mutateAsync(r as Partial<ProductRow> & { name: string });
        ok++;
      }
      toast.success(`Imported ${ok} products`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AppTopbar
        title="Products & Services"
        actions={
          <ActionBar
            primary={[
              <Button
                key="new"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 " /> New product
              </Button>,
              <Button key="export" variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 " /> Export
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem key="categories" onClick={() => setCatOpen(true)}>
                <FolderTree className="h-4 w-4 mr-2" /> Categories
              </DropdownMenuItem>,
              <DropdownMenuItem key="quick-import" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Quick import
              </DropdownMenuItem>,
              <DropdownMenuItem key="bulk-csv" asChild>
                <Link to="/commerce/import">
                  <Upload className="h-4 w-4 mr-2" /> Bulk CSV
                </Link>
              </DropdownMenuItem>,
            ]}
          />
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Boxes },
            { label: "Products", value: stats.products, icon: Package },
            { label: "Services", value: stats.services, icon: Wrench },
            { label: "Bundles", value: stats.bundles, icon: Boxes },
          ].map((k) => (
            <Card key={k.label} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-control bg-primary/10 text-primary grid place-items-center">
                <k.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-2xl font-semibold">{k.value}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, description"
              value={filters.search ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>
          <Select
            value={filters.kind ?? "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, kind: v === "all" ? undefined : v }))}
          >
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 " />
              <SelectValue placeholder="Kind" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="product">Products</SelectItem>
              <SelectItem value="service">Services</SelectItem>
              <SelectItem value="subscription">Subscriptions</SelectItem>
              <SelectItem value="bundle">Bundles</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.categoryId ?? "all"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, categoryId: v === "all" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(cats ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status ?? "all"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filters.favoritesOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
          >
            <Star className="h-4 w-4 " /> Favorites
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])}
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : (products?.length ?? 0) === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <div className="font-medium">No products yet</div>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first product to power quotes and invoices.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 " /> New product
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(products ?? []).map((p) => {
              const Icon = KIND_ICONS[p.kind as keyof typeof KIND_ICONS] ?? Package;
              const isFav = favs?.has(p.id) ?? false;
              const cat = p.category_id ? catMap.get(p.category_id) : null;
              const images = (p.images as string[] | null)?.length
                ? (p.images as string[])
                : p.image_url
                  ? [p.image_url]
                  : [];
              return (
                <Card key={p.id} className="p-4 hover:shadow-md transition group animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 rounded-control bg-muted overflow-hidden shrink-0 grid place-items-center">
                      {images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={images[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.sku ? `SKU ${p.sku} • ` : ""}
                            {p.kind}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => toggleFav.mutate({ productId: p.id, favored: isFav })}
                        >
                          {isFav ? (
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          ) : (
                            <StarOff className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="font-mono">
                          {money(Number(p.price ?? 0), p.currency)}
                        </Badge>
                        {cat && (
                          <Badge
                            variant="outline"
                            style={
                              cat.color ? { borderColor: cat.color, color: cat.color } : undefined
                            }
                          >
                            {cat.name}
                          </Badge>
                        )}
                        {p.status && p.status !== "active" && (
                          <Badge variant="outline">{p.status}</Badge>
                        )}
                        {(() => {
                          // Which store this was imported from. Woo product ids
                          // repeat across stores, so with more than one connected
                          // the name is the only way to tell two "#42"s apart.
                          const src = productSource(p);
                          if (!src) return null;
                          return (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Store className="h-3 w-3" />
                              {productSourceLabel(src)}
                            </Badge>
                          );
                        })()}
                        {p.track_inventory && (
                          <Badge variant={(p.stock_quantity ?? 0) > 0 ? "outline" : "destructive"}>
                            Stock {p.stock_quantity ?? 0}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      onClick={() => {
                        setEditing(p);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      onClick={() => {
                        if (confirm(`Archive "${p.name}"?`)) del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ProductFormDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editing} />
      <CategoryManager open={catOpen} onOpenChange={setCatOpen} />
    </div>
  );
}
