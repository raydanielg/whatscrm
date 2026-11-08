import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getLeadQualification,
  qualifyLead,
  listLeadQualifications,
  type LeadQualification,
} from "@/lib/ai/lead-qualification.functions";

export type { LeadQualification, RecommendedAction } from "@/lib/ai/lead-qualification.functions";

export function useLeadQualification(leadId: string | null | undefined) {
  const qc = useQueryClient();
  const getFn = useServerFn(getLeadQualification);
  const runFn = useServerFn(qualifyLead);

  const query = useQuery<LeadQualification | null>({
    queryKey: ["lead-qualification", leadId],
    queryFn: () => (leadId ? getFn({ data: { leadId } }) : Promise.resolve(null)),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  // Realtime updates
  useEffect(() => {
    if (!leadId) return;
    const ch = supabase
      .channel(`lead-q-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_qualification",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["lead-qualification", leadId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadId, qc]);

  const analyze = useMutation({
    mutationFn: () => {
      if (!leadId) throw new Error("No lead");
      return runFn({ data: { leadId } });
    },
    onSuccess: (data) => {
      qc.setQueryData(["lead-qualification", leadId], data);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      toast.success("Lead qualified");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to qualify lead");
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    analyze: analyze.mutate,
    isAnalyzing: analyze.isPending,
  };
}

export function useLeadQualificationList(params: {
  workspaceId: string | undefined;
  temperature?: "hot" | "warm" | "cold";
  priority?: "low" | "medium" | "high" | "urgent";
  minScore?: number;
  limit?: number;
}) {
  const listFn = useServerFn(listLeadQualifications);
  return useQuery<LeadQualification[]>({
    queryKey: ["lead-qualifications", params],
    queryFn: () =>
      params.workspaceId
        ? listFn({
            data: {
              workspaceId: params.workspaceId,
              temperature: params.temperature,
              priority: params.priority,
              minScore: params.minScore,
              limit: params.limit ?? 50,
            },
          })
        : Promise.resolve([]),
    enabled: !!params.workspaceId,
    staleTime: 60_000,
  });
}
