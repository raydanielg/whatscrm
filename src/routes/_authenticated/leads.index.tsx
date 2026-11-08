import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
  Plus,
  Search,
  Trash2,
  MoreHorizontal,
  Pencil,
  Download,
  Filter,
  UserPlus2,
  Zap,
  Target,
  Flame,
  Snowflake,
  Thermometer,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useLeads,
  useRecentLeadsCount,
  useLeadsRealtime,
  useUpdateLead,
  useDeleteLead,
  useBulkUpdateLeads,
  useBulkDeleteLeads,
  leadsToCsv,
  downloadCsv,
  leadDisplayName,
  leadInitials,
  LEAD_STATUSES,
  LEAD_RATINGS,
  LEAD_SOURCES,
  type LeadFilters,
  type LeadRow,
} from "@/hooks/use-leads";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { LeadFormDialog } from "@/components/app/leads/lead-form-dialog";
import { ConvertLeadDialog } from "@/components/app/leads/convert-lead-dialog";

export const Route = createFileRoute("/_authenticated/leads/")({
  staticData: { breadcrumb: "Leads" },
  head: () => ({
    meta: [
      { title: "Leads" },
      { name: "description", content: "Capture, qualify, and convert leads across your pipeline." },
    ],
  }),
  component: LeadsPage,
});

export function LeadsPage() {
  useLeadsRealtime();
  const location = useLocation();
  const formatZonedDate = useZonedDateFormatter();
  const { active } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(active?.id);

  const [search, setSearch] = useState("");
  const [recentSince, setRecentSince] = useState<string | undefined>(() =>
    location.hash?.replace(/^#/, "") === "new-7d"
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  );
  const [view, setView] = useState<"active" | "converted" | "all">(
    recentSince ? "all" : "active",
  );
  const [filters, setFilters] = useState<Omit<LeadFilters, "search" | "converted">>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<LeadRow | null>(null);
  const [converting, setConverting] = useState<LeadRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LeadRow | null>(null);

  const activeFilters: LeadFilters = useMemo(
    () => ({
      ...filters,
      search,
      createdAfter: recentSince,
      converted: view === "converted" ? true : view === "active" ? false : undefined,
    }),
    [filters, search, recentSince, view],
  );
  const { data: rows = [], isLoading } = useLeads(activeFilters);
  const recentCount = useRecentLeadsCount(recentSince);
  const update = useUpdateLead();
  const bulk = useBulkUpdateLeads();
  const bulkDel = useBulkDeleteLeads();
  const del = useDeleteLead();

  const stats = useMemo(() => {
    const total = rows.length;
    const qualified = rows.filter((r) => r.status === "qualified").length;
    const converted = rows.filter((r) => r.converted_at).length;
    const avgScore = total ? Math.round(rows.reduce((s, r) => s + (r.score || 0), 0) / total) : 0;
    return { total, qualified, converted, avgScore };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportCsv = () => {
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, leadsToCsv(rows));
    toast.success("Exported CSV");
  };

  return (
    <>
      <AppTopbar
        title="Leads"
        subtitle="Capture, qualify, and convert"
        actions={
          <div className="flex gap-2">
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
              <Plus className="w-4 h-4 mr-1.5" /> New lead
            </Button>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {recentSince && (
          <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-muted/30 px-4 py-2 text-sm">
            <span>Created in the last 7 days · {recentCount.isLoading ? "Loading total…" : recentCount.isError ? "Total unavailable" : `${recentCount.data ?? 0} total`}</span>
            <Button variant="ghost" size="sm" onClick={() => setRecentSince(undefined)}>Clear date filter</Button>
          </div>
        )}
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label={recentSince ? "Leads shown" : "Total leads"}
            value={String(stats.total)}
            icon={<Target className="w-4 h-4 text-accent" />}
          />
          <Stat
            label="Qualified"
            value={String(stats.qualified)}
            icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
          />
          <Stat
            label="Converted"
            value={String(stats.converted)}
            icon={<UserPlus2 className="w-4 h-4 text-blue-500" />}
          />
          <Stat
            label="Avg score"
            value={String(stats.avgScore)}
            icon={<Zap className="w-4 h-4 text-yellow-500" />}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, company"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.status ?? "any"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, status: v === "any" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.source ?? "any"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, source: v === "any" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any source</SelectItem>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.rating ?? "any"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, rating: v === "any" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any rating</SelectItem>
              {LEAD_RATINGS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.ownerId ?? "any"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, ownerId: v === "any" ? undefined : v }))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any owner</SelectItem>
              {(members ?? []).map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.display_name || m.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-1.5" /> Min score{" "}
                {filters.minScore ? `≥ ${filters.minScore}` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <Label className="text-xs text-muted-foreground">
                Minimum score: {filters.minScore ?? 0}
              </Label>
              <Slider
                className="mt-2"
                value={[filters.minScore ?? 0]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => setFilters((f) => ({ ...f, minScore: v || undefined }))}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-1 text-sm">
          {(["active", "converted", "all"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-control capitalize ${view === v ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {v}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="rounded-control border border-border bg-muted/40 p-2 flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium">{selected.size} selected</span>
            <div className="ml-auto flex gap-1 flex-wrap">
              <BulkStatus
                onSet={async (status) => {
                  await bulk.mutateAsync({ ids: [...selected], patch: { status } });
                  setSelected(new Set());
                  toast.success(`Set status: ${status}`);
                }}
              />
              <BulkOwner
                members={members ?? []}
                onSet={async (owner_id) => {
                  await bulk.mutateAsync({ ids: [...selected], patch: { owner_id } });
                  setSelected(new Set());
                  toast.success("Owner reassigned");
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  await bulkDel.mutateAsync({ ids: [...selected] });
                  setSelected(new Set());
                  toast.success("Leads deleted");
                }}
              >
                <Trash2 className="w-4 h-4 " /> Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-control border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_120px_110px_90px_90px_100px_40px] gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <div>Lead</div>
            <div className="hidden md:block">Status</div>
            <div className="hidden md:block">Source</div>
            <div className="hidden md:block">Score</div>
            <div className="hidden md:block">Rating</div>
            <div className="hidden md:block">Updated</div>
            <div />
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Target className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No leads yet — capture your first one.
              </p>
              <Button
                className="mt-3"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpenForm(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" /> New lead
              </Button>
            </div>
          ) : (
            rows.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[36px_1fr_120px_110px_90px_90px_100px_40px] gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 group items-center"
              >
                <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: l.id }}
                  className="flex items-center gap-3 min-w-0"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-accent/10 text-accent">
                      {leadInitials(l)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{leadDisplayName(l)}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {l.company_name ?? ""}
                      {l.job_title ? ` · ${l.job_title}` : ""}
                      {l.email ? ` · ${l.email}` : ""}
                    </div>
                  </div>
                </Link>
                <div className="hidden md:block">
                  <Badge variant={l.converted_at ? "default" : "secondary"} className="text-[11px]">
                    {l.converted_at ? "converted" : l.status}
                  </Badge>
                </div>
                <div className="hidden md:block text-xs text-muted-foreground capitalize">
                  {l.source?.replace(/_/g, " ") ?? "—"}
                </div>
                <div className="hidden md:flex items-center gap-1.5">
                  <ScoreBar score={l.score} />
                  <span className="text-xs w-6 text-right">{l.score}</span>
                </div>
                <div className="hidden md:block">
                  <RatingBadge rating={l.rating} />
                </div>
                <div className="hidden md:block text-xs text-muted-foreground">
                  {timeago(l.updated_at, formatZonedDate)}
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
                        setEditing(l);
                        setOpenForm(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!!l.converted_at} onClick={() => setConverting(l)}>
                      <UserPlus2 className="w-4 h-4" /> Convert to customer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Set status</DropdownMenuLabel>
                    {LEAD_STATUSES.filter((s) => s !== "converted").map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => update.mutate({ id: l.id, patch: { status: s } })}
                      >
                        {s}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setConfirmDelete(l)}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">{rows.length} leads</p>
      </main>

      <LeadFormDialog open={openForm} onOpenChange={setOpenForm} initial={editing} />
      <ConvertLeadDialog
        open={!!converting}
        onOpenChange={(v) => !v && setConverting(null)}
        lead={converting}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Lead will be soft-deleted. You can restore it from trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                await del.mutateAsync({ id: confirmDelete.id });
                toast.success("Lead deleted");
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

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="text-xl font-display font-semibold mt-1">{value}</div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-muted-foreground/40";
  return (
    <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">—</span>;
  const icon =
    rating === "hot" ? (
      <Flame className="w-3 h-3" />
    ) : rating === "warm" ? (
      <Thermometer className="w-3 h-3" />
    ) : (
      <Snowflake className="w-3 h-3" />
    );
  const cls =
    rating === "hot"
      ? "text-red-500 bg-red-500/10"
      : rating === "warm"
        ? "text-amber-500 bg-amber-500/10"
        : "text-blue-500 bg-blue-500/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[11px] ${cls}`}>
      {icon}
      {rating}
    </span>
  );
}

function BulkStatus({ onSet }: { onSet: (s: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          Set status
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LEAD_STATUSES.filter((s) => s !== "converted").map((s) => (
          <DropdownMenuItem key={s} onClick={() => onSet(s)}>
            {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkOwner({
  members,
  onSet,
}: {
  members: Array<{ user_id: string; display_name: string | null }>;
  onSet: (id: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          Reassign
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSet(null)}>Unassigned</DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.user_id} onClick={() => onSet(m.user_id)}>
            {m.display_name || m.user_id.slice(0, 8)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function timeago(
  iso: string,
  formatDate: (date: Date | string | number, options: Intl.DateTimeFormatOptions) => string,
) {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(iso, {});
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}
