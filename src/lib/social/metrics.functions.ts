/**
 * Refreshes per-post performance metrics (impressions, clicks, shares, likes,
 * comments) for published X, Threads and Instagram targets.
 *
 * Called on demand from the Social Studio Performance tab. Channel tokens are
 * column-restricted, so reads go through the service client after a workspace
 * membership check; decrypted tokens never leave the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const input = z.object({ workspaceId: z.string().uuid() });

interface TargetRow {
  id: string;
  post_id: string;
  channel_id: string;
  external_post_id: string | null;
  status: string;
  social_channels: { id: string; platform: string } | null;
}

export interface MetricRefreshResult {
  targetId: string;
  platform: string;
  ok: boolean;
  error?: string;
}

export const refreshSocialMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    const { data: isMember } = await sbAny(context.supabase).rpc("is_workspace_member" as never, {
      _workspace_id: data.workspaceId,
      _user_id: context.userId,
    } as never);
    if (!isMember) throw new Error("You are not a member of this workspace");

    const { data: rows, error } = await sbAny(context.supabase)
      .from("social_post_targets")
      .select("id, post_id, channel_id, external_post_id, status, social_channels!inner(id, platform)")
      .eq("status", "published")
      .not("external_post_id", "is", null);
    if (error) throw new Error(error.message);

    const targets = ((rows ?? []) as unknown as TargetRow[]).filter((t) =>
      ["x", "threads", "instagram"].includes(t.social_channels?.platform ?? ""),
    );
    if (!targets.length) return { refreshed: 0, results: [] as MetricRefreshResult[] };

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const channelIds = [...new Set(targets.map((t) => t.channel_id))];
    const { data: tokenRows } = await sbAny(supabaseAdmin)
      .from("social_channels")
      .select("id, access_token")
      .eq("workspace_id", data.workspaceId)
      .in("id", channelIds);
    const tokens = new Map<string, string | null>(
      ((tokenRows ?? []) as { id: string; access_token: string | null }[]).map((r) => [r.id, r.access_token]),
    );

    const { fetchXMetrics, fetchThreadsMetrics, fetchInstagramMetrics } = await import("./metrics.server");

    const results: MetricRefreshResult[] = [];
    for (const target of targets) {
      const platform = target.social_channels!.platform;
      try {
        const token = tokens.get(target.channel_id);
        if (!token) throw new Error("Channel has no access token. Reconnect the channel.");
        const externalId = target.external_post_id!;
        const metrics =
          platform === "x"
            ? await fetchXMetrics(token, externalId)
            : platform === "threads"
              ? await fetchThreadsMetrics(token, externalId)
              : await fetchInstagramMetrics(token, externalId);

        const { error: upsertError } = await sbAny(supabaseAdmin)
          .from("social_post_metrics")
          .upsert(
            {
              workspace_id: data.workspaceId,
              post_id: target.post_id,
              target_id: target.id,
              channel_id: target.channel_id,
              platform,
              impressions: metrics.impressions,
              clicks: metrics.clicks,
              shares: metrics.shares,
              likes: metrics.likes,
              comments: metrics.comments,
              raw: metrics.raw,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "target_id" },
          );
        if (upsertError) throw new Error(upsertError.message);
        results.push({ targetId: target.id, platform, ok: true });
      } catch (e) {
        results.push({
          targetId: target.id,
          platform,
          ok: false,
          error: e instanceof Error ? e.message : "Metrics fetch failed",
        });
      }
    }

    return { refreshed: results.filter((r) => r.ok).length, results };
  });
