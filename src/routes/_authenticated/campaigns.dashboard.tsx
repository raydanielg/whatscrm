import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  CheckCircle2,
  Eye,
  XCircle,
  Clock,
  TrendingUp,
  Plus,
  BarChart3,
  CalendarIcon,
  Search,
  X,
  Download,
} from "lucide-react";
import { useCampaigns, useMarketingRealtime, type CampaignRow } from "@/hooks/use-marketing";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_authenticated/campaigns/dashboard")({
  component: CampaignDashboardPage,
});

const STATUS_OPTIONS = ["running", "scheduled", "completed", "draft", "paused", "failed"] as const;

const RANGE_PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  running: "bg-success/10 text-success",
  scheduled: "bg-accent/10 text-accent",
  completed: "bg-muted text-muted-foreground",
  draft: "bg-secondary text-secondary-foreground",
  paused: "bg-warning/15 text-warning-foreground",
  failed: "bg-destructive/10 text-destructive",
};

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCampaignsCsv(rows: CampaignRow[]) {
  const headers = [
    "name",
    "status",
    "channel",
    "created_at",
    "scheduled_at",
    "started_at",
    "completed_at",
    "total_recipients",
    "sent",
    "delivered",
    "read",
    "replied",
    "clicked",
    "failed",
    "opted_out",
    "delivery_rate_%",
    "read_rate_%",
    "failure_rate_%",
  ];
  const data = rows.map((c) => {
    const sent = c.sent_count ?? 0;
    const delivered = c.delivered_count ?? 0;
    const read = c.read_count ?? 0;
    const failed = c.failed_count ?? 0;
    const recips = c.total_recipients ?? 0;
    return [
      c.name ?? "",
      c.status ?? "",
      (c as unknown as { channel?: string }).channel ?? "",
      c.created_at ?? "",
      c.scheduled_at ?? "",
      (c as unknown as { started_at?: string }).started_at ?? "",
      (c as unknown as { completed_at?: string }).completed_at ?? "",
      recips,
      sent,
      delivered,
      read,
      (c as unknown as { replied_count?: number }).replied_count ?? 0,
      (c as unknown as { clicked_count?: number }).clicked_count ?? 0,
      failed,
      (c as unknown as { opted_out_count?: number }).opted_out_count ?? 0,
      pct(delivered, sent),
      pct(read, delivered),
      pct(failed, sent),
    ] as (string | number)[];
  });
  const ts = format(new Date(), "yyyyMMdd-HHmm");
  downloadCsv(`campaign-metrics-${ts}.csv`, headers, data);
}

function CampaignDashboardPage() {
  useMarketingRealtime();
  const { active } = useCurrentWorkspace();
  const { data: campaigns = [], isLoading } = useCampaigns();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rangePreset, setRangePreset] = useState<string>("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState("");

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["campaign-dispatch-pending", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("campaign_dispatch_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", active!.id)
        .in("status", ["pending", "queued", "processing"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const dateBounds = useMemo<{ from: Date | null; to: Date | null }>(() => {
    if (rangePreset === "all") return { from: null, to: null };
    if (rangePreset === "custom") {
      return {
        from: customRange?.from ? startOfDay(customRange.from) : null,
        to: customRange?.to ? startOfDay(customRange.to) : null,
      };
    }
    const days = Number(rangePreset);
    return { from: startOfDay(subDays(new Date(), days - 1)), to: null };
  }, [rangePreset, customRange]);

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (term && !c.name?.toLowerCase().includes(term)) return false;
      const created = startOfDay(new Date(c.created_at));
      if (dateBounds.from && created < dateBounds.from) return false;
      if (dateBounds.to && created > dateBounds.to) return false;
      return true;
    });
  }, [campaigns, statusFilter, search, dateBounds]);

  const stats = useMemo(() => {
    const total = filteredCampaigns.length;
    const sent = filteredCampaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);
    const delivered = filteredCampaigns.reduce((s, c) => s + (c.delivered_count ?? 0), 0);
    const read = filteredCampaigns.reduce((s, c) => s + (c.read_count ?? 0), 0);
    const failed = filteredCampaigns.reduce((s, c) => s + (c.failed_count ?? 0), 0);
    const recipients = filteredCampaigns.reduce((s, c) => s + (c.total_recipients ?? 0), 0);
    return { total, sent, delivered, read, failed, recipients };
  }, [filteredCampaigns]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filteredCampaigns) {
      map.set(c.status, (map.get(c.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredCampaigns]);

  const activity = useMemo(() => {
    const days: { date: Date; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({ date: d, label: format(d, "MMM d"), count: 0 });
    }
    for (const c of filteredCampaigns) {
      const created = startOfDay(new Date(c.created_at));
      const day = days.find((d) => d.date.getTime() === created.getTime());
      if (day) day.count += 1;
    }
    return days;
  }, [filteredCampaigns]);

  const maxActivity = Math.max(1, ...activity.map((a) => a.count));
  const hasActivity = activity.some((a) => a.count > 0);

  const recent = filteredCampaigns.slice(0, 10);

  const hasActiveFilters =
    statusFilter !== "all" ||
    rangePreset !== "30" ||
    search.trim().length > 0 ||
    !!customRange?.from;

  const resetFilters = () => {
    setStatusFilter("all");
    setRangePreset("30");
    setCustomRange(undefined);
    setSearch("");
  };

  const rangeLabel =
    rangePreset === "custom"
      ? customRange?.from
        ? customRange.to
          ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d, yyyy")}`
          : format(customRange.from, "MMM d, yyyy")
        : "Pick dates"
      : (RANGE_PRESETS.find((r) => r.value === rangePreset)?.label ?? "");

  return (
    <>
      <AppTopbar
        title="Campaign Dashboard"
        subtitle="View and manage sent campaigns"
        actions={
          <ActionBar
            primary={[
              <Button key="analytics" variant="outline" asChild>
                <Link to="/campaign-analytics">
                  <BarChart3 className="mr-2 h-4 w-4" /> Analytics
                </Link>
              </Button>,
              <Button key="new-campaign" asChild>
                <Link to="/campaigns/send">
                  <Plus className="mr-2 h-4 w-4" /> New Campaign
                </Link>
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem
                key="export-csv"
                onClick={() => exportCampaignsCsv(filteredCampaigns)}
                disabled={filteredCampaigns.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </DropdownMenuItem>,
            ]}
          />
        }
      />

      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Filters */}
        <Card className="rounded-control">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 rounded-control"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] rounded-control">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={rangePreset} onValueChange={setRangePreset}>
              <SelectTrigger className="w-[160px] rounded-control">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {rangePreset === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "rounded-control justify-start text-left font-normal min-w-[220px]",
                      !customRange?.from && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {rangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={customRange}
                    onSelect={setCustomRange}
                    numberOfMonths={2}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}

            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {filteredCampaigns.length} of {campaigns.length}
              </span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="rounded-control">
                  <X className="mr-1 h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top KPIs */}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KpiCard
            icon={<Send className="h-4 w-4" />}
            label="Total Campaigns"
            value={stats.total}
          />
          <KpiCard
            icon={<Send className="h-4 w-4" />}
            label="Messages Sent"
            value={stats.sent}
            sub={`${pct(stats.sent, stats.recipients)}%`}
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            label="Delivered"
            value={stats.delivered}
            sub={`${pct(stats.delivered, stats.sent)}%`}
          />
          <KpiCard
            icon={<Eye className="h-4 w-4 text-accent" />}
            label="Read"
            value={stats.read}
            sub={`${pct(stats.read, stats.delivered)}%`}
          />
          <KpiCard
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            label="Failed"
            value={stats.failed}
          />
        </div>

        {/* Rates */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <RateCard label="Delivery Rate" value={pct(stats.delivered, stats.sent)} tone="success" />
          <RateCard label="Read Rate" value={pct(stats.read, stats.delivered)} tone="accent" />
          <RateCard label="Failure Rate" value={pct(stats.failed, stats.sent)} tone="destructive" />
          <Card className="rounded-control">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Pending Messages</div>
                <div className="text-2xl font-semibold mt-1">{pendingCount}</div>
              </div>
              <Clock className="h-8 w-8 text-warning" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status breakdown */}
          <Card className="rounded-control">
            <CardHeader>
              <CardTitle className="text-base">Campaign Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="space-y-2 pt-2">
                {statusBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaigns yet</p>
                ) : (
                  statusBreakdown.map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <Badge
                        variant="secondary"
                        className={cn("rounded-control uppercase text-[11px]", STATUS_STYLES[status])}
                      >
                        {status}
                      </Badge>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activity chart */}
          <Card className="rounded-control lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Last 7 Days Activity</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {!hasActivity ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No activity in the last 7 days
                </div>
              ) : (
                <div className="flex items-end justify-between gap-2 h-40">
                  {activity.map((a) => (
                    <div key={a.label} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex flex-col justify-end h-32">
                        <div
                          className="w-full bg-primary/80 rounded-control transition-all"
                          style={{ height: `${(a.count / maxActivity) * 100}%` }}
                          title={`${a.count} campaigns`}
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground">{a.label}</div>
                      <div className="text-xs font-medium">{a.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent campaigns */}
        <Card className="rounded-control">
          <CardHeader>
            <CardTitle className="text-base">Recent Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-center">Sent / Delivered / Read / Failed</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading
                    </TableCell>
                  </TableRow>
                ) : recent.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No campaigns yet.{" "}
                      <Link to="/campaigns/send" className="text-primary underline">
                        Send your first campaign
                      </Link>
                    </TableCell>
                  </TableRow>
                ) : (
                  recent.map((c) => <RecentRow key={c.id} campaign={c} />)
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card className="rounded-control">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>{label}</span>
          {icon}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{value}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function RateCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "accent" | "destructive";
}) {
  const toneMap = {
    success: "text-success",
    accent: "text-accent",
    destructive: "text-destructive",
  } as const;
  return (
    <Card className="rounded-control">
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold", toneMap[tone])}>{value}%</div>
        <Progress value={value} className="mt-3 h-1.5" />
      </CardContent>
    </Card>
  );
}

function RecentRow({ campaign: c }: { campaign: CampaignRow }) {
  const formatZoned = useZonedDateFormatter();
  const progress =
    c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/campaigns/$campaignId"
          params={{ campaignId: c.id }}
          className="font-medium hover:text-primary"
        >
          {c.name}
        </Link>
        {c.template_id && (
          <div className="text-xs text-muted-foreground font-mono truncate max-w-[220px]">
            {c.template_id}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={cn("rounded-control uppercase text-[11px]", STATUS_STYLES[c.status])}
        >
          {c.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-[140px]">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground w-20 text-right">
            {progress}% {c.sent_count}/{c.total_recipients}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center font-mono text-xs">
        <span className="text-foreground">{c.sent_count}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-success">{c.delivered_count}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-accent">{c.read_count}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-destructive">{c.failed_count}</span>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {formatZoned(new Date(c.created_at), { month: "short", day: "2-digit" })}
      </TableCell>
    </TableRow>
  );
}
