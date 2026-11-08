import { publishToFacebook, isAuthError } from "./providers/facebook.server";
import { publishToInstagram } from "./providers/instagram.server";
import { publishToTikTok } from "./providers/tiktok.server";
import { publishToX } from "./providers/x.server";
import { publishToThreads } from "./providers/threads.server";
import { publishToYouTube } from "./providers/youtube.server";
import { publishToLinkedIn } from "./providers/linkedin.server";
import { sbAny } from "@/lib/supabase/untyped";

type PublishResult = {
  externalId?: string;
  permalink?: string;
  providerResponse?: Record<string, unknown>;
};

interface PostRow {
  id: string;
  workspace_id: string;
  caption: string;
  media_urls: string[];
  link_url: string | null;
  first_comment: string | null;
  content_type: string;
  media_kind: string;
  poll_options: string[];
  poll_duration: number | null;
  allow_multi_vote: boolean;
  status: string;
}

interface TargetRow {
  id: string;
  channel_id: string;
  status: string;
  social_channels: {
    id: string;
    platform: string;
    external_id: string | null;
    username?: string | null;
    name: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

export interface PublishSocialPostResult {
  ok: boolean;
  results: { channel: string; ok: boolean; error?: string }[];
  alreadyPublished?: boolean;
}

/**
 * Internal publishing logic. Accepts either the authenticated user client
 * (for manual "Publish now") or the admin client (for the scheduler).
 */
export async function publishSocialPostInternal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  postId: string,
  workspaceId: string,
): Promise<PublishSocialPostResult> {
  const { data: post, error } = await supabase
    .from("social_posts")
    .select("*, social_post_targets(*, social_channels(id, platform, external_id, username, name, metadata))")
    .eq("id", postId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post) throw new Error("Post not found");

  const typedPost = post as unknown as PostRow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approval = (post as any).approval_status as string | undefined;
  if (approval === "pending")
    throw new Error("This post is waiting for approval. Approve it in Social Studio first.");
  if (approval === "rejected") throw new Error("This post was rejected in the approval queue.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targets: TargetRow[] = (post.social_post_targets ?? []) as any;
  if (!targets.length) throw new Error("This post has no channels selected");

  if (targets.every((target) => target.status === "published")) {
    return {
      ok: true,
      alreadyPublished: true,
      results: targets.map((target) => ({ channel: target.social_channels?.name ?? "Channel", ok: true })),
    };
  }

  const { data: claimedPost, error: postClaimError } = await sbAny(supabase)
    .from("social_posts")
    .update({ status: "publishing" })
    .eq("id", typedPost.id)
    .in("status", ["draft", "scheduled", "failed", "published"])
    .select("id");
  if (postClaimError) throw new Error(postClaimError.message);
  if (!claimedPost?.length) {
    return {
      ok: false,
      results: [{ channel: "Post", ok: false, error: "Publishing is already in progress. Wait for it to finish before retrying." }],
    };
  }

  // Access tokens are hidden from app users at the database level; load them
  // with the service client, scoped to this workspace's channels only.
  const channelIds = targets.map((t) => t.channel_id).filter(Boolean);
  const { data: tokenRows } = await adminSupabase
    .from("social_channels")
    .select("id, access_token")
    .eq("workspace_id", workspaceId)
    .in("id", channelIds);
  const tokens = new Map<string, string | null>(
    (tokenRows ?? []).map((r: { id: string; access_token: string | null }) => [
      r.id,
      r.access_token,
    ]),
  );

  const results: { channel: string; ok: boolean; error?: string }[] = [];
  let uncertainDelivery = false;
  for (const target of targets) {
    const channel = target.social_channels;
    if (!channel) continue;
    if (target.status === "published") {
      results.push({ channel: channel.name, ok: true });
      continue;
    }
    // The predicate is part of the UPDATE, so concurrent publish requests
    // cannot both claim the same target after PostgreSQL rechecks its row lock.
    const { data: claimed, error: claimError } = await sbAny(supabase)
      .from("social_post_targets")
      .update({ status: "publishing" })
      .eq("id", target.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (claimError) {
      results.push({ channel: channel.name, ok: false, error: `Could not reserve channel: ${claimError.message}` });
      continue;
    }
    if (!claimed?.length) {
      results.push({ channel: channel.name, ok: false, error: "Already publishing or published in another request" });
      continue;
    }
    try {
      const accessToken = tokens.get(channel.id);
      if (!accessToken) throw new Error("Channel has no access token. Reconnect the channel.");

      let out: PublishResult;
      if (channel.platform === "facebook") {
        out = await publishToFacebook({
          pageId: channel.external_id ?? "",
          accessTokenCipher: accessToken,
          caption: typedPost.caption,
          contentType:
            (typedPost.content_type as "post" | "story" | "reel" | "short" | "poll") ?? "post",
          mediaKind: (typedPost.media_kind as "none" | "image" | "video" | "carousel") ?? "none",
          mediaUrls: typedPost.media_urls ?? [],
          linkUrl: typedPost.link_url,
          pollOptions: typedPost.poll_options,
          allowMultiVote: typedPost.allow_multi_vote,
          firstComment: typedPost.first_comment,
        });
      } else if (channel.platform === "instagram") {
        out = await publishToInstagram({
          igUserId: channel.external_id ?? "",
          accessTokenCipher: accessToken,
          caption: typedPost.caption,
          contentType:
            (typedPost.content_type as "post" | "story" | "reel" | "short" | "poll") ?? "post",
          mediaKind: (typedPost.media_kind as "none" | "image" | "video" | "carousel") ?? "none",
          mediaUrls: typedPost.media_urls ?? [],
          firstComment: typedPost.first_comment,
        });
      } else if (channel.platform === "tiktok") {
        // Requested scopes at connect time are not a guarantee of what TikTok
        // actually granted — check what the callback recorded rather than
        // discovering the gap from a failed provider call.
        if (channel.metadata?.["can_publish"] === false) {
          throw new Error(
            "TikTok did not grant video publishing for this channel. Reconnect and approve video.publish.",
          );
        }
        out = await publishToTikTok({
          openId: channel.external_id ?? undefined,
          accessTokenCipher: accessToken,
          caption: typedPost.caption,
          contentType:
            (typedPost.content_type as "post" | "story" | "reel" | "short" | "poll") ?? "short",
          mediaKind: (typedPost.media_kind as "none" | "image" | "video" | "carousel") ?? "video",
          mediaUrls: typedPost.media_urls ?? [],
        });
      } else if (channel.platform === "x") {
        out = await publishToX({
          username: channel.username ?? null,
          accessTokenCipher: accessToken,
          caption: typedPost.caption,
          contentType:
            (typedPost.content_type as "post" | "story" | "reel" | "short" | "poll") ?? "post",
          mediaKind: (typedPost.media_kind as "none" | "image" | "video" | "carousel") ?? "none",
          mediaUrls: typedPost.media_urls ?? [],
          pollOptions: typedPost.poll_options,
          pollDurationHours: typedPost.poll_duration,
          firstComment: typedPost.first_comment,
        });
      } else if (channel.platform === "threads") {
        out = await publishToThreads({
          userId: channel.external_id ?? "",
          accessTokenCipher: accessToken,
          caption: typedPost.caption,
          contentType:
            (typedPost.content_type as "post" | "story" | "reel" | "short" | "poll") ?? "post",
          mediaKind: (typedPost.media_kind as "none" | "image" | "video" | "carousel") ?? "none",
          mediaUrls: typedPost.media_urls ?? [],
          linkUrl: typedPost.link_url,
          firstComment: typedPost.first_comment,
        });
      } else if (channel.platform === "youtube") {
        // Google OAuth channels renew their ~1h access token here.
        const { data: yt } = await adminSupabase
          .from("social_channels")
          .select("id, access_token, refresh_token, token_expires_at")
          .eq("id", channel.id)
          .maybeSingle();
        let youtubeToken = accessToken;
        if (yt?.refresh_token) {
          const { freshGoogleAccessToken } = await import("./providers/google-token.server");
          const { encryptToken } = await import("@/lib/instagram/token-crypto.server");
          youtubeToken = encryptToken(await freshGoogleAccessToken(adminSupabase, yt));
        }
        out = await publishToYouTube({
          accessTokenCipher: youtubeToken,
          caption: typedPost.caption,
          contentType:
            (typedPost.content_type as "post" | "story" | "reel" | "short" | "poll") ?? "short",
          mediaKind: (typedPost.media_kind as "none" | "image" | "video" | "carousel") ?? "video",
          mediaUrls: typedPost.media_urls ?? [],
        });
      } else if (channel.platform === "linkedin") {
        // Requested scopes at connect time are not a guarantee of what
        // LinkedIn actually granted — check what the callback recorded
        // rather than discovering the gap from a failed provider call.
        if (channel.metadata?.["can_publish"] === false) {
          throw new Error(
            "LinkedIn did not grant post publishing for this channel. Reconnect and approve w_member_social.",
          );
        }
        out = await publishToLinkedIn({
          memberId: channel.external_id ?? "",
          accessTokenCipher: accessToken,
          caption: typedPost.caption,
        });
      } else {
        throw new Error(`Publishing to ${channel.platform} is not supported yet`);
      }

      let persistError: { message: string } | null = null;
      try {
        const saved = await supabase
          .from("social_post_targets")
          .update({
            status: "published",
            external_post_id: out.externalId ?? null,
            permalink: out.permalink ?? null,
            error: null,
            published_at: new Date().toISOString(),
            provider_response: out.providerResponse ?? {},
          })
          .eq("id", target.id);
        persistError = saved.error;
      } catch (saveError) {
        persistError = { message: saveError instanceof Error ? saveError.message : "Database unavailable" };
      }
      if (persistError) {
        // The provider may already have published. Keep the target reserved so
        // an automatic retry cannot send the same post again.
        uncertainDelivery = true;
        results.push({ channel: channel.name, ok: false, error: "Provider accepted the post, but its result could not be saved. Check the channel before retrying." });
        continue;
      }
      results.push({ channel: channel.name, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publish failed";
      const metaErr = e as Error & { metaCode?: number; metaSubcode?: number; metaType?: string };
      if (isAuthError(metaErr.metaCode, metaErr.metaSubcode, metaErr.metaType)) {
        await adminSupabase
          .from("social_channels")
          .update({ status: "error", token_refresh_error: message })
          .eq("id", channel.id);
      }
      await supabase
        .from("social_post_targets")
        .update({ status: "failed", error: message })
        .eq("id", target.id);
      results.push({ channel: channel.name, ok: false, error: message });
    }
  }

  const anyOk = results.some((r) => r.ok);
  await supabase
    .from("social_posts")
    .update({
      status: uncertainDelivery ? "publishing" : anyOk ? "published" : "failed",
      published_at: anyOk ? new Date().toISOString() : null,
      last_error: uncertainDelivery ? "One provider result could not be saved. Check the channel before retrying." : null,
    })
    .eq("id", typedPost.id);

  return { ok: anyOk, results };
}
