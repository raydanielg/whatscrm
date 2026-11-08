/**
 * Platform comment payloads → one `SocialComment` shape for the Inbox.
 *
 * Pure (no I/O) so every parser is unit-tested against recorded API shapes.
 */

export const SOCIAL_INBOX_PLATFORMS = ["facebook", "youtube", "linkedin", "tiktok"] as const;
export type SocialInboxPlatform = (typeof SOCIAL_INBOX_PLATFORMS)[number];

export function isSocialInboxPlatform(value: unknown): value is SocialInboxPlatform {
  return typeof value === "string" && (SOCIAL_INBOX_PLATFORMS as readonly string[]).includes(value);
}

export interface SocialComment {
  platform: SocialInboxPlatform;
  commentId: string;
  /** Top-level comment of the thread — the id a reply must target. */
  replyTargetId: string;
  parentCommentId: string | null;
  postId: string;
  postText: string | null;
  permalink: string | null;
  authorId: string;
  authorName: string | null;
  authorAvatar: string | null;
  text: string;
  createdAt: string;
  /** Written by the connected account itself (our own reply). */
  fromOwner: boolean;
}

type Json = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null;

function isoFrom(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Unix seconds (Meta webhooks, TikTok) vs milliseconds (LinkedIn).
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  if (typeof v === "string" && v.trim()) {
    if (/^\d+$/.test(v.trim())) return isoFrom(Number(v.trim()));
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** Stable Inbox thread key: one conversation per commenter per post. */
export function socialThreadKey(
  platform: SocialInboxPlatform,
  accountExternalId: string,
  postId: string,
  authorId: string,
): string {
  return `${platform}:${accountExternalId}:${postId}:${authorId}`;
}

/* ------------------------------- Facebook -------------------------------- */

/**
 * `GET /{post-id}/comments?filter=stream&fields=id,message,from{id,name,picture},created_time,parent{id},permalink_url`
 * `filter=stream` returns replies flat, each carrying its `parent`.
 */
export function normalizeFacebookComments(
  json: unknown,
  ctx: { pageId: string; postId: string; postText?: string | null; postPermalink?: string | null },
): SocialComment[] {
  const data = ((json as Json | null)?.data as Json[] | undefined) ?? [];
  const out: SocialComment[] = [];
  for (const c of data) {
    const id = str(c.id);
    const from = (c.from as Json | undefined) ?? {};
    const authorId = str(from.id);
    const text = str(c.message) ?? "";
    if (!id || !authorId || !text) continue;
    const parentId = str((c.parent as Json | undefined)?.id);
    const picture = ((from.picture as Json | undefined)?.data as Json | undefined)?.url;
    out.push({
      platform: "facebook",
      commentId: id,
      replyTargetId: parentId ?? id,
      parentCommentId: parentId,
      postId: ctx.postId,
      postText: ctx.postText ?? null,
      permalink: str(c.permalink_url) ?? ctx.postPermalink ?? null,
      authorId,
      authorName: str(from.name),
      authorAvatar: str(picture),
      text,
      createdAt: isoFrom(c.created_time),
      fromOwner: authorId === ctx.pageId,
    });
  }
  return out;
}

/**
 * Page webhook `changes[]` item with `field: "feed"`. Only new comments
 * (`item: "comment"`, `verb: "add"`) become Inbox messages.
 */
export function normalizeFacebookFeedChange(change: unknown, pageId: string): SocialComment | null {
  const c = change as Json | null;
  if (!c || c.field !== "feed") return null;
  const v = (c.value as Json | undefined) ?? {};
  if (v.item !== "comment" || v.verb !== "add") return null;
  const commentId = str(v.comment_id);
  const postId = str(v.post_id);
  const from = (v.from as Json | undefined) ?? {};
  const authorId = str(from.id);
  const text = str(v.message) ?? "";
  if (!commentId || !postId || !authorId || !text) return null;
  const rawParent = str(v.parent_id);
  const parentId = rawParent && rawParent !== postId ? rawParent : null;
  return {
    platform: "facebook",
    commentId,
    replyTargetId: parentId ?? commentId,
    parentCommentId: parentId,
    postId,
    postText: null,
    permalink: str((v.post as Json | undefined)?.permalink_url),
    authorId,
    authorName: str(from.name),
    authorAvatar: null,
    text,
    createdAt: isoFrom(v.created_time),
    fromOwner: authorId === pageId,
  };
}

/* -------------------------------- YouTube -------------------------------- */

function ytComment(
  c: Json,
  ctx: { videoId: string; channelId: string; topLevelId: string; isReply: boolean },
): SocialComment | null {
  const id = str(c.id);
  const s = (c.snippet as Json | undefined) ?? {};
  const authorId = str((s.authorChannelId as Json | undefined)?.value) ?? str(s.authorDisplayName);
  const text = str(s.textOriginal) ?? str(s.textDisplay) ?? "";
  if (!id || !authorId || !text) return null;
  return {
    platform: "youtube",
    commentId: id,
    replyTargetId: ctx.topLevelId,
    parentCommentId: ctx.isReply ? ctx.topLevelId : null,
    postId: ctx.videoId,
    postText: null,
    permalink: `https://www.youtube.com/watch?v=${ctx.videoId}&lc=${id}`,
    authorId,
    authorName: str(s.authorDisplayName),
    authorAvatar: str(s.authorProfileImageUrl),
    text,
    createdAt: isoFrom(s.publishedAt),
    fromOwner: authorId === ctx.channelId,
  };
}

/** `GET youtube/v3/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=…` */
export function normalizeYouTubeCommentThreads(json: unknown, channelId: string): SocialComment[] {
  const items = ((json as Json | null)?.items as Json[] | undefined) ?? [];
  const out: SocialComment[] = [];
  for (const t of items) {
    const s = (t.snippet as Json | undefined) ?? {};
    const videoId = str(s.videoId);
    const top = s.topLevelComment as Json | undefined;
    const topId = str(top?.id);
    if (!videoId || !top || !topId) continue;
    const first = ytComment(top, { videoId, channelId, topLevelId: topId, isReply: false });
    if (first) out.push(first);
    const replies = ((t.replies as Json | undefined)?.comments as Json[] | undefined) ?? [];
    for (const r of replies) {
      const reply = ytComment(r, { videoId, channelId, topLevelId: topId, isReply: true });
      if (reply) out.push(reply);
    }
  }
  return out;
}

/* -------------------------------- LinkedIn ------------------------------- */

/** `GET v2/socialActions/{postUrn}/comments` */
export function normalizeLinkedInComments(
  json: unknown,
  ctx: { postUrn: string; ownerUrn: string; permalink?: string | null },
): SocialComment[] {
  const elements = ((json as Json | null)?.elements as Json[] | undefined) ?? [];
  const out: SocialComment[] = [];
  for (const e of elements) {
    const urn = str(e.$URN) ?? str(e.commentUrn) ?? str(e.id);
    const actor = str(e.actor) ?? str((e.created as Json | undefined)?.actor);
    const text = str((e.message as Json | undefined)?.text) ?? "";
    if (!urn || !actor || !text) continue;
    const parent = str(e.parentComment);
    out.push({
      platform: "linkedin",
      commentId: urn,
      replyTargetId: parent ?? urn,
      parentCommentId: parent,
      postId: ctx.postUrn,
      postText: null,
      permalink: ctx.permalink ?? null,
      authorId: actor,
      authorName: null,
      authorAvatar: null,
      text,
      createdAt: isoFrom((e.created as Json | undefined)?.time),
      fromOwner: actor === ctx.ownerUrn,
    });
  }
  return out;
}

/* --------------------------------- TikTok -------------------------------- */

/** TikTok Business API `GET /business/comment/list/` (`data.comments[]`). */
export function normalizeTikTokComments(
  json: unknown,
  ctx: { videoId: string; permalink?: string | null },
): SocialComment[] {
  const data = ((json as Json | null)?.data as Json | undefined) ?? {};
  const comments = (data.comments as Json[] | undefined) ?? [];
  const out: SocialComment[] = [];
  for (const c of comments) {
    const id = str(c.comment_id);
    const authorId = str(c.user_id) ?? str(c.username);
    const text = str(c.text) ?? "";
    if (!id || !authorId || !text) continue;
    const rawParent = str(c.parent_comment_id);
    const parentId = rawParent && rawParent !== "0" && rawParent !== id ? rawParent : null;
    out.push({
      platform: "tiktok",
      commentId: id,
      replyTargetId: parentId ?? id,
      parentCommentId: parentId,
      postId: str(c.video_id) ?? ctx.videoId,
      postText: null,
      permalink: ctx.permalink ?? null,
      authorId,
      authorName: str(c.display_name) ?? str(c.username),
      authorAvatar: str(c.profile_image),
      text,
      createdAt: isoFrom(c.create_time),
      fromOwner: c.owner === true,
    });
  }
  return out;
}
