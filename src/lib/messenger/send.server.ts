/**
 * Facebook Messenger Send API helper.
 *
 * Server-only. Uses the encrypted Page access token stored on
 * `messenger_accounts` to call Meta Graph `/messages`. Supports text and
 * a single attachment (image | video | audio | file) delivered by public URL.
 *
 * Every failure is thrown as a `MessengerSendError` with a normalised `kind`.
 * The recipient is validated locally first, so a missing or non-PSID id never
 * reaches Meta.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";
import { classifyMetaSendError, MessengerSendError } from "./errors";
import { assertSendablePsid } from "./psid";

const GRAPH = "https://graph.facebook.com/v21.0";

export type MessengerAttachmentType = "image" | "video" | "audio" | "file";

export interface MessengerSendInput {
  pageId: string;
  accessTokenCipher: string;
  recipientPsid: string;
  text?: string | null;
  attachment?: {
    type: MessengerAttachmentType;
    url: string;
  } | null;
  messagingType?: "RESPONSE" | "UPDATE" | "MESSAGE_TAG";
  /** Only sent when the caller explicitly chose MESSAGE_TAG; never auto-applied. */
  tag?: string | null;
}

export interface MessengerSendResult {
  messageId: string;
  recipientId: string;
}

export async function sendMessengerMessage(
  input: MessengerSendInput,
): Promise<MessengerSendResult> {
  if (!input.pageId) {
    throw new MessengerSendError("account_config", "Facebook Page id is missing", { local: true });
  }
  const recipientId = assertSendablePsid(input.recipientPsid, input.pageId);

  const messagingType = input.messagingType ?? "RESPONSE";
  if (messagingType === "MESSAGE_TAG" && !input.tag) {
    throw new MessengerSendError("generic", "MESSAGE_TAG sends require an explicit tag", { local: true });
  }

  const message: Record<string, unknown> = {};
  if (input.attachment) {
    message.attachment = {
      type: input.attachment.type,
      payload: { url: input.attachment.url, is_reusable: true },
    };
  } else if (input.text && input.text.trim()) {
    message.text = input.text.trim();
  } else {
    throw new MessengerSendError("generic", "Message must have text or an attachment", { local: true });
  }

  let token: string;
  try {
    token = decryptToken(input.accessTokenCipher);
  } catch {
    throw new MessengerSendError("token_invalid", "Stored Page token could not be read", { local: true });
  }

  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
    message,
    messaging_type: messagingType,
  };
  if (messagingType === "MESSAGE_TAG") body.tag = input.tag;

  const url = `${GRAPH}/${encodeURIComponent(input.pageId)}/messages?access_token=${encodeURIComponent(token)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new MessengerSendError("generic", "Could not reach Meta Graph API");
  }
  const json = (await resp.json().catch(() => ({}))) as {
    message_id?: string;
    recipient_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number; type?: string };
  };
  if (!resp.ok || json.error) {
    const e = json.error ?? {};
    const detail = e.message ?? `Messenger send failed (${resp.status})`;
    const kind = classifyMetaSendError({
      code: e.code,
      subcode: e.error_subcode,
      message: detail,
      httpStatus: resp.status,
    });
    throw new MessengerSendError(kind, detail, { code: e.code, subcode: e.error_subcode, type: e.type });
  }
  return {
    messageId: json.message_id ?? "",
    recipientId: json.recipient_id ?? recipientId,
  };
}

/**
 * Meta OAuth error codes/subcodes indicating the Page access token is
 * invalid, expired, or the user revoked authorization. Used by token health
 * checks; the send path relies on `classifyMetaSendError`, which does not
 * treat #10 ("outside the allowed window") as an auth failure.
 * https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
export function isMetaAuthError(code?: number, subcode?: number): boolean {
  if (code === 190) return true; // OAuthException — invalid/expired token
  if (code === 102 || code === 10 || code === 200) return true; // session/permission
  if (subcode && [458, 459, 460, 463, 464, 467, 492].includes(subcode)) return true;
  return false;
}
