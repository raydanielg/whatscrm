/**
 * Threads publishing provider — Meta Threads API (graph.threads.net v1.0).
 *
 * Two-step container flow: create a media container, then publish it.
 * Carousels create one child container per item. Tokens are decrypted in
 * memory only.
 */
import { resolveToken, type ProviderPublishResult } from "./token.server";

const API = "https://graph.threads.net/v1.0";

export interface ThreadsPublishInput {
  userId: string;
  accessTokenCipher: string;
  caption: string;
  contentType: "post" | "story" | "reel" | "short" | "poll";
  mediaKind: "none" | "image" | "video" | "carousel";
  mediaUrls: string[];
  linkUrl?: string | null;
  firstComment?: string | null;
}

async function call(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok || json["error"]) {
    const msg = (json["error"] as { message?: string } | undefined)?.message ?? `Threads error ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function createContainer(
  userId: string,
  token: string,
  params: Record<string, string>,
): Promise<string> {
  const json = await call(`/${userId}/threads`, { access_token: token, ...params });
  const id = json["id"] as string | undefined;
  if (!id) throw new Error("Threads did not return a container id");
  return id;
}

export async function publishToThreads(input: ThreadsPublishInput): Promise<ProviderPublishResult> {
  const token = resolveToken(input.accessTokenCipher);
  if (!input.userId) throw new Error("Threads channel is missing its user ID. Reconnect the channel.");
  if (input.contentType === "poll") throw new Error("Threads does not support polls.");
  if (input.contentType === "story") throw new Error("Threads does not support stories.");

  const media = input.mediaUrls.filter((u) => u.trim());
  const text = [input.caption.trim(), input.linkUrl?.trim()].filter(Boolean).join("\n\n");

  let containerId: string;
  if (input.mediaKind === "carousel" && media.length > 1) {
    const children: string[] = [];
    for (const url of media.slice(0, 10)) {
      children.push(
        await createContainer(input.userId, token, {
          media_type: "IMAGE",
          image_url: url,
          is_carousel_item: "true",
        }),
      );
    }
    containerId = await createContainer(input.userId, token, {
      media_type: "CAROUSEL",
      children: children.join(","),
      ...(text ? { text } : {}),
    });
  } else if (input.mediaKind === "image" && media[0]) {
    containerId = await createContainer(input.userId, token, {
      media_type: "IMAGE",
      image_url: media[0],
      ...(text ? { text } : {}),
    });
  } else if ((input.mediaKind === "video" || input.contentType === "reel") && media[0]) {
    containerId = await createContainer(input.userId, token, {
      media_type: "VIDEO",
      video_url: media[0],
      ...(text ? { text } : {}),
    });
  } else {
    if (!text) throw new Error("Threads posts require text or media.");
    containerId = await createContainer(input.userId, token, { media_type: "TEXT", text });
  }

  const published = await call(`/${input.userId}/threads_publish`, {
    access_token: token,
    creation_id: containerId,
  });
  const id = published["id"] as string | undefined;

  if (input.firstComment?.trim() && id) {
    try {
      const replyContainer = await createContainer(input.userId, token, {
        media_type: "TEXT",
        text: input.firstComment.trim(),
        reply_to_id: id,
      });
      await call(`/${input.userId}/threads_publish`, { access_token: token, creation_id: replyContainer });
    } catch {
      // A failed reply must not undo a successful post.
    }
  }

  return { externalId: id, providerResponse: { id: id ?? null, containerId } };
}
