import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, LayoutGrid, TrendingUp, Loader2, DollarSign, Settings2,
  BarChart3, Trophy, Flame, X as XIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  useDeals, useCreateDefaultPipeline,
  formatMoney, DEAL_PRIORITIES, DEAL_STATUSES,
  type DealFilters,
} from "@/hooks/use-deals";
import {
  usePipelinesFull, useStagesFull, useDealsRealtime,
} from "@/hooks/use-pipeline";
import { useCurrentWorkspace, useWorkspaceMembers } from "@/hooks/use-workspace";
import { useTenantCurrency } from "@/hooks/use-currency";
import { DealFormDialog } from "@/components/app/deals/deal-form-dialog";
import { DealKanban } from "@/components/app/deals/deal-kanban";
import { PipelineManager } from "@/components/app/deals/pipeline-manager";
import { PipelineAnalytics } from "@/components/app/deals/pipeline-analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/deals/")({
  staticData: { breadcrumb: "Deals" },
  head: () => ({
    meta: [
      { title: "Sales Pipeline" },
      { name: "description", content: `Visual sales pipeline, deals, and revenue in ${BRAND_NAME}.` },
    ],
  }),
  component: DealsPage,
});

function DealsPage() {
  const { active } = useCurrentWorkspace();
  const { data: pipelines, isLoading: pipesLoading } = usePipelinesFull();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const activePipelineId =
    pipelineId ?? pipelines?.find((p) => p.is_default)?.id ?? pipelines?.[0]?.id ?? null;
  const activePipeline = pipelines?.find((p) => p.id === activePipelineId) ?? null;
  const { data: stages } = useStagesFull(activePipelineId);
  const { data: members } = useWorkspaceMembers(active?.id);

  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("open");
  const [tag, setTag] = useState<string>("");
  const [openCreate, setOpenCreate] = useState(false);
  const [openManager, setOpenManager] = useState(false);
  const [view, setView] = useState<"board" | "analytics">("board");
  const createDefault = useCreateDefaultPipeline();

  // Live updates
  useDealsRealtime(active?.id, activePipelineId);

  const filters: DealFilters = {
    search,
    pipelineId: activePipelineId ?? undefined,
    ownerId: ownerId !== "all" ? ownerId : undefined,
    priority: priority !== "all" ? (priority as DealFilters["priority"]) : undefined,
    status: status !== "all" ? (status as DealFilters["status"]) : undefined,
  };
  const { data: allDeals = [], isLoading } = useDeals(filters);

  // Client-side tag refine
  const deals = useMemo(
    () => tag ? allDeals.filter((d) => d.tags?.includes(tag)) : allDeals,
    [allDeals, tag],
  );

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    allDeals.forEach((d) => d.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [allDeals]);

  const membersById = useMemo(() => {
    const m = new Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>();
    (members ?? []).forEach((mm) => m.set(mm.user_id, { display_name: mm.display_name, avatar_url: mm.avatar_url, email: mm.email }));
    return m;
  }, [members]);

  const tenantCurrency = useTenantCurrency();

  const totals = useMemo(() => {
    const open = deals.filter((d) => d.status === "open");
    const won = deals.filter((d) => d.status === "won");
    const currency = activePipeline?.default_currency ?? deals[0]?.currency ?? tenantCurrency;
    return {
      count: deals.length,
      openCount: open.length,
      wonCount: won.length,
      openValue: open.reduce((a, d) => a + Number(d.amount || 0), 0),
      wonValue: won.reduce((a, d) => a + Number(d.amount || 0), 0),
      weightedValue: open.reduce((a, d) => a + (Number(d.amount || 0) * Number(d.probability || 0)) / 100, 0),
      currency,
    };
  }, [deals, activePipeline, tenantCurrency]);

  const hasFilters = search || ownerId !== "all" || priority !== "all" || tag || status !== "open";

  const handleCreateDefault = async () => {
    try {
      await createDefault.mutateAsync();
      toast.success("Default pipeline created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create pipeline");
    }
  };

  const clearFilters = () => {
    setSearch(""); setOwnerId("all"); setPriority("all"); setTag(""); setStatus("open");
  };

  return (
    <>
      <AppTopbar
        title="Sales pipeline"
        subtitle={activePipeline?.name ?? "Deals & opportunities"}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setOpenManager(true)}>
              <Settings2 className="w-4 h-4 mr-1.5" /> Manage pipelines
            </Button>
            <Button size="sm" onClick={() => setOpenCreate(true)} disabled={!stages?.length}>
              <Plus className="w-4 h-4 mr-1.5" /> New deal
            </Button>
          </>
        }
      />

      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Open" value={formatMoney(totals.openValue, totals.currency)} hint={`${totals.openCount} deals`} />
          <KpiCard label="Weighted" value={formatMoney(totals.weightedValue, totals.currency)}
            hint="expected" icon={<TrendingUp className="w-3 h-3" />} />
          <KpiCard label="Won" value={formatMoney(totals.wonValue, totals.currency)}
            hint={`${totals.wonCount} deals`} icon={<Trophy className="w-3 h-3" />} tone="emerald" />
          <KpiCard label="Total" value={String(totals.count)} hint="deals in view" />
        </div>

        {/* Toolbar */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deals, tags, notes"
                className="pl-8 h-9"
              />
            </div>

            {pipelines && pipelines.length > 0 && (
              <Select value={activePipelineId ?? ""} onValueChange={(v) => setPipelineId(v)}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: p.color ?? "#6366f1" }} />
                        {p.name}{p.is_default ? " · default" : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open only</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                {DEAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {(members ?? []).map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.display_name ?? m.email ?? m.user_id.slice(0, 6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {DEAL_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="inline-flex items-center gap-1.5">
                      {p === "urgent" && <Flame className="w-3 h-3 text-destructive" />}
                      {p}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {availableTags.length > 0 && (
              <Select value={tag || "__none__"} onValueChange={(v) => setTag(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Tag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any tag</SelectItem>
                  {availableTags.map((t) => <SelectItem key={t} value={t}>#{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon className="w-3.5 h-3.5 " /> Clear
              </Button>
            )}
          </div>

          {hasFilters && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {search && <FilterPill label={`"${search}"`} onClear={() => setSearch("")} />}
              {status !== "open" && <FilterPill label={`Status: ${status}`} onClear={() => setStatus("open")} />}
              {ownerId !== "all" && <FilterPill label="Owner filter" onClear={() => setOwnerId("all")} />}
              {priority !== "all" && <FilterPill label={`Priority: ${priority}`} onClear={() => setPriority("all")} />}
              {tag && <FilterPill label={`#${tag}`} onClear={() => setTag("")} />}
            </div>
          )}
        </Card>

        {/* Tabs: Board / Analytics */}
        <Tabs value={view} onValueChange={(v) => setView(v as "board" | "analytics")}>
          <TabsList>
            <TabsTrigger value="board"><LayoutGrid className="w-3.5 h-3.5 mr-1.5" /> Board</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="mt-4">
            {pipesLoading || isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading pipeline
              </div>
            ) : !pipelines?.length ? (
              <Card className="p-8 text-center space-y-3">
                <LayoutGrid className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <div>
                  <p className="font-medium">No pipeline yet</p>
                  <p className="text-sm text-muted-foreground">Create a default pipeline or start from a template.</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" onClick={handleCreateDefault} disabled={createDefault.isPending}>
                    {createDefault.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Create default pipeline
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpenManager(true)}>
                    Browse templates
                  </Button>
                </div>
              </Card>
            ) : !stages?.length ? (
              <Card className="p-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">This pipeline has no stages yet.</p>
                <Button size="sm" onClick={() => setOpenManager(true)}>
                  <Settings2 className="w-4 h-4 mr-1.5" /> Configure stages
                </Button>
              </Card>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <DealKanban
                  stages={stages}
                  deals={deals}
                  membersById={membersById}
                  pipelineStaleAfter={activePipeline?.stale_after_days ?? 14}
                />
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <PipelineAnalytics pipelineId={activePipelineId} />
          </TabsContent>
        </Tabs>
      </main>

      <DealFormDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        defaults={{ pipeline_id: activePipelineId ?? undefined }}
      />

      <PipelineManager
        open={openManager}
        onOpenChange={setOpenManager}
        initialPipelineId={activePipelineId}
        onPipelineChange={(id) => setPipelineId(id)}
      />
    </>
  );
}

function KpiCard({
  label, value, hint, icon, tone,
}: {
  label: string; value: string; hint: string;
  icon?: React.ReactNode;
  tone?: "emerald" | "destructive";
}) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Card className="p-3 h-full">
        <div className="text-[11px]  text-muted-foreground flex items-center gap-1">
          {icon}{label}
        </div>
        <div className={
          "text-xl font-semibold mt-1 " +
          (tone === "emerald" ? "text-emerald-600 dark:text-emerald-400 " : "") +
          (tone === "destructive" ? "text-destructive " : "")
        }>
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </Card>
    </motion.div>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-0.5">
      {label}
      <button onClick={onClear} className="hover:text-destructive p-0.5">
        <XIcon className="w-2.5 h-2.5" />
      </button>
    </Badge>
  );
}
