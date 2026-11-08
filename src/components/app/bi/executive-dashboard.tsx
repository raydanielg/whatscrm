import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  MessageSquare,
  MessageCircle,
  CheckCircle2,
  Clock,
  Timer,
  Users,
  UserPlus,
  Trophy,
  TrendingDown,
  DollarSign,
  Megaphone,
  Sparkles,
  Workflow,
  HardDrive,
  Zap,
  CreditCard,
  HeartPulse,
  Settings2,
  Radio,
  GripVertical,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BiMetricWidget } from "./bi-metric-widget";
import {
  getExecutiveOverview,
  getActivityFeed,
  type ExecutiveOverview,
  type ActivityFeedItem,
} from "@/lib/bi/executive.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { ScrollArea } from "@/components/ui/scroll-area";

type WidgetId =
  | "total-conversations"
  | "active-conversations"
  | "resolved-conversations"
  | "response-time"
  | "first-response-time"
  | "resolution-time"
  | "total-customers"
  | "new-leads"
  | "won-deals"
  | "lost-deals"
  | "revenue"
  | "campaign-performance"
  | "ai-usage"
  | "workflow-executions"
  | "storage-usage"
  | "api-requests"
  | "subscription-status"
  | "system-health"
  | "realtime-activity";

interface WidgetDef {
  id: WidgetId;
  label: string;
  icon: typeof Activity;
  group: "conversations" | "sla" | "customers" | "sales" | "marketing" | "system";
  span?: "sm" | "md" | "lg" | "xl"; // grid column span
}

const WIDGETS: WidgetDef[] = [
  {
    id: "total-conversations",
    label: "Total Conversations",
    icon: MessageSquare,
    group: "conversations",
  },
  {
    id: "active-conversations",
    label: "Active Conversations",
    icon: MessageCircle,
    group: "conversations",
  },
  {
    id: "resolved-conversations",
    label: "Resolved Conversations",
    icon: CheckCircle2,
    group: "conversations",
  },
  { id: "response-time", label: "Response Time", icon: Clock, group: "sla" },
  { id: "first-response-time", label: "First Response Time", icon: Timer, group: "sla" },
  { id: "resolution-time", label: "Resolution Time", icon: Timer, group: "sla" },
  { id: "total-customers", label: "Total Customers", icon: Users, group: "customers" },
  { id: "new-leads", label: "New Leads", icon: UserPlus, group: "customers" },
  { id: "won-deals", label: "Won Deals", icon: Trophy, group: "sales" },
  { id: "lost-deals", label: "Lost Deals", icon: TrendingDown, group: "sales" },
  { id: "revenue", label: "Revenue", icon: DollarSign, group: "sales", span: "md" },
  {
    id: "campaign-performance",
    label: "Campaign Performance",
    icon: Megaphone,
    group: "marketing",
    span: "md",
  },
  { id: "ai-usage", label: "AI Usage", icon: Sparkles, group: "system" },
  { id: "workflow-executions", label: "Workflow Executions", icon: Workflow, group: "system" },
  { id: "storage-usage", label: "Storage Usage", icon: HardDrive, group: "system" },
  { id: "api-requests", label: "API Requests", icon: Zap, group: "system" },
  {
    id: "subscription-status",
    label: "Subscription Status",
    icon: CreditCard,
    group: "system",
    span: "md",
  },
  { id: "system-health", label: "System Health", icon: HeartPulse, group: "system", span: "md" },
  {
    id: "realtime-activity",
    label: "Realtime Activity Feed",
    icon: Radio,
    group: "system",
    span: "xl",
  },
];

const DEFAULT_LAYOUT: WidgetId[] = WIDGETS.map((w) => w.id);

function useLayout(workspaceId: string) {
  const key = `bi.exec.layout.${workspaceId}`;
  const [layout, setLayout] = useState<WidgetId[]>(DEFAULT_LAYOUT);
  const [hidden, setHidden] = useState<Set<WidgetId>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { order?: WidgetId[]; hidden?: WidgetId[] };
        const known = new Set(DEFAULT_LAYOUT);
        const order = (parsed.order ?? []).filter((id) => known.has(id));
        const missing = DEFAULT_LAYOUT.filter((id) => !order.includes(id));
        setLayout([...order, ...missing]);
        setHidden(new Set((parsed.hidden ?? []).filter((id) => known.has(id))));
      }
    } catch {
      /* ignore */
    }
  }, [key, workspaceId]);

  const persist = (order: WidgetId[], h: Set<WidgetId>) => {
    if (typeof window === "undefined" || !workspaceId) return;
    localStorage.setItem(key, JSON.stringify({ order, hidden: [...h] }));
  };

  return {
    layout,
    hidden,
    toggle: (id: WidgetId) =>
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(layout, next);
        return next;
      }),
    move: (id: WidgetId, dir: -1 | 1) =>
      setLayout((prev) => {
        const idx = prev.indexOf(id);
        if (idx < 0) return prev;
        const swap = idx + dir;
        if (swap < 0 || swap >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[swap]] = [next[swap], next[idx]];
        persist(next, hidden);
        return next;
      }),
    reset: () => {
      setLayout(DEFAULT_LAYOUT);
      setHidden(new Set());
      if (typeof window !== "undefined" && workspaceId) localStorage.removeItem(key);
    },
  };
}

function formatDuration(ms: number) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  delta,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warn" | "danger";
  delta?: number;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500 bg-emerald-500/10"
      : tone === "warn"
        ? "text-amber-500 bg-amber-500/10"
        : tone === "danger"
          ? "text-rose-500 bg-rose-500/10"
          : "text-primary bg-primary/10";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-control border border-border bg-surface p-4 flex flex-col gap-3 h-full"
    >
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-control flex items-center justify-center ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-display font-semibold mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
    </motion.div>
  );
}

function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  const fmtZoned = useZonedDateFormatter();
  const iconFor = (t: ActivityFeedItem["type"]) =>
    t === "message"
      ? MessageSquare
      : t === "deal"
        ? Trophy
        : t === "lead"
          ? UserPlus
          : t === "contact"
            ? Users
            : t === "workflow"
              ? Workflow
              : Megaphone;
  return (
    <div className="rounded-control border border-border bg-surface p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Realtime Activity</h3>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </div>
      <ScrollArea type="hover" viewportClassName="max-h-80 [&>div]:!block">
        <div className="space-y-2 pr-1">
          <AnimatePresence initial={false}>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent activity.</p>
            ) : (
              items.map((it) => {
                const Icon = iconFor(it.type);
                return (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-start gap-3 rounded-control p-2 hover:bg-surface-elevated transition-colors"
                  >
                    <div className="h-7 w-7 rounded-control bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.title}</p>
                      {it.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {fmtZoned(new Date(it.createdAt), { hour: "numeric", minute: "2-digit" })} ·{" "}
                        {it.type}
                        {it.status ? ` · ${it.status}` : ""}
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

function CustomizeSheet({
  open,
  onClose,
  layout,
  hidden,
  onToggle,
  onMove,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  layout: WidgetId[];
  hidden: Set<WidgetId>;
  onToggle: (id: WidgetId) => void;
  onMove: (id: WidgetId, dir: -1 | 1) => void;
  onReset: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 240 }}
            className="fixed top-0 right-0 h-full w-full sm:w-96 z-50 bg-surface border-l border-border p-5 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Customize dashboard</h3>
                <p className="text-xs text-muted-foreground">
                  Reorder or hide widgets. Saved per workspace.
                </p>
              </div>
              <button onClick={onReset} className="text-xs text-primary hover:underline">
                Reset
              </button>
            </div>
            <ScrollArea type="hover" className="flex-1 min-h-0">
              <div className="space-y-1">
                {layout.map((id) => {
                  const def = WIDGETS.find((w) => w.id === id);
                  if (!def) return null;
                  const isHidden = hidden.has(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-control border border-border p-2"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <def.icon className="h-4 w-4 text-primary" />
                      <span
                        className={`flex-1 text-sm ${isHidden ? "text-muted-foreground line-through" : ""}`}
                      >
                        {def.label}
                      </span>
                      <button
                        onClick={() => onMove(id, -1)}
                        className="text-xs text-muted-foreground hover:text-foreground px-1"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => onMove(id, 1)}
                        className="text-xs text-muted-foreground hover:text-foreground px-1"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => onToggle(id)}
                        className={`p-1 rounded hover:bg-surface-elevated ${isHidden ? "text-muted-foreground" : "text-primary"}`}
                        aria-label={isHidden ? "Show widget" : "Hide widget"}
                      >
                        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <button
              onClick={onClose}
              className="mt-4 h-10 rounded-control bg-primary text-primary-foreground font-medium"
            >
              Done
            </button>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function ExecutiveDashboard({ workspaceId }: { workspaceId: string }) {
  const { layout, hidden, toggle, move, reset } = useLayout(workspaceId);
  const [customizing, setCustomizing] = useState(false);
  const fmtZoned = useZonedDateFormatter();

  const overviewFn = useServerFn(getExecutiveOverview);
  const feedFn = useServerFn(getActivityFeed);

  const { data: overview } = useQuery({
    queryKey: ["bi.exec.overview", workspaceId],
    queryFn: () => overviewFn({ data: { workspaceId } }) as Promise<ExecutiveOverview>,
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: !!workspaceId,
  });

  const { data: feed, refetch: refetchFeed } = useQuery({
    queryKey: ["bi.exec.feed", workspaceId],
    queryFn: () => feedFn({ data: { workspaceId, limit: 25 } }) as Promise<ActivityFeedItem[]>,
    refetchInterval: 20_000,
    enabled: !!workspaceId,
  });

  // Realtime — refresh feed and overview on relevant table changes
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`bi-exec-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => refetchFeed(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `workspace_id=eq.${workspaceId}` },
        () => refetchFeed(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `workspace_id=eq.${workspaceId}` },
        () => refetchFeed(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workflow_runs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => refetchFeed(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, refetchFeed]);

  const visible = useMemo(() => layout.filter((id) => !hidden.has(id)), [layout, hidden]);

  const spanClass = (span?: WidgetDef["span"]) =>
    span === "xl"
      ? "col-span-1 sm:col-span-2 lg:col-span-4"
      : span === "lg"
        ? "col-span-1 sm:col-span-2 lg:col-span-3"
        : span === "md"
          ? "col-span-1 sm:col-span-2 lg:col-span-2"
          : "col-span-1";

  const renderWidget = (id: WidgetId) => {
    const def = WIDGETS.find((w) => w.id === id);
    if (!def) return null;
    const wrapperClass = spanClass(def.span);
    switch (id) {
      case "total-conversations":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="conversations.total"
              title="Total Conversations"
              chart="line"
            />
          </div>
        );
      case "active-conversations":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="conversations.open"
              title="Active Conversations"
              chart="area"
            />
          </div>
        );
      case "resolved-conversations":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="conversations.resolved"
              title="Resolved Conversations"
              chart="bar"
            />
          </div>
        );
      case "response-time":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={Clock}
              label="Avg Response Time"
              value={overview ? formatDuration(overview.responseTime.avgFirstResponseMs) : ""}
              hint={overview ? `${overview.responseTime.slaBreaches} SLA breaches` : undefined}
              tone={overview && overview.responseTime.slaBreaches > 5 ? "warn" : "default"}
            />
          </div>
        );
      case "first-response-time":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={Timer}
              label="First Response"
              value={overview ? formatDuration(overview.responseTime.avgFirstResponseMs) : ""}
              hint="Median across SLAs"
            />
          </div>
        );
      case "resolution-time":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={Timer}
              label="Resolution Time"
              value={overview ? formatDuration(overview.responseTime.avgResolutionMs) : ""}
              hint="Avg time to resolve"
            />
          </div>
        );
      case "total-customers":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={Users}
              label="Total Customers"
              value={overview ? overview.customers.total.toLocaleString() : ""}
              hint={overview ? `+${overview.customers.new30d} new (30d)` : undefined}
              tone="success"
            />
          </div>
        );
      case "new-leads":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="leads.new"
              title="New Leads"
              chart="line"
            />
          </div>
        );
      case "won-deals":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={Trophy}
              label="Won Deals (30d)"
              value={overview ? overview.deals.won30d.toLocaleString() : ""}
              hint={overview ? `${overview.deals.winRate.toFixed(1)}% win rate` : undefined}
              tone="success"
            />
          </div>
        );
      case "lost-deals":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={TrendingDown}
              label="Lost Deals (30d)"
              value={overview ? overview.deals.lost30d.toLocaleString() : ""}
              tone="danger"
            />
          </div>
        );
      case "revenue":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="deals.revenue"
              title="Revenue (Won)"
              chart="area"
              unit="currency"
            />
          </div>
        );
      case "campaign-performance":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="campaigns.delivered"
              title="Campaign Performance"
              chart="bar"
            />
          </div>
        );
      case "ai-usage":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="ai.requests"
              title="AI Usage"
              chart="line"
            />
          </div>
        );
      case "workflow-executions":
        return (
          <div key={id} className={wrapperClass}>
            <BiMetricWidget
              workspaceId={workspaceId}
              metric="workflow.runs"
              title="Workflow Executions"
              chart="area"
            />
          </div>
        );
      case "storage-usage":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={HardDrive}
              label="Storage"
              value={overview ? formatBytes(overview.storage.totalBytes) : ""}
              hint={overview ? `${overview.storage.fileCount.toLocaleString()} files` : undefined}
            />
          </div>
        );
      case "api-requests":
        return (
          <div key={id} className={wrapperClass}>
            <StatCard
              icon={Zap}
              label="API Requests (24h)"
              value={overview ? overview.api.requests24h.toLocaleString() : ""}
              hint={overview ? `${overview.api.errorRate.toFixed(1)}% errors` : undefined}
              tone={overview && overview.api.errorRate > 5 ? "warn" : "default"}
            />
          </div>
        );
      case "subscription-status": {
        const s = overview?.subscription;
        return (
          <div key={id} className={wrapperClass}>
            <div className="rounded-control border border-border bg-surface p-4 h-full flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Subscription</h3>
              </div>
              <p className="text-2xl font-display font-semibold capitalize">{s?.plan ?? "—"}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-control font-medium ${s?.status === "active" ? "bg-emerald-500/10 text-emerald-500" : s?.status === "trialing" ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"}`}
                >
                  {s?.status ?? "unknown"}
                </span>
                {s?.seats != null && (
                  <span className="px-2 py-0.5 rounded-control bg-muted text-muted-foreground">
                    {s.seats} seats
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-auto">
                {s?.currentPeriodEnd
                  ? `Renews ${fmtZoned(new Date(s.currentPeriodEnd), { dateStyle: "medium" })}`
                  : s?.trialEndsAt
                    ? `Trial ends ${fmtZoned(new Date(s.trialEndsAt), { dateStyle: "medium" })}`
                    : ""}
              </p>
            </div>
          </div>
        );
      }
      case "system-health": {
        const h = overview?.systemHealth;
        const tone =
          h?.dbStatus === "healthy" ? "success" : h?.dbStatus === "degraded" ? "warn" : "danger";
        const toneClass =
          tone === "success"
            ? "text-emerald-500"
            : tone === "warn"
              ? "text-amber-500"
              : "text-rose-500";
        return (
          <div key={id} className={wrapperClass}>
            <div className="rounded-control border border-border bg-surface p-4 h-full flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <HeartPulse className={`h-4 w-4 ${toneClass}`} />
                <h3 className="text-sm font-semibold">System Health</h3>
                <span className={`ml-auto text-xs capitalize font-medium ${toneClass}`}>
                  {h?.dbStatus ?? ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                <div className="rounded-control bg-surface-elevated p-2">
                  <p className="text-muted-foreground">Queue backlog</p>
                  <p className="font-semibold text-sm">{h?.queueBacklog ?? 0}</p>
                </div>
                <div className="rounded-control bg-surface-elevated p-2">
                  <p className="text-muted-foreground">Failed workflows</p>
                  <p className="font-semibold text-sm">{h?.failedWorkflows24h ?? 0}</p>
                </div>
                <div className="rounded-control bg-surface-elevated p-2">
                  <p className="text-muted-foreground">Failed messages</p>
                  <p className="font-semibold text-sm">{h?.failedMessages24h ?? 0}</p>
                </div>
                <div className="rounded-control bg-surface-elevated p-2">
                  <p className="text-muted-foreground">AI issues</p>
                  <p className="font-semibold text-sm">{h?.aiProviderIssues ?? 0}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {h
                  ? `Checked ${fmtZoned(new Date(h.lastCheckedAt), { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
                  : ""}
              </p>
            </div>
          </div>
        );
      }
      case "realtime-activity":
        return (
          <div key={id} className={wrapperClass}>
            <ActivityFeed items={feed ?? []} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-semibold">Executive Dashboard</h2>
          <p className="text-xs text-muted-foreground">
            Live view across conversations, sales, marketing, AI, and platform health.
          </p>
        </div>
        <button
          onClick={() => setCustomizing(true)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-control border border-border bg-surface text-sm font-medium hover:bg-surface-elevated"
        >
          <Settings2 className="h-4 w-4" /> Customize
        </button>
      </div>

      <motion.div layout className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatePresence>{visible.map(renderWidget)}</AnimatePresence>
      </motion.div>

      {visible.length === 0 && (
        <div className="rounded-control border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            All widgets are hidden. Open{" "}
            <button onClick={() => setCustomizing(true)} className="text-primary underline">
              Customize
            </button>{" "}
            to add them back.
          </p>
        </div>
      )}

      <CustomizeSheet
        open={customizing}
        onClose={() => setCustomizing(false)}
        layout={layout}
        hidden={hidden}
        onToggle={toggle}
        onMove={move}
        onReset={reset}
      />
    </div>
  );
}
