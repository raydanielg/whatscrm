/**
 * Social Studio performance metrics: reads the stored per-target snapshots and
 * triggers on-demand refreshes from the platform insight APIs.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";
import { refreshSocialMetrics, type MetricRefreshResult } from "@/lib/social/metrics.functions";

export type PostMetric = {
  id: string;
  post_id: string;
  target_id: string;
  channel_id: string | null;
  platform: string;
  impressions: number;
  clicks: number;
  shares: number;
  likes: number;
  comments: number;
  fetched_at: string;
};

export function usePostMetrics() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["social-post-metrics", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await sbAny(supabase)
        .from("social_post_metrics")
        .select("id, post_id, target_id, channel_id, platform, impressions, clicks, shares, likes, comments, fetched_at")
        .eq("workspace_id", active!.id)
        .order("fetched_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PostMetric[];
    },
  });
}

export function useRefreshPostMetrics() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const refresh = useServerFn(refreshSocialMetrics);
  return useMutation({
    mutationFn: async (): Promise<{ refreshed: number; results: MetricRefreshResult[] }> => {
      if (!active?.id) throw new Error("No active workspace");
      return refresh({ data: { workspaceId: active.id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-post-metrics", active?.id] }),
  });
}
