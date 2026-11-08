/**
 * Messenger capability inspection helpers (server-only).
 *
 * Reads the Page-level Messenger capabilities from Meta Graph:
 *  - whether the Page is subscribed to THIS app (required for inbound
 *    webhooks — without it, messages never reach the Inbox),
 *  - which webhook fields the subscription covers,
 *  - the messaging permissions granted on the stored Page token.
 *
 * Decrypted tokens never leave this module.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Webhook fields Messenger needs for a fully working two-way Inbox.
 * `message_echoes` carries replies sent outside this app (Meta Business Suite,
 * Page inbox, phone) — without it those replies never reach the Inbox.
 */
export const REQUIRED_PAGE_FIELDS = [
  "messages",
  "message_echoes",
  "messaging_postbacks",
  "message_deliveries",
  "message_reads",
] as const;

export interface PageCapability {
  subscribed: boolean;
  subscribedFields: string[];
  missingFields: string[];
  error: string | null;
}

function tokenOf(cipher: string): string | null {
  try {
    return decryptToken(cipher);
  } catch {
    return null;
  }
}

/** GET /{page_id}/subscribed_apps — is this app receiving the Page's messages? */
export async function readPageSubscription(
  pageId: string,
  accessTokenCipher: string,
): Promise<PageCapability> {
  const token = tokenOf(accessTokenCipher);
  if (!token) {
    return {
      subscribed: false,
      subscribedFields: [],
      missingFields: [...REQUIRED_PAGE_FIELDS],
      error: "Stored Page token could not be read — reconnect this Page.",
    };
  }

  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(token)}`,
  );
  const json: {
    data?: Array<{ subscribed_fields?: string[] }>;
    error?: { message?: string };
  } = await res.json().catch(() => ({}));

  if (!res.ok || json.error) {
    return {
      subscribed: false,
      subscribedFields: [],
      missingFields: [...REQUIRED_PAGE_FIELDS],
      error: json.error?.message ?? `Meta returned HTTP ${res.status}`,
    };
  }

  const entry = (json.data ?? [])[0];
  const fields = entry?.subscribed_fields ?? [];
  return {
    subscribed: Boolean(entry),
    subscribedFields: fields,
    missingFields: REQUIRED_PAGE_FIELDS.filter((f) => !fields.includes(f)),
    error: null,
  };
}

/** POST / DELETE /{page_id}/subscribed_apps — turn Messenger delivery on or off. */
export async function setPageSubscription(
  pageId: string,
  accessTokenCipher: string,
  subscribe: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const token = tokenOf(accessTokenCipher);
  if (!token) return { ok: false, error: "Stored Page token could not be read — reconnect this Page." };

  const url = new URL(`${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`);
  url.searchParams.set("access_token", token);
  if (subscribe) url.searchParams.set("subscribed_fields", REQUIRED_PAGE_FIELDS.join(","));

  const res = await fetch(url.toString(), { method: subscribe ? "POST" : "DELETE" });
  const json: { success?: boolean; error?: { message?: string } } = await res.json().catch(() => ({}));
  if (!res.ok || json.error) return { ok: false, error: json.error?.message ?? `Meta returned HTTP ${res.status}` };
  return { ok: true, error: null };
}
