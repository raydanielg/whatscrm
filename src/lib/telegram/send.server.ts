/**
 * Telegram Bot API send helpers — server-only.
 *
 * Uses the encrypted bot token stored on `telegram_accounts`. Telegram is
 * called directly (api.telegram.org); no gateway hop is required because the
 * workspace brings its own bot token from BotFather.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

const API = "https://api.telegram.org";

export interface TelegramSendInput {
  botTokenCipher: string;
  chatId: string;
  text?: string | null;
  /** Public URL of a media file to deliver instead of / alongside text. */
  media?: { url: string; kind: "photo" | "video" | "audio" | "document" } | null;
  replyToMessageId?: number | null;
}

export interface TelegramSendResult {
  messageId: string;
  chatId: string;
}

export class TelegramApiError extends Error {
  readonly status: number;
  readonly isAuthError: boolean;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.isAuthError = status === 401 || status === 403;
  }
}

export async function callTelegram<T = Record<string, unknown>>(
  botTokenCipher: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = decryptToken(botTokenCipher);
  return callTelegramRaw<T>(token, method, body);
}

export async function callTelegramRaw<T = Record<string, unknown>>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };
  if (!resp.ok || json.ok !== true) {
    throw new TelegramApiError(
      json.description ?? `Telegram ${method} failed with HTTP ${resp.status}`,
      json.error_code ?? resp.status,
    );
  }
  return json.result as T;
}

/**
 * Uploads a file to Telegram as multipart form data instead of handing it a
 * URL. Several CDNs we pull media from — Meta's Commerce Manager/`fbcdn.net`
 * catalog images chief among them — hotlink-protect against Telegram's own
 * fetcher and reject it (visible to the agent as "Bad Request: failed to get
 * HTTP URL content"), even though the same URL opens fine in a browser or
 * from our server. Fetching the bytes ourselves and attaching them sidesteps
 * that block entirely.
 */
async function callTelegramMultipart<T = Record<string, unknown>>(
  botToken: string,
  method: string,
  fields: Record<string, string>,
  file: { field: string; bytes: Uint8Array; filename: string; mimeType: string },
): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(
    file.field,
    new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
    file.filename,
  );
  const resp = await fetch(`${API}/bot${botToken}/${method}`, { method: "POST", body: form });
  const json = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };
  if (!resp.ok || json.ok !== true) {
    throw new TelegramApiError(
      json.description ?? `Telegram ${method} failed with HTTP ${resp.status}`,
      json.error_code ?? resp.status,
    );
  }
  return json.result as T;
}

const MEDIA_FIELD = {
  photo: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  document: ["sendDocument", "document"],
} as const;

function filenameForKind(kind: "photo" | "video" | "audio" | "document", url: string): string {
  const ext = url.split(/[?#]/)[0]!.split(".").pop()?.toLowerCase();
  const safeExt =
    ext && ext.length <= 5
      ? ext
      : { photo: "jpg", video: "mp4", audio: "mp3", document: "bin" }[kind];
  return `file.${safeExt}`;
}

export async function sendTelegramMessage(input: TelegramSendInput): Promise<TelegramSendResult> {
  const base: Record<string, unknown> = { chat_id: input.chatId };
  if (input.replyToMessageId) base.reply_to_message_id = input.replyToMessageId;

  if (input.media) {
    const [method, field] = MEDIA_FIELD[input.media.kind];
    const caption = input.text?.trim();
    const token = decryptToken(input.botTokenCipher);

    // Telegram's own file_id references (already-uploaded media) and its own
    // t.me/api.telegram.org links are never hotlink-blocked — URL mode is
    // fine, and skips an extra fetch round-trip, for those.
    const isTelegramNative =
      !input.media.url.startsWith("http") || input.media.url.includes("api.telegram.org");

    if (!isTelegramNative) {
      try {
        const res = await fetch(input.media.url);
        if (!res.ok) throw new Error(`source returned HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const mimeType =
          res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
        const result = await callTelegramMultipart<{ message_id: number; chat: { id: number } }>(
          token,
          method,
          { chat_id: input.chatId, ...(caption ? { caption } : {}) },
          { field, bytes, filename: filenameForKind(input.media.kind, input.media.url), mimeType },
        );
        return {
          messageId: String(result.message_id),
          chatId: String(result.chat?.id ?? input.chatId),
        };
      } catch (err) {
        // Fall through to URL mode — some sources (large files, Telegram's
        // own CDN, slow origins) are better left to Telegram's own fetcher.
        console.warn("[telegram] multipart upload failed, falling back to URL mode:", err);
      }
    }

    const result = await callTelegramRaw<{ message_id: number; chat: { id: number } }>(
      token,
      method,
      { ...base, [field]: input.media.url, ...(caption ? { caption } : {}) },
    );
    return {
      messageId: String(result.message_id),
      chatId: String(result.chat?.id ?? input.chatId),
    };
  }

  if (!input.text?.trim()) throw new Error("Message must have text or media");
  const result = await callTelegram<{ message_id: number; chat: { id: number } }>(
    input.botTokenCipher,
    "sendMessage",
    { ...base, text: input.text.trim() },
  );
  return { messageId: String(result.message_id), chatId: String(result.chat?.id ?? input.chatId) };
}

export async function sendTelegramTyping(botTokenCipher: string, chatId: string): Promise<void> {
  try {
    await callTelegram(botTokenCipher, "sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    /* typing indicators are best-effort */
  }
}
