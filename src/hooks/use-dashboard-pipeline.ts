import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";
import {
  groupPipelineAmounts,
  pipelineDataState,
  type PipelineAmount,
  type PipelineDataState,
} from "@/lib/dashboard/pipeline-summary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (table: string) => sbAny(supabase).from(table as any) as any;
const PAGE_SIZE = 500;

export type DashboardPipeline = {
  id: string;
  name: string;
  position: number;
};

export type DashboardPipelineStage = {
  id: string;
  pipeline_id: string;
  pipelineName: string;
  name: string;
  color: string | null;
  position: number;
  count: number;
  totals: PipelineAmount[];
};

export type DashboardPipelineDeal = {
  id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  amount: number;
  currency: string;
  probability: number;
};

export type DashboardPipelineData = {
  state: PipelineDataState;
  pipelines: DashboardPipeline[];
  stages: DashboardPipelineStage[];
  deals: DashboardPipelineDeal[];
  totals: PipelineAmount[];
  unassignedDeals: number;
};

async function fetchAll<T>(
  table: string,
  select: string,
  workspaceId: string,
  filter?: (query: ReturnType<typeof anyFrom>) => ReturnType<typeof anyFrom>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = anyFrom(table)
      .select(select)
      .eq("workspace_id", workspaceId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function useDashboardPipeline(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ["dash", "pipeline-summary", workspaceId] });
    const channel = supabase.channel(`dashboard:pipeline-summary:${workspaceId}`);
    for (const table of ["deal_pipelines", "deal_stages", "deals"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        invalidate,
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);

  return useQuery<DashboardPipelineData>({
    queryKey: ["dash", "pipeline-summary", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      if (!workspaceId) throw new Error("No workspace selected");
      type StageRow = {
        id: string;
        pipeline_id: string;
        name: string;
        color: string | null;
        position: number;
        is_active: boolean;
      };
      type DealRow = DashboardPipelineDeal;
      const [pipelines, stages, deals] = await Promise.all([
        fetchAll<DashboardPipeline>("deal_pipelines", "id,name,position", workspaceId, (q) =>
          q.is("deleted_at", null),
        ),
        fetchAll<StageRow>(
          "deal_stages",
          "id,pipeline_id,name,color,position,is_active",
          workspaceId,
          (q) => q.eq("is_active", true),
        ),
        fetchAll<DealRow>(
          "deals",
          "id,pipeline_id,stage_id,amount,currency,probability",
          workspaceId,
          (q) => q.is("deleted_at", null).eq("status", "open"),
        ),
      ]);

      pipelines.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      const pipelineNames = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));
      const pipelineOrder = new Map(pipelines.map((pipeline, index) => [pipeline.id, index]));
      const activeStages = stages.filter((stage) => pipelineNames.has(stage.pipeline_id));
      activeStages.sort(
        (a, b) =>
          (pipelineOrder.get(a.pipeline_id) ?? 0) - (pipelineOrder.get(b.pipeline_id) ?? 0) ||
          a.position - b.position ||
          a.name.localeCompare(b.name),
      );
      const dealsByStage = new Map<string, DealRow[]>();
      for (const deal of deals) {
        if (!deal.pipeline_id || !deal.stage_id) continue;
        const key = `${deal.pipeline_id}:${deal.stage_id}`;
        const group = dealsByStage.get(key) ?? [];
        group.push(deal);
        dealsByStage.set(key, group);
      }
      const stageRows = activeStages.map((stage) => {
        const stageDeals = dealsByStage.get(`${stage.pipeline_id}:${stage.id}`) ?? [];
        return {
          id: stage.id,
          pipeline_id: stage.pipeline_id,
          pipelineName: pipelineNames.get(stage.pipeline_id) ?? "",
          name: stage.name,
          color: stage.color,
          position: stage.position,
          count: stageDeals.length,
          totals: groupPipelineAmounts(stageDeals),
        };
      });
      const stageKeys = new Set(activeStages.map((stage) => `${stage.pipeline_id}:${stage.id}`));
      return {
        state: pipelineDataState(pipelines.length, activeStages.length, deals.length),
        pipelines,
        stages: stageRows,
        deals,
        totals: groupPipelineAmounts(deals),
        unassignedDeals: deals.filter(
          (deal) => !stageKeys.has(`${deal.pipeline_id}:${deal.stage_id}`),
        ).length,
      };
    },
  });
}
