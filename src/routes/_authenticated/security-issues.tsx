import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, RefreshCcw, ShieldAlert, Search } from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UnavailableSignalsBanner } from "@/components/security/unavailable-signals-banner";
import {
  getSecurityScan,
  type IssueSeverity,
  type IssueStatus,
  type SecurityIssue,
  type SurfaceStatus,
} from "@/lib/security/security-issues.functions";

export const Route = createFileRoute("/_authenticated/security-issues")({
  staticData: { breadcrumb: "Security Issues" },
  head: () => ({
    meta: [
      { title: "Security Issues" },
      {
        name: "description",
        content:
          "Actionable security findings with live status for every protected policy, hook, and endpoint.",
      },
      { property: "og:title", content: "Security Issues" },
      {
        property: "og:description",
        content:
          "Actionable security findings with live status for every protected policy, hook, and endpoint.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityIssuesPage,
});

const SEV_CLASS: Record<IssueSeverity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-destructive/10 text-destructive border-destructive/25",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
  info: "bg-muted text-muted-foreground border-border",
};

const STATUS_META: Record<
  IssueStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  action_required: {
    label: "Action required",
    className: "bg-destructive/10 text-destructive border-destructive/25",
    Icon: ShieldAlert,
  },
  monitor: {
    label: "Monitor",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    Icon: Eye,
  },
  passing: {
    label: "Passing",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    Icon: CheckCircle2,
  },
};

const SURFACE_META: Record<SurfaceStatus["status"], { label: string; className: string }> = {
  protected: {
    label: "Protected",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  },
  degraded: {
    label: "Degraded",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  unprotected: {
    label: "Unprotected",
    className: "bg-destructive/10 text-destructive border-destructive/25",
  },
};

const ACK_KEY = "wacrm.security-issues.applied";
const AUTO_KEY = "wacrm.security-issues.auto-rescan";

function readAck(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ACK_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function SecurityIssuesPage() {
  const runScan = useServerFn(getSecurityScan);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["security-issues-scan"],
    queryFn: () => runScan(),
    refetchInterval: 60_000,
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [autoRescan, setAutoRescan] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setApplied(readAck());
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(AUTO_KEY);
      if (stored !== null) setAutoRescan(stored === "1");
    }
  }, []);

  const persistApplied = (next: Record<string, string>) => {
    setApplied(next);
    try {
      window.localStorage.setItem(ACK_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggleAuto = (v: boolean) => {
    setAutoRescan(v);
    try {
      window.localStorage.setItem(AUTO_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const runRescan = async (): Promise<number | null> => {
    const res = await refetch();
    if (res.error) {
      toast.error("Scan failed", { description: (res.error as Error).message });
      return null;
    }
    // Drop acknowledgements for findings the fresh scan now reports as passing.
    const fresh = res.data;
    if (fresh) {
      const stillOpen = new Set(
        fresh.issues.filter((i) => i.status !== "passing").map((i) => i.id),
      );
      const next = Object.fromEntries(
        Object.entries(readAck()).filter(([id]) => stillOpen.has(id)),
      );
      persistApplied(next);
    }
    return fresh?.summary?.action_required ?? 0;
  };

  const handleRerun = async () => {
    const found = await runRescan();
    if (found === null) return;
    toast.success("Scan complete", {
      description:
        found > 0
          ? `${found} finding${found === 1 ? "" : "s"} need attention.`
          : "No findings need attention.",
    });
  };

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v)
        .map(([id]) => id),
    [selected],
  );

  const handleApplySelected = async () => {
    if (selectedIds.length === 0) return;
    setApplying(true);
    try {
      const stamp = new Date().toISOString();
      const next = { ...readAck() };
      for (const id of selectedIds) next[id] = stamp;
      persistApplied(next);
      setSelected({});
      toast.success(
        `Marked ${selectedIds.length} fix${selectedIds.length === 1 ? "" : "es"} as applied`,
      );

      if (autoRescan) {
        const found = await runRescan();
        if (found !== null) {
          toast.success("Re-scan complete", {
            description:
              found > 0
                ? `${found} finding${found === 1 ? "" : "s"} still need attention.`
                : "All findings clear.",
          });
        }
      }
    } finally {
      setApplying(false);
    }
  };

  const issues = useMemo(() => {
    const list = data?.issues ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!q) return true;
      return [i.title, i.detail, i.category, i.evidence].join(" ").toLowerCase().includes(q);
    });
  }, [data, query, statusFilter]);

  const s = data?.summary;

  return (
    <div className="flex flex-col min-h-screen">
      <AppTopbar
        title="Security issues"
        subtitle="Actionable findings from the latest scan, with live status for every protected surface"
        actions={
          <Button variant="outline" onClick={handleRerun} disabled={isFetching}>
            <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Scanning" : "Re-run scan"}
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {data
              ? `Last scanned ${formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}`
              : "Running scan"}
          </p>
          <div className="flex items-center gap-2">
            <Switch id="auto-rescan" checked={autoRescan} onCheckedChange={toggleAuto} />
            <Label htmlFor="auto-rescan" className="text-sm text-muted-foreground">
              Re-run scan after applying fixes
            </Label>
          </div>
        </div>

        <UnavailableSignalsBanner signals={data?.unavailable} />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryTile
            label="Action required"
            value={s?.action_required}
            tone="danger"
            loading={isLoading}
          />
          <SummaryTile label="Monitor" value={s?.monitor} tone="warn" loading={isLoading} />
          <SummaryTile label="Passing" value={s?.passing} tone="ok" loading={isLoading} />
          <SummaryTile
            label="Protected surfaces"
            value={s?.protected_surfaces}
            tone="ok"
            loading={isLoading}
          />
          <SummaryTile
            label="At-risk surfaces"
            value={s?.unprotected_surfaces}
            tone="danger"
            loading={isLoading}
          />
        </div>

        {Boolean(error) && (
          <Card className="border-destructive/30">
            <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Could not load scan results. Try re-running the scan.
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="findings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="findings">Findings{s ? ` (${s.total})` : ""}</TabsTrigger>
            <TabsTrigger value="surfaces">
              Policies & hooks{data ? ` (${data.surfaces.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search findings"
                  aria-label="Search findings"
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1">
                {(["all", "action_required", "monitor", "passing"] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={statusFilter === k ? "default" : "outline"}
                    onClick={() => setStatusFilter(k)}
                  >
                    {k === "all" ? "All" : STATUS_META[k].label}
                  </Button>
                ))}
              </div>
            </div>

            {selectedIds.length > 0 && (
              <Card className="border-primary/30">
                <CardContent className="p-3 flex flex-wrap items-center gap-3">
                  <span className="text-sm">
                    {selectedIds.length} finding{selectedIds.length === 1 ? "" : "s"} selected
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {autoRescan
                      ? "Scan will re-run automatically after applying."
                      : "Auto re-run is off."}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected({})}
                      disabled={applying}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApplySelected}
                      disabled={applying || isFetching}
                    >
                      {applying ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
                      {applying ? "Applying" : "Apply selected fixes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            )}

            {!isLoading && issues.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No findings match the current filters.
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  selected={Boolean(selected[issue.id])}
                  appliedAt={applied[issue.id]}
                  onSelectedChange={(v) => setSelected((prev) => ({ ...prev, [issue.id]: v }))}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="surfaces" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Protected surfaces</CardTitle>
                <CardDescription>
                  Current enforcement status of every policy, cron hook, and public endpoint touched
                  by this scan.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {(data?.surfaces ?? []).map((sf) => {
                      const meta = SURFACE_META[sf.status];
                      return (
                        <li
                          key={sf.id}
                          className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{sf.name}</span>
                              <Badge variant="outline" className="text-[11px] uppercase">
                                {sf.kind}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{sf.guard}</p>
                            <p className="text-xs text-muted-foreground mt-1">{sf.note}</p>
                          </div>
                          <Badge variant="outline" className={meta.className}>
                            {meta.label}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function IssueCard({
  issue,
  selected,
  appliedAt,
  onSelectedChange,
}: {
  issue: SecurityIssue;
  selected: boolean;
  appliedAt?: string;
  onSelectedChange: (v: boolean) => void;
}) {
  const meta = STATUS_META[issue.status];
  const Icon = meta.Icon;
  const selectable = issue.status !== "passing";
  return (
    <Card className={issue.status === "action_required" ? "border-destructive/30" : undefined}>
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {selectable && (
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelectedChange(v === true)}
              aria-label={`Select ${issue.title}`}
            />
          )}
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <h2 className="font-medium text-sm flex-1 min-w-0">{issue.title}</h2>
          {appliedAt && (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/25">
              Fix applied — awaiting verification
            </Badge>
          )}
          <Badge variant="outline" className={SEV_CLASS[issue.severity]}>
            {issue.severity}
          </Badge>
          <Badge variant="outline" className={meta.className}>
            {meta.label}
          </Badge>
          <Badge variant="outline">{issue.category}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{issue.detail}</p>
        <p className="text-xs">
          <span className="text-muted-foreground">Evidence: </span>
          {issue.evidence}
        </p>
        {issue.status !== "passing" && (
          <p className="text-xs">
            <span className="text-muted-foreground">Fix: </span>
            {issue.remediation}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value?: number;
  tone: "ok" | "warn" | "danger";
  loading?: boolean;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-10 mt-1" />
        ) : (
          <div className={`text-2xl font-semibold  ${toneClass}`}>{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
