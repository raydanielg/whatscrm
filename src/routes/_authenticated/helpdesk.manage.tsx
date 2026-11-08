import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  searchTickets,
  bulkUpdateTickets,
  bulkDeleteTickets,
  mergeTickets,
  createTicket,
} from "@/lib/helpdesk/ticket-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Filter,
  Trash2,
  Merge,
  ChevronDown,
  Tag as TagIcon,
  ExternalLink,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/helpdesk/manage")({
  head: () => ({ meta: [{ title: "Ticket Management" }] }),
  component: TicketManagementPage,
});

type Filters = {
  q: string;
  status: string[];
  priority: string[];
  channel: string[];
  tags_any: string[];
  created_from?: string;
  created_to?: string;
  include_deleted: boolean;
  parent_only: boolean;
};

const DEFAULT_FILTERS: Filters = {
  q: "",
  status: [],
  priority: [],
  channel: [],
  tags_any: [],
  include_deleted: false,
  parent_only: false,
};

const STATUSES = ["open", "pending", "on_hold", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const CHANNELS = ["web", "email", "whatsapp", "sms", "chat", "instagram", "facebook", "telegram"];

function priorityColor(p?: string | null) {
  switch (p) {
    case "urgent": return "bg-red-500/10 text-red-600 border-red-500/20";
    case "high": return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    case "low": return "bg-slate-500/10 text-slate-500 border-slate-500/20";
    default: return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  }
}

function statusColor(s?: string | null) {
  switch (s) {
    case "resolved":
    case "closed": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "on_hold":
    case "pending": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default: return "bg-primary/10 text-primary border-primary/20";
  }
}

function TicketManagementPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const searchFn = useServerFn(searchTickets);
  const bulkUpdate = useServerFn(bulkUpdateTickets);
  const bulkDelete = useServerFn(bulkDeleteTickets);
  const mergeFn = useServerFn(mergeTickets);
  const createFn = useServerFn(createTicket);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergePrimary, setMergePrimary] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");

  const queryKey = useMemo(
    () => ["ticket-manage", filters, page] as const,
    [filters, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      searchFn({
        data: {
          q: filters.q || undefined,
          status: filters.status.length ? filters.status : undefined,
          priority: filters.priority.length ? filters.priority : undefined,
          channel: filters.channel.length ? filters.channel : undefined,
          tags_any: filters.tags_any.length ? filters.tags_any : undefined,
          created_from: filters.created_from || undefined,
          created_to: filters.created_to || undefined,
          include_deleted: filters.include_deleted,
          parent_only: filters.parent_only,
          page,
          page_size: 25,
        },
      }),
  });

  const rows = (data?.rows ?? []) as Array<Record<string, string | number | boolean | null | string[]>>;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  const toggleMulti = (key: keyof Filters, value: string) =>
    setFilters((f) => {
      const arr = new Set(f[key] as string[]);
      arr.has(value) ? arr.delete(value) : arr.add(value);
      setPage(1);
      return { ...f, [key]: Array.from(arr) };
    });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(String(r.id)));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => String(r.id))));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const runBulk = useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      bulkUpdate({ data: { ids: Array.from(selected), patch: patch as never } }),
    onSuccess: (r) => {
      toast.success(`Updated ${r.count} tickets`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["ticket-manage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runDelete = useMutation({
    mutationFn: async () => bulkDelete({ data: { ids: Array.from(selected) } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} tickets`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["ticket-manage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMerge = useMutation({
    mutationFn: async () => {
      const merge_ids = Array.from(selected).filter((id) => id !== mergePrimary);
      return mergeFn({ data: { primary_id: mergePrimary, merge_ids } });
    },
    onSuccess: () => {
      toast.success("Tickets merged");
      setShowMerge(false);
      setSelected(new Set());
      setMergePrimary("");
      qc.invalidateQueries({ queryKey: ["ticket-manage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };
  const activeFilterCount =
    filters.status.length +
    filters.priority.length +
    filters.channel.length +
    filters.tags_any.length +
    (filters.q ? 1 : 0) +
    (filters.created_from ? 1 : 0) +
    (filters.created_to ? 1 : 0) +
    (filters.include_deleted ? 1 : 0) +
    (filters.parent_only ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Ticket Management</h1>
          <p className="text-sm text-muted-foreground">
            Search, filter, bulk-update, merge & split tickets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-4 w-4 mr-2" /> Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>
            )}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> New ticket
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by subject"
          value={filters.q}
          onChange={(e) => {
            setFilters((f) => ({ ...f, q: e.target.value }));
            setPage(1);
          }}
          className="max-w-md h-9"
        />
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="h-3.5 w-3.5 " /> Clear
          </Button>
        )}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FilterGroup title="Status" values={STATUSES} selected={filters.status}
              onToggle={(v) => toggleMulti("status", v)} />
            <FilterGroup title="Priority" values={PRIORITIES} selected={filters.priority}
              onToggle={(v) => toggleMulti("priority", v)} />
            <FilterGroup title="Channel" values={CHANNELS} selected={filters.channel}
              onToggle={(v) => toggleMulti("channel", v)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Tags (any of, comma separated)</label>
              <Input
                placeholder="billing, refund"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={() => {
                  const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
                  setFilters((f) => ({ ...f, tags_any: tags }));
                  setPage(1);
                }}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Created from</label>
              <DatePicker value={fromDateString(filters.created_from ?? "")}
                onChange={(d) => { setFilters((f) => ({ ...f, created_from: toDateString(d) })); setPage(1); }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Created to</label>
              <DatePicker value={fromDateString(filters.created_to ?? "")}
                onChange={(d) => { setFilters((f) => ({ ...f, created_to: toDateString(d) })); setPage(1); }} />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={filters.include_deleted}
                onCheckedChange={(c) => setFilters((f) => ({ ...f, include_deleted: !!c }))} />
              Include deleted
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={filters.parent_only}
                onCheckedChange={(c) => setFilters((f) => ({ ...f, parent_only: !!c }))} />
              Parent tickets only
            </label>
          </div>
        </Card>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <Card className="p-3 flex items-center gap-3 flex-wrap bg-primary/5 border-primary/20">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Status <ChevronDown className="h-3.5 w-3.5 ml-1" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {STATUSES.map((s) => (
                <DropdownMenuItem key={s} onClick={() => runBulk.mutate({ status: s })}>
                  {s.replace("_", " ")}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Priority <ChevronDown className="h-3.5 w-3.5 ml-1" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuItem key={p} onClick={() => runBulk.mutate({ priority: p })}>
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <TagBulkAction onApply={(tags) => runBulk.mutate({ add_tags: tags })} />
          <Button variant="outline" size="sm" onClick={() => {
            if (selected.size < 2) return toast.error("Select ≥ 2 tickets to merge");
            setMergePrimary(Array.from(selected)[0]);
            setShowMerge(true);
          }}>
            <Merge className="h-4 w-4 " /> Merge
          </Button>
          <Button variant="destructive" size="sm" onClick={() => runDelete.mutate()}>
            <Trash2 className="h-4 w-4 " /> Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="w-24">#</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No tickets match your filters.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const id = String(r.id);
              const num = r.ticket_number ? `#${r.ticket_number}` : "—";
              const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
              return (
                <TableRow key={id} data-state={selected.has(id) ? "selected" : undefined}>
                  <TableCell><Checkbox checked={selected.has(id)} onCheckedChange={() => toggleOne(id)} /></TableCell>
                  <TableCell className="font-mono text-xs">{num}</TableCell>
                  <TableCell>
                    <Link to="/helpdesk/$id" params={{ id }} className="hover:underline font-medium">
                      {String(r.subject ?? "(no subject)")}
                    </Link>
                    {r.parent_ticket_id && (
                      <Badge variant="outline" className="ml-2 text-[11px]">child</Badge>
                    )}
                    {r.merged_into_id && (
                      <Badge variant="outline" className="ml-2 text-[11px]">merged</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(String(r.status ?? ""))}>
                      {String(r.status ?? "")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={priorityColor(String(r.priority ?? ""))}>
                      {String(r.priority ?? "")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{String(r.channel ?? "")}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>
                      ))}
                      {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/helpdesk/$id", params: { id } })}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {total} total · page {page}/{totalPages} {isFetching && ""}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <CreateTicketDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={async (payload) => {
          try {
            const r = await createFn({ data: payload });
            toast.success(`Ticket #${(r as { ticket_number?: number })?.ticket_number ?? ""} created`);
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["ticket-manage"] });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      {/* Merge dialog */}
      <Dialog open={showMerge} onOpenChange={setShowMerge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selected.size} tickets</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Choose the ticket that should remain as primary. Others will be closed and their messages moved.</p>
            <Select value={mergePrimary} onValueChange={setMergePrimary}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select primary ticket" /></SelectTrigger>
              <SelectContent>
                {Array.from(selected).map((id) => {
                  const r = rows.find((x) => String(x.id) === id);
                  return (
                    <SelectItem key={id} value={id}>
                      #{String(r?.ticket_number ?? "?")} — {String(r?.subject ?? "").slice(0, 60)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMerge(false)}>Cancel</Button>
            <Button onClick={() => runMerge.mutate()} disabled={!mergePrimary || runMerge.isPending}>
              {runMerge.isPending ? "Merging" : "Merge tickets"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterGroup({
  title, values, selected, onToggle,
}: { title: string; values: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{title}</label>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              className={`text-xs px-2.5 py-1 rounded-control border transition-colors ${
                on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              }`}
            >
              {v.replace("_", " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TagBulkAction({ onApply }: { onApply: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><TagIcon className="h-4 w-4 " /> Tag</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add tags</DialogTitle></DialogHeader>
        <Input placeholder="tag1, tag2" value={val} onChange={(e) => setVal(e.target.value)} className="h-9" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            const tags = val.split(",").map((t) => t.trim()).filter(Boolean);
            if (!tags.length) return;
            onApply(tags);
            setOpen(false);
            setVal("");
          }}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTicketDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (p: {
    subject: string; description?: string; priority: string; status: string;
    channel: string; ticket_type: string; tags: string[];
  }) => void | Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [channel, setChannel] = useState("web");
  const [ticketType, setTicketType] = useState("question");
  const [tags, setTags] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className="h-9" />
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Type</label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["question", "incident", "problem", "task"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Tags (comma separated)</label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} className="h-9" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!subject.trim()}
            onClick={() =>
              onCreate({
                subject: subject.trim(),
                description: description.trim() || undefined,
                priority,
                status: "open",
                channel,
                ticket_type: ticketType,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              })
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
