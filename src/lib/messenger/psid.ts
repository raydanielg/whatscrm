/**
 * Messenger recipient (PSID) resolution.
 *
 * A PSID is page-scoped: the same person has a different id on every Page, and
 * the Send API rejects anything else with `(#100) Param recipient[id] must be a
 * valid ID string`. The only trustworthy sources are the ids Meta itself put on
 * this Page's webhook events / Graph threads, which the inbox stores in the
 * canonical thread key `psid:<page_id>:<psid>`. CRM contact identities are NOT
 * used: they are not page-scoped, survive contact merges across Pages, and can
 * be attached by hand with arbitrary values.
 */
import { MessengerSendError, type MessengerErrorKind } from "./errors";

const PSID_PATTERN = /^[0-9]{5,32}$/;

export function isPlausiblePsid(value: unknown): value is string {
  return typeof value === "string" && PSID_PATTERN.test(value);
}

export function parseMessengerThreadKey(
  key: string | null | undefined,
): { pageId: string; psid: string } | null {
  if (!key?.startsWith("psid:")) return null;
  const [, pageId, psid, ...rest] = key.split(":");
  if (!pageId || !psid || rest.length > 0) return null;
  return { pageId, psid };
}

/** Local guard run immediately before every Graph `/messages` call. */
export function assertSendablePsid(recipient: unknown, pageId: string): string {
  const value = typeof recipient === "string" ? recipient.trim() : "";
  if (!value) {
    throw new MessengerSendError("invalid_recipient", "Recipient PSID is missing", { local: true });
  }
  if (!isPlausiblePsid(value)) {
    throw new MessengerSendError(
      "invalid_recipient",
      "Recipient is not a Messenger page-scoped ID",
      { local: true },
    );
  }
  if (value === pageId) {
    throw new MessengerSendError("invalid_recipient", "Recipient cannot be the Page itself", {
      local: true,
    });
  }
  return value;
}

export interface RecipientConversation {
  id: string;
  channel: string;
  contact_id: string | null;
  external_conversation_id: string | null;
  metadata: Record<string, unknown> | null;
}

export type RecipientResolution =
  | { ok: true; psid: string; source: "thread_key" | "metadata" | "inbound_history" }
  | { ok: false; kind: MessengerErrorKind; reason: string };

/**
 * Resolve the PSID for `conv` as seen by the Page `pageId`.
 *
 * `lastInboundFrom` is the sender of the newest inbound message stored in this
 * conversation; it is page-scoped by construction and heals legacy threads
 * that predate the canonical key.
 */
export function resolveMessengerRecipient(
  conv: RecipientConversation,
  pageId: string,
  lastInboundFrom?: string | null,
): RecipientResolution {
  if (conv.channel !== "messenger") {
    return { ok: false, kind: "account_config", reason: "Conversation is not a Messenger thread." };
  }
  const meta = conv.metadata ?? {};
  const key = parseMessengerThreadKey(conv.external_conversation_id);
  const threadPage = key?.pageId ?? (typeof meta.page_id === "string" ? meta.page_id : null);
  if (threadPage && threadPage !== pageId) {
    return {
      ok: false,
      kind: "account_config",
      reason:
        "This conversation belongs to a different Facebook Page than the one selected for sending.",
    };
  }

  const forbidden = new Set([pageId, conv.id, conv.contact_id ?? ""]);
  const candidates: Array<[unknown, "thread_key" | "metadata" | "inbound_history"]> = [
    [key?.psid, "thread_key"],
    [meta.psid, "metadata"],
    [meta.chat_id, "metadata"],
    [lastInboundFrom, "inbound_history"],
  ];
  for (const [value, source] of candidates) {
    if (isPlausiblePsid(value) && !forbidden.has(value)) return { ok: true, psid: value, source };
  }
  return {
    ok: false,
    kind: "invalid_recipient",
    reason: "No page-scoped Messenger ID (PSID) is stored for this conversation.",
  };
}
