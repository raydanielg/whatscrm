import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiAnalytics, type AiAnalyticsReport } from "@/lib/ai/analytics.functions";

export type { AiAnalyticsReport };

export function useAiAnalytics(workspaceId: string | undefined, days: number) {
  const fn = useServerFn(getAiAnalytics);
  return useQuery({
    queryKey: ["ai-analytics", workspaceId, days],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, days } }),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
