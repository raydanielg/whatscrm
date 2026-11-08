/**
 * TikTok publishing guard (Content Posting API v2).
 *
 * The previous flow silently selected public visibility and treated an async
 * tracking ID as success. Keep direct posting paused until the composer stores
 * the creator's explicit options and the provider verifies completion.
 */


export interface TikTokPublishInput {
  /** TikTok open_id (unused for direct post; kept for symmetry). */
  openId?: string;
  accessTokenCipher: string;
  caption: string;
  contentType: "post" | "story" | "reel" | "short" | "poll";
  mediaKind: "none" | "image" | "video" | "carousel";
  mediaUrls: string[];
}

export interface TikTokPublishResult {
  externalId?: string;
  permalink?: string;
  providerResponse?: Record<string, unknown>;
}

export async function publishToTikTok(_input: TikTokPublishInput): Promise<TikTokPublishResult> {
  // TikTok requires fresh creator_info, an explicit privacy choice, commercial
  // disclosure and consent before /video/init/. The current composer persists
  // none of those choices. Do not silently publish a public video or mistake a
  // publish_id (an asynchronous tracking ID) for a completed post.
  throw new Error("TikTok direct posting needs privacy, disclosure and consent controls plus creator-info verification. Save this as a draft until TikTok publishing is configured.");
}
