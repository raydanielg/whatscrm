/**
 * Instagram Business publishing provider (Meta Graph API).
 *
 * Supports feed posts (single image, carousel, video), stories, and reels via
 * the two-step container → media_publish flow. Follows the same pattern as the
 * Facebook provider: tokens are decrypted on the fly and never persisted here.
 */

import { decryptToken } from "@/lib/instagram/token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface InstagramPublishInput {
  igUserId: string;
  accessTokenCipher: string;
  caption: string;
  contentType: "post" | "story" | "reel" | "short" | "poll";
  mediaKind: "none" | "image" | "video" | "carousel";
  mediaUrls: string[];
  firstComment?: string | null;
}

export interface InstagramPublishResult {
  externalId?: string;
  permalink?: string;
  providerResponse?: Record<string, unknown>;
}

function isEncrypted(token: string): boolean {
  try {
    return Buffer.from(token, "base64").length >= 28;
  } catch {
    return false;
  }
}

function resolveToken(cipher: string): string {
  return isEncrypted(cipher) ? decryptToken(cipher) : cipher;
}

async function graphPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    const e = json.error as { message?: string; code?: number; error_subcode?: number; type?: string } | undefined;
    const err = new Error(e?.message ?? `Instagram error ${res.status}`);
    (err as Error & { metaCode?: number; metaSubcode?: number; metaType?: string }).metaCode = e?.code;
    (err as Error & { metaCode?: number; metaSubcode?: number; metaType?: string }).metaSubcode = e?.error_subcode;
    (err as Error & { metaCode?: number; metaSubcode?: number; metaType?: string }).metaType = e?.type;
    throw err;
  }
  return json;
}

async function waitForContainer(containerId: string, token: string, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const json = (await res.json()) as { status_code?: string; error?: { message?: string } };
    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? `Instagram container status check failed (${res.status})`);
    }
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`Instagram media container failed with status ${json.status_code}`);
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram media container did not finish processing in time");
}

async function createContainer(
  igUserId: string,
  token: string,
  params: Record<string, string>,
): Promise<string> {
  const json = await graphPost(`/${igUserId}/media`, { ...params, access_token: token });
  if (typeof json.id !== "string" || !json.id) throw new Error("Instagram did not return a media container ID");
  return json.id;
}

async function publishContainer(igUserId: string, token: string, containerId: string) {
  const json = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });
  if (typeof json.id !== "string" || !json.id) throw new Error("Instagram did not return a published media ID");
  return json.id;
}

export async function publishToInstagram(input: InstagramPublishInput): Promise<InstagramPublishResult> {
  const token = resolveToken(input.accessTokenCipher);
  const { igUserId, caption, contentType, mediaKind, mediaUrls } = input;
  if (!mediaUrls.length) throw new Error("Instagram requires at least one media item");

  const isStory = contentType === "story";
  const isReel = contentType === "reel" || contentType === "short";

  let containerId: string;

  if (mediaKind === "carousel" && !isStory && !isReel) {
    if (mediaUrls.length < 2) throw new Error("An Instagram carousel needs at least two images");
    const childIds: string[] = [];
    for (const url of mediaUrls.slice(0, 10)) {
      childIds.push(
        await createContainer(igUserId, token, { image_url: url, is_carousel_item: "true" }),
      );
    }
    // Carousel children and their parent are processed asynchronously by Meta.
    // Publishing immediately can fail with "Media ID is not available" even
    // though each /media request returned an ID.
    await Promise.all(childIds.map((id) => waitForContainer(id, token)));
    containerId = await createContainer(igUserId, token, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
    });
    await waitForContainer(containerId, token);
  } else if (mediaKind === "video" || isReel) {
    const params: Record<string, string> = { video_url: mediaUrls[0] };
    if (isReel) params.media_type = "REELS";
    if (isStory) params.media_type = "STORIES";
    params.caption = caption;
    containerId = await createContainer(igUserId, token, params);
    await waitForContainer(containerId, token);
  } else {
    const params: Record<string, string> = { image_url: mediaUrls[0] };
    if (isStory) params.media_type = "STORIES";
    else params.caption = caption;
    containerId = await createContainer(igUserId, token, params);
    await waitForContainer(containerId, token);
  }

  const mediaId = await publishContainer(igUserId, token, containerId);

  // Best-effort permalink lookup.
  let permalink: string | undefined;
  try {
    const res = await fetch(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
    );
    const json = (await res.json()) as { permalink?: string };
    permalink = json.permalink;
  } catch {
    // non-fatal
  }

  // First comment via /comments (best effort, like Facebook provider).
  if (input.firstComment?.trim()) {
    try {
      await graphPost(`/${mediaId}/comments`, { message: input.firstComment.trim(), access_token: token });
    } catch (e) {
      console.warn("[instagram] first comment failed:", e instanceof Error ? e.message : String(e));
    }
  }

  return { externalId: mediaId, permalink };
}
