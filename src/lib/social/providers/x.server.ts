/**
 * X (Twitter) publishing provider — API v2 `POST /2/tweets`.
 *
 * Uses the channel's OAuth 2.0 user access token (scopes: tweet.write,
 * users.read, offline.access). Text posts and native polls are supported;
 * media requires the v1.1 upload endpoint with OAuth 1.0a, which the channel
 * token cannot sign, so media posts fail with a clear message.
 */
import { resolveToken, type ProviderPublishResult } from "./token.server";

const API = "https://api.twitter.com/2";

export interface XPublishInput {
  username?: string | null;
  accessTokenCipher: string;
  caption: string;
  contentType: "post" | "story" | "reel" | "short" | "poll";
  mediaKind: "none" | "image" | "video" | "carousel";
  mediaUrls: string[];
  pollOptions?: string[];
  pollDurationHours?: number | null;
  firstComment?: string | null;
}

async function tweet(token: string, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch(`${API}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const detail =
      (json["detail"] as string) ??
      ((json["errors"] as { message?: string }[] | undefined)?.[0]?.message ?? `X error ${res.status}`);
    throw new Error(detail);
  }
  return (json["data"] ?? {}) as { id: string };
}

export async function publishToX(input: XPublishInput): Promise<ProviderPublishResult> {
  const token = resolveToken(input.accessTokenCipher);
  const caption = input.caption.trim();

  if (input.mediaKind !== "none" && input.mediaUrls.length) {
    throw new Error(
      "X media posts are not supported with this connection. Post text or a poll, or include the media as a link.",
    );
  }
  if (input.contentType === "story" || input.contentType === "reel" || input.contentType === "short") {
    throw new Error("X does not support stories, reels or shorts.");
  }

  const body: Record<string, unknown> = { text: caption };
  if (input.contentType === "poll") {
    const options = (input.pollOptions ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 4);
    if (options.length < 2) throw new Error("An X poll needs at least two options.");
    const minutes = Math.min(Math.max(Math.round((input.pollDurationHours ?? 24) * 60), 5), 10080);
    body["poll"] = { options, duration_minutes: minutes };
  }
  if (!caption) throw new Error("X posts require text.");

  const created = await tweet(token, body);
  const permalink = `https://x.com/${input.username?.replace(/^@/, "") || "i"}/status/${created.id}`;

  if (input.firstComment?.trim()) {
    try {
      await tweet(token, {
        text: input.firstComment.trim(),
        reply: { in_reply_to_tweet_id: created.id },
      });
    } catch {
      // A failed reply must not undo a successful post.
    }
  }

  return { externalId: created.id, permalink, providerResponse: { id: created.id } };
}
