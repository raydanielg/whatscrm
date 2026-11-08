/**
 * Per-platform post-performance fetchers.
 *
 * Pulls the latest public insight metrics for a published post and normalizes
 * them into one shape. Tokens are decrypted in memory only. Unsupported or
 * permission-gated metrics surface as a thrown error with the provider's own
 * message so the UI can show why a channel has no numbers.
 */
import { resolveToken } from "./providers/token.server";

export interface PostMetrics {
  impressions: number;
  clicks: number;
  shares: number;
  likes: number;
  comments: number;
  raw: Record<string, unknown>;
}

const EMPTY: PostMetrics = { impressions: 0, clicks: 0, shares: 0, likes: 0, comments: 0, raw: {} };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

async function getJson(url: string, headers?: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok || json["error"]) {
    const msg =
      (json["error"] as { message?: string } | undefined)?.message ??
      (json["detail"] as string | undefined) ??
      `Metrics request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

/** X API v2 public metrics (impression/like/retweet/reply counts). */
export async function fetchXMetrics(accessTokenCipher: string, tweetId: string): Promise<PostMetrics> {
  const token = resolveToken(accessTokenCipher);
  const json = await getJson(
    `https://api.twitter.com/2/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics`,
    { Authorization: `Bearer ${token}` },
  );
  const m = ((json["data"] as Record<string, unknown> | undefined)?.["public_metrics"] ?? {}) as Record<string, unknown>;
  return {
    ...EMPTY,
    impressions: num(m["impression_count"]),
    shares: num(m["retweet_count"]) + num(m["quote_count"]),
    likes: num(m["like_count"]),
    comments: num(m["reply_count"]),
    raw: m,
  };
}

/** Threads insights: views, likes, replies, reposts, shares. */
export async function fetchThreadsMetrics(accessTokenCipher: string, mediaId: string): Promise<PostMetrics> {
  const token = resolveToken(accessTokenCipher);
  const json = await getJson(
    `https://graph.threads.net/v1.0/${encodeURIComponent(mediaId)}/insights?metric=views,likes,replies,reposts,shares&access_token=${encodeURIComponent(token)}`,
  );
  const values: Record<string, number> = {};
  for (const entry of (json["data"] as { name?: string; values?: { value?: number }[] }[] | undefined) ?? []) {
    if (entry.name) values[entry.name] = num(entry.values?.[0]?.value);
  }
  return {
    ...EMPTY,
    impressions: num(values["views"]),
    shares: num(values["shares"]) + num(values["reposts"]),
    likes: num(values["likes"]),
    comments: num(values["replies"]),
    raw: values as Record<string, unknown>,
  };
}

/** Instagram Graph insights for a published media object. */
export async function fetchInstagramMetrics(accessTokenCipher: string, mediaId: string): Promise<PostMetrics> {
  const token = resolveToken(accessTokenCipher);
  const json = await getJson(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}/insights?metric=impressions,reach,likes,comments,shares,saved,total_interactions&access_token=${encodeURIComponent(token)}`,
  );
  const values: Record<string, number> = {};
  for (const entry of (json["data"] as { name?: string; values?: { value?: number }[] }[] | undefined) ?? []) {
    if (entry.name) values[entry.name] = num(entry.values?.[0]?.value);
  }
  return {
    ...EMPTY,
    impressions: num(values["impressions"]) || num(values["reach"]),
    shares: num(values["shares"]),
    likes: num(values["likes"]),
    comments: num(values["comments"]),
    raw: values as Record<string, unknown>,
  };
}
