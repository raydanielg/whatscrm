import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/app/inbox/channel-icon";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { getSocialInboxSetup } from "@/lib/social-inbox/setup.functions";
import { syncSocialInboxNow } from "@/lib/social-inbox/sync.functions";
import type { SocialInboxPlatform } from "@/lib/social-inbox/normalize";

interface PlatformCopy {
  title: string;
  intro: string;
  connectLabel: string;
  connectTo: { to: string; params?: Record<string, string> };
  requirements: string[];
}

const COPY: Record<SocialInboxPlatform, PlatformCopy> = {
  facebook: {
    title: "Facebook Comments",
    intro:
      "Comments on your Facebook Page posts arrive in the Inbox as conversations (one per commenter per post). Replies you send from the Inbox are posted as public comment replies.",
    connectLabel: "Connect a Facebook Page",
    connectTo: { to: "/api-config/$section", params: { section: "messenger" } },
    requirements: [
      "The Page is connected under Messenger Accounts (the same Page token is used).",
      "The Meta app has pages_read_engagement and pages_manage_engagement approved.",
      "The Page is subscribed to the feed webhook field for real-time comments (polling every 5 minutes is the backstop).",
    ],
  },
  youtube: {
    title: "YouTube Comments",
    intro:
      "Comments on your channel's videos are pulled into the Inbox every 5 minutes. Inbox replies are posted as replies to the comment thread.",
    connectLabel: "Connect a YouTube channel",
    connectTo: { to: "/social" },
    requirements: [
      "Connect from Social Publishing → YouTube → Continue with Google. The connection then renews itself automatically (no reconnect every hour).",
      "Server needs YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET (a Google Cloud OAuth client with YouTube Data API v3 enabled and the youtube.force-ssl scope).",
      "Publish the Google OAuth consent screen to Production: while it is in Testing, Google expires the connection after 7 days.",
      "A pasted access token still works but expires after about an hour.",
    ],
  },
  linkedin: {
    title: "LinkedIn Comments",
    intro:
      "Comments on posts published from WACRM are pulled into the Inbox every 5 minutes. Inbox replies are posted as replies to the comment.",
    connectLabel: "Connect LinkedIn",
    connectTo: { to: "/social" },
    requirements: [
      "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are set on the server.",
      "Reading and replying to comments needs LinkedIn's r_member_social permission (or the Community Management API) approved for your LinkedIn app.",
      "Only posts published through WACRM are watched.",
    ],
  },
  tiktok: {
    title: "TikTok Comments",
    intro:
      "Comments on your TikTok Business account's videos are pulled into the Inbox every 5 minutes. Inbox replies are posted as replies to the comment.",
    connectLabel: "Connect TikTok Business",
    connectTo: { to: "/api-config/$section", params: { section: "tiktok-dm" } },
    requirements: [
      "Uses the same TikTok Business connection as TikTok Messages: connect once and both comments and DMs arrive in the Inbox.",
      "TIKTOK_BUSINESS_APP_ID and TIKTOK_BUSINESS_APP_SECRET are set on the server, and the TikTok app has the video.list, comment.list and comment.list.manage scopes enabled.",
    ],
  },
};

function relative(iso: string | null) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

export function SocialInboxChannelPanel({ platform }: { platform: SocialInboxPlatform }) {
  const copy = COPY[platform];
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const qc = useQueryClient();
  const fetchSetup = useServerFn(getSocialInboxSetup);
  const runSync = useServerFn(syncSocialInboxNow);

  const setup = useQuery({
    queryKey: ["social-inbox-setup", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchSetup({ data: { workspaceId: workspaceId! } }),
  });
  const mine = setup.data?.find((p) => p.platform === platform);

  const sync = useMutation({
    mutationFn: () => runSync({ data: { workspaceId: workspaceId!, force: true } }),
    onSuccess: (res) => {
      const here = res.accounts.filter((a) => a.platform === platform);
      if (here.length === 0) toast.info(`No connected ${copy.title.replace(" Comments", "")} account to sync.`);
      else if (here.some((a) => !a.ok)) toast.error(here.find((a) => !a.ok)?.error ?? "Sync failed");
      else toast.success(`Synced — ${here.reduce((n, a) => n + a.inserted, 0)} new comment(s).`);
      void qc.invalidateQueries({ queryKey: ["social-inbox-setup", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["conversations", workspaceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/public/webhooks/messenger` : "";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ChannelIcon channel={platform} boxed className="h-9 w-9" />
          <div>
            <h2 className="font-bold text-xl">{copy.title}</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">{copy.intro}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sync.mutate()}
            disabled={!workspaceId || sync.isPending || !mine?.accounts.length}
          >
            {sync.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Sync now
          </Button>
          <Button asChild size="sm">
            <Link to={copy.connectTo.to as never} params={copy.connectTo.params as never}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> {copy.connectLabel}
            </Link>
          </Button>
        </div>
      </header>

      <section className="rounded-control border border-border p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {mine?.appConfigured ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          App credentials
        </div>
        <p className="text-xs text-muted-foreground">
          {setup.isLoading
            ? "Checking…"
            : mine?.appConfigured
              ? platform === "youtube"
                ? "No server app secret is needed — YouTube connects with a channel access token."
                : "Configured on the server."
              : `Missing on the server: ${mine?.missingEnv.join(", ")}. Add them to the deployment environment and redeploy.`}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Connected accounts</h3>
        {setup.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : setup.isError ? (
          <p className="text-sm text-destructive">
            {setup.error instanceof Error ? setup.error.message : "Could not load the setup."}
          </p>
        ) : !mine?.accounts.length ? (
          <div className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No account connected yet. Use “{copy.connectLabel}” to add one.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {mine.accounts.map((a) => (
              <li key={`${a.source}:${a.id}`} className="p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{a.name}</span>
                  {a.handle && <span className="text-xs text-muted-foreground font-mono">{a.handle}</span>}
                  <Badge variant="outline" className="text-[11px] capitalize">
                    {a.status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Last sync {relative(a.lastSyncedAt)}
                    {typeof a.lastResult.inserted === "number" && ` · ${a.lastResult.inserted} new`}
                  </span>
                </div>
                {a.lastError && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" /> {a.lastError}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {platform === "facebook" && (
        <section className="rounded-control border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Real-time webhook</h3>
          <p className="text-xs text-muted-foreground">
            In your Meta app, subscribe the Page to the <b>feed</b> field on the same callback URL used
            for Messenger:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded bg-muted px-2 py-1 text-xs">{webhookUrl}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Copy callback URL"
              onClick={() => {
                void navigator.clipboard.writeText(webhookUrl);
                toast.success("Callback URL copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-control border border-border p-4 space-y-2">
        <h3 className="text-sm font-semibold">Requirements</h3>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
          {copy.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <Link
          to="/inbox"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open the Inbox <ExternalLink className="h-3 w-3" />
        </Link>
      </section>
    </div>
  );
}

export const FacebookCommentsPanel = () => <SocialInboxChannelPanel platform="facebook" />;
export const YouTubeCommentsPanel = () => <SocialInboxChannelPanel platform="youtube" />;
export const LinkedInCommentsPanel = () => <SocialInboxChannelPanel platform="linkedin" />;
export const TikTokCommentsPanel = () => <SocialInboxChannelPanel platform="tiktok" />;
