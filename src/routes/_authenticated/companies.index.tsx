import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  Building2,
  Plus,
  Search,
  Star,
  Archive,
  ArchiveRestore,
  Trash2,
  Download,
  MoreHorizontal,
  Pencil,
  Globe,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCompanies,
  useCompaniesRealtime,
  useUpdateCompany,
  useDeleteCompany,
  useBulkUpdateCompanies,
  companiesToCsv,
  downloadCsv,
  companyInitials,
  type CompanyFilters,
  type CompanyRow,
} from "@/hooks/use-companies";
import { CompanyFormDialog } from "@/components/app/companies/company-form-dialog";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/companies/")({
  staticData: { breadcrumb: "Companies" },
  head: () => ({
    meta: [
      { title: "Companies" },
      {
        name: "description",
        content: "Manage your companies, industries, and account relationships.",
      },
    ],
  }),
  component: CompaniesPage,
});

const INDUSTRIES = [
  "Software",
  "SaaS",
  "E-commerce",
  "Retail",
  "Manufacturing",
  "Healthcare",
  "Finance",
  "Education",
  "Real Estate",
  "Media",
  "Consulting",
  "Hospitality",
  "Logistics",
  "Other",
];
const STATUSES = ["active", "prospect", "customer", "partner", "vendor", "inactive"];

function CompaniesPage() {
  useCompaniesRealtime();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "favorites" | "archived">("all");
  const [filters, setFilters] = useState<Omit<CompanyFilters, "search" | "favorite" | "archived">>(
    {},
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CompanyRow | null>(null);

  const activeFilters: CompanyFilters = useMemo(
    () => ({
      ...filters,
      search,
      favorite: view === "favorites" ? true : undefined,
      archived: view === "archived" ? true : false,
    }),
    [filters, search, view],
  );
  const { data: rows = [], isLoading } = useCompanies(activeFilters);
  const update = useUpdateCompany();
  const bulk = useBulkUpdateCompanies();
  const del = useDeleteCompany();
  const canDelete = useCanAct("companies.delete");

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const exportCsv = () => {
    downloadCsv(`companies-${new Date().toISOString().slice(0, 10)}.csv`, companiesToCsv(rows));
    toast.success("Exported CSV");
  };

  const bulkArchive = async (archived: boolean) => {
    await bulk.mutateAsync({ ids: [...selected], patch: { is_archived: archived } });
    setSelected(new Set());
    toast.success(archived ? "Archived" : "Unarchived");
  };
  const bulkFavorite = async (fav: boolean) => {
    await bulk.mutateAsync({ ids: [...selected], patch: { is_favorite: fav } });
    setSelected(new Set());
  };

  return (
    <>
      <AppTopbar
        title="Companies"
        subtitle="Organizations tied to your contacts, deals, and campaigns"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1.5" /> Export
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpenForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> New company
            </Button>
          </>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.industry ?? "all"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, industry: v === "all" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All industries</SelectItem>
              {INDUSTRIES.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
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
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1 text-sm">
          {(["all", "favorites", "archived"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-control capitalize transition-colors ${view === v ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {v}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="rounded-control border border-border bg-muted/40 p-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => bulkFavorite(true)}>
                <Star className="w-4 h-4 " /> Favorite
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulkArchive(true)}>
                <Archive className="w-4 h-4 " /> Archive
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulkArchive(false)}>
                <ArchiveRestore className="w-4 h-4 " /> Unarchive
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-control border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_120px_120px_100px_100px_40px] items-center gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <div>Company</div>
            <div className="hidden md:block">Industry</div>
            <div className="hidden md:block">Size</div>
            <div className="hidden md:block">Status</div>
            <div className="hidden md:block">Country</div>
            <div />
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No companies yet.</p>
              <Button
                className="mt-3"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpenForm(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" /> Create your first company
              </Button>
            </div>
          ) : (
            rows.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-[36px_1fr_120px_120px_100px_100px_40px] items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors group"
              >
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <Link
                  to="/companies/$companyId"
                  params={{ companyId: c.id }}
                  className="flex items-center gap-3 min-w-0"
                >
                  <Avatar className="w-8 h-8 rounded-control">
                    {c.logo_url ? <AvatarImage src={c.logo_url} alt={c.name} /> : null}
                    <AvatarFallback className="rounded-control text-xs bg-accent/10 text-accent">
                      {companyInitials(c)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {c.name}
                      {c.is_favorite && (
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                      {c.domain && <span>{c.domain}</span>}
                      {c.website && (
                        <>
                          <Globe className="w-3 h-3" />
                        </>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="hidden md:block text-sm text-muted-foreground">
                  {c.industry ?? "—"}
                </div>
                <div className="hidden md:block text-sm text-muted-foreground">
                  {c.company_size ?? "—"}
                </div>
                <div className="hidden md:block">
                  <Badge variant="secondary" className="text-[11px]">
                    {c.status}
                  </Badge>
                </div>
                <div className="hidden md:block text-sm text-muted-foreground truncate">
                  {c.country ?? c.address?.country ?? "—"}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(c);
                        setOpenForm(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        update.mutate({ id: c.id, patch: { is_favorite: !c.is_favorite } })
                      }
                    >
                      <Star className="w-4 h-4" /> {c.is_favorite ? "Unfavorite" : "Favorite"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        update.mutate({ id: c.id, patch: { is_archived: !c.is_archived } })
                      }
                    >
                      {c.is_archived ? (
                        <ArchiveRestore className="w-4 h-4" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
                      {c.is_archived ? "Unarchive" : "Archive"}
                    </DropdownMenuItem>
                    <PermissionGate permission="companies.delete">
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setConfirmDelete(c)}
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </DropdownMenuItem>
                    </PermissionGate>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">{rows.length} companies</p>
      </main>

      <CompanyFormDialog open={openForm} onOpenChange={setOpenForm} initial={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete company?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{confirmDelete?.name}</b> will be soft-deleted. Related contacts, deals and history
              stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                if (!canDelete) return;
                await del.mutateAsync({ id: confirmDelete.id });
                toast.success("Company deleted");
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
