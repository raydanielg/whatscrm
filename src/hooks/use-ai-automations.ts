import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import * as React from "react";
import {
  listAutomationConfig,
  updateAutomationConfig,
  listSuggestions,
  analyzeAndSuggest,
  applySuggestion,
  rejectSuggestion,
  AUTOMATION_TYPES,
  AUTOMATION_META,
  type AutomationType,
  type AutomationConfig,
  type AutomationSuggestion,
} from "@/lib/ai/automations.functions";

export { AUTOMATION_TYPES, AUTOMATION_META };
export type { AutomationType, AutomationConfig, AutomationSuggestion };

export function useAutomationConfig(workspaceId: string | undefined) {
  const fn = useServerFn(listAutomationConfig);
  return useQuery({
    queryKey: ["ai-automation-config", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
  });
}

export function useUpdateAutomationConfig(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(updateAutomationConfig);
  return useMutation({
    mutationFn: (input: {
      automationType: AutomationType;
      enabled?: boolean;
      requireConfirmation?: boolean;
      autoApplyThreshold?: number | null;
      config?: Record<string, unknown>;
    }) => fn({ data: { workspaceId: workspaceId!, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-automation-config", workspaceId] }),
  });
}

export function useSuggestions(
  workspaceId: string | undefined,
  opts: { status?: "pending" | "approved" | "applied" | "rejected" | "failed" | "all"; entityType?: string; entityId?: string; limit?: number } = {},
) {
  const fn = useServerFn(listSuggestions);
  const qc = useQueryClient();
  const key = ["ai-automation-suggestions", workspaceId, opts];

  React.useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`ai-sug:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_automation_suggestions", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["ai-automation-suggestions", workspaceId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);

  return useQuery({
    queryKey: key,
    enabled: !!workspaceId,
    queryFn: () =>
      fn({
        data: {
          workspaceId: workspaceId!,
          status: opts.status ?? "pending",
          entityType: opts.entityType,
          entityId: opts.entityId,
          limit: opts.limit,
        },
      }),
  });
}

export function useAnalyzeAndSuggest(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(analyzeAndSuggest);
  return useMutation({
    mutationFn: (input: {
      entityType: "conversation" | "lead" | "contact" | "deal";
      entityId: string;
      types?: AutomationType[];
    }) => fn({ data: { workspaceId: workspaceId!, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-automation-suggestions", workspaceId] }),
  });
}

export function useApplySuggestion(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(applySuggestion);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-automation-suggestions", workspaceId] }),
  });
}

export function useRejectSuggestion(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(rejectSuggestion);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-automation-suggestions", workspaceId] }),
  });
}

export function useAutomationConfigMap(workspaceId: string | undefined) {
  const q = useAutomationConfig(workspaceId);
  const map = useMemo(() => {
    const m = new Map<AutomationType, AutomationConfig>();
    for (const c of q.data ?? []) m.set(c.automationType, c);
    return m;
  }, [q.data]);
  return { ...q, map };
}
