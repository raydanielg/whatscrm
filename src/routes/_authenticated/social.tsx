import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { useTenantAccent } from "@/lib/themes/tenant-accent";
import {
  Plus,
  Trash2,
  Send,
  CalendarClock,
  Loader2,
  Share2,
  ExternalLink,
  Pencil,
  Copy,
  X,
  Upload,
  Instagram,
  Check,
  XCircle,
  ShieldCheck,
  Save,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadSocialMedia } from "@/lib/social/media-upload";
import { describeSaveFailure } from "@/lib/social/save-errors";

import {
  useSocialChannels,
  useDeleteSocialChannel,
  useSocialPosts,
  useSaveSocialPost,
  useDeleteSocialPost,
  useRescheduleSocialPost,
  useSetPostApproval,
  validatePost,
  PLATFORM_LABELS,
  PLATFORM_LIMITS,
  PLATFORM_CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_MEDIA_KINDS,
  defaultMediaKind,
  type SocialPlatform,
  type SocialChannel,
  type SocialPost,
  type PostInput,
  type SocialContentType,
  type SocialMediaKind,
} from "@/hooks/use-social-publishing";
import { Switch } from "@/components/ui/switch";
import { SchedulePicker } from "@/components/app/social/schedule-picker";
import { publishSocialPost } from "@/lib/social/publish.functions";
import {
  ChannelSetupDialog,
  ChannelHealthPanel,
  InstagramFeed,
  emptyChannelDraft,
  type ChannelDraft,
} from "@/components/social/social-channel-panels";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { MetaDashboard } from "@/components/social/meta-dashboard";
import { PostHistory, PostLibrary } from "@/components/social/post-history-library";
import { PostPerformance } from "@/components/social/post-performance";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/social")({
  component: SocialStudio,
  staticData: { breadcrumb: "Social Studio" },
  head: () => ({
    meta: [
      { title: "Social Studio · Auto Posting" },
      {
        name: "description",
        content:
          "Schedule and auto-publish posts to Facebook, Instagram and LinkedIn from one CRM composer.",
      },
      { property: "og:title", content: "Social Studio · Auto Posting" },
      {
        property: "og:description",
        content:
          "Schedule and auto-publish posts to Facebook, Instagram and LinkedIn from one CRM composer.",
      },
    ],
  }),
});

const emptyPost: PostInput = {
  caption: "",
  media_urls: [],
  link_url: "",
  first_comment: "",
  channelIds: [],
  scheduled_at: null,
  status: "draft",
  content_type: "post",
  media_kind: "none",
  poll_options: ["", ""],
  poll_duration: 24,
  allow_multi_vote: false,
};

const MEDIA_KIND_LABELS: Record<SocialMediaKind, string> = {
  none: "No media",
  image: "Single image",
  video: "Video",
  carousel: "Carousel",
};

const MEDIA_PLACEHOLDER: Record<SocialMediaKind, string> = {
  none: "",
  image: "https:///image.jpg",
  video: "https:///video.mp4",
  carousel: "https:///image.jpg",
};

function StatusPill({ status }: { status: SocialPost["status"] }) {
  const cls: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    scheduled: "bg-primary/10 text-primary",
    publishing: "bg-amber-500/15 text-amber-600",
    published: "bg-emerald-500/15 text-emerald-600",
    failed: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`capitalize ${cls[status]}`}>
      {status}
    </Badge>
  );
}

/** Day-grouped timeline of scheduled/published posts across all channels. */
function SocialTimeline({
  posts,
  isLoading,
  onNewPost,
  onPublish,
  publishingId,
}: {
  posts: SocialPost[];
  isLoading: boolean;
  onNewPost: () => void;
  onPublish: (p: SocialPost) => void;
  publishingId: string | null;
}) {
  const formatZoned = useZonedDateFormatter();
  const groups = useMemo(() => {
    const timed = posts
      .filter((p) => p.scheduled_at || p.published_at)
      .sort(
        (a, b) =>
          new Date(a.scheduled_at ?? a.published_at!).getTime() -
          new Date(b.scheduled_at ?? b.published_at!).getTime(),
      );
    const byDay = new Map<string, SocialPost[]>();
    for (const p of timed) {
      const d = new Date(p.scheduled_at ?? p.published_at!);
      const key = formatZoned(d, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(p);
    }
    return [...byDay.entries()];
  }, [posts, formatZoned]);

  if (isLoading)
    return <Card className="p-10 text-center text-muted-foreground">Loading timeline</Card>;
  if (!groups.length) {
    return (
      <Card className="p-10 text-center space-y-3">
        <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Nothing scheduled yet</p>
        <p className="text-sm text-muted-foreground">
          Scheduled and published posts will appear here, grouped by day and channel.
        </p>
        <Button onClick={onNewPost}>
          <Plus className="h-4 w-4 mr-2" />
          New post
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([day, dayPosts]) => (
        <div key={day} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-1">
            {day}
          </h3>
          <div className="relative ml-3 border-l pl-5 space-y-3">
            {dayPosts.map((post) => {
              const when = new Date(post.scheduled_at ?? post.published_at!);
              return (
                <div key={post.id} className="relative">
                  <span
                    className="absolute -left-[26.5px] top-4 h-3 w-3 rounded-full bg-primary/70 ring-4 ring-background"
                    aria-hidden
                  />
                  <Card className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatZoned(when, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <Badge variant="secondary" className="text-[11px]">
                        {CONTENT_TYPE_LABELS[post.content_type]}
                      </Badge>
                      <StatusPill status={post.status} />
                    </div>
                    <p className="text-sm line-clamp-2 break-words">
                      {post.caption || <span className="text-muted-foreground">No caption</span>}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(post.social_post_targets ?? []).map((t) => (
                        <Badge key={t.id} variant="outline" className="text-[11px] gap-1">
                          {t.social_channels?.name ?? "Channel"}
                          <span className="text-muted-foreground">
                            · {t.social_channels?.platform}
                          </span>
                          <span
                            className={
                              t.status === "published"
                                ? "text-emerald-600"
                                : t.status === "failed"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }
                          >
                            · {t.status}
                          </span>
                          {t.permalink && (
                            <a href={t.permalink} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </Badge>
                      ))}
                    </div>
                    {post.last_error && (
                      <p className="text-xs text-destructive">{post.last_error}</p>
                    )}
                    {post.status !== "publishing" &&
                      (post.social_post_targets ?? []).some((target) => target.status === "pending" || target.status === "failed") && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!publishingId}
                          onClick={() => onPublish(post)}
                        >
                          {publishingId === post.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 " />
                          )}
                          Publish now
                        </Button>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin dashboard: every scheduled/failed post by channel, with reschedule + manual publish. */
const DASHBOARD_FILTERS = ["queued", "failed", "published", "all"] as const;
type DashboardFilter = (typeof DASHBOARD_FILTERS)[number];
const FILTER_LABELS: Record<DashboardFilter, string> = {
  queued: "Waiting to publish",
  failed: "Failed",
  published: "Published",
  all: "All posts",
};

export type BulkProgressItem = {
  id: string;
  caption: string;
  state: "pending" | "publishing" | "ok" | "failed";
  error?: string;
};

function ScheduledDashboard({
  posts,
  channels,
  onEdit,
  onReschedule,
  onPublish,
  onBulkPublish,
  publishingId,
  bulkPublishing,
  bulkProgress,
}: {
  posts: SocialPost[];
  channels: SocialChannel[];
  onEdit: (p: SocialPost) => void;
  onReschedule: (p: SocialPost) => void;
  onPublish: (p: SocialPost) => void;
  onBulkPublish: (posts: SocialPost[]) => void;
  publishingId: string | null;
  bulkPublishing: boolean;
  bulkProgress: BulkProgressItem[];
}) {
  const formatZoned = useZonedDateFormatter();
  const [filter, setFilter] = useState<DashboardFilter>("queued");

  const counts = useMemo(
    () => ({
      queued: posts.filter((p) => p.status === "scheduled" || p.status === "publishing").length,
      failed: posts.filter((p) => p.status === "failed").length,
      published: posts.filter((p) => p.status === "published").length,
      all: posts.length,
    }),
    [posts],
  );

  const visible = useMemo(
    () =>
      posts.filter((p) => {
        if (filter === "all") return true;
        if (filter === "queued") return p.status === "scheduled" || p.status === "publishing";
        return p.status === filter;
      }),
    [posts, filter],
  );

  const bulkEligible = useMemo(
    () => visible.filter((p) => p.status === "scheduled" || p.status === "failed"),
    [visible],
  );

  const byChannel = useMemo(() => {
    const map = new Map<string, { channel: SocialChannel | undefined; items: SocialPost[] }>();
    for (const p of visible) {
      const targets = p.social_post_targets ?? [];
      const keys = targets.length ? targets.map((t) => t.channel_id) : ["unassigned"];
      for (const key of keys) {
        if (!map.has(key)) map.set(key, { channel: channels.find((c) => c.id === key), items: [] });
        map.get(key)!.items.push(p);
      }
    }
    for (const g of map.values())
      g.items.sort(
        (a, b) =>
          new Date(b.scheduled_at ?? b.created_at).getTime() -
          new Date(a.scheduled_at ?? a.created_at).getTime(),
      );
    return [...map.values()];
  }, [visible, channels]);

  const nextUp = useMemo(() => {
    const upcoming = posts
      .filter((p) => p.status === "scheduled" && p.scheduled_at)
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
    return upcoming[0]?.scheduled_at ?? null;
  }, [posts]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-semibold">{counts.queued}</div>
          <div className="text-xs text-muted-foreground">Waiting to publish</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold text-destructive">{counts.failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold">{counts.published}</div>
          <div className="text-xs text-muted-foreground">Published</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold">
            {nextUp
              ? formatZoned(new Date(nextUp), { dateStyle: "medium", timeStyle: "short" })
              : "—"}
          </div>
          <div className="text-xs text-muted-foreground">Next automatic publish</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]} ({counts[f]})
            </Button>
          ))}
        </div>
        <Button
          className="sm:ml-auto"
          size="sm"
          disabled={!bulkEligible.length || bulkPublishing || !!publishingId}
          onClick={() => onBulkPublish(bulkEligible)}
        >
          {bulkPublishing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 mr-1.5" />
          )}
          Publish {bulkEligible.length} now
        </Button>
      </div>

      {bulkProgress.length > 0 && (
        <Card className="p-3 space-y-1.5" aria-live="polite">
          <div className="text-xs font-medium text-muted-foreground">
            Bulk publish — {bulkProgress.filter((i) => i.state === "ok").length}/
            {bulkProgress.length} published
            {bulkProgress.some((i) => i.state === "failed") &&
              `, ${bulkProgress.filter((i) => i.state === "failed").length} failed`}
          </div>
          <ul className="max-h-56 overflow-auto divide-y">
            {bulkProgress.map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-1.5 text-sm">
                {item.state === "publishing" && (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                )}
                {item.state === "pending" && (
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                {item.state === "ok" && (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                {item.state === "failed" && (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 break-words">
                    {item.caption || "Untitled post"}
                  </span>
                  {item.error && (
                    <span className="block text-xs text-destructive break-words">{item.error}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!byChannel.length ? (
        <Card className="p-10 text-center text-muted-foreground">Nothing here yet.</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {byChannel.map(({ channel, items }) => (
            <Card key={channel?.id ?? "unassigned"} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {channel?.name ?? "No channel selected"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {channel
                      ? PLATFORM_LABELS[channel.platform]
                      : "Assign a channel before publishing"}
                  </div>
                </div>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <div
                    key={`${channel?.id ?? "x"}-${p.id}`}
                    className="rounded border p-2 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="h-3 w-3" />
                      {p.scheduled_at
                        ? formatZoned(new Date(p.scheduled_at), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "No time set"}
                      <Badge variant="outline" className="text-[11px]">
                        {CONTENT_TYPE_LABELS[p.content_type]}
                      </Badge>
                      <StatusPill status={p.status} />
                    </div>
                    <p className="text-sm line-clamp-2 break-words">
                      {p.caption || <span className="text-muted-foreground">No caption</span>}
                    </p>
                    {p.status === "failed" && p.last_error && (
                      <p className="text-xs text-destructive break-words">{p.last_error}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {p.status !== "publishing" &&
                        (p.social_post_targets ?? []).some((target) => target.status === "pending" || target.status === "failed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={bulkPublishing || publishingId === p.id}
                          onClick={() => onPublish(p)}
                        >
                          {publishingId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 " />
                          )}
                          {p.status === "failed" ? "Retry now" : "Publish now"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => onReschedule(p)} disabled={p.status === "publishing" || p.status === "published" || (p.social_post_targets ?? []).some((target) => target.status === "published")}>
                        <CalendarClock className="h-3.5 w-3.5 " />
                        Reschedule
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onEdit(p)} disabled={p.status === "publishing"}>
                        <Pencil className="h-3.5 w-3.5 " />
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalQueue({
  posts,
  channels,
  onApprove,
  onReject,
  busyId,
}: {
  posts: SocialPost[];
  channels: SocialChannel[];
  onApprove: (p: SocialPost, publishNow: boolean) => void;
  onReject: (p: SocialPost) => void;
  busyId: string | null;
}) {
  const formatZoned = useZonedDateFormatter();
  if (!posts.length) {
    return (
      <Card className="p-10 text-center space-y-2">
        <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Nothing waiting for approval</p>
        <p className="text-sm text-muted-foreground">
          Posts saved with “Require approval” land here before they can go live on X, Threads,
          Instagram or any channel.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {posts.map((p) => {
        const targets = (p.social_post_targets ?? [])
          .map((t) => channels.find((c) => c.id === t.channel_id))
          .filter(Boolean) as SocialChannel[];
        const busy = busyId === p.id;
        return (
          <Card key={p.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm whitespace-pre-wrap break-words line-clamp-4">
                  {p.caption || <span className="text-muted-foreground">No caption</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusPill status={p.status} />
                  {p.scheduled_at && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {formatZoned(new Date(p.scheduled_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {targets.map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-[11px]">
                      {PLATFORM_LABELS[c.platform]} · {c.name}
                    </Badge>
                  ))}
                </div>
              </div>
              {p.media_urls?.[0] && (
                <img
                  src={p.media_urls[0]}
                  alt="Post media preview"
                  className="h-16 w-16 rounded object-cover shrink-0"
                  loading="lazy"
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => onApprove(p, false)}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 " />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onApprove(p, true)}
              >
                <Send className="h-3.5 w-3.5 " />
                Approve &amp; publish now
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={busy}
                onClick={() => onReject(p)}
              >
                <XCircle className="h-3.5 w-3.5 " />
                Reject
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function isVideoPreviewUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|#|$)/i.test(url);
}

function SocialComposerPreview({ form, channel }: { form: PostInput; channel: SocialChannel }) {
  const media = form.media_urls[0];
  // Detect video from the actual file too, not just the selected kind: the
  // uploader accepts video/* even in image mode, and rendering a video URL in
  // an <img> leaves the preview blank.
  const isVideo = form.media_kind === "video" || isVideoPreviewUrl(media ?? "");
  const platform = channel.platform === "instagram" ? "Instagram" : channel.platform === "facebook" ? "Facebook" : "TikTok";

  return (
    <section className="space-y-2" aria-label={`${platform} post preview`}>
      <div className="flex items-center gap-2">
        {channel.platform === "instagram" && <Instagram className="h-4 w-4" />}
        <Label>{platform} preview</Label>
        <span className="text-xs text-muted-foreground">Updates as you compose</span>
      </div>
      <div className="mx-auto max-w-sm overflow-hidden rounded border bg-background shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <span className="text-xs font-semibold">{channel.platform === "instagram" ? "IG" : channel.platform === "facebook" ? "f" : "TT"}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{channel.name}</p>
            {channel.username && (
              <p className="truncate text-xs text-muted-foreground">@{channel.username}</p>
            )}
          </div>
        </div>
        <div className={`${channel.platform === "tiktok" ? "aspect-[9/16] max-h-[340px]" : "aspect-square"} bg-muted`}>
          {media ? (
            form.media_kind === "carousel" ? (
              <div className="flex h-full gap-1 overflow-x-auto" aria-label={`${form.media_urls.length} carousel items`}>
                {form.media_urls.map((url, index) =>
                  isVideoPreviewUrl(url) ? (
                    <video
                      key={`${url}-${index}`}
                      src={url}
                      controls
                      preload="metadata"
                      aria-label={`Carousel video ${index + 1}`}
                      className="h-full min-w-0 flex-1 object-cover"
                    />
                  ) : (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={`Carousel item ${index + 1}`}
                      className="h-full min-w-0 flex-1 object-cover"
                    />
                  ),
                )}
              </div>
            ) : isVideo ? (
              <video
                src={media}
                controls
                preload="metadata"
                className="h-full w-full object-cover"
                aria-label={`${platform} video preview`}
              />
            ) : (
              <img
                src={media}
                alt={`${platform} post preview`}
                className="h-full w-full object-cover"
              />
            )
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
              Add an image or video to preview this post.
            </div>
          )}
        </div>
        <div className="space-y-2 px-3 py-3">
          <p className="whitespace-pre-wrap break-words text-sm">
            <span className="font-semibold">
              {channel.username ? `@${channel.username}` : channel.name}
            </span>{" "}
            {form.caption || (
              <span className="text-muted-foreground">Your caption will appear here.</span>
            )}
          </p>
          {form.link_url?.trim() && (
            <a
              href={form.link_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{form.link_url}</span>
            </a>
          )}
          {form.media_urls.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Carousel · {form.media_urls.length} items
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const SOCIAL_TABS = [
  "posts",
  "timeline",
  "scheduled",
  "approvals",
  "history",
  "performance",
  "library",
  "feed",
  "channels",
  "meta",
] as const;
type SocialTab = (typeof SOCIAL_TABS)[number];

function SocialStudio() {
  const location = useLocation();
  const navigate = useNavigate({ from: "/social" });
  const { active: workspace } = useCurrentWorkspace();
  const { data: channels = [], refetch: refetchChannels } = useSocialChannels();
  const formatZoned = useZonedDateFormatter();

  // Surface the outcome of an OAuth login redirect (Meta, X, Threads), then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("meta_error") ?? params.get("social_error");
    const connected = params.get("meta_connected");
    const socialConnected = params.get("social_connected");
    if (!err && !connected && !socialConnected) return;
    if (err) toast.error(err);
    else if (socialConnected) {
      toast.success(`Connected ${params.get("social_platform") ?? "channel"}`);
      void refetchChannels();
    } else {
      const n = Number(connected) || 0;
      const ig = Number(params.get("meta_ig")) || 0;
      const target = params.get("meta_target") === "instagram" ? "Instagram" : "Facebook";
      if (n > 0) {
        toast.success(
          ig > 0
            ? `Connected ${n} channel${n === 1 ? "" : "s"} (${ig} Instagram account${ig === 1 ? "" : "s"})`
            : `Connected ${n} channel${n === 1 ? "" : "s"} from ${target}`,
        );
        void refetchChannels();
      } else toast.warning(`No channels were connected from ${target}`);
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [refetchChannels]);

  const { data: posts = [], isLoading, refetch: refetchPosts } = useSocialPosts("all");
  const savePost = useSaveSocialPost();
  const deletePost = useDeleteSocialPost();
  const reschedule = useRescheduleSocialPost();
  const deleteChannel = useDeleteSocialChannel();
  const publish = useServerFn(publishSocialPost);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [duplicatingPost, setDuplicatingPost] = useState(false);
  const [form, setForm] = useState<PostInput>(emptyPost);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mediaInput, setMediaInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [publishMode, setPublishMode] = useState<"schedule" | "now">("schedule");

  const [confirmDeletePost, setConfirmDeletePost] = useState<SocialPost | null>(null);

  const [rescheduleTarget, setRescheduleTarget] = useState<SocialPost | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState<ChannelDraft>(emptyChannelDraft);
  const [confirmDeleteChannel, setConfirmDeleteChannel] = useState<SocialChannel | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  /** Single-flight guard for the composer's submit buttons. */
  const submitInFlight = useRef(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgressItem[]>([]);
  const setApproval = useSetPostApproval();

  const limit = useMemo(() => {
    const selected = channels.filter((c) => form.channelIds.includes(c.id));
    if (!selected.length) return null;
    return Math.min(...selected.map((c) => PLATFORM_LIMITS[c.platform]));
  }, [channels, form.channelIds]);

  /** Content types supported by every currently-selected channel. */
  const allowedTypes = useMemo<SocialContentType[]>(() => {
    const selected = channels.filter((c) => form.channelIds.includes(c.id));
    const all: SocialContentType[] = ["post", "story", "reel", "short", "poll"];
    if (!selected.length) return all;
    return all.filter((t) => selected.every((c) => PLATFORM_CONTENT_TYPES[c.platform].includes(t)));
  }, [channels, form.channelIds]);

  const previewChannels = useMemo(
    () =>
      channels.filter(
        (channel) => ["instagram", "facebook", "tiktok"].includes(channel.platform) && form.channelIds.includes(channel.id),
      ),
    [channels, form.channelIds],
  );
  const tiktokSelected = previewChannels.some((channel) => channel.platform === "tiktok");

  const setContentType = (type: SocialContentType) => {
    setForm((f) => ({
      ...f,
      content_type: type,
      media_kind: CONTENT_TYPE_MEDIA_KINDS[type].includes(f.media_kind)
        ? f.media_kind
        : defaultMediaKind(type),
      media_urls: type === "poll" ? [] : f.media_urls,
      link_url: type === "story" ? "" : f.link_url,
      poll_options:
        type === "poll" ? (f.poll_options?.length ? f.poll_options : ["", ""]) : f.poll_options,
    }));
    setErrors({});
  };

  const openComposer = (post?: SocialPost) => {
    if (post) {
      const duplicate = post.status === "published" || post.status === "publishing" ||
        (post.social_post_targets ?? []).some((target) => target.status === "published");
      setDuplicatingPost(duplicate);
      setEditingPost(duplicate ? null : post);
      setForm({
        id: duplicate ? undefined : post.id,
        caption: post.caption,
        media_urls: post.media_urls ?? [],
        link_url: post.link_url ?? "",
        first_comment: post.first_comment ?? "",
        channelIds: (post.social_post_targets ?? []).map((t) => t.channel_id),
        scheduled_at: post.scheduled_at ? post.scheduled_at.slice(0, 16) : null,
        status: duplicate ? "draft" : post.status,
        content_type: post.content_type ?? "post",
        media_kind: post.media_kind ?? (post.media_urls?.length ? "image" : "none"),
        poll_options: post.poll_options?.length ? post.poll_options : ["", ""],
        poll_duration: post.poll_duration ?? 24,
        allow_multi_vote: post.allow_multi_vote ?? false,
        requires_approval: post.approval_status === "pending",
      });
      setPublishMode("schedule");
    } else {
      setEditingPost(null);
      setDuplicatingPost(false);
      setForm(emptyPost);
      setPublishMode("schedule");
    }
    setErrors({});
    setMediaInput("");
    setComposerOpen(true);
  };

  const submitPost = async (mode: "draft" | "scheduled" | "now") => {
    const payload: PostInput = {
      ...form,
      status: mode === "now" ? "draft" : mode,
      scheduled_at:
        mode === "scheduled" && form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,
    };
    const errs = validatePost(payload, channels);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    // A ref, not `savePost.isPending`: the second click of a double-click lands
    // in the same tick as the first, before React could re-render the disabled
    // button. Cleared in `finally`, so a failed save can be retried.
    if (submitInFlight.current) return;
    submitInFlight.current = true;

    // Save and publish are separate phases with separate failure meanings. The
    // post is persisted first; only then is the provider called, and a provider
    // failure must never be reported as "failed to save".
    let id: string;
    try {
      id = await savePost.mutateAsync({ ...payload, channels });
    } catch (e) {
      submitInFlight.current = false;
      toast.error(describeSaveFailure(e));
      return;
    }

    try {
      if (mode === "now") {
        setPublishingId(id);
        const res = await publish({ data: { postId: id, workspaceId: workspace!.id } });
        const failed = res.results.filter((r) => !r.ok);
        if (res.alreadyPublished) toast.info("Already published — no duplicate was sent");
        else if (res.ok && !failed.length) toast.success("Published to all channels");
        else if (res.ok)
          toast.warning(
            `Published with errors: ${failed.map((f) => `${f.channel} — ${f.error}`).join("; ")}`,
          );
        else
          toast.error(
            failed.map((f) => `${f.channel}: ${f.error}`).join("; ") || "Publishing failed",
          );
      } else {
        toast.success(mode === "scheduled" ? "Post scheduled" : "Draft saved");
      }
      setComposerOpen(false);
    } catch (e) {
      // The post is saved; only publishing failed. Say so, and leave the post.
      toast.error("Post saved, but publishing failed", { description: describeSaveFailure(e) });
      setComposerOpen(false);
    } finally {
      submitInFlight.current = false;
      setPublishingId(null);
    }
  };

  const publishExisting = async (post: SocialPost) => {
    if (!workspace?.id) {
      toast.error("No active workspace");
      return;
    }
    setPublishingId(post.id);
    try {
      const res = await publish({ data: { postId: post.id, workspaceId: workspace.id } });
      const failed = res.results.filter((r) => !r.ok);
      if (res.alreadyPublished) toast.info("Already published — no duplicate was sent");
      else if (res.ok && !failed.length) toast.success("Published");
      else if (res.ok)
        toast.warning(`Published with errors: ${failed.map((f) => f.channel).join(", ")}`);
      else
        toast.error(
          failed.map((f) => `${f.channel}: ${f.error}`).join("; ") || "Publishing failed",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publishing failed");
    } finally {
      setPublishingId(null);
      void refetchPosts();
    }
  };

  const publishBulk = async (batch: SocialPost[]) => {
    if (!workspace?.id || !batch.length) return;
    setBulkPublishing(true);
    const progress: BulkProgressItem[] = batch.map((p) => ({
      id: p.id,
      caption: p.caption ?? "",
      state: "pending",
    }));
    setBulkProgress(progress);
    const patch = (id: string, update: Partial<BulkProgressItem>) =>
      setBulkProgress((prev) => prev.map((i) => (i.id === id ? { ...i, ...update } : i)));
    let succeeded = 0;
    let failed = 0;
    try {
      for (const post of batch) {
        setPublishingId(post.id);
        patch(post.id, { state: "publishing" });
        try {
          const result = await publish({ data: { postId: post.id, workspaceId: workspace.id } });
          const failedTargets = result.results.filter((item) => !item.ok);
          if (result.ok && !failedTargets.length) {
            succeeded += 1;
            patch(post.id, { state: "ok" });
          } else {
            failed += 1;
            patch(post.id, {
              state: "failed",
              error:
                failedTargets.map((f) => `${f.channel}: ${f.error}`).join("; ") ||
                "Publishing failed",
            });
          }
        } catch (e) {
          failed += 1;
          patch(post.id, {
            state: "failed",
            error: e instanceof Error ? e.message : "Publishing failed",
          });
        }
      }
      if (failed === 0) toast.success(`Published ${succeeded} post${succeeded === 1 ? "" : "s"}`);
      else
        toast.warning(
          `Published ${succeeded}; ${failed} failed — see the list above for channel errors.`,
        );
    } finally {
      setPublishingId(null);
      setBulkPublishing(false);
      void refetchPosts();
    }
  };

  const approvePost = async (post: SocialPost, publishNow: boolean) => {
    if (!workspace?.id) return;
    setPublishingId(post.id);
    try {
      await setApproval.mutateAsync({ id: post.id, decision: "approved" });
      // A post with no future schedule (draft, or its time already passed) has
      // no cron run coming — approval itself must trigger the publish, so an
      // approved Instagram post actually goes live.
      const dueNow =
        publishNow ||
        post.status !== "scheduled" ||
        !post.scheduled_at ||
        new Date(post.scheduled_at).getTime() <= Date.now();
      if (dueNow) {
        await publishExisting(post);
        return;
      }
      toast.success("Approved — it will publish at its scheduled time");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setPublishingId(null);
    }
  };

  const rejectPost = async (post: SocialPost) => {
    setPublishingId(post.id);
    try {
      await setApproval.mutateAsync({ id: post.id, decision: "rejected" });
      toast.success("Post rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setPublishingId(null);
    }
  };

  const { accent } = useTenantAccent();
  const busy = savePost.isPending || !!publishingId;

  return (
    <>
      <AppTopbar
        title="Social Studio"
        subtitle="Compose once, schedule and publish across Facebook, Instagram and LinkedIn."
        actions={
          <Button onClick={() => openComposer()}>
            <Plus className="h-4 w-4 mr-2" />
            New post
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs
          value={
            SOCIAL_TABS.includes(location.hash as SocialTab)
              ? (location.hash as SocialTab)
              : "posts"
          }
          onValueChange={(v) => navigate({ to: ".", hash: v, replace: true })}
        >
          {/* Wraps onto a second line instead of running off the right edge. */}
          <TabsList className="h-auto w-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="approvals">
              Approvals ({posts.filter((p) => p.approval_status === "pending").length})
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="feed">Instagram feed</TabsTrigger>
            <TabsTrigger value="channels">Channels ({channels.length})</TabsTrigger>
            <TabsTrigger value="meta">Meta accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4 space-y-3">
            {isLoading ? (
              <Card className="p-10 text-center text-muted-foreground">Loading posts</Card>
            ) : posts.length === 0 ? (
              <Card className="p-10 text-center space-y-3">
                <Share2 className="h-8 w-8 mx-auto" style={{ color: accent }} />
                <p className="font-medium">No posts yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first post and schedule it across your connected pages.
                </p>
                <Button onClick={() => openComposer()}>
                  <Plus className="h-4 w-4 mr-2" />
                  New post
                </Button>
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm whitespace-pre-wrap break-words line-clamp-4">
                        {post.caption || <span className="text-muted-foreground">No caption</span>}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <StatusPill status={post.status} />
                        {post.scheduled_at && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {formatZoned(new Date(post.scheduled_at), {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                        {post.published_at && (
                          <span>
                            Published{" "}
                            {formatZoned(new Date(post.published_at), {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(post.social_post_targets ?? []).map((t) => (
                          <Badge key={t.id} variant="secondary" className="text-[11px] gap-1">
                            {t.social_channels?.name ?? "Channel"}
                            <span
                              className={
                                t.status === "published"
                                  ? "text-emerald-600"
                                  : t.status === "failed"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              }
                            >
                              · {t.status}
                            </span>
                            {t.permalink && (
                              <a href={t.permalink} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </Badge>
                        ))}
                      </div>
                      {(post.social_post_targets ?? []).some((t) => t.error) && (
                        <p className="text-xs text-destructive">
                          {(post.social_post_targets ?? []).find((t) => t.error)?.error}
                        </p>
                      )}
                    </div>
                    {post.media_urls?.[0] && (
                      <img
                        src={post.media_urls[0]}
                        alt="Post media preview"
                        className="h-16 w-16 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {post.status !== "publishing" &&
                      (post.social_post_targets ?? []).some((target) => target.status === "pending" || target.status === "failed") && (
                        <Button
                          size="sm"
                          disabled={!!publishingId}
                          onClick={() => publishExisting(post)}
                        >
                          {publishingId === post.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 " />
                          )}
                          {post.status === "published" ? "Retry failed channels" : "Publish now"}
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={post.status === "published" || (post.social_post_targets ?? []).some((t) => t.status === "published") ? "Duplicate post" : "Edit post"}
                      onClick={() => openComposer(post)}
                      disabled={post.status === "publishing"}
                    >
                      {post.status === "published" || (post.social_post_targets ?? []).some((t) => t.status === "published") ? (
                        <Copy className="h-3.5 w-3.5" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmDeletePost(post)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <SocialTimeline
              posts={posts}
              isLoading={isLoading}
              onNewPost={() => openComposer()}
              onPublish={(p) => void publishExisting(p)}
              publishingId={publishingId}
            />
          </TabsContent>

          <TabsContent value="scheduled" className="mt-4">
            <ScheduledDashboard
              posts={posts}
              channels={channels}
              onEdit={(p) => openComposer(p)}
              onReschedule={(p) => {
                setRescheduleTarget(p);
                setRescheduleAt(
                  p.scheduled_at ? new Date(p.scheduled_at).toISOString().slice(0, 16) : "",
                );
              }}
              onPublish={(p) => void publishExisting(p)}
              onBulkPublish={(batch) => void publishBulk(batch)}
              publishingId={publishingId}
              bulkPublishing={bulkPublishing}
              bulkProgress={bulkProgress}
            />
          </TabsContent>

          <TabsContent value="approvals" className="mt-4">
            <ApprovalQueue
              posts={posts.filter((p) => p.approval_status === "pending")}
              channels={channels}
              onApprove={(p, publishNow) => void approvePost(p, publishNow)}
              onReject={(p) => void rejectPost(p)}
              busyId={publishingId}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <PostHistory
              posts={posts}
              channels={channels}
              isLoading={isLoading}
              onOpenPost={(p) => openComposer(p)}
            />
          </TabsContent>

          <TabsContent value="performance" className="mt-4">
            <PostPerformance posts={posts} channels={channels} />
          </TabsContent>

          <TabsContent value="library" className="mt-4">
            <PostLibrary
              onUse={(item) => {
                setEditingPost(null);
                setForm({
                  ...emptyPost,
                  caption: item.caption,
                  media_urls: item.media_urls ?? [],
                  link_url: item.link_url ?? "",
                  first_comment: item.first_comment ?? "",
                  content_type: item.content_type,
                  media_kind: item.media_kind,
                  poll_options: item.poll_options?.length ? item.poll_options : ["", ""],
                  poll_duration: item.poll_duration ?? 24,
                  allow_multi_vote: !!item.allow_multi_vote,
                });
                setErrors({});
                setMediaInput("");
                setPublishMode("schedule");
                setComposerOpen(true);
              }}
            />
          </TabsContent>

          <TabsContent value="feed" className="mt-4">
            <InstagramFeed channels={channels} posts={posts} onOpenPost={(p) => openComposer(p)} />
          </TabsContent>

          <TabsContent value="meta" className="mt-4">
            <MetaDashboard workspaceId={workspace?.id} onChanged={() => void refetchChannels?.()} />
          </TabsContent>

          <TabsContent value="channels" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setChannelDraft(emptyChannelDraft);
                  setChannelOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Connect channel
              </Button>
            </div>
            <ChannelHealthPanel
              channels={channels}
              posts={posts}
              onFix={(c) => {
                setChannelDraft({
                  id: c.id,
                  platform: c.platform,
                  name: c.name,
                  external_id: c.external_id ?? "",
                  username: c.username ?? "",
                  access_token: "",
                });
                setChannelOpen(true);
              }}
            />
            {channels.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                No channels connected yet.
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {channels.map((c) => (
                  <Card key={c.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {PLATFORM_LABELS[c.platform]}
                          {c.username ? ` · @${c.username}` : ""}
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {c.status}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setChannelDraft({
                            id: c.id,
                            platform: c.platform,
                            name: c.name,
                            external_id: c.external_id ?? "",
                            username: c.username ?? "",
                            access_token: "",
                          });
                          setChannelOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setConfirmDeleteChannel(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Composer */}
      <Dialog
        open={composerOpen}
        onOpenChange={(v) => {
          if (!busy) setComposerOpen(v);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{duplicatingPost ? "Duplicate post" : editingPost ? "Edit post" : "New post"}</DialogTitle>
            <DialogDescription>
              Select channels, write your caption and publish or schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Channels</Label>
              {channels.length === 0 ? (
                <div className="flex flex-col gap-3 rounded-control border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">No channel connected yet</p>
                      <p className="text-xs text-muted-foreground">
                        Connect at least one page or account, then come back to create the post.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      setComposerOpen(false);
                      navigate({ to: ".", hash: "channels", replace: true });
                    }}
                  >
                    Go to Channels
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {channels.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 rounded border p-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={form.channelIds.includes(c.id)}
                        disabled={busy}
                        onCheckedChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            channelIds: v
                              ? [...f.channelIds, c.id]
                              : f.channelIds.filter((id) => id !== c.id),
                          }))
                        }
                      />
                      <span className="text-sm truncate">{c.name}</span>
                      <Badge variant="secondary" className="ml-auto text-[11px]">
                        {c.platform}
                      </Badge>
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setComposerOpen(false);
                      navigate({ to: ".", hash: "channels", replace: true });
                    }}
                    className="flex items-center justify-center gap-1.5 rounded border border-dashed p-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add another channel
                  </button>
                </div>
              )}
              {errors.channels && <p className="text-xs text-destructive">{errors.channels}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Content type</Label>
              <Tabs
                value={form.content_type}
                onValueChange={(v) => setContentType(v as SocialContentType)}
              >
                <TabsList className="h-auto w-auto flex-wrap justify-start gap-1">
                  {(Object.keys(CONTENT_TYPE_LABELS) as SocialContentType[]).map((t) => (
                    <TabsTrigger key={t} value={t} disabled={busy || !allowedTypes.includes(t)}>
                      {CONTENT_TYPE_LABELS[t]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground">
                {form.content_type === "poll"
                  ? "Polls publish the question as the post text with up to four options."
                  : form.content_type === "story"
                    ? "Stories accept a single image or video and cannot include links."
                    : form.content_type === "reel" || form.content_type === "short"
                      ? "Requires a single video URL."
                      : "Standard feed post with optional media and link preview."}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{form.content_type === "poll" ? "Poll question" : "Caption"}</Label>
                {limit && (
                  <span
                    className={`text-xs ${form.caption.length > limit ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {form.caption.length}/{limit}
                  </span>
                )}
              </div>
              <Textarea
                rows={form.content_type === "poll" ? 3 : 6}
                value={form.caption}
                disabled={busy}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                placeholder={
                  form.content_type === "poll" ? "Ask something" : "What do you want to share?"
                }
              />
              {errors.caption && <p className="text-xs text-destructive">{errors.caption}</p>}
            </div>

            {form.content_type === "poll" && (
              <div className="space-y-3 rounded-control border p-3">
                <div className="space-y-1.5">
                  <Label>Options</Label>
                  {(form.poll_options ?? []).map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        disabled={busy}
                        placeholder={`Option ${i + 1}`}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            poll_options: (f.poll_options ?? []).map((o, idx) =>
                              idx === i ? e.target.value : o,
                            ),
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label={`Remove option ${i + 1}`}
                        disabled={busy || (form.poll_options ?? []).length <= 2}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            poll_options: (f.poll_options ?? []).filter((_, idx) => idx !== i),
                          }))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || (form.poll_options ?? []).length >= 4}
                    onClick={() =>
                      setForm((f) => ({ ...f, poll_options: [...(f.poll_options ?? []), ""] }))
                    }
                  >
                    <Plus className="h-3.5 w-3.5 " />
                    Add option
                  </Button>
                  {errors.poll_options && (
                    <p className="text-xs text-destructive">{errors.poll_options}</p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Duration (hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={form.poll_duration ?? 24}
                      disabled={busy}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, poll_duration: Number(e.target.value) }))
                      }
                    />
                    {errors.poll_duration && (
                      <p className="text-xs text-destructive">{errors.poll_duration}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded border p-2">
                    <Label htmlFor="allow-multi-vote" className="text-sm">
                      Allow multiple votes
                    </Label>
                    <Switch
                      id="allow-multi-vote"
                      checked={!!form.allow_multi_vote}
                      disabled={busy}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, allow_multi_vote: v }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {form.content_type !== "poll" && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Media</Label>
                  <Select
                    value={form.media_kind}
                    disabled={busy || CONTENT_TYPE_MEDIA_KINDS[form.content_type].length === 1}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        media_kind: v as SocialMediaKind,
                        media_urls: v === "none" ? [] : f.media_urls,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_TYPE_MEDIA_KINDS[form.content_type].map((k) => (
                        <SelectItem key={k} value={k}>
                          {MEDIA_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.media_kind !== "none" && (
                  <>
                    <div className="flex gap-2">
                      <Input
                        value={mediaInput}
                        disabled={
                          busy || (form.media_kind !== "carousel" && form.media_urls.length >= 1)
                        }
                        onChange={(e) => setMediaInput(e.target.value)}
                        placeholder={MEDIA_PLACEHOLDER[form.media_kind]}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && mediaInput.trim()) {
                            e.preventDefault();
                            setForm((f) => ({
                              ...f,
                              media_urls: [...f.media_urls, mediaInput.trim()],
                            }));
                            setMediaInput("");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          busy ||
                          !mediaInput.trim() ||
                          (form.media_kind !== "carousel" && form.media_urls.length >= 1)
                        }
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            media_urls: [...f.media_urls, mediaInput.trim()],
                          }));
                          setMediaInput("");
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        ref={fileRef}
                        type="file"
                        className="hidden"
                        accept={form.media_kind === "video" ? "video/*" : "image/*,video/*"}
                        multiple={form.media_kind === "carousel"}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (!files.length) return;
                          if (!workspace?.id) {
                            toast.error("No active workspace");
                            return;
                          }
                          setUploading(true);
                          try {
                            const limit =
                              form.media_kind === "carousel" ? files : files.slice(0, 1);
                            for (const file of limit) {
                              const up = await uploadSocialMedia(workspace.id, file);
                              setForm((f) => ({ ...f, media_urls: [...f.media_urls, up.url] }));
                            }
                            toast.success(
                              limit.length > 1 ? `${limit.length} files uploaded` : "File uploaded",
                            );
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Upload failed");
                          } finally {
                            setUploading(false);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          busy ||
                          uploading ||
                          (form.media_kind !== "carousel" && form.media_urls.length >= 1)
                        }
                        onClick={() => fileRef.current?.click()}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-3.5 w-3.5" />
                        )}
                        {uploading ? "Uploading" : "Upload file"}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Stored with the post and published as the real asset (max 200MB).
                      </span>
                    </div>

                    {form.media_urls.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {form.media_urls.map((url, i) => (
                          <span
                            key={`${url}-${i}`}
                            className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs max-w-[220px]"
                          >
                            <span className="truncate">{url}</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  media_urls: f.media_urls.filter((_, idx) => idx !== i),
                                }))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {errors.media && <p className="text-xs text-destructive">{errors.media}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>First comment (optional)</Label>
              <Textarea
                rows={2}
                value={form.first_comment ?? ""}
                disabled={busy}
                onChange={(e) => setForm((f) => ({ ...f, first_comment: e.target.value }))}
                placeholder="Posted as a comment right after publishing — great for hashtags or links."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Link (optional)</Label>
                <Input
                  value={form.link_url ?? ""}
                  disabled={busy || form.content_type === "story"}
                  onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                  placeholder={
                    form.content_type === "story" ? "Not supported for stories" : "https://"
                  }
                />
                {errors.link_url && <p className="text-xs text-destructive">{errors.link_url}</p>}
              </div>
              {publishMode === "schedule" && (
                <div className="space-y-1.5">
                  <Label>Schedule for</Label>
                  <SchedulePicker
                    value={form.scheduled_at ?? ""}
                    disabled={busy}
                    onChange={(next) => setForm((f) => ({ ...f, scheduled_at: next }))}
                  />
                  {errors.scheduled_at && (
                    <p className="text-xs text-destructive">{errors.scheduled_at}</p>
                  )}
                </div>
              )}
            </div>

            {previewChannels.map((channel) => (
              <SocialComposerPreview key={channel.id} form={form} channel={channel} />
            ))}
            {tiktokSelected && (
              <p role="status" className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                TikTok direct posting is paused while privacy, disclosure and consent controls are completed. You can save this post as a draft.
              </p>
            )}
          </div>
          {/* Left: approval switch. Right: actions, with the primary action last. */}
          <DialogFooter className="flex-col gap-3 border-t bg-muted/30 py-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Switch
                checked={!!form.requires_approval}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requires_approval: v }))}
              />
              <span className="font-medium">Require approval</span>
            </label>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Button variant="ghost" onClick={() => setComposerOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => submitPost("draft")} disabled={busy}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save draft
              </Button>
              {/* Split button: the main part runs the chosen mode, the arrow switches it. */}
              <div className="inline-flex">
                <Button
                  onClick={() => submitPost(publishMode === "now" ? "now" : "scheduled")}
                  disabled={busy || tiktokSelected}
                  className="min-w-[9.5rem] rounded-r-none"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : publishMode === "now" ? (
                    <Send className="h-4 w-4 mr-2" />
                  ) : (
                    <CalendarClock className="h-4 w-4 mr-2" />
                  )}
                  {publishMode === "now" ? "Publish now" : "Schedule post"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={busy}
                      aria-label="Choose publish mode"
                      className="rounded-l-none border-l border-primary-foreground/20 px-2"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setPublishMode("schedule")}>
                      <CalendarClock className="mr-2 h-3.5 w-3.5" />
                      Schedule post
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPublishMode("now")}>
                      <Send className="mr-2 h-3.5 w-3.5" />
                      Publish now
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel dialog */}
      <Dialog
        open={!!rescheduleTarget}
        onOpenChange={(v) => {
          if (!v) setRescheduleTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule post</DialogTitle>
            <DialogDescription>
              Pick a new publish time, or clear it to move the post back to drafts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Publish at</Label>
            <Input
              type="datetime-local"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={reschedule.isPending}
              onClick={async () => {
                if (!rescheduleTarget) return;
                await reschedule.mutateAsync({ id: rescheduleTarget.id, scheduled_at: null });
                toast.success("Moved back to drafts");
                setRescheduleTarget(null);
              }}
            >
              Move to draft
            </Button>
            <Button
              disabled={reschedule.isPending || !rescheduleAt}
              onClick={async () => {
                if (!rescheduleTarget || !rescheduleAt) return;
                if (new Date(rescheduleAt).getTime() < Date.now() - 60_000) {
                  toast.error("Pick a time in the future");
                  return;
                }
                await reschedule.mutateAsync({
                  id: rescheduleTarget.id,
                  scheduled_at: new Date(rescheduleAt).toISOString(),
                });
                toast.success("Post rescheduled");
                setRescheduleTarget(null);
              }}
            >
              {reschedule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChannelSetupDialog open={channelOpen} onOpenChange={setChannelOpen} initial={channelDraft} />

      <ConfirmDialog
        open={!!confirmDeletePost}
        onOpenChange={(v) => !v && setConfirmDeletePost(null)}
        title="Delete this post?"
        description="The post and its channel results will be removed. Already published posts stay live on the platform."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!confirmDeletePost) return;
          try {
            await deletePost.mutateAsync(confirmDeletePost.id);
            toast.success("Post deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete");
          } finally {
            setConfirmDeletePost(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteChannel}
        onOpenChange={(v) => !v && setConfirmDeleteChannel(null)}
        title="Disconnect channel?"
        description="Scheduled posts targeting this channel will no longer publish to it."
        confirmLabel="Disconnect"
        destructive
        onConfirm={async () => {
          if (!confirmDeleteChannel) return;
          try {
            await deleteChannel.mutateAsync(confirmDeleteChannel.id);
            toast.success("Channel disconnected");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to disconnect");
          } finally {
            setConfirmDeleteChannel(null);
          }
        }}
      />
    </>
  );
}
