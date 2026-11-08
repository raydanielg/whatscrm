/**
 * YouTube publishing provider — Data API v3 resumable upload.
 *
 * Streams the video from its public URL into YouTube's resumable upload
 * session, then returns the watch permalink. Only video content types are
 * supported; the caption becomes the title/description.
 */
import { resolveToken, type ProviderPublishResult } from "./token.server";

const UPLOAD =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

export interface YouTubePublishInput {
  accessTokenCipher: string;
  caption: string;
  contentType: "post" | "story" | "reel" | "short" | "poll";
  mediaKind: "none" | "image" | "video" | "carousel";
  mediaUrls: string[];
  privacyStatus?: "public" | "unlisted" | "private";
}

export async function publishToYouTube(input: YouTubePublishInput): Promise<ProviderPublishResult> {
  const token = resolveToken(input.accessTokenCipher);
  const videoUrl = input.mediaUrls.find((u) => u.trim());
  if (!videoUrl) throw new Error("YouTube requires a video URL.");
  if (input.mediaKind !== "video") throw new Error("YouTube only publishes video content.");

  const caption = input.caption.trim() || "Untitled";
  const title = caption.split("\n")[0]!.slice(0, 100);
  const isShort = input.contentType === "short" || input.contentType === "reel";

  const source = await fetch(videoUrl);
  if (!source.ok || !source.body) throw new Error(`Could not download the video (${source.status}).`);
  const contentLength = source.headers.get("content-length");
  const mime = source.headers.get("content-type") ?? "video/*";

  const init = await fetch(UPLOAD, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": mime,
      ...(contentLength ? { "X-Upload-Content-Length": contentLength } : {}),
    },
    body: JSON.stringify({
      snippet: {
        title,
        description: isShort ? `${caption}\n\n#Shorts` : caption,
      },
      status: { privacyStatus: input.privacyStatus ?? "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) {
    const text = await init.text();
    throw new Error(`YouTube upload could not start: ${text.slice(0, 200)}`);
  }
  const sessionUrl = init.headers.get("location");
  if (!sessionUrl) throw new Error("YouTube did not return an upload session URL.");

  const bytes = new Uint8Array(await source.arrayBuffer());
  const upload = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  const text = await upload.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!upload.ok) {
    const msg = (json["error"] as { message?: string } | undefined)?.message ?? `YouTube error ${upload.status}`;
    throw new Error(msg);
  }
  const id = json["id"] as string | undefined;
  return {
    externalId: id,
    permalink: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
    providerResponse: { id: id ?? null },
  };
}
