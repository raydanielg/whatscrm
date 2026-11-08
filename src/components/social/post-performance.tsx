/**
 * Social Studio Performance tab: per-post impressions, clicks and shares for
 * published X, Threads and Instagram targets, with on-demand refresh from the
 * platform insight APIs.
 */
import { useMemo } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  Eye,
  MousePointerClick,
  Share2,
  Heart,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import {
  PLATFORM_LABELS,
  type SocialPost,
  type SocialChannel,
} from "@/hooks/use-social-publishing";
import {
  usePostMetrics,
  useRefreshPostMetrics,
  type PostMetric,
} from "@/hooks/use-post-performance";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const TRACKED = ["x", "threads", "instagram"];

type ChannelLite = Pick<SocialChannel, "id" | "name" | "platform">;
type TargetLite = NonNullable<SocialPost["social_post_targets"]>[number];
type PerfTarget = {
  target: TargetLite;
  channel: ChannelLite | null;
  platform: string;
  metric?: PostMetric;
};
type PerfRow = { post: SocialPost; targets: PerfTarget[] };

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      {icon}
      <span className="font-medium text-foreground">{fmt(value)}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

export function PostPerformance({
  posts,
  channels,
}: {
  posts: SocialPost[];
  channels: SocialChannel[];
}) {
  const { data: metrics, isLoading } = usePostMetrics();
  const refresh = useRefreshPostMetrics();
  const formatZoned = useZonedDateFormatter();

  // Latest published posts that have at least one tracked target.
  const rows = useMemo<PerfRow[]>(() => {
    const byTarget = new Map<string, PostMetric>((metrics ?? []).map((m) => [m.target_id, m]));
    const out: PerfRow[] = [];
    for (const post of posts) {
      if (post.status !== "published") continue;
      const targets: PerfTarget[] = [];
      for (const t of post.social_post_targets ?? []) {
        const channel = channels.find((c) => c.id === t.channel_id) ?? t.social_channels ?? null;
        const platform = channel?.platform ?? "";
        if (!TRACKED.includes(platform)) continue;
        targets.push({ target: t, channel, platform, metric: byTarget.get(t.id) });
      }
      if (targets.length) out.push({ post, targets });
    }
    return out;
  }, [posts, channels, metrics]);

  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, shares: 0, likes: 0, comments: 0 };
    for (const m of metrics ?? []) {
      t.impressions += m.impressions;
      t.clicks += m.clicks;
      t.shares += m.shares;
      t.likes += m.likes;
      t.comments += m.comments;
    }
    return t;
  }, [metrics]);

  const lastFetched = metrics?.[0]?.fetched_at;

  const onRefresh = async () => {
    try {
      const res = await refresh.mutateAsync();
      const failed = res.results.filter((r) => !r.ok);
      if (!res.results.length)
        toast.info("No published X, Threads or Instagram posts to measure yet");
      else if (!failed.length)
        toast.success(
          `Refreshed metrics for ${res.refreshed} post${res.refreshed === 1 ? "" : "s"}`,
        );
      else toast.warning(`Refreshed ${res.refreshed}; ${failed.length} failed: ${failed[0].error}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Post performance</h3>
          {lastFetched && (
            <span className="text-xs text-muted-foreground">
              Updated{" "}
              {formatZoned(new Date(lastFetched), { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onRefresh()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 " />
          )}
          Refresh metrics
        </Button>
      </div>

      {(metrics?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-3">
            <Stat
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Impressions"
              value={totals.impressions}
            />
          </Card>
          <Card className="p-3">
            <Stat
              icon={<MousePointerClick className="h-3.5 w-3.5" />}
              label="Clicks"
              value={totals.clicks}
            />
          </Card>
          <Card className="p-3">
            <Stat icon={<Share2 className="h-3.5 w-3.5" />} label="Shares" value={totals.shares} />
          </Card>
          <Card className="p-3">
            <Stat icon={<Heart className="h-3.5 w-3.5" />} label="Likes" value={totals.likes} />
          </Card>
          <Card className="p-3">
            <Stat
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              label="Comments"
              value={totals.comments}
            />
          </Card>
        </div>
      )}

      {isLoading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2" />
          Loading metrics
        </Card>
      ) : !rows.length ? (
        <Card className="p-10 text-center space-y-2">
          <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No published posts to measure yet</p>
          <p className="text-sm text-muted-foreground">
            Publish a post to X, Threads or Instagram, then hit Refresh metrics to see impressions,
            clicks and shares here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ post, targets }) => (
            <Card key={post.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm line-clamp-2 break-words min-w-0">
                  {post.caption || <span className="text-muted-foreground">No caption</span>}
                </p>
                {post.published_at && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatZoned(new Date(post.published_at), { dateStyle: "medium" })}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {targets.map(({ target, channel, platform, metric }) => (
                  <div
                    key={target.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control border px-3 py-2"
                  >
                    <Badge variant="secondary" className="text-[11px]">
                      {PLATFORM_LABELS[platform as SocialChannel["platform"]] ?? platform}
                      {channel?.name ? ` · ${channel.name}` : ""}
                    </Badge>
                    {metric ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Stat
                          icon={<Eye className="h-3.5 w-3.5" />}
                          label="impressions"
                          value={metric.impressions}
                        />
                        <Stat
                          icon={<MousePointerClick className="h-3.5 w-3.5" />}
                          label="clicks"
                          value={metric.clicks}
                        />
                        <Stat
                          icon={<Share2 className="h-3.5 w-3.5" />}
                          label="shares"
                          value={metric.shares}
                        />
                        <Stat
                          icon={<Heart className="h-3.5 w-3.5" />}
                          label="likes"
                          value={metric.likes}
                        />
                        <Stat
                          icon={<MessageCircle className="h-3.5 w-3.5" />}
                          label="comments"
                          value={metric.comments}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No metrics yet — refresh to fetch them
                      </span>
                    )}
                    {target.permalink && (
                      <a
                        href={target.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        aria-label="Open published post"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Metrics come from each platform's insights API. Threads and Instagram require the insights
        permission — channels connected before it was added may need to be reconnected. X only
        exposes public counts on most access tiers, so clicks may show as 0.
      </p>
    </div>
  );
}
