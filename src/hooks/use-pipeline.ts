import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";
import { useTenantCurrency } from "@/hooks/use-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

/* -------------------------------- Types -------------------------------- */

export type StageType = "normal" | "qualifying" | "won" | "lost";

export type PipelineRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
  color: string | null;
  icon: string | null;
  default_currency: string;
  stale_after_days: number;
};

export type StageRow = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  color: string | null;
  stage_type: StageType;
  aging_days: number | null;
  rules: Record<string, unknown>;
  automations: Record<string, unknown>[];
  description: string | null;
  is_active: boolean;
};

export type StageHistoryRow = {
  id: string;
  workspace_id: string;
  deal_id: string;
  pipeline_id: string | null;
  from_stage_id: string | null;
  to_stage_id: string | null;
  from_status: string | null;
  to_status: string | null;
  amount: number | null;
  currency: string | null;
  moved_by: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type PipelineTemplateRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  category: string | null;
  is_builtin: boolean;
  stages: {
    name: string;
    probability: number;
    color?: string;
    stage_type?: StageType;
    aging_days?: number | null;
    description?: string;
  }[];
};

export const STAGE_COLORS = [
  "#94a3b8", "#64748b", "#3b82f6", "#0ea5e9", "#06b6d4",
  "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b",
  "#f97316", "#ef4444", "#ec4899", "#a855f7", "#8b5cf6", "#6366f1",
];

/* ------------------------------ Pipelines ------------------------------ */

export function usePipelinesFull() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["pipelines_full", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<PipelineRow[]> => {
      const { data, error } = await anyFrom("deal_pipelines")
        .select("*")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineRow[];
    },
  });
}

export function useStagesFull(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ["stages_full", pipelineId],
    enabled: !!pipelineId,
    queryFn: async (): Promise<StageRow[]> => {
      const { data, error } = await anyFrom("deal_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
  });
}

export function useCreatePipeline() {
  // A new pipeline's default currency is the tenant's, not dollars.
  const tenantCurrency = useTenantCurrency();
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      color?: string;
      icon?: string;
      default_currency?: string;
      is_default?: boolean;
    }): Promise<PipelineRow> => {
      if (!active?.id) throw new Error("No workspace");
      // find next position
      const { data: existing } = await anyFrom("deal_pipelines")
        .select("position").eq("workspace_id", active.id)
        .order("position", { ascending: false }).limit(1);
      const position = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;

      if (input.is_default) {
        await anyFrom("deal_pipelines").update({ is_default: false })
          .eq("workspace_id", active.id);
      }
      const { data, error } = await anyFrom("deal_pipelines")
        .insert({
          workspace_id: active.id,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? "#6366f1",
          icon: input.icon ?? null,
          default_currency: input.default_currency ?? tenantCurrency,
          is_default: input.is_default ?? false,
          position,
        })
        .select("*").single();
      if (error) throw error;
      return data as PipelineRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines_full"] });
      qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PipelineRow> }) => {
      if (patch.is_default) {
        await anyFrom("deal_pipelines").update({ is_default: false })
          .eq("workspace_id", active?.id).neq("id", id);
      }
      const { data, error } = await anyFrom("deal_pipelines")
        .update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return data as PipelineRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines_full"] });
      qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("deal_pipelines")
        .update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines_full"] });
      qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

/* -------------------------------- Stages -------------------------------- */

export function useCreateStage() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<StageRow> & { pipeline_id: string; name: string }) => {
      if (!active?.id) throw new Error("No workspace");
      const { data: existing } = await anyFrom("deal_stages")
        .select("position").eq("pipeline_id", input.pipeline_id)
        .order("position", { ascending: false }).limit(1);
      const position = input.position ?? ((existing?.[0]?.position as number | undefined) ?? -1) + 1;

      const { data, error } = await anyFrom("deal_stages")
        .insert({
          workspace_id: active.id,
          pipeline_id: input.pipeline_id,
          name: input.name,
          position,
          probability: input.probability ?? 0,
          color: input.color ?? "#94a3b8",
          stage_type: input.stage_type ?? "normal",
          is_won: input.stage_type === "won" || input.is_won === true,
          is_lost: input.stage_type === "lost" || input.is_lost === true,
          aging_days: input.aging_days ?? null,
          description: input.description ?? null,
          rules: input.rules ?? {},
          automations: input.automations ?? [],
          is_active: input.is_active ?? true,
        })
        .select("*").single();
      if (error) throw error;
      return data as StageRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["stages_full", row.pipeline_id] });
      qc.invalidateQueries({ queryKey: ["deal_stages", row.pipeline_id] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StageRow> }) => {
      const p: Partial<StageRow> = { ...patch };
      if (patch.stage_type) {
        p.is_won = patch.stage_type === "won";
        p.is_lost = patch.stage_type === "lost";
      }
      const { data, error } = await anyFrom("deal_stages")
        .update(p).eq("id", id).select("*").single();
      if (error) throw error;
      return data as StageRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["stages_full", row.pipeline_id] });
      qc.invalidateQueries({ queryKey: ["deal_stages", row.pipeline_id] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pipelineId }: { id: string; pipelineId: string }) => {
      const { error } = await anyFrom("deal_stages").delete().eq("id", id);
      if (error) throw error;
      return pipelineId;
    },
    onSuccess: (pipelineId) => {
      qc.invalidateQueries({ queryKey: ["stages_full", pipelineId] });
      qc.invalidateQueries({ queryKey: ["deal_stages", pipelineId] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pipelineId, orderedIds }: { pipelineId: string; orderedIds: string[] }) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          anyFrom("deal_stages").update({ position: i }).eq("id", id),
        ),
      );
      return pipelineId;
    },
    onSuccess: (pipelineId) => {
      qc.invalidateQueries({ queryKey: ["stages_full", pipelineId] });
      qc.invalidateQueries({ queryKey: ["deal_stages", pipelineId] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

/* ------------------------------ Templates ------------------------------ */

export function usePipelineTemplates() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["pipeline_templates", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<PipelineTemplateRow[]> => {
      const { data, error } = await anyFrom("pipeline_templates")
        .select("*")
        .or(`is_builtin.eq.true,workspace_id.eq.${wsId}`)
        .order("is_builtin", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineTemplateRow[];
    },
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({
      template, name, makeDefault,
    }: { template: PipelineTemplateRow; name?: string; makeDefault?: boolean }): Promise<PipelineRow> => {
      if (!active?.id) throw new Error("No workspace");
      // find next position
      const { data: existing } = await anyFrom("deal_pipelines")
        .select("position").eq("workspace_id", active.id)
        .order("position", { ascending: false }).limit(1);
      const position = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;

      if (makeDefault) {
        await anyFrom("deal_pipelines").update({ is_default: false })
          .eq("workspace_id", active.id);
      }

      const { data: pipe, error: pErr } = await anyFrom("deal_pipelines")
        .insert({
          workspace_id: active.id,
          name: name || template.name,
          description: template.description ?? null,
          color: template.color ?? "#6366f1",
          icon: template.icon ?? null,
          is_default: !!makeDefault,
          position,
        }).select("*").single();
      if (pErr) throw pErr;

      const rows = template.stages.map((s, i) => ({
        workspace_id: active.id,
        pipeline_id: pipe.id,
        name: s.name,
        position: i,
        probability: s.probability ?? 0,
        color: s.color ?? "#94a3b8",
        stage_type: s.stage_type ?? "normal",
        is_won: s.stage_type === "won",
        is_lost: s.stage_type === "lost",
        aging_days: s.aging_days ?? null,
        description: s.description ?? null,
        rules: {},
        automations: [],
        is_active: true,
      }));
      if (rows.length > 0) {
        const { error: sErr } = await anyFrom("deal_stages").insert(rows);
        if (sErr) throw sErr;
      }
      return pipe as PipelineRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines_full"] });
      qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

/* ------------------------------ Analytics ------------------------------ */

export type PipelineAnalytics = {
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  openValue: number;
  wonValue: number;
  lostValue: number;
  weightedValue: number;
  winRate: number; // 0..1
  avgDealSize: number;
  avgSalesCycleDays: number | null;
  currency: string;
  byStage: {
    stageId: string;
    stageName: string;
    color: string;
    dealCount: number;
    value: number;
    avgAgeDays: number | null;
    stalled: number;
  }[];
  funnel: { stageId: string; stageName: string; color: string; count: number; value: number }[];
  conversion: { fromStageId: string; toStageId: string; rate: number }[];
};

export function usePipelineAnalytics(pipelineId: string | null | undefined) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["pipeline_analytics", wsId, pipelineId],
    enabled: !!wsId && !!pipelineId,
    queryFn: async (): Promise<PipelineAnalytics> => {
      const [{ data: stages }, { data: deals }, { data: history }] = await Promise.all([
        anyFrom("deal_stages").select("*")
          .eq("pipeline_id", pipelineId).order("position", { ascending: true }),
        anyFrom("deals").select("*")
          .eq("workspace_id", wsId).eq("pipeline_id", pipelineId).is("deleted_at", null),
        anyFrom("deal_stage_history").select("*")
          .eq("workspace_id", wsId).eq("pipeline_id", pipelineId)
          .order("created_at", { ascending: true }).limit(5000),
      ]);
      const stageList: StageRow[] = (stages ?? []) as StageRow[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dealList: any[] = (deals ?? []) as any[];
      const histList: StageHistoryRow[] = (history ?? []) as StageHistoryRow[];

      // Empty when the pipeline has no deals yet — the UI substitutes the tenant currency.
      const currency = dealList[0]?.currency ?? "";
      const won = dealList.filter((d) => d.status === "won");
      const lost = dealList.filter((d) => d.status === "lost");
      const open = dealList.filter((d) => d.status === "open");

      const wonValue = won.reduce((a, d) => a + Number(d.amount || 0), 0);
      const openValue = open.reduce((a, d) => a + Number(d.amount || 0), 0);
      const lostValue = lost.reduce((a, d) => a + Number(d.amount || 0), 0);
      const weightedValue = open.reduce(
        (a, d) => a + Number(d.amount || 0) * (Number(d.probability || 0) / 100), 0,
      );

      const closed = won.length + lost.length;
      const winRate = closed === 0 ? 0 : won.length / closed;
      const avgDealSize = won.length === 0 ? 0 : wonValue / won.length;

      // sales cycle from history (creation → won)
      const cycleDays: number[] = [];
      for (const d of won) {
        const firstHist = histList.find((h) => h.deal_id === d.id);
        const wonHist = [...histList].reverse().find((h) => h.deal_id === d.id && h.to_status === "won");
        if (firstHist && wonHist) {
          const ms = new Date(wonHist.created_at).getTime() - new Date(firstHist.created_at).getTime();
          if (ms > 0) cycleDays.push(ms / (1000 * 60 * 60 * 24));
        }
      }
      const avgSalesCycleDays = cycleDays.length
        ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length
        : null;

      // by stage aging & counts
      const byStage = stageList.map((s) => {
        const stageDeals = dealList.filter((d) => d.stage_id === s.id && d.status === "open");
        const ages = stageDeals
          .map((d) => {
            const last = [...histList].reverse().find((h) => h.deal_id === d.id && h.to_stage_id === s.id);
            const enteredAt = last ? new Date(last.created_at) : new Date(d.updated_at || d.created_at);
            return (Date.now() - enteredAt.getTime()) / (1000 * 60 * 60 * 24);
          });
        const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
        const threshold = s.aging_days ?? Infinity;
        const stalled = ages.filter((a) => a > threshold).length;
        return {
          stageId: s.id,
          stageName: s.name,
          color: s.color ?? "#94a3b8",
          dealCount: stageDeals.length,
          value: stageDeals.reduce((a, d) => a + Number(d.amount || 0), 0),
          avgAgeDays: avgAge,
          stalled,
        };
      });

      // funnel: how many deals have ever touched each stage
      const funnel = stageList.map((s) => {
        const touchedIds = new Set(histList.filter((h) => h.to_stage_id === s.id).map((h) => h.deal_id));
        for (const d of dealList) if (d.stage_id === s.id) touchedIds.add(d.id);
        const touched = dealList.filter((d) => touchedIds.has(d.id));
        return {
          stageId: s.id,
          stageName: s.name,
          color: s.color ?? "#94a3b8",
          count: touched.length,
          value: touched.reduce((a, d) => a + Number(d.amount || 0), 0),
        };
      });

      // stage-to-stage conversion
      const conversion = stageList.slice(0, -1).map((s, i) => {
        const next = stageList[i + 1];
        const from = funnel[i].count;
        const to = funnel[i + 1].count;
        return { fromStageId: s.id, toStageId: next.id, rate: from === 0 ? 0 : Math.min(1, to / from) };
      });

      return {
        totalDeals: dealList.length,
        openDeals: open.length,
        wonDeals: won.length,
        lostDeals: lost.length,
        openValue, wonValue, lostValue, weightedValue,
        winRate, avgDealSize, avgSalesCycleDays,
        currency,
        byStage, funnel, conversion,
      };
    },
  });
}

/* -------------------------- Realtime updates -------------------------- */

export function useDealsRealtime(workspaceId: string | undefined, pipelineId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`pipeline_rt:${workspaceId}:${pipelineId ?? "any"}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["deals"] });
          qc.invalidateQueries({ queryKey: ["pipeline_analytics"] });
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "deal_stages" },
        () => {
          qc.invalidateQueries({ queryKey: ["stages_full"] });
          qc.invalidateQueries({ queryKey: ["deal_stages"] });
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "deal_pipelines", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["pipelines_full"] });
          qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "deal_stage_history", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["pipeline_analytics"] });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, pipelineId, qc]);
}

/* -------------------------- Deal aging helpers -------------------------- */

export function computeAgeDays(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  return (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
}

export function isDealStale(
  deal: { updated_at?: string; stage_id?: string | null; status?: string },
  stage: StageRow | undefined,
  pipelineFallbackDays = 14,
): boolean {
  if (!deal || deal.status !== "open") return false;
  const threshold = stage?.aging_days ?? pipelineFallbackDays;
  return computeAgeDays(deal.updated_at) > threshold;
}

export function useStageMap(stages: StageRow[] | undefined) {
  return useMemo(() => {
    const m = new Map<string, StageRow>();
    (stages ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [stages]);
}
