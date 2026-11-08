/**
 * HTTP request shapes for reading comments and posting comment replies.
 * Pure builders: tokens travel in headers, never in URLs (URLs get logged).
 */
import type { SocialInboxPlatform } from "./normalize";

export const FB_GRAPH = "https://graph.facebook.com/v21.0";
export const YT_API = "https://www.googleapis.com/youtube/v3";
export const LI_API = "https://api.linkedin.com/v2";
export const TT_BUSINESS_API = "https://business-api.tiktok.com/open_api/v1.3";

export interface HttpRequest {
  url: string;
  init: RequestInit;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const linkedInHeaders = (token: string) => ({
  ...bearer(token),
  "X-Restli-Protocol-Version": "2.0.0",
});

/* ------------------------------ reads ----------------------------------- */

export function facebookRecentPostsRequest(pageId: string, token: string, limit = 10): HttpRequest {
  const q = new URLSearchParams({ fields: "id,message,permalink_url,created_time", limit: String(limit) });
  return { url: `${FB_GRAPH}/${encodeURIComponent(pageId)}/posts?${q}`, init: { headers: bearer(token) } };
}

export function facebookPostCommentsRequest(postId: string, token: string, limit = 50): HttpRequest {
  const q = new URLSearchParams({
    filter: "stream",
    order: "reverse_chronological",
    limit: String(limit),
    fields: "id,message,from{id,name,picture},created_time,parent{id},permalink_url",
  });
  return { url: `${FB_GRAPH}/${encodeURIComponent(postId)}/comments?${q}`, init: { headers: bearer(token) } };
}

export function youtubeMyChannelRequest(token: string): HttpRequest {
  return { url: `${YT_API}/channels?part=id&mine=true`, init: { headers: bearer(token) } };
}

export function youtubeCommentThreadsRequest(channelId: string, token: string, max = 50): HttpRequest {
  const q = new URLSearchParams({
    part: "snippet,replies",
    allThreadsRelatedToChannelId: channelId,
    maxResults: String(max),
    order: "time",
    textFormat: "plainText",
  });
  return { url: `${YT_API}/commentThreads?${q}`, init: { headers: bearer(token) } };
}

export function linkedInCommentsRequest(postUrn: string, token: string): HttpRequest {
  return {
    url: `${LI_API}/socialActions/${encodeURIComponent(postUrn)}/comments`,
    init: { headers: linkedInHeaders(token) },
  };
}

export function tiktokVideoListRequest(businessId: string, token: string): HttpRequest {
  const q = new URLSearchParams({
    business_id: businessId,
    fields: JSON.stringify(["item_id", "create_time", "share_url", "caption"]),
  });
  return { url: `${TT_BUSINESS_API}/business/video/list/?${q}`, init: { headers: { "Access-Token": token } } };
}

export function tiktokCommentListRequest(businessId: string, videoId: string, token: string): HttpRequest {
  const q = new URLSearchParams({ business_id: businessId, video_id: videoId });
  return { url: `${TT_BUSINESS_API}/business/comment/list/?${q}`, init: { headers: { "Access-Token": token } } };
}

/* ------------------------------ replies --------------------------------- */

export interface ReplyArgs {
  platform: SocialInboxPlatform;
  token: string;
  /** Top-level comment id the reply attaches to. */
  targetId: string;
  postId: string;
  /** LinkedIn `urn:li:person:…` / TikTok business id. */
  ownerId: string | null;
  text: string;
}

export function buildReplyRequest(a: ReplyArgs): HttpRequest {
  switch (a.platform) {
    case "facebook":
      return {
        url: `${FB_GRAPH}/${encodeURIComponent(a.targetId)}/comments`,
        init: {
          method: "POST",
          headers: { ...bearer(a.token), "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ message: a.text }).toString(),
        },
      };
    case "youtube":
      return {
        url: `${YT_API}/comments?part=snippet`,
        init: {
          method: "POST",
          headers: { ...bearer(a.token), "Content-Type": "application/json" },
          body: JSON.stringify({ snippet: { parentId: a.targetId, textOriginal: a.text } }),
        },
      };
    case "linkedin":
      if (!a.ownerId) throw new Error("LinkedIn channel is missing the member id. Reconnect the channel.");
      return {
        url: `${LI_API}/socialActions/${encodeURIComponent(a.postId)}/comments`,
        init: {
          method: "POST",
          headers: { ...linkedInHeaders(a.token), "Content-Type": "application/json" },
          body: JSON.stringify({
            actor: a.ownerId,
            object: a.postId,
            message: { text: a.text },
            ...(a.targetId !== a.postId ? { parentComment: a.targetId } : {}),
          }),
        },
      };
    case "tiktok":
      if (!a.ownerId) throw new Error("TikTok channel is missing the business account id. Reconnect the channel.");
      return {
        url: `${TT_BUSINESS_API}/business/comment/reply/create/`,
        init: {
          method: "POST",
          headers: { "Access-Token": a.token, "Content-Type": "application/json" },
          body: JSON.stringify({
            business_id: a.ownerId,
            video_id: a.postId,
            comment_id: a.targetId,
            text: a.text,
          }),
        },
      };
  }
}

/** Pull the created comment id out of each platform's reply response. */
export function replyIdFromResponse(
  platform: SocialInboxPlatform,
  json: Record<string, unknown> | null,
  headers?: Headers,
): string | null {
  if (platform === "tiktok") {
    const data = (json?.data as Record<string, unknown> | undefined) ?? {};
    const id = data.comment_id ?? data.reply_id;
    return typeof id === "string" || typeof id === "number" ? String(id) : null;
  }
  if (platform === "linkedin") {
    const urn = json?.$URN ?? json?.commentUrn ?? headers?.get("x-restli-id");
    return typeof urn === "string" ? urn : null;
  }
  const id = json?.id;
  return typeof id === "string" ? id : null;
}

/** Map a platform error body onto one actionable sentence. */
export function explainPlatformError(platform: SocialInboxPlatform, status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401 || lower.includes("invalid_token") || lower.includes("expired")) {
    return `${PLATFORM_LABEL[platform]} access token is invalid or expired. Reconnect the channel.`;
  }
  if (status === 403 || lower.includes("permission") || lower.includes("insufficient")) {
    return PERMISSION_HINT[platform];
  }
  if (status === 429) return `${PLATFORM_LABEL[platform]} rate limit reached. The next sync will retry.`;
  return `${PLATFORM_LABEL[platform]} error ${status}: ${body.slice(0, 200)}`;
}

export const PLATFORM_LABEL: Record<SocialInboxPlatform, string> = {
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const PERMISSION_HINT: Record<SocialInboxPlatform, string> = {
  facebook:
    "Facebook did not grant comment access. Reconnect the Page and approve pages_read_engagement and pages_manage_engagement.",
  youtube: "YouTube did not grant comment access. Reconnect with the youtube.force-ssl scope.",
  linkedin:
    "LinkedIn did not grant comment access. Reading and replying to comments requires the r_member_social / Community Management API permission on the LinkedIn app.",
  tiktok:
    "TikTok did not grant comment access. Comments require a TikTok Business account connected through the TikTok Business API (comment.list / comment.reply).",
};
