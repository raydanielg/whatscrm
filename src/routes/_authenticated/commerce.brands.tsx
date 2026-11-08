import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listBrands,
  upsertBrand,
  deleteBrand,
  toggleBrandActive,
} from "@/lib/commerce/catalog.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Search, Download, Package, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/commerce/brands")({
  component: Brands,
  staticData: { breadcrumb: "Brands" },
  head: () => ({
    meta: [
      { title: "Brands · Commerce" },
      {
        name: "description",
        content: "Manage product brands, manufacturers, and labels for your commerce catalog.",
      },
      { property: "og:title", content: "Brands · Commerce" },
      {
        property: "og:description",
        content: "Manage product brands, manufacturers, and labels for your commerce catalog.",
      },
    ],
  }),
});

type Brand = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  is_active: boolean;
  product_count: number;
  created_at: string;
};

const empty = { name: "", description: "", website: "", logo_url: "", is_active: true };

function Brands() {
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const fetchBrands = useServerFn(listBrands);
  const saveBrand = useServerFn(upsertBrand);
  const removeBrand = useServerFn(deleteBrand);
  const toggleActive = useServerFn(toggleBrandActive);

  const { data: brands = [], isLoading } = useQuery<Brand[]>({
    queryKey: ["commerce-brands", workspace?.id],
    queryFn: () => fetchBrands({ data: { workspaceId: workspace!.id } }) as Promise<Brand[]>,
    enabled: !!workspace?.id,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [confirmDelete, setConfirmDelete] = useState<Brand | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("none");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["commerce-brands"] });

  const upsertMut = useMutation({
    mutationFn: () => saveBrand({ data: { id: editing?.id, workspaceId: workspace!.id, ...form } }),
    onSuccess: () => {
      toast.success(editing ? "Brand updated" : "Brand created");
      invalidate();
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save brand"),
  });

  const deleteMut = useMutation({
    mutationFn: (args: { id: string; reassignTo: string | null }) =>
      removeBrand({
        data: { id: args.id, workspaceId: workspace!.id, reassignTo: args.reassignTo },
      }),
    onSuccess: () => {
      toast.success("Brand deleted");
      invalidate();
      setConfirmDelete(null);
      setReassignTo("none");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete brand"),
  });

  const toggleMut = useMutation({
    mutationFn: (args: { id: string; isActive: boolean }) =>
      toggleActive({ data: { ...args, workspaceId: workspace!.id } }),
    onSuccess: (_d, args) => {
      invalidate();
      toast.success(args.isActive ? "Brand activated" : "Brand deactivated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update brand"),
  });

  const openEdit = (b: Brand) => {
    setEditing(b);
    setForm({
      name: b.name,
      description: b.description ?? "",
      website: b.website ?? "",
      logo_url: b.logo_url ?? "",
      is_active: b.is_active,
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands.filter((b) => {
      if (statusFilter === "active" && !b.is_active) return false;
      if (statusFilter === "inactive" && b.is_active) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q) ||
        (b.website ?? "").toLowerCase().includes(q)
      );
    });
  }, [brands, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: brands.length,
      active: brands.filter((b) => b.is_active).length,
      inactive: brands.filter((b) => !b.is_active).length,
      products: brands.reduce((s, b) => s + (b.product_count ?? 0), 0),
    }),
    [brands],
  );

  const exportCsv = () => {
    const rows = [["Name", "Status", "Products", "Website", "Description", "Created"]];
    filtered.forEach((b) =>
      rows.push([
        b.name,
        b.is_active ? "Active" : "Inactive",
        String(b.product_count ?? 0),
        b.website ?? "",
        (b.description ?? "").replace(/\n/g, " "),
        new Date(b.created_at).toISOString(),
      ]),
    );
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brands-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reassignOptions = brands.filter((b) => b.id !== confirmDelete?.id && b.is_active);

  return (
    <>
      <AppTopbar
        title="Brands"
        subtitle="Manage product manufacturers and labels"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button size="sm" className="h-9" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Brand
            </Button>
          </>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-2xl font-bold">{stats.active}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Inactive</div>
            <div className="text-2xl font-bold">{stats.inactive}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Products</div>
            <div className="text-2xl font-bold">{stats.products}</div>
          </Card>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search brands"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((b) => (
              <Card key={b.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {b.logo_url ? (
                      <img
                        src={b.logo_url}
                        alt={b.name}
                        className="h-10 w-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={b.is_active ? "default" : "secondary"}
                          className="text-[11px]"
                        >
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Link
                          to="/commerce"
                          search={{ brand: b.id } as any}
                          className="text-[11px] text-muted-foreground hover:text-primary"
                        >
                          {b.product_count} product{b.product_count === 1 ? "" : "s"}
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => openEdit(b)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setConfirmDelete(b)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {b.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{b.description}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  {b.website ? (
                    <a
                      href={b.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{b.website.replace(/^https?:\/\//, "")}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">No website</span>
                  )}
                  <Switch
                    checked={b.is_active}
                    onCheckedChange={(v) => toggleMut.mutate({ id: b.id, isActive: v })}
                    aria-label="Toggle active"
                  />
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-12">
                {brands.length === 0
                  ? "No brands yet. Create your first brand to organize products."
                  : "No brands match your filters."}
              </p>
            )}
          </div>
        )}

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditing(null);
              setForm(empty);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Brand" : "New Brand"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  placeholder="Brand name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  placeholder="Short description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Logo URL</Label>
                <Input
                  placeholder="https:///logo.png"
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                />
                {form.logo_url && (
                  <img
                    src={form.logo_url}
                    alt="preview"
                    className="h-12 w-12 rounded object-cover mt-2"
                  />
                )}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <Label htmlFor="active-toggle">Active</Label>
                <Switch
                  id="active-toggle"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => upsertMut.mutate()}
                disabled={!form.name.trim() || upsertMut.isPending}
              >
                {upsertMut.isPending ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(o) => {
            if (!o) {
              setConfirmDelete(null);
              setReassignTo("none");
            }
          }}
          title={`Delete "${confirmDelete?.name}"?`}
          description={
            confirmDelete && confirmDelete.product_count > 0 ? (
              <div className="space-y-3">
                <p>
                  {confirmDelete.product_count} product
                  {confirmDelete.product_count === 1 ? " is" : "s are"} linked to this brand. Choose
                  where to reassign them, or leave unlinked.
                </p>
                <div className="space-y-1.5">
                  <Label>Reassign products to</Label>
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Leave unlinked</SelectItem>
                      {reassignOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              "This action cannot be undone."
            )
          }
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (!confirmDelete) return;
            await deleteMut.mutateAsync({
              id: confirmDelete.id,
              reassignTo: reassignTo === "none" ? null : reassignTo,
            });
          }}
        />
      </div>
    </>
  );
}
