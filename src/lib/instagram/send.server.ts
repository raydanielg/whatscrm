/**
 * Instagram Messaging (Graph API) send helper — server-only.
 *
 * Instagram DMs for a professional account are sent through the linked
 * Facebook Page (or the IG user id) using the same `/messages` Send API as
 * Messenger, with the encrypted token stored on `instagram_accounts`.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface InstagramSendInput {
  /** Facebook Page id linked to the IG account (fallback: ig_user_id). */
  senderId: string;
  accessTokenCipher: string;
  /** IGSID of the person being replied to. */
  recipientId: string;
  text?: string | null;
  media?: { url: string; kind: "image" | "video" | "audio" | "document" } | null;
}

export interface InstagramSendResult {
  messageId: string;
  recipientId: string;
}

export async function sendInstagramMessage(
  input: InstagramSendInput,
): Promise<InstagramSendResult> {
  const token = decryptToken(input.accessTokenCipher);

  const message: Record<string, unknown> = {};
  if (input.media) {
    // Instagram supports image / video / audio attachments by public URL.
    const type =
      input.media.kind === "document" ? "file" : input.media.kind;
    message.attachment = {
      type,
      payload: { url: input.media.url, is_reusable: true },
    };
  } else if (input.text?.trim()) {
    message.text = input.text.trim();
  } else {
    throw new Error("Message must have text or media");
  }

  const resp = await fetch(
    `${GRAPH}/${encodeURIComponent(input.senderId)}/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: input.recipientId },
        message,
        messaging_type: "RESPONSE",
      }),
    },
  );

  const json = (await resp.json().catch(() => ({}))) as {
    message_id?: string;
    recipient_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };

  if (!resp.ok || json.error) {
    const err = new Error(
      json.error?.message ?? `Instagram send failed (${resp.status})`,
    ) as Error & { metaCode?: number; metaSubcode?: number };
    err.metaCode = json.error?.code;
    err.metaSubcode = json.error?.error_subcode;
    throw err;
  }

  return {
    messageId: json.message_id ?? "",
    recipientId: json.recipient_id ?? input.recipientId,
  };
}
