/**
 * Connected social accounts → recent comments, and Inbox replies → platform
 * comment replies. Server-only: tokens are decrypted in memory, never logged.
 */
import { resolveToken } from "@/lib/social/providers/token.server";
import type { TikTokBusinessAccountRow } from "@/lib/tiktok-dm/client.server";
import {
  normalizeFacebookComments,
  normalizeLinkedInComments,
  normalizeTikTokComments,
  normalizeYouTubeCommentThreads,
  type SocialComment,
  type SocialInboxPlatform,
} from "./normalize";
import {
  buildReplyRequest,
  explainPlatformError,
  facebookPostCommentsRequest,
  facebookRecentPostsRequest,
  linkedInCommentsRequest,
  replyIdFromResponse,
  tiktokCommentListRequest,
  tiktokVideoListRequest,
  youtubeCommentThreadsRequest,
  youtubeMyChannelRequest,
  type HttpRequest,
} from "./requests";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = { from: (table: string) => any };
export type FetchImpl = typeof fetch;

export interface SocialInboxAccount {
  source: "messenger_accounts" | "social_channels" | "tiktok_business_accounts";
  id: string;
  workspaceId: string;
  platform: SocialInboxPlatform;
  /** Page id, YouTube channel id, LinkedIn member id or TikTok business id. */
  externalId: string | null;
  name: string;
  token: string;
}

const MAX_POSTS = 10;

async function getJson(
  fetchImpl: FetchImpl,
  platform: SocialInboxPlatform,
  req: HttpRequest,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(req.url, req.init);
  const text = await res.text();
  if (!res.ok) throw new Error(explainPlatformError(platform, res.status, text));
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  // TikTok Business API answers 200 with a non-zero `code` on failure.
  if (platform === "tiktok" && typeof json.code === "number" && json.code !== 0) {
    const status = json.code === 40001 || json.code === 40105 ? 401 : 403;
    throw new Error(explainPlatformError(platform, status, String(json.message ?? "")));
  }
  return json;
}

/** Every connected account in scope that can feed the Inbox. */
export async function loadSocialInboxAccounts(
  admin: Admin,
  opts: { workspaceId?: string; facebookPageId?: string } = {},
): Promise<SocialInboxAccount[]> {
  let pages = admin
    .from("messenger_accounts")
    .select("id, workspace_id, page_id, page_name, status, access_token_ciphertext")
    .neq("status", "disconnected");
  if (opts.workspaceId) pages = pages.eq("workspace_id", opts.workspaceId);
  if (opts.facebookPageId) pages = pages.eq("page_id", opts.facebookPageId);
  let channels = admin
    .from("social_channels")
    .select("id, workspace_id, platform, external_id, name, username, access_token, refresh_token, token_expires_at, status")
    // TikTok comments come from the Business connection below: a Login Kit
    // token in social_channels cannot read comments.
    .in("platform", opts.facebookPageId ? ["facebook"] : ["facebook", "youtube", "linkedin"])
    .eq("status", "connected");
  if (opts.workspaceId) channels = channels.eq("workspace_id", opts.workspaceId);
  if (opts.facebookPageId) channels = channels.eq("external_id", opts.facebookPageId);

  let tiktok = admin
    .from("tiktok_business_accounts")
    .select("id, workspace_id, business_id, username, display_name, access_token, refresh_token, expires_at, refresh_expires_at, status")
    .eq("status", "active");
  if (opts.workspaceId) tiktok = tiktok.eq("workspace_id", opts.workspaceId);

  const [{ data: pageRows, error: pageErr }, { data: channelRows, error: channelErr }, { data: tiktokRows }] =
    await Promise.all([pages, channels, opts.facebookPageId ? Promise.resolve({ data: [] }) : tiktok]);
  if (pageErr) throw new Error(`messenger_accounts: ${pageErr.message}`);
  if (channelErr) throw new Error(`social_channels: ${channelErr.message}`);

  const out: SocialInboxAccount[] = [];
  const pageKeys = new Set<string>();
  for (const p of (pageRows ?? []) as Array<Record<string, string | null>>) {
    if (!p.page_id || !p.access_token_ciphertext) continue;
    pageKeys.add(`${p.workspace_id}:${p.page_id}`);
    out.push({
      source: "messenger_accounts",
      id: p.id!,
      workspaceId: p.workspace_id!,
      platform: "facebook",
      externalId: p.page_id,
      name: p.page_name?.trim() || "Facebook Page",
      token: resolveToken(p.access_token_ciphertext),
    });
  }
  for (const c of (channelRows ?? []) as Array<Record<string, string | null>>) {
    if (!c.access_token) continue;
    // The same Page connected for both Messenger and publishing syncs once.
    if (c.platform === "facebook" && pageKeys.has(`${c.workspace_id}:${c.external_id}`)) continue;
    let token = resolveToken(c.access_token);
    if (c.platform === "youtube" && c.refresh_token) {
      const { freshGoogleAccessToken } = await import("@/lib/social/providers/google-token.server");
      token = await freshGoogleAccessToken(admin, c as never).catch(() => token);
    }
    out.push({
      source: "social_channels",
      id: c.id!,
      workspaceId: c.workspace_id!,
      platform: c.platform as SocialInboxPlatform,
      externalId: c.external_id,
      name: c.name?.trim() || c.username || c.platform!,
      token,
    });
  }
  if ((tiktokRows ?? []).length) {
    const { validAccessToken } = await import("@/lib/tiktok-dm/client.server");
    for (const t of tiktokRows as TikTokBusinessAccountRow[]) {
      // An expired connection is flagged on the row by validAccessToken.
      const token = await validAccessToken(admin, t).catch(() => null);
      if (!token) continue;
      out.push({
        source: "tiktok_business_accounts",
        id: t.id,
        workspaceId: t.workspace_id,
        platform: "tiktok",
        externalId: t.business_id,
        name: t.display_name?.trim() || t.username || "TikTok account",
        token,
      });
    }
  }
  return out;
}

/** One account by its provider-table row, scoped to the workspace. */
export async function loadSocialInboxAccount(
  admin: Admin,
  args: { workspaceId: string; accountId: string; platform: SocialInboxPlatform },
): Promise<SocialInboxAccount | null> {
  const all = await loadSocialInboxAccounts(admin, { workspaceId: args.workspaceId });
  return all.find((a) => a.id === args.accountId && a.platform === args.platform) ?? null;
}

/** Recent comments for one account, oldest first. */
export async function fetchRecentComments(
  admin: Admin,
  account: SocialInboxAccount,
  fetchImpl: FetchImpl = fetch,
): Promise<{ comments: SocialComment[]; externalId: string | null }> {
  const t = account.token;
  let comments: SocialComment[] = [];
  let externalId = account.externalId;

  if (account.platform === "facebook") {
    if (!externalId) throw new Error("Facebook Page id is missing. Reconnect the Page.");
    const posts = await getJson(fetchImpl, "facebook", facebookRecentPostsRequest(externalId, t, MAX_POSTS));
    for (const post of ((posts.data as Array<Record<string, unknown>>) ?? []).slice(0, MAX_POSTS)) {
      const postId = String(post.id ?? "");
      if (!postId) continue;
      const json = await getJson(fetchImpl, "facebook", facebookPostCommentsRequest(postId, t));
      comments.push(
        ...normalizeFacebookComments(json, {
          pageId: externalId,
          postId,
          postText: (post.message as string | undefined) ?? null,
          postPermalink: (post.permalink_url as string | undefined) ?? null,
        }),
      );
    }
  } else if (account.platform === "youtube") {
    if (!externalId || !externalId.startsWith("UC")) {
      const me = await getJson(fetchImpl, "youtube", youtubeMyChannelRequest(t));
      externalId = ((me.items as Array<{ id?: string }> | undefined)?.[0]?.id ?? null) as string | null;
      if (!externalId) throw new Error("No YouTube channel is available for this token.");
    }
    const json = await getJson(fetchImpl, "youtube", youtubeCommentThreadsRequest(externalId, t));
    comments = normalizeYouTubeCommentThreads(json, externalId);
  } else if (account.platform === "linkedin") {
    if (!externalId) throw new Error("LinkedIn channel is missing the member id. Reconnect the channel.");
    const ownerUrn = `urn:li:person:${externalId}`;
    const { data: targets } = await admin
      .from("social_post_targets")
      .select("external_post_id, permalink")
      .eq("channel_id", account.id)
      .not("external_post_id", "is", null)
      .limit(MAX_POSTS * 2);
    for (const target of (targets ?? []) as Array<{ external_post_id: string; permalink: string | null }>) {
      const json = await getJson(fetchImpl, "linkedin", linkedInCommentsRequest(target.external_post_id, t));
      comments.push(
        ...normalizeLinkedInComments(json, {
          postUrn: target.external_post_id,
          ownerUrn,
          permalink: target.permalink,
        }),
      );
    }
  } else {
    if (!externalId) throw new Error("TikTok channel is missing the business account id. Reconnect the channel.");
    const videos = await getJson(fetchImpl, "tiktok", tiktokVideoListRequest(externalId, t));
    const list =
      (((videos.data as Record<string, unknown> | undefined)?.videos as Array<Record<string, unknown>>) ?? []).slice(
        0,
        MAX_POSTS,
      );
    for (const v of list) {
      const videoId = String(v.item_id ?? "");
      if (!videoId) continue;
      const json = await getJson(fetchImpl, "tiktok", tiktokCommentListRequest(externalId, videoId, t));
      comments.push(...normalizeTikTokComments(json, { videoId, permalink: (v.share_url as string) ?? null }));
    }
  }

  comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { comments, externalId };
}

/** Post an Inbox reply as a comment reply. Returns the created comment id. */
export async function replyToSocialComment(args: {
  account: SocialInboxAccount;
  targetId: string;
  postId: string;
  text: string;
  fetchImpl?: FetchImpl;
}): Promise<string | null> {
  const { account } = args;
  const ownerId =
    account.platform === "linkedin" && account.externalId
      ? `urn:li:person:${account.externalId}`
      : account.externalId;
  const req = buildReplyRequest({
    platform: account.platform,
    token: account.token,
    targetId: args.targetId,
    postId: args.postId,
    ownerId,
    text: args.text,
  });
  const res = await (args.fetchImpl ?? fetch)(req.url, req.init);
  const body = await res.text();
  if (!res.ok) throw new Error(explainPlatformError(account.platform, res.status, body));
  const json = body ? (JSON.parse(body) as Record<string, unknown>) : null;
  if (account.platform === "tiktok" && typeof json?.code === "number" && json.code !== 0) {
    throw new Error(explainPlatformError("tiktok", 403, String(json.message ?? "")));
  }
  return replyIdFromResponse(account.platform, json, res.headers);
}
