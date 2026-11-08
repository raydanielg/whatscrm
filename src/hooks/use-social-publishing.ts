import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace, resolveWorkspaceId } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";
import { SocialSaveError, normalizeSaveError } from "@/lib/social/save-errors";

export type SocialPlatform = "facebook" | "instagram" | "linkedin" | "x" | "tiktok" | "youtube" | "threads";

export type SocialChannel = {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  name: string;
  external_id: string | null;
  username: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  status: "connected" | "expired" | "error" | "disconnected";
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export type SocialPostTarget = {
  id: string;
  post_id: string;
  channel_id: string;
  status: string;
  permalink: string | null;
  error: string | null;
  published_at: string | null;
  social_channels?: Pick<SocialChannel, "id" | "name" | "platform"> | null;
};

export type SocialContentType = "post" | "story" | "reel" | "short" | "poll";
export type SocialMediaKind = "none" | "image" | "video" | "carousel";

export type SocialPost = {
  id: string;
  workspace_id: string;
  caption: string;
  media_urls: string[];
  link_url: string | null;
  first_comment: string | null;
  content_type: SocialContentType;
  media_kind: SocialMediaKind;
  poll_options: string[] | null;
  poll_duration: number | null;
  allow_multi_vote: boolean;
  timezone: string | null;
  last_error: string | null;
  status: SocialPostStatus;
  approval_status?: "not_required" | "pending" | "approved" | "rejected";
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  social_post_targets?: SocialPostTarget[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => sbAny(supabase).from(t as any) as any;

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram Business",
  linkedin: "LinkedIn Page",
  x: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
};

/** Guided connection help shown in the channel setup flow. */
export const PLATFORM_SETUP: Record<
  SocialPlatform,
  { idLabel: string; idHint: string; tokenHint: string; docsUrl: string }
> = {
  facebook: {
    idLabel: "Page ID",
    idHint: "Numeric ID of the Facebook Page you publish to.",
    tokenHint: "Page access token with pages_manage_posts and pages_read_engagement.",
    docsUrl: "https://developers.facebook.com/docs/pages-api/getting-started",
  },
  instagram: {
    idLabel: "Instagram user ID",
    idHint: "The IG Business account ID linked to your Facebook Page.",
    tokenHint: "Page access token with instagram_content_publish.",
    docsUrl: "https://developers.facebook.com/docs/instagram-api/getting-started",
  },
  linkedin: {
    idLabel: "Organization URN or ID",
    idHint: "For example urn:li:organization:1234567.",
    tokenHint: "Member token with w_organization_social.",
    docsUrl: "https://learn.microsoft.com/linkedin/marketing/",
  },
  x: {
    idLabel: "User ID (optional)",
    idHint: "Only used to build post permalinks.",
    tokenHint: "OAuth 2.0 user token with tweet.write, users.read and offline.access.",
    docsUrl: "https://developer.x.com/en/docs/authentication/oauth-2-0",
  },
  tiktok: {
    idLabel: "Open ID",
    idHint: "The open_id returned by TikTok Login Kit.",
    tokenHint: "Access token with video.publish scope.",
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
  youtube: {
    idLabel: "Channel ID (optional)",
    idHint: "Only used for display; uploads go to the token's channel.",
    tokenHint: "Google OAuth token with https://www.googleapis.com/auth/youtube.upload.",
    docsUrl: "https://developers.google.com/youtube/v3/guides/uploading_a_video",
  },
  threads: {
    idLabel: "Threads user ID",
    idHint: "Your Threads account ID from the Threads API.",
    tokenHint: "Threads token with threads_basic and threads_content_publish.",
    docsUrl: "https://developers.facebook.com/docs/threads",
  },
};

export const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
  x: 280,
  tiktok: 2200,
  youtube: 5000,
  threads: 500,
};

export function useSocialChannels() {
  const { active } = useCurrentWorkspace();
  return useQuery<SocialChannel[]>({
    queryKey: ["social-channels", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await db("social_channels")
        .select("id, workspace_id, platform, name, external_id, username, avatar_url, token_expires_at, status, metadata, created_at")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SocialChannel[];
    },
  });
}

export function useSaveSocialChannel() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      platform: SocialPlatform;
      name: string;
      external_id?: string;
      username?: string;
      access_token?: string;
    }) => {
      const workspaceId = await resolveWorkspaceId(active?.id);
      if (!workspaceId)
        throw new Error("No workspace is available for your account yet. Create a workspace in Settings first.");
      if (!input.name.trim()) throw new Error("Channel name is required");
      // Access tokens are never written from the browser — the server fn holds
      // the only path that can touch the credential column.
      const { saveSocialChannel } = await import("@/lib/social/channels.functions");
      const res = await saveSocialChannel({
        data: {
          id: input.id,
          workspaceId,
          platform: input.platform,
          name: input.name.trim(),
          external_id: input.external_id?.trim() || null,
          username: input.username?.trim() || null,
          ...(input.access_token?.trim() ? { access_token: input.access_token.trim() } : {}),
        },
      });
      return res.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-channels"] }),
  });
}

export function useDeleteSocialChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db("social_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-channels"] }),
  });
}

export function useSocialPosts(status?: SocialPostStatus | "all") {
  const { active } = useCurrentWorkspace();
  return useQuery<SocialPost[]>({
    queryKey: ["social-posts", active?.id, status ?? "all"],
    enabled: !!active?.id,
    queryFn: async () => {
      let q = db("social_posts")
        .select("*, social_post_targets(*, social_channels(id, name, platform))")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
  });
}

export type PostInput = {
  id?: string;
  caption: string;
  media_urls: string[];
  link_url?: string;
  first_comment?: string;
  channelIds: string[];
  scheduled_at?: string | null;
  status: SocialPostStatus;
  content_type: SocialContentType;
  media_kind: SocialMediaKind;
  poll_options?: string[];
  poll_duration?: number | null;
  allow_multi_vote?: boolean;
  timezone?: string;
  /** When true, the post waits in the approval queue until approved. */
  requires_approval?: boolean;
};

export const CONTENT_TYPE_LABELS: Record<SocialContentType, string> = {
  post: "Post",
  story: "Story",
  reel: "Reel",
  short: "Short",
  poll: "Poll",
};

/** Which content types each platform can currently publish. */
export const PLATFORM_CONTENT_TYPES: Record<SocialPlatform, SocialContentType[]> = {
  facebook: ["post", "story", "reel", "poll"],
  instagram: ["post", "story", "reel"],
  linkedin: ["post", "poll"],
  x: ["post", "poll"],
  tiktok: ["short"],
  youtube: ["short", "reel"],
  threads: ["post", "reel"],
};

/** Media kinds allowed for a given content type. */
export const CONTENT_TYPE_MEDIA_KINDS: Record<SocialContentType, SocialMediaKind[]> = {
  post: ["none", "image", "carousel", "video"],
  story: ["image", "video"],
  reel: ["video"],
  short: ["video"],
  poll: ["none"],
};

export function defaultMediaKind(type: SocialContentType): SocialMediaKind {
  return CONTENT_TYPE_MEDIA_KINDS[type][0];
}

export function validatePost(input: PostInput, channels: SocialChannel[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const type = input.content_type;
  const kind = input.media_kind;
  const media = input.media_urls.filter((u) => u.trim());
  const isPoll = type === "poll";

  if (!isPoll && !input.caption.trim() && media.length === 0)
    errors.caption = "Add a caption or at least one media item";
  if (!input.channelIds.length) errors.channels = "Select at least one channel";

  if (input.status === "scheduled") {
    if (!input.scheduled_at) errors.scheduled_at = "Pick a date and time";
    else if (new Date(input.scheduled_at).getTime() < Date.now() - 60_000)
      errors.scheduled_at = "Scheduled time must be in the future";
  }

  if (!CONTENT_TYPE_MEDIA_KINDS[type].includes(kind))
    errors.media = `${CONTENT_TYPE_LABELS[type]} does not support ${kind} media`;
  if (kind !== "none" && media.length === 0)
    errors.media = `${CONTENT_TYPE_LABELS[type]} requires at least one media URL`;
  if ((kind === "video" || kind === "image") && media.length > 1)
    errors.media = "Only one media item is allowed for this content type";
  if (kind === "carousel" && media.length < 2)
    errors.media = "A carousel needs at least two images";

  if (type === "story" && input.link_url?.trim())
    errors.link_url = "Stories cannot include a link";

  if (isPoll) {
    const opts = (input.poll_options ?? []).map((o) => o.trim()).filter(Boolean);
    if (!input.caption.trim()) errors.caption = "Add a poll question";
    if (opts.length < 2) errors.poll_options = "Add at least two poll options";
    if (opts.length > 4) errors.poll_options = "A poll supports up to four options";
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
      errors.poll_options = "Poll options must be unique";
    const hours = input.poll_duration ?? 24;
    if (hours < 1 || hours > 168) errors.poll_duration = "Duration must be between 1 and 168 hours";
  }

  const selected = channels.filter((c) => input.channelIds.includes(c.id));
  for (const c of selected) {
    if (input.caption.length > PLATFORM_LIMITS[c.platform]) {
      errors.caption = `Caption is too long for ${PLATFORM_LABELS[c.platform]} (max ${PLATFORM_LIMITS[c.platform]} characters)`;
      break;
    }
    if (!PLATFORM_CONTENT_TYPES[c.platform].includes(type)) {
      errors.channels = `${PLATFORM_LABELS[c.platform]} does not support ${CONTENT_TYPE_LABELS[type].toLowerCase()}s`;
      break;
    }
    if (c.platform === "instagram" && media.length === 0) {
      errors.media = "Instagram posts require at least one media item";
      break;
    }
  }
  return errors;
}

/**
 * Check the selected targets against the channels this workspace can actually
 * see before touching the database.
 *
 * `validatePost` only inspects ids it recognises, so a stale or cross-workspace
 * channel id slipped through and failed later as an opaque foreign-key or RLS
 * error. `channels` comes from the workspace-scoped query, so anything missing
 * from it is either deleted or not ours.
 */
export function validateTargets(
  channelIds: readonly string[],
  channels: readonly SocialChannel[],
  workspaceId: string,
): SocialSaveError | null {
  if (channelIds.length === 0) {
    return new SocialSaveError("no_targets", "validate", "Select at least one channel to post to.");
  }
  const byId = new Map(channels.map((c) => [c.id, c]));
  for (const id of channelIds) {
    const channel = byId.get(id);
    if (!channel) {
      return new SocialSaveError(
        "unknown_target",
        "validate",
        "One of the selected channels is no longer available in this workspace. Reopen the composer and pick the channels again.",
      );
    }
    if (channel.workspace_id !== workspaceId) {
      return new SocialSaveError(
        "unknown_target",
        "validate",
        `${PLATFORM_LABELS[channel.platform]} "${channel.name}" belongs to a different workspace.`,
      );
    }
    if (channel.status === "disconnected") {
      return new SocialSaveError(
        "unknown_target",
        "validate",
        `${PLATFORM_LABELS[channel.platform]} "${channel.name}" is disconnected. Reconnect it or remove it from this post.`,
      );
    }
  }
  return null;
}

export function useSaveSocialPost() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: PostInput & { channels?: readonly SocialChannel[] }) => {
      const workspaceId = await resolveWorkspaceId(active?.id);
      if (!workspaceId)
        throw new SocialSaveError(
          "no_workspace",
          "validate",
          "No workspace is available for your account yet. Create a workspace in Settings first.",
        );
      if (input.channels) {
        const invalid = validateTargets(input.channelIds, input.channels, workspaceId);
        if (invalid) throw invalid;
      }
      const payload = {
        workspace_id: workspaceId,
        caption: input.caption,
        media_urls: input.media_urls,
        link_url: input.link_url?.trim() || null,
        first_comment: input.first_comment?.trim() || null,
        status: input.status,
        scheduled_at: input.status === "scheduled" ? input.scheduled_at : null,
        content_type: input.content_type,
        media_kind: input.media_kind,
        poll_options:
          input.content_type === "poll"
            ? (input.poll_options ?? []).map((o) => o.trim()).filter(Boolean)
            : [],
        poll_duration: input.content_type === "poll" ? (input.poll_duration ?? 24) : null,
        allow_multi_vote: input.content_type === "poll" ? !!input.allow_multi_vote : false,
        timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        last_error: null,
        approval_status: input.requires_approval ? "pending" : "not_required",
      };
      let postId = input.id;
      const isNewPost = !postId;
      if (postId) {
        const { data: existing, error: existingError } = await db("social_posts")
          .select("status, social_post_targets(status)")
          .eq("id", postId)
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        if (existingError) throw normalizeSaveError(existingError, "post");
        if (!existing) throw new Error("Post not found in this workspace.");
        if (
          ["published", "publishing"].includes(existing.status) ||
          (existing.social_post_targets ?? []).some((target: { status: string }) => target.status === "published")
        ) {
          throw new Error("This post has already reached a channel. Duplicate it to publish a revised version.");
        }
        const { error } = await db("social_posts").update(payload).eq("id", postId);
        if (error) throw normalizeSaveError(error, "post");
        await db("social_post_targets").delete().eq("post_id", postId);
      } else {
        const { data, error } = await db("social_posts").insert(payload).select("id").single();
        if (error) throw normalizeSaveError(error, "post");
        postId = data.id as string;
      }
      const targets = input.channelIds.map((channel_id) => ({
        post_id: postId,
        channel_id,
        workspace_id: workspaceId,
        status: "pending",
      }));
      if (targets.length) {
        const { error } = await db("social_post_targets").insert(targets);
        if (error) {
          // The post row already exists. Leaving it behind would show the user
          // a failed save and a mystery draft at the same time, so a post this
          // call created is removed before the error propagates. An edit keeps
          // its existing row — the user's post predates this attempt.
          if (isNewPost) {
            await db("social_posts").delete().eq("id", postId);
          }
          throw normalizeSaveError(error, "targets");
        }
      }
      return postId as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

/** Moves a scheduled post to a new time (or back to draft) without reopening the composer. */
export function useRescheduleSocialPost() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: string; scheduled_at: string | null }) => {
      if (!active?.id) throw new Error("No workspace");
      const { data: post, error: readError } = await db("social_posts")
        .select("status, social_post_targets(status)")
        .eq("id", id)
        .eq("workspace_id", active.id)
        .maybeSingle();
      if (readError) throw readError;
      if (!post || ["publishing", "published"].includes(post.status) ||
          (post.social_post_targets ?? []).some((target: { status: string }) => target.status === "published")) {
        throw new Error("This post has already reached a channel. Duplicate it to schedule a new version.");
      }
      const { data, error } = await db("social_posts")
        .update({
          scheduled_at,
          status: scheduled_at ? "scheduled" : "draft",
          last_error: null,
        })
        .eq("id", id)
        .eq("workspace_id", active.id)
        .in("status", ["draft", "scheduled", "failed"])
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("This post changed while you were editing. Refresh and try again.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

/** Approves or rejects a post in the approval queue. */
export function useSetPostApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approved" | "rejected" }) => {
      const { error } = await db("social_posts")
        .update({ approval_status: decision, last_error: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

export function useDeleteSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db("social_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}
