import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Search, MoreHorizontal, Pencil, Filter, Users, Heart, DollarSign, Activity, Tag, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useCustomers, useActiveCustomerCount, useCustomersRealtime, useBulkUpdateCustomers, customerDisplayName, customerInitials, CUSTOMER_STATUSES, type CustomerRow, type CustomerFilters } from "@/hooks/use-customers";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { CustomerEditDialog } from "@/components/app/customers/customer-edit-dialog";

export const Route = createFileRoute("/_authenticated/customers/")({
  staticData: { breadcrumb: "Customers" },
  head: () => ({
    meta: [
      { title: "Customers" },
      { name: "description", content: "Manage customer profiles, health, LTV, and segments." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  useCustomersRealtime();
  const location = useLocation();
  const { active } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(active?.id);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Omit<CustomerFilters, "search">>(() =>
    location.hash?.replace(/^#/, "") === "active" ? { customerStatus: "active" } : {},
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CustomerRow | null>(null);

  const activeFilters: CustomerFilters = useMemo(() => ({ ...filters, search }), [filters, search]);
  const { data: rows = [], isLoading } = useCustomers(activeFilters);
  const activeCount = useActiveCustomerCount(filters.customerStatus === "active");
  // Lifetime value is stored without a per-row currency, so it is denominated
  // in the tenant's — it was rendering as dollars for every tenant before.
  const money = useCurrencyFormatter({ maximumFractionDigits: 0 });
  const bulk = useBulkUpdateCustomers();

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.customer_status === "active").length;
    const atRisk = rows.filter((r) => r.customer_status === "at_risk" || (r.customer_health_score ?? 100) < 40).length;
    const ltv = rows.reduce((s, r) => s + Number(r.customer_lifetime_value ?? 0), 0);
    return { total, active, atRisk, ltv };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const segmentOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => (r.segments ?? []).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [rows]);

  return (
    <>
      <AppTopbar title="Customers" subtitle="360° customer view, health, and lifetime value" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {filters.customerStatus === "active" && (
          <div className="rounded-control border border-border bg-muted/30 px-4 py-2 text-sm">
            Active customers · {activeCount.isLoading ? "Loading total…" : activeCount.isError ? "Total unavailable" : `${activeCount.data ?? 0} total`}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Customers" value={String(stats.total)} icon={<Users className="w-4 h-4 text-accent" />} />
          <Stat label={filters.customerStatus === "active" ? "Active shown" : "Active"} value={String(stats.active)} icon={<Activity className="w-4 h-4 text-green-500" />} />
          <Stat label="At risk" value={String(stats.atRisk)} icon={<Heart className="w-4 h-4 text-red-500" />} />
          <Stat label="Total LTV" value={money(stats.ltv)} icon={<DollarSign className="w-4 h-4 text-yellow-500" />} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="pl-9" />
          </div>
          <Select value={filters.customerStatus ?? "any"} onValueChange={(v) => setFilters((f) => ({ ...f, customerStatus: v === "any" ? undefined : v }))}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {CUSTOMER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.segment ?? "any"} onValueChange={(v) => setFilters((f) => ({ ...f, segment: v === "any" ? undefined : v }))}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Segment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any segment</SelectItem>
              {segmentOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.ownerId ?? "any"} onValueChange={(v) => setFilters((f) => ({ ...f, ownerId: v === "any" ? undefined : v }))}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any owner</SelectItem>
              {(members ?? []).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || m.user_id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><Filter className="w-4 h-4 mr-1.5" /> Health {filters.minHealth ? `≥ ${filters.minHealth}` : ""}</Button></PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="text-xs text-muted-foreground mb-2">Minimum health: {filters.minHealth ?? 0}</div>
              <Slider value={[filters.minHealth ?? 0]} min={0} max={100} step={5} onValueChange={([v]) => setFilters((f) => ({ ...f, minHealth: v || undefined }))} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><Filter className="w-4 h-4 mr-1.5" /> LTV {filters.minLtv ? `≥ ${money(Number(filters.minLtv))}` : ""}</Button></PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="text-xs text-muted-foreground mb-2">Minimum LTV</div>
              <Input type="number" value={filters.minLtv ?? ""} onChange={(e) => setFilters((f) => ({ ...f, minLtv: e.target.value ? Number(e.target.value) : undefined }))} />
            </PopoverContent>
          </Popover>
        </div>

        {selected.size > 0 && (
          <div className="rounded-control border border-border bg-muted/40 p-2 flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium">{selected.size} selected</span>
            <div className="ml-auto flex gap-1 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">Set status</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">Customer status</DropdownMenuLabel>
                  {CUSTOMER_STATUSES.map((s) => (
                    <DropdownMenuItem key={s} onClick={async () => { await bulk.mutateAsync({ ids: [...selected], patch: { customer_status: s } }); setSelected(new Set()); toast.success(`Status: ${s}`); }}>{s}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><Tag className="w-4 h-4 " /> Segment</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={async () => { await bulk.mutateAsync({ ids: [...selected], patch: { segments: ["Enterprise"] } }); setSelected(new Set()); }}>Set: Enterprise</DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => { await bulk.mutateAsync({ ids: [...selected], patch: { segments: ["SMB"] } }); setSelected(new Set()); }}>Set: SMB</DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => { await bulk.mutateAsync({ ids: [...selected], patch: { segments: ["VIP"] } }); setSelected(new Set()); }}>Set: VIP</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await bulk.mutateAsync({ ids: [...selected], patch: { segments: [] } }); setSelected(new Set()); }}>Clear segments</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
        )}

        <div className="rounded-control border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_110px_110px_110px_1fr_40px] gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <div>Customer</div>
            <div className="hidden md:block">Status</div>
            <div className="hidden md:block">LTV</div>
            <div className="hidden md:block">Health</div>
            <div className="hidden md:block">Segments</div>
            <div />
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No customers yet. Convert a lead or update a contact's lifecycle stage.</p>
              <Link to="/leads" className="inline-block mt-3"><Button size="sm" variant="outline">Go to leads <ArrowRight className="w-4 h-4 ml-1.5" /></Button></Link>
            </div>
          ) : (
            rows.map((c) => (
              <div key={c.id} className="grid grid-cols-[36px_1fr_110px_110px_110px_1fr_40px] gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 group items-center">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <Link to="/customers/$customerId" params={{ customerId: c.id }} className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-8 h-8">
                    {c.avatar_url ? <AvatarImage src={c.avatar_url} /> : null}
                    <AvatarFallback className="text-xs bg-accent/10 text-accent">{customerInitials(c)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{customerDisplayName(c)}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.job_title ?? ""}{c.email ? ` · ${c.email}` : ""}</div>
                  </div>
                </Link>
                <div className="hidden md:block"><Badge variant="secondary" className="text-[11px]">{c.customer_status ?? "—"}</Badge></div>
                <div className="hidden md:block text-sm">{c.customer_lifetime_value != null ? money(Number(c.customer_lifetime_value)) : "—"}</div>
                <div className="hidden md:flex items-center gap-1.5">
                  <HealthBar score={c.customer_health_score} />
                  <span className="text-xs w-6 text-right">{c.customer_health_score ?? "—"}</span>
                </div>
                <div className="hidden md:flex flex-wrap gap-1">
                  {(c.segments ?? []).slice(0, 3).map((s) => <Badge key={s} variant="outline" className="text-[11px]">{s}</Badge>)}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="w-4 h-4" /> Edit profile</DropdownMenuItem>
                    <Link to="/contacts/$contactId" params={{ contactId: c.id }}><DropdownMenuItem>View contact</DropdownMenuItem></Link>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">{rows.length} customers</p>
      </main>

      <CustomerEditDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} customer={editing} />
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-xl font-display font-semibold mt-1">{value}</div>
    </div>
  );
}

function HealthBar({ score }: { score: number | null }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>;
}
