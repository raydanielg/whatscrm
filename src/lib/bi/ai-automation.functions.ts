// AI & Automation analytics server functions.
// Aggregates AI request/token/cost usage, provider mix, acceptance rate, saved time,
// workflow executions, success/failure rates, top prompts and top workflows.
// Supports date range + previous-period comparison.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(730).default(30),
  compare: z.boolean().default(true),
});

export interface AiAutomationAnalytics {
  range: { from: string; to: string; days: number };
  compareRange: { from: string; to: string } | null;
  ai: {
    totals: {
      requests: number;
      successRequests: number;
      failedRequests: number;
      acceptanceRate: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      avgLatencyMs: number;
      savedSeconds: number;
    };
    delta: {
      requests: number;
      totalTokens: number;
      costUsd: number;
      acceptanceRate: number;
      savedSeconds: number;
    } | null;
    trend: {
      date: string;
      requests: number;
      successRequests: number;
      failedRequests: number;
      totalTokens: number;
      costUsd: number;
    }[];
    providers: {
      providerId: string | null;
      providerKind: string | null;
      name: string;
      requests: number;
      totalTokens: number;
      costUsd: number;
      share: number;
    }[];
    models: {
      model: string;
      requests: number;
      totalTokens: number;
      costUsd: number;
    }[];
    topPrompts: {
      key: string;
      name: string;
      requests: number;
      totalTokens: number;
      costUsd: number;
      acceptanceRate: number;
    }[];
    costByFeature: {
      feature: string;
      requests: number;
      totalTokens: number;
      costUsd: number;
    }[];
  };
  workflow: {
    totals: {
      runs: number;
      succeeded: number;
      failed: number;
      running: number;
      cancelled: number;
      successRate: number;
      avgDurationMs: number;
      savedSeconds: number;
    };
    delta: {
      runs: number;
      successRate: number;
      failed: number;
      savedSeconds: number;
    } | null;
    trend: {
      date: string;
      total: number;
      succeeded: number;
      failed: number;
    }[];
    statusMix: { status: string; count: number }[];
    topWorkflows: {
      automationId: string;
      name: string;
      runs: number;
      succeeded: number;
      failed: number;
      successRate: number;
      avgDurationMs: number;
      savedSeconds: number;
    }[];
    failures: {
      automationId: string;
      name: string;
      failed: number;
      lastFailureAt: string | null;
      lastError: string | null;
    }[];
  };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
const pctDelta = (curr: number, prev: number) =>
  prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;

// Estimated seconds saved per successful AI request / workflow run.
// Configurable via workspace settings later; use pragmatic defaults for now.
const AI_SAVED_SECONDS_PER_SUCCESS = 45;
const WF_SAVED_SECONDS_PER_SUCCESS = 120;

export const getAiAutomationAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<AiAutomationAnalytics> => {
    const { supabase } = context;
    const days = data.days;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const prevTo = from;
    const prevFrom = new Date(prevTo.getTime() - days * 24 * 60 * 60 * 1000);

    // ---- AI request logs (current + previous) ----
    const aiSel = "provider_id,provider_kind,model,feature,status,latency_ms,prompt_tokens,completion_tokens,total_tokens,cost_usd,metadata,created_at";
    const [{ data: aiCurr = [] }, { data: aiPrev = [] }] = await Promise.all([
      supabase
        .from("ai_request_logs")
        .select(aiSel)
        .eq("workspace_id", data.workspaceId)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(100000),
      data.compare
        ? supabase
            .from("ai_request_logs")
            .select(aiSel)
            .eq("workspace_id", data.workspaceId)
            .gte("created_at", prevFrom.toISOString())
            .lt("created_at", prevTo.toISOString())
            .limit(100000)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // AI aggregates for current period
    const aiTrendMap = new Map<string, { requests: number; successRequests: number; failedRequests: number; totalTokens: number; costUsd: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 86_400_000);
      aiTrendMap.set(dayKey(d), { requests: 0, successRequests: 0, failedRequests: 0, totalTokens: 0, costUsd: 0 });
    }

    const providers = new Map<string, { providerId: string | null; providerKind: string | null; name: string; requests: number; totalTokens: number; costUsd: number }>();
    const models = new Map<string, { model: string; requests: number; totalTokens: number; costUsd: number }>();
    const prompts = new Map<string, { key: string; requests: number; totalTokens: number; costUsd: number; accepted: number }>();
    const featureAgg = new Map<string, { feature: string; requests: number; totalTokens: number; costUsd: number }>();

    let aiSuccess = 0;
    let aiFailed = 0;
    let aiPromptTok = 0;
    let aiComplTok = 0;
    let aiTotalTok = 0;
    let aiCost = 0;
    let aiLatencySum = 0;
    let aiLatencyCount = 0;
    let aiAccepted = 0;

    for (const r of aiCurr ?? []) {
      const row = r as any;
      const d = dayKey(new Date(row.created_at));
      const b = aiTrendMap.get(d);
      const success = row.status === "success";
      const tot = row.total_tokens ?? 0;
      const cost = Number(row.cost_usd ?? 0) || 0;
      if (b) {
        b.requests += 1;
        if (success) b.successRequests += 1;
        else b.failedRequests += 1;
        b.totalTokens += tot;
        b.costUsd += cost;
      }
      if (success) aiSuccess += 1;
      else aiFailed += 1;
      aiPromptTok += row.prompt_tokens ?? 0;
      aiComplTok += row.completion_tokens ?? 0;
      aiTotalTok += tot;
      aiCost += cost;
      if (row.latency_ms != null) {
        aiLatencySum += row.latency_ms;
        aiLatencyCount += 1;
      }
      const meta = row.metadata ?? {};
      if (meta && (meta.accepted === true || meta.accepted === "true")) aiAccepted += 1;

      // Provider
      const provKey = row.provider_id ?? row.provider_kind ?? "unknown";
      const pcur = providers.get(provKey) ?? {
        providerId: row.provider_id ?? null,
        providerKind: row.provider_kind ?? null,
        name: row.provider_kind ?? "Unknown",
        requests: 0,
        totalTokens: 0,
        costUsd: 0,
      };
      pcur.requests += 1;
      pcur.totalTokens += tot;
      pcur.costUsd += cost;
      providers.set(provKey, pcur);

      // Model
      if (row.model) {
        const mcur = models.get(row.model) ?? { model: row.model, requests: 0, totalTokens: 0, costUsd: 0 };
        mcur.requests += 1;
        mcur.totalTokens += tot;
        mcur.costUsd += cost;
        models.set(row.model, mcur);
      }

      // Prompt key from feature or metadata.prompt_key
      const promptKey = (meta && (meta.prompt_key || meta.promptKey)) || row.feature || null;
      if (promptKey) {
        const pk = String(promptKey);
        const cur = prompts.get(pk) ?? { key: pk, requests: 0, totalTokens: 0, costUsd: 0, accepted: 0 };
        cur.requests += 1;
        cur.totalTokens += tot;
        cur.costUsd += cost;
        if (success) cur.accepted += meta.accepted ? 1 : success ? 1 : 0;
        prompts.set(pk, cur);
      }

      // Feature cost
      const feat = row.feature ?? "unspecified";
      const fcur = featureAgg.get(feat) ?? { feature: feat, requests: 0, totalTokens: 0, costUsd: 0 };
      fcur.requests += 1;
      fcur.totalTokens += tot;
      fcur.costUsd += cost;
      featureAgg.set(feat, fcur);
    }

    // Resolve provider display names
    const providerIds = Array.from(providers.values())
      .map((p) => p.providerId)
      .filter(Boolean) as string[];
    if (providerIds.length > 0) {
      const { data: provRows = [] } = await supabase
        .from("ai_providers")
        .select("id,name,kind")
        .in("id", providerIds);
      for (const p of provRows ?? []) {
        for (const v of providers.values()) {
          if (v.providerId === (p as any).id) v.name = (p as any).name;
        }
      }
    }

    // Top prompts: enrich name from ai_prompts if key matches
    const promptKeys = Array.from(prompts.keys());
    const promptNames = new Map<string, string>();
    if (promptKeys.length > 0) {
      const { data: pr = [] } = await supabase
        .from("ai_prompts")
        .select("key,name")
        .eq("workspace_id", data.workspaceId)
        .in("key", promptKeys);
      for (const p of pr ?? []) promptNames.set((p as any).key, (p as any).name);
    }

    // Previous-period aggregates (totals only)
    let prevRequests = 0;
    let prevTokens = 0;
    let prevCost = 0;
    let prevSuccess = 0;
    for (const r of aiPrev ?? []) {
      const row = r as any;
      prevRequests += 1;
      prevTokens += row.total_tokens ?? 0;
      prevCost += Number(row.cost_usd ?? 0) || 0;
      if (row.status === "success") prevSuccess += 1;
    }

    const acceptanceRate = aiAccepted > 0
      ? (aiAccepted / (aiSuccess + aiFailed || 1)) * 100
      : safeDiv(aiSuccess, aiSuccess + aiFailed) * 100;
    const prevAcceptance = safeDiv(prevSuccess, prevRequests) * 100;
    const aiSavedSeconds = aiSuccess * AI_SAVED_SECONDS_PER_SUCCESS;
    const prevAiSaved = prevSuccess * AI_SAVED_SECONDS_PER_SUCCESS;

    const totalReqs = aiSuccess + aiFailed;
    const providerArr = Array.from(providers.values())
      .map((p) => ({ ...p, share: totalReqs > 0 ? (p.requests / totalReqs) * 100 : 0 }))
      .sort((a, b) => b.requests - a.requests);

    const modelArr = Array.from(models.values()).sort((a, b) => b.requests - a.requests).slice(0, 10);
    const topPrompts = Array.from(prompts.values())
      .map((p) => ({
        key: p.key,
        name: promptNames.get(p.key) ?? p.key,
        requests: p.requests,
        totalTokens: p.totalTokens,
        costUsd: p.costUsd,
        acceptanceRate: safeDiv(p.accepted, p.requests) * 100,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);
    const costByFeature = Array.from(featureAgg.values())
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 10);

    // ---- Workflow runs (current + previous) ----
    const wfSel = "id,automation_id,status,duration_ms,started_at,finished_at,error";
    const [{ data: wfCurr = [] }, { data: wfPrev = [] }] = await Promise.all([
      supabase
        .from("workflow_runs")
        .select(wfSel)
        .eq("workspace_id", data.workspaceId)
        .gte("started_at", from.toISOString())
        .lte("started_at", to.toISOString())
        .limit(100000),
      data.compare
        ? supabase
            .from("workflow_runs")
            .select(wfSel)
            .eq("workspace_id", data.workspaceId)
            .gte("started_at", prevFrom.toISOString())
            .lt("started_at", prevTo.toISOString())
            .limit(100000)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const wfTrendMap = new Map<string, { total: number; succeeded: number; failed: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 86_400_000);
      wfTrendMap.set(dayKey(d), { total: 0, succeeded: 0, failed: 0 });
    }

    const wfStatusMix = new Map<string, number>();
    const perWorkflow = new Map<string, { automationId: string; runs: number; succeeded: number; failed: number; durationSum: number; durationCount: number; lastFailureAt: string | null; lastError: string | null }>();
    let wfRuns = 0;
    let wfSucceeded = 0;
    let wfFailed = 0;
    let wfRunning = 0;
    let wfCancelled = 0;
    let wfDurSum = 0;
    let wfDurCount = 0;

    for (const r of wfCurr ?? []) {
      const row = r as any;
      const d = dayKey(new Date(row.started_at));
      const b = wfTrendMap.get(d);
      if (b) b.total += 1;
      wfRuns += 1;
      wfStatusMix.set(row.status, (wfStatusMix.get(row.status) ?? 0) + 1);

      const succ = row.status === "succeeded" || row.status === "success" || row.status === "completed";
      const fail = row.status === "failed" || row.status === "error";
      if (succ) {
        wfSucceeded += 1;
        if (b) b.succeeded += 1;
      } else if (fail) {
        wfFailed += 1;
        if (b) b.failed += 1;
      } else if (row.status === "running" || row.status === "pending") {
        wfRunning += 1;
      } else if (row.status === "cancelled") {
        wfCancelled += 1;
      }
      if (row.duration_ms != null) {
        wfDurSum += row.duration_ms;
        wfDurCount += 1;
      }

      const key = row.automation_id;
      const cur = perWorkflow.get(key) ?? { automationId: key, runs: 0, succeeded: 0, failed: 0, durationSum: 0, durationCount: 0, lastFailureAt: null as string | null, lastError: null as string | null };
      cur.runs += 1;
      if (succ) cur.succeeded += 1;
      if (fail) {
        cur.failed += 1;
        cur.lastFailureAt = row.started_at;
        cur.lastError = row.error ? (typeof row.error === "string" ? row.error : row.error?.message ?? JSON.stringify(row.error).slice(0, 200)) : null;
      }
      if (row.duration_ms != null) {
        cur.durationSum += row.duration_ms;
        cur.durationCount += 1;
      }
      perWorkflow.set(key, cur);
    }

    // Previous period totals
    let prevWfRuns = 0;
    let prevWfSucceeded = 0;
    let prevWfFailed = 0;
    for (const r of wfPrev ?? []) {
      const row = r as any;
      prevWfRuns += 1;
      if (row.status === "succeeded" || row.status === "success" || row.status === "completed") prevWfSucceeded += 1;
      if (row.status === "failed" || row.status === "error") prevWfFailed += 1;
    }

    // Resolve automation names
    const autoIds = Array.from(perWorkflow.keys());
    const autoNames = new Map<string, string>();
    if (autoIds.length > 0) {
      const { data: autos = [] } = await supabase
        .from("automations")
        .select("id,name")
        .in("id", autoIds);
      for (const a of autos ?? []) autoNames.set((a as any).id, (a as any).name);
    }

    const wfSavedSeconds = wfSucceeded * WF_SAVED_SECONDS_PER_SUCCESS;
    const prevWfSaved = prevWfSucceeded * WF_SAVED_SECONDS_PER_SUCCESS;

    const topWorkflows = Array.from(perWorkflow.values())
      .map((w) => ({
        automationId: w.automationId,
        name: autoNames.get(w.automationId) ?? "Untitled workflow",
        runs: w.runs,
        succeeded: w.succeeded,
        failed: w.failed,
        successRate: safeDiv(w.succeeded, w.runs) * 100,
        avgDurationMs: w.durationCount > 0 ? w.durationSum / w.durationCount : 0,
        savedSeconds: w.succeeded * WF_SAVED_SECONDS_PER_SUCCESS,
      }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 10);

    const failures = Array.from(perWorkflow.values())
      .filter((w) => w.failed > 0)
      .map((w) => ({
        automationId: w.automationId,
        name: autoNames.get(w.automationId) ?? "Untitled workflow",
        failed: w.failed,
        lastFailureAt: w.lastFailureAt,
        lastError: w.lastError,
      }))
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 10);

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      compareRange: data.compare ? { from: prevFrom.toISOString(), to: prevTo.toISOString() } : null,
      ai: {
        totals: {
          requests: aiSuccess + aiFailed,
          successRequests: aiSuccess,
          failedRequests: aiFailed,
          acceptanceRate,
          promptTokens: aiPromptTok,
          completionTokens: aiComplTok,
          totalTokens: aiTotalTok,
          costUsd: aiCost,
          avgLatencyMs: aiLatencyCount > 0 ? aiLatencySum / aiLatencyCount : 0,
          savedSeconds: aiSavedSeconds,
        },
        delta: data.compare
          ? {
              requests: pctDelta(aiSuccess + aiFailed, prevRequests),
              totalTokens: pctDelta(aiTotalTok, prevTokens),
              costUsd: pctDelta(aiCost, prevCost),
              acceptanceRate: acceptanceRate - prevAcceptance,
              savedSeconds: pctDelta(aiSavedSeconds, prevAiSaved),
            }
          : null,
        trend: Array.from(aiTrendMap.entries()).map(([date, v]) => ({ date, ...v })),
        providers: providerArr,
        models: modelArr,
        topPrompts,
        costByFeature,
      },
      workflow: {
        totals: {
          runs: wfRuns,
          succeeded: wfSucceeded,
          failed: wfFailed,
          running: wfRunning,
          cancelled: wfCancelled,
          successRate: safeDiv(wfSucceeded, wfRuns) * 100,
          avgDurationMs: wfDurCount > 0 ? wfDurSum / wfDurCount : 0,
          savedSeconds: wfSavedSeconds,
        },
        delta: data.compare
          ? {
              runs: pctDelta(wfRuns, prevWfRuns),
              successRate: safeDiv(wfSucceeded, wfRuns) * 100 - safeDiv(prevWfSucceeded, prevWfRuns) * 100,
              failed: pctDelta(wfFailed, prevWfFailed),
              savedSeconds: pctDelta(wfSavedSeconds, prevWfSaved),
            }
          : null,
        trend: Array.from(wfTrendMap.entries()).map(([date, v]) => ({ date, ...v })),
        statusMix: Array.from(wfStatusMix.entries()).map(([status, count]) => ({ status, count })),
        topWorkflows,
        failures,
      },
    };
  });
