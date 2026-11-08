import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useQueryClient } from "@tanstack/react-query";

/* ------------------------------- Types ---------------------------------- */

export type ForecastPeriod = "month" | "quarter" | "year";

export type DealLite = {
  id: string;
  amount: number;
  currency: string;
  probability: number;
  status: "open" | "won" | "lost" | "abandoned";
  owner_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  expected_close_date: string | null;
  actual_close_date: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalRow = {
  id: string;
  name: string;
  metric: string;
  period: string;
  target_amount: number;
  currency: string;
  scope: string;
  user_id: string | null;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
};

export type ForecastBuckets = {
  bestCase: number;
  commit: number;
  worstCase: number;
  weighted: number;
  closedWon: number;
  openCount: number;
};

/* ------------------------------- Fetching -------------------------------- */

export function useForecastDeals() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`forecast-deals-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["forecast", "deals", workspaceId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);

  return useQuery({
    queryKey: ["forecast", "deals", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<DealLite[]> => {
      const { data, error } = await supabase
        .from("deals")
        .select("id,amount,currency,probability,status,owner_id,pipeline_id,stage_id,expected_close_date,actual_close_date,created_at,updated_at")
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null)
        .order("expected_close_date", { ascending: true, nullsFirst: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as DealLite[];
    },
  });
}

export function useForecastGoals() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`forecast-goals-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_goals", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["forecast", "goals", workspaceId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);

  return useQuery({
    queryKey: ["forecast", "goals", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<GoalRow[]> => {
      const { data, error } = await supabase
        .from("sales_goals")
        .select("id,name,metric,period,target_amount,currency,scope,user_id,starts_on,ends_on,is_active")
        .eq("workspace_id", workspaceId!)
        .eq("is_active", true)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoalRow[];
    },
  });
}

export function useWorkspaceMembers() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["forecast", "members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId!);
      const ids = (mems ?? []).map((m) => m.user_id).filter(Boolean);
      if (ids.length === 0) return [] as { id: string; name: string; avatar_url: string | null }[];
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,full_name,avatar_url,email")
        .in("id", ids);
      return (data ?? []).map((p) => ({
        id: p.id,
        name: (p.display_name || p.full_name || p.email || "Agent") as string,
        avatar_url: (p.avatar_url ?? null) as string | null,
      }));
    },
  });
}

/* ------------------------------- Helpers -------------------------------- */

export function periodRange(period: ForecastPeriod, anchor = new Date()): { start: Date; end: Date; label: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  if (period === "month") {
    return {
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 0, 23, 59, 59),
      label: anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3);
    return {
      start: new Date(y, q * 3, 1),
      end: new Date(y, q * 3 + 3, 0, 23, 59, 59),
      label: `Q${q + 1} ${y}`,
    };
  }
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: `${y}` };
}

function inRange(iso: string | null, start: Date, end: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/* --------------------------- Derived metrics ----------------------------- */

export function computeForecast(deals: DealLite[], start: Date, end: Date): ForecastBuckets {
  let bestCase = 0, commit = 0, worstCase = 0, weighted = 0, closedWon = 0, openCount = 0;
  for (const d of deals) {
    if (d.status === "won") {
      if (inRange(d.actual_close_date ?? d.updated_at, start, end)) closedWon += Number(d.amount);
      continue;
    }
    if (d.status !== "open") continue;
    if (!inRange(d.expected_close_date, start, end)) continue;
    openCount++;
    const amt = Number(d.amount);
    const p = Number(d.probability) / 100;
    bestCase += amt;
    weighted += amt * p;
    if (p >= 0.7) commit += amt;
    if (p >= 0.9) worstCase += amt;
  }
  return { bestCase, commit, worstCase, weighted, closedWon, openCount };
}

export function computeKpis(deals: DealLite[]) {
  const won = deals.filter((d) => d.status === "won");
  const lost = deals.filter((d) => d.status === "lost");
  const decided = won.length + lost.length;
  const winRate = decided ? (won.length / decided) * 100 : 0;

  const cycleDays = won
    .map((d) => {
      const closed = d.actual_close_date ? new Date(d.actual_close_date).getTime() : new Date(d.updated_at).getTime();
      const created = new Date(d.created_at).getTime();
      return (closed - created) / 86400000;
    })
    .filter((n) => n > 0);
  const avgCycle = cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;

  const openDeals = deals.filter((d) => d.status === "open");
  const pipelineValue = openDeals.reduce((s, d) => s + Number(d.amount), 0);
  const avgDealSize = won.length ? won.reduce((s, d) => s + Number(d.amount), 0) / won.length : 0;

  const totalCreated = deals.length;
  const conversionRate = totalCreated ? (won.length / totalCreated) * 100 : 0;

  // Sales velocity = (# open deals × avg deal size × win rate) / avg cycle length
  const salesVelocity = avgCycle > 0 ? (openDeals.length * avgDealSize * (winRate / 100)) / avgCycle : 0;

  return {
    winRate,
    avgCycleDays: avgCycle,
    conversionRate,
    salesVelocity,
    pipelineValue,
    avgDealSize,
    openCount: openDeals.length,
    wonCount: won.length,
    lostCount: lost.length,
  };
}

export function computeMonthlyRevenue(deals: DealLite[], months = 12) {
  const now = new Date();
  const buckets: { key: string; label: string; won: number; weighted: number; forecast: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      won: 0, weighted: 0, forecast: 0,
    });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const d of deals) {
    const wonDate = d.status === "won" ? (d.actual_close_date ?? d.updated_at) : null;
    if (wonDate) {
      const dt = new Date(wonDate);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const i = idx.get(k);
      if (i !== undefined) buckets[i].won += Number(d.amount);
    }
    if (d.status === "open" && d.expected_close_date) {
      const dt = new Date(d.expected_close_date);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const i = idx.get(k);
      if (i !== undefined) {
        buckets[i].forecast += Number(d.amount);
        buckets[i].weighted += Number(d.amount) * (Number(d.probability) / 100);
      }
    }
  }
  return buckets;
}

export function computeLeaderboard(
  deals: DealLite[],
  members: { id: string; name: string; avatar_url: string | null }[],
  start: Date,
  end: Date,
) {
  const byUser = new Map<string, { revenue: number; wonCount: number; weighted: number; openCount: number }>();
  for (const m of members) byUser.set(m.id, { revenue: 0, wonCount: 0, weighted: 0, openCount: 0 });
  for (const d of deals) {
    if (!d.owner_id) continue;
    const b = byUser.get(d.owner_id) ?? { revenue: 0, wonCount: 0, weighted: 0, openCount: 0 };
    if (d.status === "won" && inRange(d.actual_close_date ?? d.updated_at, start, end)) {
      b.revenue += Number(d.amount); b.wonCount++;
    }
    if (d.status === "open" && inRange(d.expected_close_date, start, end)) {
      b.openCount++;
      b.weighted += Number(d.amount) * (Number(d.probability) / 100);
    }
    byUser.set(d.owner_id, b);
  }
  return members
    .map((m) => ({ ...m, ...(byUser.get(m.id) ?? { revenue: 0, wonCount: 0, weighted: 0, openCount: 0 }) }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function computeForecastAccuracy(deals: DealLite[], months = 6) {
  const now = new Date();
  const buckets: { key: string; label: string; predicted: number; actual: number; accuracy: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const predicted = deals
      .filter((x) => x.expected_close_date && inRange(x.expected_close_date, d, end))
      .reduce((s, x) => s + Number(x.amount) * (Number(x.probability) / 100), 0);
    const actual = deals
      .filter((x) => x.status === "won" && inRange(x.actual_close_date ?? x.updated_at, d, end))
      .reduce((s, x) => s + Number(x.amount), 0);
    const accuracy = predicted > 0 ? Math.min(100, (actual / predicted) * 100) : (actual > 0 ? 100 : 0);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      predicted, actual, accuracy,
    });
  }
  return buckets;
}

/* --------------------------- Composite hook ------------------------------ */

export function useForecasting(period: ForecastPeriod = "month") {
  const dealsQ = useForecastDeals();
  const goalsQ = useForecastGoals();
  const membersQ = useWorkspaceMembers();

  const deals = dealsQ.data ?? [];
  const goals = goalsQ.data ?? [];
  const members = membersQ.data ?? [];
  const range = useMemo(() => periodRange(period), [period]);

  const forecast = useMemo(() => computeForecast(deals, range.start, range.end), [deals, range]);
  const kpis = useMemo(() => computeKpis(deals), [deals]);
  const monthly = useMemo(() => computeMonthlyRevenue(deals, 12), [deals]);
  const leaderboard = useMemo(() => computeLeaderboard(deals, members, range.start, range.end), [deals, members, range]);
  const accuracy = useMemo(() => computeForecastAccuracy(deals, 6), [deals]);

  const monthRange = useMemo(() => periodRange("month"), []);
  const quarterRange = useMemo(() => periodRange("quarter"), []);
  const yearRange = useMemo(() => periodRange("year"), []);
  const monthly_revenue = useMemo(
    () => deals.filter((d) => d.status === "won" && inRange(d.actual_close_date ?? d.updated_at, monthRange.start, monthRange.end))
      .reduce((s, d) => s + Number(d.amount), 0),
    [deals, monthRange],
  );
  const quarterly_revenue = useMemo(
    () => deals.filter((d) => d.status === "won" && inRange(d.actual_close_date ?? d.updated_at, quarterRange.start, quarterRange.end))
      .reduce((s, d) => s + Number(d.amount), 0),
    [deals, quarterRange],
  );
  const yearly_revenue = useMemo(
    () => deals.filter((d) => d.status === "won" && inRange(d.actual_close_date ?? d.updated_at, yearRange.start, yearRange.end))
      .reduce((s, d) => s + Number(d.amount), 0),
    [deals, yearRange],
  );

  return {
    isLoading: dealsQ.isLoading || membersQ.isLoading,
    deals, goals, members, range,
    forecast, kpis, monthly, leaderboard, accuracy,
    monthly_revenue, quarterly_revenue, yearly_revenue,
    monthRange, quarterRange, yearRange,
  };
}

/* --------------------------- Export helpers ------------------------------ */

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
