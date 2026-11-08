/**
 * Social Studio channel surfaces: guided per-platform setup screens, a channel
 * health panel and an Instagram-style feed preview.
 *
 * Setup is a two-step flow (pick platform → follow that platform's checklist)
 * and finishes with a live connection test so a channel is only marked
 * connected once the platform actually answers with the stored token.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Instagram,
  CalendarClock,
  ShieldCheck,
  Plug,
  Copy,
} from "lucide-react";
import {
  PLATFORM_LABELS,
  PLATFORM_SETUP,
  useSaveSocialChannel,
  type SocialPlatform,
  type SocialChannel,
  type SocialPost,
} from "@/hooks/use-social-publishing";
import { verifySocialChannel } from "@/lib/social/verify.functions";
import { startMetaConnect } from "@/lib/social/meta-oauth.functions";
import { startSocialConnect } from "@/lib/social/oauth.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { useBrandName } from "@/hooks/use-brand-name";

/** Ordered, copy-paste friendly instructions per platform. */
const PLATFORM_STEPS: Record<SocialPlatform, string[]> = {
  facebook: [
    "Open Meta for Developers and create (or pick) an app with the Pages API product.",
    "Grant pages_show_list, pages_manage_posts and pages_read_engagement to your user.",
    "Exchange the user token for a long-lived Page access token for the Page you publish to.",
    "Copy the Page ID from the Page’s About section and paste both values below.",
  ],
  instagram: [
    "Convert the Instagram account to a Business or Creator account and link it to a Facebook Page.",
    "In the Meta app, add the Instagram Graph API product and request instagram_content_publish.",
    "Fetch the IG user ID via /{page-id}?fields=instagram_business_account.",
    "Paste the IG user ID and the long-lived Page access token below.",
  ],
  linkedin: [
    "Create a LinkedIn developer app and associate it with your company Page.",
    "Request the Community Management API with the w_organization_social scope.",
    "Complete the OAuth 2.0 flow and copy the member access token.",
    "Paste the organization URN (urn:li:organization:1234567) and the token below.",
  ],
  x: [
    "Create a project + app in the X developer portal with Read and Write permissions.",
    "Enable OAuth 2.0 with the tweet.write, users.read and offline.access scopes.",
    "Run the OAuth flow and copy the user access token (not the app-only bearer).",
    "Paste the token below; the user ID is optional and only used for permalinks.",
  ],
  tiktok: [
    'Click "Continue with TikTok" and approve the requested scopes.',
    "{brand} stores the open_id, access token and refresh token for you — there is nothing to paste.",
    "If video.publish is not granted, the channel still connects for identity, but publishing stays unavailable until you reconnect and approve it.",
  ],
  youtube: [
    "Create a Google Cloud project and enable the YouTube Data API v3.",
    "Create OAuth client credentials and request the youtube.upload scope.",
    "Run the consent flow with the account that owns the channel and copy the access token.",
    "Paste the token below; the channel ID is optional and used for display only.",
  ],
  threads: [
    'In the Meta app dashboard add the "Threads API" use case and enable Threads for the account.',
    "Request the scopes threads_basic and threads_content_publish (add threads_manage_replies for first comments).",
    "Send the user to https://threads.net/oauth/authorize?client_id=&redirect_uri=&scope=threads_basic,threads_content_publish&response_type=code",
    "Exchange the code at POST https://graph.threads.net/oauth/access_token, then upgrade it at GET https://graph.threads.net/access_token?grant_type=th_exchange_token (60-day long-lived token).",
    "Read your Threads user ID from GET https://graph.threads.net/v1.0/me?fields=id,username and paste both values below.",
  ],
};

/** Exact scopes + API endpoints the scheduler uses, shown on the setup screen. */
const PLATFORM_API: Record<SocialPlatform, { scopes: string[]; endpoints: string[] }> = {
  facebook: {
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    endpoints: [
      "POST graph.facebook.com/v21.0/{page-id}/feed",
      "POST /{page-id}/photos · /{page-id}/videos",
    ],
  },
  instagram: {
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    endpoints: [
      "POST graph.facebook.com/v21.0/{ig-user-id}/media",
      "POST /{ig-user-id}/media_publish",
    ],
  },
  linkedin: {
    scopes: ["w_organization_social", "r_organization_social"],
    endpoints: ["POST api.linkedin.com/rest/posts"],
  },
  x: {
    scopes: ["tweet.write", "tweet.read", "users.read", "offline.access"],
    endpoints: ["POST api.twitter.com/2/tweets", "GET /2/users/me"],
  },
  tiktok: {
    scopes: ["video.publish", "user.info.basic"],
    endpoints: ["POST open.tiktokapis.com/v2/post/publish/video/init/", "GET /v2/user/info/"],
  },
  youtube: {
    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    endpoints: ["POST youtube.googleapis.com/upload/youtube/v3/videos"],
  },
  threads: {
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_replies (optional)"],
    endpoints: [
      "POST graph.threads.net/v1.0/{threads-user-id}/threads",
      "POST graph.threads.net/v1.0/{threads-user-id}/threads_publish",
      "GET graph.threads.net/v1.0/me?fields=id,username (connection test)",
    ],
  },
};

export interface ChannelDraft {
  id?: string;
  platform: SocialPlatform;
  name: string;
  external_id: string;
  username: string;
  access_token: string;
}

export const emptyChannelDraft: ChannelDraft = {
  platform: "facebook",
  name: "",
  external_id: "",
  username: "",
  access_token: "",
};

/** Guided per-platform connection screens. */
export function ChannelSetupDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ChannelDraft | null;
}) {
  const brandName = useBrandName();
  const saveChannel = useSaveSocialChannel();
  const verify = useServerFn(verifySocialChannel);
  const [draft, setDraft] = useState<ChannelDraft>(initial ?? emptyChannelDraft);
  const [step, setStep] = useState<"platform" | "form">(initial?.id ? "form" : "platform");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(initial ?? emptyChannelDraft);
    setStep(initial?.id ? "form" : "platform");
  }, [open, initial]);

  const setup = PLATFORM_SETUP[draft.platform];
  const { active: workspace } = useCurrentWorkspace();
  const metaConnect = useServerFn(startMetaConnect);
  const socialConnect = useServerFn(startSocialConnect);
  const [metaBusy, setMetaBusy] = useState(false);
  const busy = saveChannel.isPending || testing || metaBusy;
  const supportsMetaLogin = draft.platform === "facebook" || draft.platform === "instagram";
  const supportsOwnLogin =
    draft.platform === "x" ||
    draft.platform === "threads" ||
    draft.platform === "tiktok" ||
    draft.platform === "linkedin" ||
    draft.platform === "youtube";
  // TikTok's and LinkedIn's manual paste forms are retired now that real OAuth exists for
  // them — these are the platforms with no fallback text entry, unlike X/Threads which
  // still allow one.
  const isOAuthOnly = draft.platform === "tiktok" || draft.platform === "linkedin";
  const loginLabel =
    draft.platform === "x"
      ? "Continue with X"
      : draft.platform === "threads"
        ? "Continue with Threads"
        : draft.platform === "tiktok"
          ? "Continue with TikTok"
          : draft.platform === "linkedin"
            ? "Continue with LinkedIn"
            : draft.platform === "youtube"
              ? "Continue with Google"
            : draft.platform === "instagram"
              ? "Connect Instagram"
              : "Continue with Facebook";

  const connectWithMeta = async () => {
    if (!workspace?.id) return;
    setMetaBusy(true);
    try {
      const res = await metaConnect({
        data: {
          workspaceId: workspace.id,
          origin: window.location.origin,
          returnTo: "/social",
          target: draft.platform === "instagram" ? "instagram" : "facebook",
        },
      });
      window.location.href = res.url;
    } catch (e) {
      setMetaBusy(false);
      toast.error(
        e instanceof Error
          ? e.message
          : `Could not start the ${draft.platform === "instagram" ? "Instagram" : "Facebook"} login`,
      );
    }
  };

  const connectWithProvider = async () => {
    if (!workspace?.id || !supportsOwnLogin) return;
    setMetaBusy(true);
    try {
      const res = await socialConnect({
        data: {
          platform: draft.platform as "x" | "threads" | "tiktok" | "linkedin" | "youtube",
          workspaceId: workspace.id,
          origin: window.location.origin,
          returnTo: "/social",
        },
      });
      window.location.href = res.url;
    } catch (e) {
      setMetaBusy(false);
      toast.error(
        e instanceof Error
          ? e.message
          : `Could not start the ${PLATFORM_LABELS[draft.platform]} login`,
      );
    }
  };

  const saveAndVerify = async (runTest: boolean) => {
    try {
      const id = await saveChannel.mutateAsync(draft);
      setDraft((d) => ({ ...d, id, access_token: "" }));
      if (!runTest) {
        toast.success(initial?.id ? "Channel updated" : "Channel connected");
        onOpenChange(false);
        return;
      }
      setTesting(true);
      const res = await verify({ data: { channelId: id } });
      if (res.ok) {
        toast.success(`Connected${res.name ? ` to ${res.name}` : ""}`);
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "The platform rejected this token");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save channel");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "platform"
              ? "Connect a channel"
              : `${initial?.id ? "Edit" : "Connect"} ${PLATFORM_LABELS[draft.platform]}`}
          </DialogTitle>
          <DialogDescription>
            {step === "platform"
              ? "Pick the platform you want to publish to. Each one has its own guided setup."
              : "Follow the steps, paste your credentials, then run a live connection test."}
          </DialogDescription>
        </DialogHeader>

        {step === "platform" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(PLATFORM_LABELS) as SocialPlatform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, platform: p }));
                  setStep("form");
                }}
                className="rounded-control border p-3 text-left transition-colors hover:bg-muted cursor-pointer"
              >
                <div className="flex items-center gap-2 font-medium">
                  <Plug className="h-4 w-4" />
                  {PLATFORM_LABELS[p]}
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {PLATFORM_SETUP[p].tokenHint}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {supportsMetaLogin && (
              <div className="rounded-control border p-3">
                <p className="text-sm font-medium">Connect with Facebook</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in with Meta and pick your Pages — {brandName} stores the Page token (and any
                  linked Instagram account) for you, so there is nothing to paste below.
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={connectWithMeta}
                  disabled={busy || !workspace?.id}
                >
                  {metaBusy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4 mr-2" />
                  )}
                  Continue with Facebook
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  or paste a token manually
                </p>
              </div>
            )}
            {supportsOwnLogin && (
              <div className="rounded-control border p-3">
                <p className="text-sm font-medium">
                  Connect with {PLATFORM_LABELS[draft.platform]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in with {PLATFORM_LABELS[draft.platform]} and approve the publishing scopes —
                  {brandName} stores the access token for you, so there is nothing to paste below.
                </p>
                {/* Providers reject a login whose redirect_uri is not registered exactly,
                    so show the value to paste into the developer console. No secrets here. */}
                <Label className="mt-3 block text-xs">
                  Redirect URI (add this in {PLATFORM_LABELS[draft.platform]}&apos;s developer
                  console)
                </Label>
                <div className="mt-1 flex items-center gap-2 rounded-control border bg-muted/40 p-2">
                  <code className="flex-1 truncate text-xs">{`${window.location.origin}/api/public/social/${draft.platform}-callback`}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Copy redirect URI"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          `${window.location.origin}/api/public/social/${draft.platform}-callback`,
                        )
                        .then(() => toast.success("Redirect URI copied"))
                        .catch(() =>
                          toast.error("Could not copy. Select the text and copy it manually."),
                        );
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  className="mt-3 w-full"
                  onClick={connectWithProvider}
                  disabled={busy || !workspace?.id}
                >
                  {metaBusy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4 mr-2" />
                  )}
                  {loginLabel}
                </Button>
                {!isOAuthOnly && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    or paste a token manually
                  </p>
                )}
              </div>
            )}

            {!isOAuthOnly && (
              <ol className="space-y-2 rounded-control border bg-muted/30 p-3 text-xs">
                {PLATFORM_STEPS[draft.platform].map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-background text-[11px] font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">
                      {s.replaceAll("{brand}", brandName)}
                    </span>
                  </li>
                ))}
                <li>
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={setup.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official setup guide <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ol>
            )}

            <div className="grid gap-3 rounded-control border p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="mb-1 font-medium">Required scopes</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {PLATFORM_API[draft.platform].scopes.map((sc) => (
                    <li key={sc}>
                      <code className="rounded bg-muted px-1 py-0.5">{sc}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-medium">Endpoints used</p>
                <ul className="space-y-0.5 break-all text-muted-foreground">
                  {PLATFORM_API[draft.platform].endpoints.map((ep) => (
                    <li key={ep}>{ep}</li>
                  ))}
                </ul>
              </div>
            </div>

            {!isOAuthOnly && (
              <>
                <div className="space-y-1.5">
                  <Label>Display name</Label>
                  <Input
                    value={draft.name}
                    disabled={busy}
                    placeholder={`e.g. ${brandName} Official`}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{setup.idLabel}</Label>
                  <Input
                    value={draft.external_id}
                    disabled={busy}
                    onChange={(e) => setDraft((d) => ({ ...d, external_id: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">{setup.idHint}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Username (optional)</Label>
                  <Input
                    value={draft.username}
                    disabled={busy}
                    onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Access token{initial?.id ? " (leave blank to keep current)" : ""}</Label>
                  <Input
                    type="password"
                    value={draft.access_token}
                    disabled={busy}
                    onChange={(e) => setDraft((d) => ({ ...d, access_token: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">{setup.tokenHint}</p>
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3 w-3" /> Stored encrypted and only read server-side
                    by the scheduler.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {step === "form" && !initial?.id && (
            <Button variant="ghost" onClick={() => setStep("platform")} disabled={busy}>
              <ArrowLeft className="h-4 w-4 " />
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {step === "form" && !isOAuthOnly && (
            <>
              <Button
                variant="secondary"
                onClick={() => saveAndVerify(false)}
                disabled={busy || !draft.name.trim()}
              >
                {saveChannel.isPending && !testing && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save only
              </Button>
              <Button onClick={() => saveAndVerify(true)} disabled={busy || !draft.name.trim()}>
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Save &amp; test connection
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Health {
  channel: SocialChannel;
  lastPublish: string | null;
  nextScheduled: string | null;
  queued: number;
  error: string | null;
}

function buildHealth(channels: SocialChannel[], posts: SocialPost[]): Health[] {
  return channels.map((channel) => {
    let lastPublish: string | null = null;
    let nextScheduled: string | null = null;
    let queued = 0;
    let error: string | null = null;
    for (const post of posts) {
      for (const t of post.social_post_targets ?? []) {
        if (t.channel_id !== channel.id) continue;
        if (t.published_at && (!lastPublish || t.published_at > lastPublish))
          lastPublish = t.published_at;
        if (t.error) error = t.error;
        if ((post.status === "scheduled" || post.status === "publishing") && post.scheduled_at) {
          queued++;
          if (!nextScheduled || post.scheduled_at < nextScheduled)
            nextScheduled = post.scheduled_at;
        }
      }
    }
    const meta = channel.metadata as { last_error?: string } | null;
    return {
      channel,
      lastPublish,
      nextScheduled,
      queued,
      error: error ?? meta?.last_error ?? null,
    };
  });
}

/** Per-channel health: last publish, next scheduled time and platform errors. */
export function ChannelHealthPanel({
  channels,
  posts,
  onFix,
}: {
  channels: SocialChannel[];
  posts: SocialPost[];
  onFix: (c: SocialChannel) => void;
}) {
  const verify = useServerFn(verifySocialChannel);
  const [testingId, setTestingId] = useState<string | null>(null);
  const rows = useMemo(() => buildHealth(channels, posts), [channels, posts]);
  const formatZoned = useZonedDateFormatter();

  const runTest = async (c: SocialChannel) => {
    setTestingId(c.id);
    try {
      const res = await verify({ data: { channelId: c.id } });
      if (res.ok) toast.success(`${c.name} is healthy`);
      else toast.error(`${c.name}: ${res.error ?? "connection failed"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setTestingId(null);
    }
  };

  if (!channels.length) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Channel health</h3>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(({ channel, lastPublish, nextScheduled, queued, error }) => {
          const expired =
            channel.token_expires_at && new Date(channel.token_expires_at) < new Date();
          const bad =
            error || expired || channel.status === "error" || channel.status === "expired";
          return (
            <div key={channel.id} className="rounded-control border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{channel.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {PLATFORM_LABELS[channel.platform]}
                  </div>
                </div>
                <Badge variant="outline" className={bad ? "text-destructive" : "text-emerald-600"}>
                  {bad ? (
                    <AlertTriangle className="h-3 w-3 " />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 " />
                  )}
                  {bad ? "Needs attention" : "Healthy"}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline">Last publish: </dt>
                  <dd className="inline text-foreground">
                    {lastPublish
                      ? formatZoned(new Date(lastPublish), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Next scheduled: </dt>
                  <dd className="inline text-foreground">
                    {nextScheduled
                      ? formatZoned(new Date(nextScheduled), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Queued: </dt>
                  <dd className="inline text-foreground">{queued}</dd>
                </div>
                <div>
                  <dt className="inline">Token: </dt>
                  <dd className="inline text-foreground">
                    {channel.token_expires_at
                      ? formatZoned(new Date(channel.token_expires_at), { dateStyle: "medium" })
                      : "no expiry set"}
                  </dd>
                </div>
              </dl>
              {error && <p className="text-xs text-destructive break-words">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testingId === channel.id}
                  onClick={() => runTest(channel)}
                >
                  {testingId === channel.id ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 " />
                  )}
                  Test
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onFix(channel)}>
                  Reconnect
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Instagram-style grid of everything targeted at an Instagram channel. */
export function InstagramFeed({
  channels,
  posts,
  onOpenPost,
}: {
  channels: SocialChannel[];
  posts: SocialPost[];
  onOpenPost: (p: SocialPost) => void;
}) {
  const igChannels = channels.filter((c) => c.platform === "instagram");
  const [selected, setSelected] = useState<string>("all");
  const formatZoned = useZonedDateFormatter();
  const feed = useMemo(() => {
    const ids = new Set(
      igChannels.filter((c) => selected === "all" || c.id === selected).map((c) => c.id),
    );
    return posts
      .filter((p) => (p.social_post_targets ?? []).some((t) => ids.has(t.channel_id)))
      .sort(
        (a, b) =>
          new Date(b.scheduled_at ?? b.published_at ?? b.created_at).getTime() -
          new Date(a.scheduled_at ?? a.published_at ?? a.created_at).getTime(),
      );
  }, [posts, igChannels, selected]);

  if (!igChannels.length)
    return (
      <Card className="p-10 text-center space-y-2">
        <Instagram className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">No Instagram channel connected</p>
        <p className="text-sm text-muted-foreground">
          Connect an Instagram Business account to see its feed here.
        </p>
      </Card>
    );

  return (
    <div className="space-y-3">
      {igChannels.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selected === "all" ? "default" : "outline"}
            onClick={() => setSelected("all")}
          >
            All accounts
          </Button>
          {igChannels.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={selected === c.id ? "default" : "outline"}
              onClick={() => setSelected(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      )}
      {!feed.length ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nothing queued for Instagram yet.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {feed.map((p) => {
            const target = (p.social_post_targets ?? []).find((t) =>
              igChannels.some((c) => c.id === t.channel_id),
            );
            const when = p.published_at ?? p.scheduled_at;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPost(p)}
                className="group relative aspect-square overflow-hidden rounded-control border text-left"
              >
                {p.media_urls?.[0] ? (
                  <img
                    src={p.media_urls[0]}
                    alt={
                      p.caption
                        ? `Instagram post: ${p.caption.slice(0, 60)}`
                        : "Instagram post preview"
                    }
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted p-3 text-center text-xs text-muted-foreground line-clamp-6">
                    {p.caption || "No media"}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <div className="flex items-center gap-1 text-[11px] text-white/90">
                    <CalendarClock className="h-3 w-3" />
                    {when
                      ? formatZoned(new Date(when), {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Draft"}
                  </div>
                  <Badge variant="secondary" className="text-[11px] capitalize">
                    {target?.status ?? p.status}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
