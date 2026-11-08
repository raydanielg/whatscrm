import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  Plus,
  Upload,
  Download,
  Search,
  Filter,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  Merge,
  Pencil,
  ArchiveRestore,
  Copy,
  ChevronLeft,
  ChevronRight,
  Users,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  useContacts,
  useContactsRealtime,
  useUpdateContact,
  useCreateContact,
  useBulkUpdateContacts,
  useBulkDeleteContacts,
  useDeleteContact,
  contactsToCsv,
  downloadCsv,
  contactDisplayName,
  contactInitials,
  primaryEmail,
  primaryPhone,
  type ContactFilters,
  type ContactRow,
} from "@/hooks/use-contacts";
import { useCompaniesLite } from "@/hooks/use-deals";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { ContactFormDialog } from "@/components/app/contacts/contact-form-dialog";
import { ContactImportDialog } from "@/components/app/contacts/contact-import-dialog";
import { ContactMergeDialog } from "@/components/app/contacts/contact-merge-dialog";
import { BulkTagButton } from "@/components/app/tags/bulk-tag-button";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/contacts/")({
  head: () => ({
    meta: [
      { title: "Contacts" },
      { name: "description", content: "Manage your CRM contacts, tags, and assignments." },
    ],
  }),
  component: ContactsPage,
});

const LEAD_STATUS = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const CUSTOMER_STATUS = ["prospect", "active", "at_risk", "churned", "vip"];

const PAGE_SIZE = 25;

type SortKey = "name" | "company" | "owner" | "updated";
type SortState = { key: SortKey; dir: "asc" | "desc" };

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (s: SortState) => void;
}) {
  const activeSort = sort.key === sortKey;
  return (
    <th className="text-left px-3 py-3 font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1  hover:text-foreground"
        onClick={() =>
          onSort({ key: sortKey, dir: activeSort && sort.dir === "asc" ? "desc" : "asc" })
        }
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span className={activeSort ? "opacity-100" : "opacity-30"}>
          {activeSort && sort.dir === "desc" ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
}

export function ContactsPage() {
  useContactsRealtime();
  const { active } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(active?.id);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [view, setView] = useState<"all" | "favorites" | "archived">("all");
  const [filters, setFilters] = useState<Omit<ContactFilters, "search" | "favorite" | "archived">>(
    {},
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "updated",
    dir: "desc",
  });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);

  const query: ContactFilters = {
    ...filters,
    search: debouncedSearch || undefined,
    favorite: view === "favorites" ? true : undefined,
    archived: view === "archived" ? true : false,
  };
  const { data: rows = [], isLoading } = useContacts(query);

  const update = useUpdateContact();
  const create = useCreateContact();
  const bulkUpdate = useBulkUpdateContacts();
  const bulkDelete = useBulkDeleteContacts();
  const del = useDeleteContact();
  const isDeleting = del.isPending || bulkDelete.isPending;
  const canDeleteContacts = useCanAct("contacts.delete");

  // Dialogs/sheets read the live row so they never show stale data after an
  // edit, a realtime event, or a bulk update.
  const editing = useMemo(() => rows.find((r) => r.id === editingId) ?? null, [rows, editingId]);
  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);

  // Reset to the first page whenever the result set itself changes; keep the
  // current page across create/update/delete so the admin stays in place.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, view, filters, sort]);

  const runBulk = async (
    patch: Record<string, unknown>,
    successMsg: string,
    clearSelection = true,
  ) => {
    if (!selected.size || bulkUpdate.isPending) return;
    try {
      await bulkUpdate.mutateAsync({ ids: [...selected], patch: patch as never });
      toast.success(successMsg);
      if (clearSelection) setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    }
  };

  const allTags = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [rows]);

  const memberById = useMemo(() => {
    const m = new Map<string, string>();
    (members ?? []).forEach((mb) =>
      m.set(mb.user_id, mb.display_name || mb.email || mb.user_id.slice(0, 6)),
    );
    return m;
  }, [members]);

  const { data: companies = [] } = useCompaniesLite();
  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [companies]);

  // Client-side sorting over the fetched result set.
  const sortedRows = useMemo(() => {
    const list = [...rows];
    const dir = sort.dir === "asc" ? 1 : -1;
    const text = (v: string | null | undefined) => (v ?? "").toLowerCase();
    list.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return text(contactDisplayName(a)).localeCompare(text(contactDisplayName(b))) * dir;
        case "company":
          return (
            text(a.company_id ? companyById.get(a.company_id) : "").localeCompare(
              text(b.company_id ? companyById.get(b.company_id) : ""),
            ) * dir
          );
        case "owner":
          return (
            text(a.owner_id ? memberById.get(a.owner_id) : "").localeCompare(
              text(b.owner_id ? memberById.get(b.owner_id) : ""),
            ) * dir
          );
        default:
          return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
      }
    });
    return list;
  }, [rows, sort, companyById, memberById]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const toggleFavorite = async (c: ContactRow) => {
    try {
      await update.mutateAsync({ id: c.id, patch: { is_favorite: !c.is_favorite } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update favorite");
    }
  };

  const toggleArchived = async (c: ContactRow) => {
    try {
      await update.mutateAsync({ id: c.id, patch: { is_archived: !c.is_archived } });
      toast.success(c.is_archived ? "Contact restored" : "Contact archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update contact");
    }
  };

  const duplicateContact = async (c: ContactRow) => {
    try {
      // Phone numbers are unique per workspace, so the copy starts without
      // them; the admin fills in the new number on the duplicate.
      await create.mutateAsync({
        first_name: c.first_name,
        last_name: c.last_name,
        display_name: `${contactDisplayName(c)} (copy)`,
        job_title: c.job_title,
        department: c.department,
        company_id: c.company_id,
        emails: c.emails ?? [],
        phones: [],
        website: c.website,
        address: c.address ?? {},
        tags: c.tags ?? [],
        notes: c.notes,
        lifecycle_stage: c.lifecycle_stage,
        lead_status: c.lead_status,
        customer_status: c.customer_status,
        owner_id: c.owner_id,
        assigned_agent_id: c.assigned_agent_id,
        custom_fields: c.custom_fields ?? {},
      });
      toast.success("Contact duplicated", {
        description: "Phone number was left blank — it must be unique.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate contact");
    }
  };

  const exportSelected = () => {
    const target = selected.size ? selectedRows : sortedRows;
    if (!target.length) {
      toast.info("Nothing to export");
      return;
    }
    downloadCsv(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, contactsToCsv(target));
    toast.success(`Exported ${target.length} contacts`);
  };

  const activeFilterCount =
    (filters.ownerId ? 1 : 0) +
    (filters.agentId ? 1 : 0) +
    (filters.leadStatus ? 1 : 0) +
    (filters.customerStatus ? 1 : 0) +
    (filters.tags?.length ? 1 : 0);

  return (
    <>
      <AppTopbar
        title="Contacts"
        subtitle={`${rows.length} contact${rows.length === 1 ? "" : "s"}`}
        actions={
          <div className="hidden md:block">
            <ActionBar
              primary={[
                <Button key="new" size="sm" onClick={() => setCreating(true)}>
                  <Plus className="w-4 h-4 " /> New contact
                </Button>,
                <Button key="import" variant="ghost" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="w-4 h-4 " /> Import
                </Button>,
              ]}
              overflow={[
                <DropdownMenuItem key="export" onSelect={exportSelected}>
                  <Download className="w-4 h-4 mr-2" /> Export
                </DropdownMenuItem>,
              ]}
            />
          </div>
        }
      />

      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Tabs + search + filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="inline-flex rounded-control border border-border bg-muted/40 p-0.5 text-sm">
            {(["all", "favorites", "archived"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 h-9 rounded capitalize transition-colors ${view === v ? "bg-surface shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone"
              className="pl-9 h-9"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 " /> Filters{" "}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Owner</label>
                <Select
                  value={filters.ownerId ?? "__any"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, ownerId: v === "__any" ? undefined : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any owner</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Assigned agent</label>
                <Select
                  value={filters.agentId ?? "__any"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, agentId: v === "__any" ? undefined : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any agent</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Lead status</label>
                  <Select
                    value={filters.leadStatus ?? "__any"}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, leadStatus: v === "__any" ? undefined : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any">Any</SelectItem>
                      {LEAD_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Customer status
                  </label>
                  <Select
                    value={filters.customerStatus ?? "__any"}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, customerStatus: v === "__any" ? undefined : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any">Any</SelectItem>
                      {CUSTOMER_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {allTags.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                    {allTags.map((t) => {
                      const on = filters.tags?.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              tags: on ? f.tags?.filter((x) => x !== t) : [...(f.tags ?? []), t],
                            }))
                          }
                          className={`text-xs px-2 py-0.5 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters({})}>
                Clear filters
              </Button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-accent/10 px-3 py-2 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <span className="text-muted-foreground">·</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  Assign owner
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Set owner</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => runBulk({ owner_id: null }, "Owner cleared")}>
                  Unassigned
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(members ?? []).map((m) => (
                  <DropdownMenuItem
                    key={m.user_id}
                    onSelect={() => runBulk({ owner_id: m.user_id }, "Owner updated")}
                  >
                    {m.display_name || m.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  Assign agent
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={() => runBulk({ assigned_agent_id: null }, "Agent cleared")}
                >
                  Unassigned
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(members ?? []).map((m) => (
                  <DropdownMenuItem
                    key={m.user_id}
                    onSelect={() => runBulk({ assigned_agent_id: m.user_id }, "Agent updated")}
                  >
                    {m.display_name || m.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  Lead status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {LEAD_STATUS.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onSelect={() => runBulk({ lead_status: s }, `Lead status set to ${s}`)}
                  >
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <BulkTagButton entityType="contact" entityIds={[...selected]} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                runBulk(
                  { is_archived: view !== "archived" },
                  view === "archived" ? "Restored" : "Archived",
                )
              }
            >
              {view === "archived" ? (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5 " /> Restore
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5 " /> Archive
                </>
              )}
            </Button>
            {selected.size >= 2 && (
              <Button size="sm" variant="ghost" onClick={() => setMergeOpen(true)}>
                <Merge className="w-3.5 h-3.5 " /> Merge
              </Button>
            )}
            <PermissionGate permission="contacts.delete">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() =>
                  setDeleteTarget({ ids: [...selected], label: `${selected.size} contacts` })
                }
              >
                <Trash2 className="w-3.5 h-3.5 " /> Delete
              </Button>
            </PermissionGate>
          </div>
        )}

        {/* Table */}
        <div className="rounded-control border border-border bg-surface shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs  text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="w-8 px-1"></th>
                  <SortableHead label="Name" sortKey="name" sort={sort} onSort={setSort} />
                  <th className="text-left px-3 py-3 font-medium">Contact</th>
                  <SortableHead label="Company" sortKey="company" sort={sort} onSort={setSort} />
                  <SortableHead label="Owner" sortKey="owner" sort={sort} onSort={setSort} />
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-left px-3 py-3 font-medium">Tags</th>
                  <th className="w-10 px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-muted-foreground">
                      Loading contacts
                    </td>
                  </tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-14 text-center">
                      <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="font-medium">No contacts yet</p>
                      <p className="text-xs text-muted-foreground">
                        Create your first contact or import a CSV.
                      </p>
                      <div className="mt-3 flex justify-center gap-2">
                        <Button size="sm" onClick={() => setCreating(true)}>
                          <Plus className="w-4 h-4 " /> New contact
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                          <Upload className="w-4 h-4 " /> Import
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {pageRows.map((c) => {
                  const name = contactDisplayName(c);
                  const email = primaryEmail(c);
                  const phone = primaryPhone(c);
                  return (
                    <tr key={c.id} className="hover:bg-muted/40 group">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggleOne(c.id)}
                          aria-label={`Select ${name}`}
                        />
                      </td>
                      <td className="px-1">
                        <button
                          onClick={() => toggleFavorite(c)}
                          className="p-1 rounded hover:bg-muted"
                          aria-label="Toggle favorite"
                        >
                          <Star
                            className={`w-4 h-4 ${c.is_favorite ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setDetailId(c.id)}
                          className="flex items-center gap-3 text-left"
                        >
                          <Avatar className="w-8 h-8">
                            {c.avatar_url && <AvatarImage src={c.avatar_url} alt={name} />}
                            <AvatarFallback className="text-xs">
                              {contactInitials(c)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium leading-none">{name}</p>
                            {c.job_title && (
                              <p className="text-xs text-muted-foreground mt-0.5">{c.job_title}</p>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {email && <div className="text-xs truncate max-w-[180px]">{email}</div>}
                        {phone && <div className="text-xs ">{phone}</div>}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">
                        {c.company_id ? (
                          <Link
                            to="/companies/$companyId"
                            params={{ companyId: c.company_id }}
                            className="hover:underline hover:text-foreground"
                          >
                            {companyById.get(c.company_id) ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">
                        {c.owner_id ? (
                          (memberById.get(c.owner_id) ?? "—")
                        ) : (
                          <span className="italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {c.lead_status && (
                          <Badge variant="outline" className="text-[11px] ">
                            {c.lead_status}
                          </Badge>
                        )}
                        {c.customer_status && (
                          <Badge variant="secondary" className="text-[11px]">
                            {c.customer_status}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(c.tags ?? []).slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[11px]">
                              {t}
                            </Badge>
                          ))}
                          {(c.tags ?? []).length > 3 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{(c.tags ?? []).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDetailId(c.id)}>
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditingId(c.id)}>
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => duplicateContact(c)}>
                              <Copy className="w-3.5 h-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleFavorite(c)}>
                              <Star className="w-3.5 h-3.5" />{" "}
                              {c.is_favorite ? "Unfavorite" : "Favorite"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleArchived(c)}>
                              {c.is_archived ? (
                                <>
                                  <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                                </>
                              ) : (
                                <>
                                  <Archive className="w-3.5 h-3.5" /> Archive
                                </>
                              )}
                            </DropdownMenuItem>
                            <PermissionGate permission="contacts.delete">
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setDeleteTarget({ ids: [c.id], label: name })}
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </DropdownMenuItem>
                            </PermissionGate>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, rows.length)} of {rows.length}
                {selected.size > 0 && ` · ${selected.size} selected`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </Button>
                <span className="">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}
      <ContactFormDialog open={creating} onOpenChange={setCreating} />
      <ContactFormDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditingId(null)}
        contact={editing}
      />
      <ContactImportDialog open={importOpen} onOpenChange={setImportOpen} />
      {mergeOpen && selectedRows.length >= 2 && (
        <ContactMergeDialog
          open={mergeOpen}
          onOpenChange={(v) => {
            setMergeOpen(v);
            if (!v) setSelected(new Set());
          }}
          contacts={selectedRows}
        />
      )}

      {/* Detail sheet */}
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <Avatar className="w-10  ">
                    {detail.avatar_url && <AvatarImage src={detail.avatar_url} />}
                    <AvatarFallback>{contactInitials(detail)}</AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <div>{contactDisplayName(detail)}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {detail.job_title ?? "—"}
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(detail.id)}>
                    <Pencil className="w-3.5 h-3.5 " /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update.mutate({ id: detail.id, patch: { is_favorite: !detail.is_favorite } })
                    }
                  >
                    <Star
                      className={`w-3.5 h-3.5 mr-1 ${detail.is_favorite ? "fill-yellow-500 text-yellow-500" : ""}`}
                    />{" "}
                    Favorite
                  </Button>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: detail.id }}
                    className="text-sm text-accent hover:underline self-center ml-auto"
                  >
                    Full page →
                  </Link>
                </div>

                <Section title="Emails">
                  {(detail.emails ?? []).length === 0 && detail.email && (
                    <Row icon={<Mail className="w-3.5 h-3.5" />} label="—" value={detail.email} />
                  )}
                  {(detail.emails ?? []).map((e, i) => (
                    <Row
                      key={i}
                      icon={<Mail className="w-3.5 h-3.5" />}
                      label={e.label ?? ""}
                      value={e.email}
                      primary={e.is_primary}
                    />
                  ))}
                </Section>

                <Section title="Phones">
                  {(detail.phones ?? []).length === 0 && detail.phone && (
                    <Row icon={<Phone className="w-3.5 h-3.5" />} label="—" value={detail.phone} />
                  )}
                  {(detail.phones ?? []).map((p, i) => (
                    <Row
                      key={i}
                      icon={<Phone className="w-3.5 h-3.5" />}
                      label={p.label ?? ""}
                      value={p.number}
                      primary={p.is_primary}
                    />
                  ))}
                  {detail.whatsapp && (
                    <Row
                      icon={<Phone className="w-3.5 h-3.5" />}
                      label="whatsapp"
                      value={detail.whatsapp}
                    />
                  )}
                </Section>

                <Section title="CRM">
                  <KV k="Lifecycle" v={detail.lifecycle_stage} />
                  <KV k="Lead status" v={detail.lead_status ?? "—"} />
                  <KV k="Customer status" v={detail.customer_status ?? "—"} />
                  <KV
                    k="Owner"
                    v={detail.owner_id ? (memberById.get(detail.owner_id) ?? "—") : "—"}
                  />
                  <KV
                    k="Agent"
                    v={
                      detail.assigned_agent_id
                        ? (memberById.get(detail.assigned_agent_id) ?? "—")
                        : "—"
                    }
                  />
                  <KV k="Source" v={detail.source ?? "—"} />
                </Section>

                {(detail.website || detail.birthday) && (
                  <Section title="More">
                    {detail.website && <KV k="Website" v={detail.website} />}
                    {detail.birthday && <KV k="Birthday" v={detail.birthday} />}
                  </Section>
                )}

                {detail.address && Object.values(detail.address).some(Boolean) && (
                  <Section title="Address">
                    <div className="text-sm text-muted-foreground">
                      {[
                        detail.address.line1,
                        detail.address.line2,
                        detail.address.city,
                        detail.address.state,
                        detail.address.postal_code,
                        detail.address.country,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  </Section>
                )}

                {(detail.tags ?? []).length > 0 && (
                  <Section title="Tags">
                    <div className="flex flex-wrap gap-1">
                      {(detail.tags ?? []).map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </Section>
                )}

                {detail.custom_fields && Object.keys(detail.custom_fields).length > 0 && (
                  <Section title="Custom fields">
                    {Object.entries(detail.custom_fields).map(([k, v]) => (
                      <KV key={k} k={k} v={String(v)} />
                    ))}
                  </Section>
                )}

                {detail.notes && (
                  <Section title="Notes">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {detail.notes}
                    </p>
                  </Section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (isDeleting) return;
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Contacts are soft-deleted and can be restored from the archive. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteTarget || isDeleting) return;
                if (!canDeleteContacts) return;
                try {
                  if (deleteTarget.ids.length === 1) {
                    await del.mutateAsync({ id: deleteTarget.ids[0] });
                  } else {
                    await bulkDelete.mutateAsync({ ids: deleteTarget.ids });
                  }
                  toast.success(
                    deleteTarget.ids.length > 1
                      ? `Deleted ${deleteTarget.ids.length} contacts`
                      : "Deleted",
                  );
                  setSelected(new Set());
                  if (deleteTarget.ids.includes(detailId ?? "")) setDetailId(null);
                  if (deleteTarget.ids.includes(editingId ?? "")) setEditingId(null);
                  setDeleteTarget(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not delete contact");
                }
              }}
            >
              {isDeleting ? "Deleting" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium  text-muted-foreground mb-1.5">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      {label && <span className="text-xs text-muted-foreground w-16 truncate">{label}</span>}
      <span className="truncate">{value}</span>
      {primary && (
        <Badge variant="outline" className="ml-auto text-[11px]">
          primary
        </Badge>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right truncate max-w-[60%]">{v}</span>
    </div>
  );
}
