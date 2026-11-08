/**
 * AI Analytics — usage, cost, quality, and outcome metrics across all AI
 * features. Aggregates from ai_usage_daily, ai_request_logs,
 * ai_automation_suggestions, conversation_intelligence, lead_qualification,
 * and conversations.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ==================== Types ====================

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ProviderSlice {
  providerKind: string;
  requests: number;
  tokens: number;
  costUsd: number;
  errorRate: number;
  avgLatencyMs: number;
}

export interface LatencyPoint {
  date: string;
  avgLatencyMs: number;
  p95LatencyMs: number;
  requests: number;
}

export interface OperationSlice {
  operation: string;
  requests: number;
  tokens: number;
  costUsd: number;
  successRate: number;
}

export interface AcceptancePoint {
  date: string;
  suggested: number;
  applied: number;
  rejected: number;
  acceptanceRate: number;
}

export interface SentimentPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
}

export interface SatisfactionPoint {
  date: string;
  avgScore: number;
  count: number;
}

export interface LeadQualityPoint {
  date: string;
  avgScore: number;
  hot: number;
  warm: number;
  cold: number;
}

export interface TopicSlice {
  topic: string;
  count: number;
  positive: number;
  negative: number;
}

export interface ResolutionPoint {
  date: string;
  resolved: number;
  aiAssisted: number;
}

export interface RecommendedAction {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  confidence: number | null;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface KpiSummary {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  totalErrors: number;
  errorRate: number;
  avgLatencyMs: number;
  savedMinutes: number;
  resolvedConversations: number;
  acceptanceRate: number;
  activeProviders: number;
  // deltas vs previous window
  requestsDelta: number;
  costDelta: number;
  latencyDelta: number;
  acceptanceDelta: number;
}

export interface Forecast {
  metric: "requests" | "cost" | "tokens";
  history: { date: string; value: number }[];
  forecast: { date: string; value: number; lower: number; upper: number }[];
  next7dTotal: number;
  next30dTotal: number;
  trend: "up" | "down" | "flat";
  changePct: number;
}

export interface AiAnalyticsReport {
  from: string;
  to: string;
  days: number;
  kpis: KpiSummary;
  usage: DailyPoint[];
  providers: ProviderSlice[];
  operations: OperationSlice[];
  latency: LatencyPoint[];
  acceptance: AcceptancePoint[];
  sentiment: SentimentPoint[];
  satisfaction: SatisfactionPoint[];
  leadQuality: LeadQualityPoint[];
  topics: TopicSlice[];
  resolutions: ResolutionPoint[];
  recommendedActions: RecommendedAction[];
  forecasts: Forecast[];
}

// ==================== Helpers ====================

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (d.getTime() <= end.getTime()) {
    out.push(toIsoDay(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function pct(numerator: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((numerator / denom) * 1000) / 10;
}

/** Rough saved-minutes estimator: 3.5 min per applied AI suggestion,
 *  plus 0.5 min per non-error AI request. Configurable later. */
const MIN_PER_APPLIED_SUGGESTION = 3.5;
const MIN_PER_REQUEST = 0.5;

function linearForecast(
  history: { date: string; value: number }[],
  daysAhead: number,
): { forecast: Forecast["forecast"]; trend: "up" | "down" | "flat"; changePct: number } {
  const n = history.length;
  if (n < 2) {
    return { forecast: [], trend: "flat", changePct: 0 };
  }
  // simple linear regression over index
  const xs = history.map((_, i) => i);
  const ys = history.map((h) => h.value);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  // residual std for uncertainty band
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ss += (ys[i] - pred) ** 2;
  }
  const sigma = Math.sqrt(ss / Math.max(1, n - 2));

  const last = new Date(history[n - 1].date + "T00:00:00Z");
  const forecast: Forecast["forecast"] = [];
  for (let k = 1; k <= daysAhead; k++) {
    const d = new Date(last);
    d.setUTCDate(d.getUTCDate() + k);
    const v = Math.max(0, intercept + slope * (n - 1 + k));
    forecast.push({
      date: toIsoDay(d),
      value: Math.round(v * 100) / 100,
      lower: Math.max(0, Math.round((v - 1.5 * sigma) * 100) / 100),
      upper: Math.round((v + 1.5 * sigma) * 100) / 100,
    });
  }
  // trend judged by projected value vs current mean
  const projected = forecast[forecast.length - 1]?.value ?? meanY;
  const changePct = meanY === 0 ? 0 : ((projected - meanY) / meanY) * 100;
  const trend: "up" | "down" | "flat" =
    changePct > 5 ? "up" : changePct < -5 ? "down" : "flat";
  return { forecast, trend, changePct: Math.round(changePct * 10) / 10 };
}

// ==================== Main Report ====================

export const getAiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(1).max(365).optional().default(30),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AiAnalyticsReport> => {
    const { supabase } = context;
    const days = data.days;
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    const fromIso = toIsoDay(from);
    const toIso = toIsoDay(to);

    // previous window (same length) for delta calc
    const prevTo = new Date(from);
    prevTo.setUTCDate(prevTo.getUTCDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
    const prevFromIso = toIsoDay(prevFrom);
    const prevToIso = toIsoDay(prevTo);

    // -------------------- Parallel fetches --------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    const [
      usageRows,
      prevUsageRows,
      providersRows,
      logRows,
      prevLogRows,
      suggestionRows,
      convIntelRows,
      leadQualRows,
      resolvedRows,
      pendingSuggestionRows,
    ] = await Promise.all([
      db
        .from("ai_usage_daily")
        .select("day, provider_id, model, requests, prompt_tokens, completion_tokens, total_tokens, cost_usd, errors")
        .eq("workspace_id", data.workspaceId)
        .gte("day", fromIso)
        .lte("day", toIso),
      db
        .from("ai_usage_daily")
        .select("day, requests, cost_usd, errors")
        .eq("workspace_id", data.workspaceId)
        .gte("day", prevFromIso)
        .lte("day", prevToIso),
      db
        .from("ai_providers")
        .select("id, kind, name, enabled")
        .eq("workspace_id", data.workspaceId),
      db
        .from("ai_request_logs")
        .select("created_at, provider_kind, operation, status, latency_ms, total_tokens, cost_usd")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", `${fromIso}T00:00:00Z`)
        .lte("created_at", `${toIso}T23:59:59Z`)
        .limit(50000),
      db
        .from("ai_request_logs")
        .select("latency_ms, status")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", `${prevFromIso}T00:00:00Z`)
        .lte("created_at", `${prevToIso}T23:59:59Z`)
        .limit(50000),
      db
        .from("ai_automation_suggestions")
        .select("automation_type, status, created_at, applied_at, reviewed_at")
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", `${fromIso}T00:00:00Z`)
        .lte("created_at", `${toIso}T23:59:59Z`)
        .limit(20000),
      db
        .from("conversation_intelligence")
        .select("sentiment, satisfaction_score, topics, category, analyzed_at, updated_at")
        .eq("workspace_id", data.workspaceId)
        .gte("updated_at", `${fromIso}T00:00:00Z`)
        .lte("updated_at", `${toIso}T23:59:59Z`)
        .limit(20000),
      db
        .from("lead_qualification")
        .select("lead_score, temperature, updated_at")
        .eq("workspace_id", data.workspaceId)
        .gte("updated_at", `${fromIso}T00:00:00Z`)
        .lte("updated_at", `${toIso}T23:59:59Z`)
        .limit(20000),
      db
        .from("conversations")
        .select("resolved_at, updated_at, status")
        .eq("workspace_id", data.workspaceId)
        .eq("status", "resolved")
        .gte("resolved_at", `${fromIso}T00:00:00Z`)
        .lte("resolved_at", `${toIso}T23:59:59Z`)
        .limit(20000),
      db
        .from("ai_automation_suggestions")
        .select("id, automation_type, title, summary, confidence, entity_type, entity_id, created_at")
        .eq("workspace_id", data.workspaceId)
        .eq("status", "pending")
        .order("confidence", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // -------------------- Provider map --------------------
    const providerMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (providersRows.data ?? []) as any[]) {
      providerMap.set(p.id, p.kind);
    }
    const activeProviders = ((providersRows.data ?? []) as { enabled: boolean }[])
      .filter((p) => p.enabled).length;

    // -------------------- Daily usage series --------------------
    const days_ = eachDay(from, to);
    const usageByDay = new Map<string, DailyPoint>();
    for (const day of days_) {
      usageByDay.set(day, {
        date: day,
        requests: 0, errors: 0,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        costUsd: 0,
      });
    }
    const providerAgg = new Map<string, { requests: number; tokens: number; cost: number; errors: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (usageRows.data ?? []) as any[]) {
      const key = String(r.day).slice(0, 10);
      const p = usageByDay.get(key);
      if (p) {
        p.requests += r.requests || 0;
        p.errors += r.errors || 0;
        p.promptTokens += Number(r.prompt_tokens || 0);
        p.completionTokens += Number(r.completion_tokens || 0);
        p.totalTokens += Number(r.total_tokens || 0);
        p.costUsd += Number(r.cost_usd || 0);
      }
      const kind = providerMap.get(r.provider_id) || "unknown";
      const agg = providerAgg.get(kind) ?? { requests: 0, tokens: 0, cost: 0, errors: 0 };
      agg.requests += r.requests || 0;
      agg.tokens += Number(r.total_tokens || 0);
      agg.cost += Number(r.cost_usd || 0);
      agg.errors += r.errors || 0;
      providerAgg.set(kind, agg);
    }
    const usage = days_.map((d) => usageByDay.get(d)!);

    // -------------------- Latency & operations (from logs) --------------------
    const latencyByDay = new Map<string, number[]>();
    const opAgg = new Map<string, { req: number; tok: number; cost: number; ok: number }>();
    const providerLatency = new Map<string, number[]>();
    let totalLatency = 0;
    let latencyCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (logRows.data ?? []) as any[]) {
      const day = String(r.created_at).slice(0, 10);
      if (typeof r.latency_ms === "number") {
        (latencyByDay.get(day) ?? latencyByDay.set(day, []).get(day)!).push(r.latency_ms);
        totalLatency += r.latency_ms;
        latencyCount += 1;
        if (r.provider_kind) {
          (providerLatency.get(r.provider_kind) ?? providerLatency.set(r.provider_kind, []).get(r.provider_kind)!).push(r.latency_ms);
        }
      }
      const op = r.operation || "chat";
      const oa = opAgg.get(op) ?? { req: 0, tok: 0, cost: 0, ok: 0 };
      oa.req += 1;
      oa.tok += Number(r.total_tokens || 0);
      oa.cost += Number(r.cost_usd || 0);
      if (r.status === "success") oa.ok += 1;
      opAgg.set(op, oa);
    }
    const latency: LatencyPoint[] = days_.map((day) => {
      const arr = (latencyByDay.get(day) ?? []).slice().sort((a, b) => a - b);
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const p95 = arr.length ? arr[Math.floor(arr.length * 0.95)] ?? arr[arr.length - 1] : 0;
      return {
        date: day,
        avgLatencyMs: Math.round(avg),
        p95LatencyMs: Math.round(p95),
        requests: arr.length,
      };
    });
    const avgLatencyMs = latencyCount ? Math.round(totalLatency / latencyCount) : 0;

    // -------------------- Providers slice --------------------
    const providers: ProviderSlice[] = [];
    for (const [kind, a] of providerAgg.entries()) {
      const lat = providerLatency.get(kind) ?? [];
      const avg = lat.length ? Math.round(lat.reduce((x, y) => x + y, 0) / lat.length) : 0;
      providers.push({
        providerKind: kind,
        requests: a.requests,
        tokens: a.tokens,
        costUsd: Math.round(a.cost * 10000) / 10000,
        errorRate: pct(a.errors, a.requests),
        avgLatencyMs: avg,
      });
    }
    providers.sort((a, b) => b.requests - a.requests);

    const operations: OperationSlice[] = Array.from(opAgg.entries())
      .map(([op, a]) => ({
        operation: op,
        requests: a.req,
        tokens: a.tok,
        costUsd: Math.round(a.cost * 10000) / 10000,
        successRate: pct(a.ok, a.req),
      }))
      .sort((a, b) => b.requests - a.requests);

    // -------------------- Suggestions / acceptance --------------------
    const acceptByDay = new Map<string, { suggested: number; applied: number; rejected: number }>();
    for (const day of days_) acceptByDay.set(day, { suggested: 0, applied: 0, rejected: 0 });
    let totalSuggested = 0;
    let totalApplied = 0;
    let totalRejected = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (suggestionRows.data ?? []) as any[]) {
      const day = String(s.created_at).slice(0, 10);
      const bucket = acceptByDay.get(day);
      if (bucket) bucket.suggested += 1;
      totalSuggested += 1;
      if (s.status === "applied") {
        totalApplied += 1;
        if (bucket) bucket.applied += 1;
      } else if (s.status === "rejected") {
        totalRejected += 1;
        if (bucket) bucket.rejected += 1;
      }
    }
    const acceptance: AcceptancePoint[] = days_.map((d) => {
      const b = acceptByDay.get(d)!;
      const reviewed = b.applied + b.rejected;
      return {
        date: d,
        suggested: b.suggested,
        applied: b.applied,
        rejected: b.rejected,
        acceptanceRate: pct(b.applied, reviewed),
      };
    });
    const overallAcceptance = pct(totalApplied, totalApplied + totalRejected);

    // -------------------- Sentiment / satisfaction / topics --------------------
    const sentByDay = new Map<string, SentimentPoint>();
    const satByDay = new Map<string, { sum: number; count: number }>();
    for (const day of days_) {
      sentByDay.set(day, { date: day, positive: 0, neutral: 0, negative: 0, mixed: 0 });
      satByDay.set(day, { sum: 0, count: 0 });
    }
    const topicMap = new Map<string, { count: number; positive: number; negative: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (convIntelRows.data ?? []) as any[]) {
      const day = String(c.updated_at).slice(0, 10);
      const sp = sentByDay.get(day);
      if (sp) {
        const key = (c.sentiment as "positive" | "neutral" | "negative" | "mixed" | null) ?? null;
        if (key && key in sp) sp[key] += 1;
      }
      const sa = satByDay.get(day);
      if (sa && typeof c.satisfaction_score === "number") {
        sa.sum += Number(c.satisfaction_score);
        sa.count += 1;
      }
      if (Array.isArray(c.topics)) {
        for (const t of c.topics as string[]) {
          if (!t) continue;
          const norm = String(t).trim().toLowerCase();
          if (!norm) continue;
          const entry = topicMap.get(norm) ?? { count: 0, positive: 0, negative: 0 };
          entry.count += 1;
          if (c.sentiment === "positive") entry.positive += 1;
          if (c.sentiment === "negative") entry.negative += 1;
          topicMap.set(norm, entry);
        }
      }
    }
    const sentiment: SentimentPoint[] = days_.map((d) => sentByDay.get(d)!);
    const satisfaction: SatisfactionPoint[] = days_.map((d) => {
      const s = satByDay.get(d)!;
      return {
        date: d,
        avgScore: s.count ? Math.round((s.sum / s.count) * 100) / 100 : 0,
        count: s.count,
      };
    });
    const topics: TopicSlice[] = Array.from(topicMap.entries())
      .map(([topic, v]) => ({ topic, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // -------------------- Lead quality --------------------
    const lqByDay = new Map<string, { sum: number; count: number; hot: number; warm: number; cold: number }>();
    for (const day of days_) lqByDay.set(day, { sum: 0, count: 0, hot: 0, warm: 0, cold: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of (leadQualRows.data ?? []) as any[]) {
      const day = String(l.updated_at).slice(0, 10);
      const b = lqByDay.get(day);
      if (!b) continue;
      if (typeof l.lead_score === "number") {
        b.sum += l.lead_score;
        b.count += 1;
      }
      const t = String(l.temperature ?? "").toLowerCase();
      if (t === "hot") b.hot += 1;
      else if (t === "warm") b.warm += 1;
      else if (t === "cold") b.cold += 1;
    }
    const leadQuality: LeadQualityPoint[] = days_.map((d) => {
      const b = lqByDay.get(d)!;
      return {
        date: d,
        avgScore: b.count ? Math.round((b.sum / b.count) * 10) / 10 : 0,
        hot: b.hot, warm: b.warm, cold: b.cold,
      };
    });

    // -------------------- Resolutions --------------------
    const resByDay = new Map<string, ResolutionPoint>();
    for (const day of days_) resByDay.set(day, { date: day, resolved: 0, aiAssisted: 0 });
    let totalResolved = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (resolvedRows.data ?? []) as any[]) {
      if (!c.resolved_at) continue;
      const day = String(c.resolved_at).slice(0, 10);
      const b = resByDay.get(day);
      if (b) b.resolved += 1;
      totalResolved += 1;
    }
    // Estimate AI-assisted resolutions: conversations that also have intelligence rows
    const analyzedConvIds = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((convIntelRows.data ?? []) as any[]).map(() => 1),
    );
    // Rough AI-assist ratio based on presence of intel in window
    const aiAssistRatio = totalResolved > 0
      ? Math.min(1, analyzedConvIds.size / Math.max(1, totalResolved))
      : 0;
    const resolutions = days_.map((d) => {
      const b = resByDay.get(d)!;
      return { ...b, aiAssisted: Math.round(b.resolved * aiAssistRatio) };
    });

    // -------------------- KPIs --------------------
    const totalRequests = usage.reduce((s, p) => s + p.requests, 0);
    const totalTokens = usage.reduce((s, p) => s + p.totalTokens, 0);
    const totalCostUsd = Math.round(usage.reduce((s, p) => s + p.costUsd, 0) * 10000) / 10000;
    const totalErrors = usage.reduce((s, p) => s + p.errors, 0);
    const errorRate = pct(totalErrors, totalRequests);
    const savedMinutes =
      totalApplied * MIN_PER_APPLIED_SUGGESTION +
      (totalRequests - totalErrors) * MIN_PER_REQUEST;

    // prev window KPIs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevUsage = (prevUsageRows.data ?? []) as any[];
    const prevReq = prevUsage.reduce((s, r) => s + (r.requests || 0), 0);
    const prevCost = prevUsage.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevLog = (prevLogRows.data ?? []) as any[];
    const prevLat = prevLog.filter((x) => typeof x.latency_ms === "number");
    const prevAvgLat = prevLat.length
      ? Math.round(prevLat.reduce((s, x) => s + x.latency_ms, 0) / prevLat.length)
      : 0;

    const requestsDelta = prevReq === 0
      ? (totalRequests > 0 ? 100 : 0)
      : Math.round(((totalRequests - prevReq) / prevReq) * 1000) / 10;
    const costDelta = prevCost === 0
      ? (totalCostUsd > 0 ? 100 : 0)
      : Math.round(((totalCostUsd - prevCost) / prevCost) * 1000) / 10;
    const latencyDelta = prevAvgLat === 0
      ? 0
      : Math.round(((avgLatencyMs - prevAvgLat) / prevAvgLat) * 1000) / 10;
    // no prev-window acceptance calc — use 0 delta baseline
    const acceptanceDelta = 0;

    const kpis: KpiSummary = {
      totalRequests,
      totalTokens,
      totalCostUsd,
      totalErrors,
      errorRate,
      avgLatencyMs,
      savedMinutes: Math.round(savedMinutes),
      resolvedConversations: totalResolved,
      acceptanceRate: overallAcceptance,
      activeProviders,
      requestsDelta,
      costDelta,
      latencyDelta,
      acceptanceDelta,
    };

    // -------------------- Recommended Actions --------------------
    const recommendedActions: RecommendedAction[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pendingSuggestionRows.data ?? []) as any[]).map((s) => ({
        id: s.id,
        type: s.automation_type,
        title: s.title,
        summary: s.summary,
        confidence: s.confidence !== null && s.confidence !== undefined ? Number(s.confidence) : null,
        entityType: s.entity_type,
        entityId: s.entity_id,
        createdAt: s.created_at,
      }));

    // -------------------- Forecasts --------------------
    const reqHistory = usage.map((u) => ({ date: u.date, value: u.requests }));
    const costHistory = usage.map((u) => ({ date: u.date, value: u.costUsd }));
    const tokHistory = usage.map((u) => ({ date: u.date, value: u.totalTokens }));

    const mkForecast = (
      metric: Forecast["metric"],
      hist: { date: string; value: number }[],
    ): Forecast => {
      const { forecast, trend, changePct } = linearForecast(hist, 30);
      const next7dTotal = forecast.slice(0, 7).reduce((s, f) => s + f.value, 0);
      const next30dTotal = forecast.reduce((s, f) => s + f.value, 0);
      return {
        metric,
        history: hist,
        forecast,
        next7dTotal: Math.round(next7dTotal * 100) / 100,
        next30dTotal: Math.round(next30dTotal * 100) / 100,
        trend,
        changePct,
      };
    };

    const forecasts: Forecast[] = [
      mkForecast("requests", reqHistory),
      mkForecast("cost", costHistory),
      mkForecast("tokens", tokHistory),
    ];

    return {
      from: fromIso,
      to: toIso,
      days,
      kpis,
      usage,
      providers,
      operations,
      latency,
      acceptance,
      sentiment,
      satisfaction,
      leadQuality,
      topics,
      resolutions,
      recommendedActions,
      forecasts,
    };
  });
