import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  aiDealSummary, aiDealRisk, aiNextBestAction, aiFollowUpSuggestions,
  aiDraftMessage, aiProposalSuggestions, aiCoaching, aiDealProbability,
  aiRevenuePrediction, aiPipelineHealth, aiLeadPriority, aiGenerateCrmNote,
  aiSalesRecommendations,
} from "@/lib/ai/sales-assistant.functions";

/** Cached fetchers per deal — refresh on demand or every 5 minutes. */
export function useDealSummary(dealId: string | undefined) {
  const fn = useServerFn(aiDealSummary);
  return useQuery({
    queryKey: ["ai-sales", "summary", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useDealRisk(dealId: string | undefined) {
  const fn = useServerFn(aiDealRisk);
  return useQuery({
    queryKey: ["ai-sales", "risk", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useNextBestAction(dealId: string | undefined) {
  const fn = useServerFn(aiNextBestAction);
  return useQuery({
    queryKey: ["ai-sales", "nba", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useFollowUps(dealId: string | undefined) {
  const fn = useServerFn(aiFollowUpSuggestions);
  return useQuery({
    queryKey: ["ai-sales", "followups", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useProposalSuggestions(dealId: string | undefined) {
  const fn = useServerFn(aiProposalSuggestions);
  return useQuery({
    queryKey: ["ai-sales", "proposal", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useCoaching(dealId: string | undefined) {
  const fn = useServerFn(aiCoaching);
  return useQuery({
    queryKey: ["ai-sales", "coaching", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useDealProbability(dealId: string | undefined) {
  const fn = useServerFn(aiDealProbability);
  return useQuery({
    queryKey: ["ai-sales", "probability", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useSalesRecommendations(dealId: string | undefined) {
  const fn = useServerFn(aiSalesRecommendations);
  return useQuery({
    queryKey: ["ai-sales", "recs", dealId],
    queryFn: () => fn({ data: { dealId: dealId! } }),
    enabled: !!dealId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useRevenuePrediction(period: "month" | "quarter" | "year" = "quarter") {
  const fn = useServerFn(aiRevenuePrediction);
  return useQuery({
    queryKey: ["ai-sales", "revenue", period],
    queryFn: () => fn({ data: { period } }),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function usePipelineHealth() {
  const fn = useServerFn(aiPipelineHealth);
  return useQuery({
    queryKey: ["ai-sales", "pipeline-health"],
    queryFn: () => fn({}),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useLeadPriority() {
  const fn = useServerFn(aiLeadPriority);
  return useQuery({
    queryKey: ["ai-sales", "priority"],
    queryFn: () => fn({}),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useDraftMessage() {
  const fn = useServerFn(aiDraftMessage);
  return useMutation({
    mutationFn: (data: { dealId: string; channel: "email" | "whatsapp"; intent: string; tone?: "friendly" | "professional" | "urgent" | "casual" | "formal" }) =>
      fn({ data: { ...data, tone: data.tone ?? "professional" } }),
  });
}

export function useGenerateCrmNote() {
  const fn = useServerFn(aiGenerateCrmNote);
  return useMutation({
    mutationFn: (data: { dealId: string; event: string }) => fn({ data }),
  });
}

/** Force refresh all AI panels for a deal. */
export function useRefreshDealAI() {
  const qc = useQueryClient();
  return (dealId: string) => {
    qc.invalidateQueries({ queryKey: ["ai-sales"], predicate: (q) => q.queryKey.includes(dealId) });
  };
}
