/**
 * TikTok Business Messaging — pure protocol helpers (no I/O).
 *
 * Contract (TikTok API for Business v1.3):
 *  - OAuth: https://www.tiktok.com/v2/auth/authorize → POST /tt_user/oauth2/token/
 *  - Send:  POST /business/message/send/ (recipient_type CONVERSATION)
 *  - Webhook: event_type DIRECT_MESSAGE; events im_receive_msg / im_send_msg,
 *    signed with `Tiktok-Signature: t=<unix>,s=<hex hmac-sha256(secret, "t.body")>`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const TIKTOK_BUSINESS_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
export const TIKTOK_DM_SOURCE = "tiktok_dm";

export function tiktokDmCallbackUri(origin: string): string {
  return `${origin}/api/public/tiktok-dm/callback`;
}

export const TIKTOK_DM_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.profile",
  "user.account.type",
  "message.list.read",
  "message.list.send",
  "message.list.manage",
  // Comments on the account's videos (TikTok Comments channel).
  "video.list",
  "comment.list",
  "comment.list.manage",
];

/** Webhook signatures older than this are rejected (replays are also idempotent). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function buildTikTokDmAuthorizeUrl(args: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize");
  url.searchParams.set("client_key", args.appId);
  url.searchParams.set("client_id", args.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_DM_SCOPES.join(","));
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

export function verifyTikTokSignature(args: {
  header: string | null;
  rawBody: string;
  secret: string;
  nowSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!args.header) return { ok: false, reason: "missing signature" };
  const parts = Object.fromEntries(
    args.header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const s = parts.s;
  if (!Number.isFinite(t) || !s) return { ok: false, reason: "malformed signature" };
  const expected = createHmac("sha256", args.secret).update(`${t}.${args.rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "stale signature" };
  return { ok: true };
}

export interface TikTokDmMessage {
  event: "im_receive_msg" | "im_send_msg";
  businessId: string;
  conversationId: string;
  messageId: string;
  createdAt: string;
  type: string;
  text: string;
  /** The TikTok user on the other side of the conversation. */
  userId: string;
  userName: string | null;
  /** True when the business account sent it (echo / sent from the TikTok app). */
  fromBusiness: boolean;
  referencedMessageId: string | null;
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

function bodyText(content: Obj): string {
  const type = str(content.type) ?? "unknown";
  if (type === "text") return str(obj(content.text).body) ?? "";
  if (type === "image") return "📷 Image";
  if (type === "share_post") {
    const link = str(obj(content.share_post).embed_url);
    return link ? `Shared a post: ${link}` : "Shared a post";
  }
  if (type === "sticker") return "Sticker";
  return `Unsupported TikTok message (${type})`;
}

/** Parse one webhook envelope. Returns null for events we do not mirror. */
export function parseTikTokDmEvent(raw: unknown): TikTokDmMessage | null {
  const env = obj(raw);
  const event = str(env.event);
  if (event !== "im_receive_msg" && event !== "im_send_msg") return null;
  let content: Obj;
  try {
    content = typeof env.content === "string" ? obj(JSON.parse(env.content)) : obj(env.content);
  } catch {
    return null;
  }
  const businessId = str(env.user_openid);
  const conversationId = str(content.conversation_id);
  const messageId = str(content.message_id);
  if (!businessId || !conversationId || !messageId) return null;

  const fromId = str(obj(content.from_user).id);
  const toId = str(obj(content.to_user).id);
  // Direction comes from the ids, not the event name: im_send_msg also fires
  // for messages typed in the TikTok app itself.
  const fromBusiness = toId ? toId !== businessId : event === "im_send_msg";
  const ts = Number(content.timestamp);
  return {
    event,
    businessId,
    conversationId,
    messageId,
    createdAt: new Date(Number.isFinite(ts) && ts > 0 ? ts : Date.now()).toISOString(),
    type: str(content.type) ?? "unknown",
    text: bodyText(content),
    userId: (fromBusiness ? toId : fromId) ?? conversationId,
    userName: fromBusiness ? str(content.to) : str(content.from),
    fromBusiness,
    referencedMessageId: str(obj(content.referenced_message_info).referenced_message_id),
  };
}

export function tiktokDmThreadKey(businessId: string, conversationId: string): string {
  return `tiktok_dm:${businessId}:${conversationId}`;
}

export function tiktokSendTextBody(args: {
  businessId: string;
  conversationId: string;
  text: string;
  referencedMessageId?: string | null;
}) {
  return {
    business_id: args.businessId,
    recipient_type: "CONVERSATION",
    recipient: args.conversationId,
    message_type: "TEXT",
    text: { body: args.text },
    ...(args.referencedMessageId
      ? { referenced_message_info: { referenced_message_id: args.referencedMessageId } }
      : {}),
  };
}

/** Turn a TikTok `{code, message}` failure into something an agent can act on. */
export function explainTikTokDmError(code: unknown, message: string): string {
  const m = message.toLowerCase();
  if (m.includes("48") || m.includes("window") || m.includes("expired"))
    return "TikTok only allows replies within 48 hours of the customer's last message. Wait for them to message again.";
  if (m.includes("scope") || m.includes("permission"))
    return `TikTok rejected the request (${message}). Reconnect the account and approve the messaging permissions.`;
  if (m.includes("token") || m.includes("auth"))
    return `TikTok authorization failed (${message}). Reconnect the TikTok Business account.`;
  return `TikTok error ${String(code ?? "")}: ${message}`.trim();
}
