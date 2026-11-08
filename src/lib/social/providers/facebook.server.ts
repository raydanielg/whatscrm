/**
 * Facebook Page publishing provider.
 *
 * Supports feed posts (text/link/image/carousel), video/reels, stories, and
 * polls through the Meta Graph API. Tokens are decrypted on the fly; the
 * provider never persists secrets.
 */

import { decryptToken } from "@/lib/instagram/token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface FacebookPublishInput {
  pageId: string;
  accessTokenCipher: string;
  caption: string;
  contentType: "post" | "story" | "reel" | "short" | "poll";
  mediaKind: "none" | "image" | "video" | "carousel";
  mediaUrls: string[];
  linkUrl?: string | null;
  pollOptions?: string[];
  allowMultiVote?: boolean;
  firstComment?: string | null;
}

export interface FacebookPublishResult {
  externalId?: string;
  permalink?: string;
  providerResponse?: Record<string, unknown>;
}

function isEncrypted(token: string): boolean {
  // Encrypted tokens are base64 and decode to at least 28 bytes (iv + tag).
  try {
    const b = Buffer.from(token, "base64");
    return b.length >= 28;
  } catch {
    return false;
  }
}

function resolveToken(cipher: string): string {
  if (isEncrypted(cipher)) return decryptToken(cipher);
  // Backwards-compatible plaintext fallback for channels connected before encryption.
  return cipher;
}

async function graphPost(path: string, body: URLSearchParams | FormData | string, contentType?: string) {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", headers, body });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok || json.error) {
    const err = new Error((json.error as { message?: string })?.message ?? `Facebook error ${res.status}`);
    (err as Error & { metaCode?: number; metaSubcode?: number; metaType?: string }).metaCode = (json.error as { code?: number })?.code;
    (err as Error & { metaCode?: number; metaSubcode?: number; metaType?: string }).metaSubcode = (json.error as { error_subcode?: number })?.error_subcode;
    (err as Error & { metaCode?: number; metaSubcode?: number; metaType?: string }).metaType = (json.error as { type?: string })?.type;
    throw err;
  }
  return json;
}

function isAuthError(code?: number, subcode?: number, type?: string): boolean {
  if (type === "OAuthException") return true;
  if (code === 190 || code === 102 || code === 10 || code === 200) return true;
  if (subcode && [458, 459, 460, 463, 464, 467, 492].includes(subcode)) return true;
  return false;
}

export { isAuthError };

async function uploadPhotoToPage(pageId: string, token: string, url: string, published = false): Promise<string> {
  const body = new URLSearchParams({ url, access_token: token, published: published ? "true" : "false" });
  const json = await graphPost(`/${pageId}/photos`, body);
  return (json.id as string) ?? "";
}

async function uploadVideoResumable(pageId: string, token: string, videoUrl: string): Promise<string> {
  // 1. Fetch video bytes.
  const fetchRes = await fetch(videoUrl);
  if (!fetchRes.ok) throw new Error(`Could not fetch video from ${videoUrl}: ${fetchRes.status}`);
  const bytes = await fetchRes.arrayBuffer();
  const fileSize = bytes.byteLength;
  if (!fileSize) throw new Error("Video file is empty");

  // 2. Start session.
  const start = await graphPost(
    `/${pageId}/videos?upload_phase=start&file_size=${fileSize}&access_token=${encodeURIComponent(token)}`,
    new URLSearchParams(),
  );
  const uploadSessionId = (start as Record<string, unknown>).upload_session_id as string;
  const videoId = (start as Record<string, unknown>).video_id as string;
  if (!uploadSessionId || !videoId) throw new Error("Facebook video upload start did not return a session");

  // 3. Transfer whole file in one chunk (suitable for short-form content under a few hundred MB).
  const chunkForm = new FormData();
  chunkForm.append("upload_phase", "transfer");
  chunkForm.append("upload_session_id", uploadSessionId);
  chunkForm.append("start_offset", "0");
  chunkForm.append("video_file_chunk", new Blob([bytes]));
  await graphPost(`/${pageId}/videos?access_token=${encodeURIComponent(token)}`, chunkForm);

  // 4. Finish.
  const finishBody = new URLSearchParams({
    upload_phase: "finish",
    upload_session_id: uploadSessionId,
    access_token: token,
  });
  await graphPost(`/${pageId}/videos?access_token=${encodeURIComponent(token)}`, finishBody);
  return videoId;
}

async function publishFeedPost(input: FacebookPublishInput, token: string): Promise<FacebookPublishResult> {
  const { pageId, caption, mediaKind, mediaUrls, linkUrl } = input;

  if (mediaKind === "image" && mediaUrls[0]) {
    const body = new URLSearchParams({
      url: mediaUrls[0],
      caption,
      access_token: token,
      published: "true",
    });
    const json = await graphPost(`/${pageId}/photos`, body);
    const id = (json.post_id as string) ?? (json.id as string);
    return { externalId: id, permalink: `https://facebook.com/${id}` };
  }

  if (mediaKind === "carousel" && mediaUrls.length) {
    const mediaIds = await Promise.all(mediaUrls.map((url) => uploadPhotoToPage(pageId, token, url, false)));
    const body = new URLSearchParams({
      message: caption,
      attached_media: JSON.stringify(mediaIds.map((id) => ({ media_fbid: id }))),
      access_token: token,
    });
    if (linkUrl) body.append("link", linkUrl);
    const json = await graphPost(`/${pageId}/feed`, body);
    const id = json.id as string;
    return { externalId: id, permalink: `https://facebook.com/${id}` };
  }

  const body = new URLSearchParams({ message: caption, access_token: token });
  if (linkUrl) body.append("link", linkUrl);
  const json = await graphPost(`/${pageId}/feed`, body);
  const id = json.id as string;
  return { externalId: id, permalink: `https://facebook.com/${id}` };
}

async function publishPoll(input: FacebookPublishInput, token: string): Promise<FacebookPublishResult> {
  const { pageId, caption, pollOptions, allowMultiVote } = input;
  const options = (pollOptions ?? []).filter(Boolean).slice(0, 4);
  if (options.length < 2) throw new Error("Polls need at least 2 options");

  // Meta page polls use a structured attachment. Fallback to a text poll if unsupported.
  const body = new URLSearchParams({
    message: caption,
    access_token: token,
  });
  const poll = {
    options: options.map((opt) => ({ option_text: opt })),
    allow_new_options: false,
    allow_multiple_choices: !!allowMultiVote,
  };
  body.append("poll", JSON.stringify(poll));
  const json = await graphPost(`/${pageId}/feed`, body);
  const id = json.id as string;
  return { externalId: id, permalink: `https://facebook.com/${id}` };
}

async function publishReel(input: FacebookPublishInput, token: string): Promise<FacebookPublishResult> {
  const { pageId, caption, mediaUrls } = input;
  if (!mediaUrls[0]) throw new Error("Reels require a video URL");
  const videoId = await uploadVideoResumable(pageId, token, mediaUrls[0]);
  // Reels are published by setting reels_parameters with the video_id.
  const body = new URLSearchParams({
    access_token: token,
    description: caption,
    video_id: videoId,
    reels_parameters: JSON.stringify({}), // required marker for reels
  });
  const json = await graphPost(`/${pageId}/video_reels`, body);
  const id = json.id as string ?? videoId;
  return { externalId: id, permalink: `https://facebook.com/reel/${id}` };
}

async function publishStory(input: FacebookPublishInput, token: string): Promise<FacebookPublishResult> {
  const { pageId, caption, mediaKind, mediaUrls } = input;
  if (!mediaUrls[0]) throw new Error("Stories require an image or video URL");

  if (mediaKind === "video") {
    const videoId = await uploadVideoResumable(pageId, token, mediaUrls[0]);
    const body = new URLSearchParams({ access_token: token, video_id: videoId });
    const json = await graphPost(`/${pageId}/stories`, body);
    return { externalId: json.id as string };
  }

  const photoId = await uploadPhotoToPage(pageId, token, mediaUrls[0], false);
  const body = new URLSearchParams({ access_token: token, photo_id: photoId });
  if (caption) body.append("caption", caption);
  const json = await graphPost(`/${pageId}/stories`, body);
  return { externalId: json.id as string };
}

async function postFirstComment(postId: string, token: string, text: string) {
  const body = new URLSearchParams({ message: text, access_token: token });
  await graphPost(`/${postId}/comments`, body);
}

export async function publishToFacebook(input: FacebookPublishInput): Promise<FacebookPublishResult> {
  const token = resolveToken(input.accessTokenCipher);
  let result: FacebookPublishResult;

  switch (input.contentType) {
    case "poll":
      result = await publishPoll(input, token);
      break;
    case "reel":
    case "short":
      result = await publishReel(input, token);
      break;
    case "story":
      result = await publishStory(input, token);
      break;
    case "post":
    default:
      result = await publishFeedPost(input, token);
  }

  if (input.firstComment?.trim() && result.externalId) {
    try {
      await postFirstComment(result.externalId, token, input.firstComment.trim());
    } catch (e) {
      // First comment is best-effort; do not fail the whole publish.
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[facebook] first comment failed:", message);
    }
  }

  return result;
}
