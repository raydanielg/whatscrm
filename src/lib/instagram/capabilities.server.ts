/**
 * Instagram webhook subscription (server-only).
 *
 * Instagram messaging is delivered through the Messenger Platform, so Meta
 * only sends events once the **Page** behind the professional account is
 * subscribed to this app. Declaring the `instagram` object's fields in the App
 * Dashboard is necessary but not sufficient: it says what the app wants, while
 * `/{page-id}/subscribed_apps` is what actually turns delivery on, per Page.
 *
 * Nothing in the Instagram flow used to call it — connect only wrote a row —
 * so a linked, "healthy" account could never receive a DM. The health check in
 * `meta-health.functions.ts` already tests for this and its remedy tells the
 * operator to reconnect, which is why reconnect now performs the subscribe.
 *
 * Decrypted tokens never leave this module.
 */
import { decryptToken } from "./token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Page fields Instagram messaging needs. `messages` is the field the health
 * check asserts; `messaging_postbacks` carries icebreaker / quick-reply taps.
 */
export const REQUIRED_IG_PAGE_FIELDS = ["messages", "messaging_postbacks"] as const;

export interface IgSubscriptionResult {
  ok: boolean;
  /** Fields the Page is subscribed to after the call. */
  fields: string[];
  error: string | null;
}

function tokenOf(cipher: string | null): string | null {
  if (!cipher) return null;
  try {
    return decryptToken(cipher);
  } catch {
    return null;
  }
}

/** GET /{page-id}/subscribed_apps — fields this app currently receives. */
export async function readIgPageFields(
  pageId: string,
  token: string,
): Promise<{ ok: boolean; subscribed: boolean; fields: string[]; error: string | null }> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(token)}`,
  );
  const json: {
    data?: Array<{ subscribed_fields?: string[] }>;
    error?: { message?: string };
  } = await res.json().catch(() => ({}));

  if (!res.ok || json.error) {
    return {
      ok: false,
      subscribed: false,
      fields: [],
      error: json.error?.message ?? `Meta returned HTTP ${res.status}`,
    };
  }
  const entry = (json.data ?? [])[0];
  return {
    ok: true,
    subscribed: Boolean(entry),
    fields: entry?.subscribed_fields ?? [],
    error: null,
  };
}

/**
 * Subscribe the Page, preserving whatever it is already subscribed to.
 *
 * A POST to `subscribed_apps` REPLACES `subscribed_fields` rather than adding
 * to it. The same Page commonly backs both Messenger and Instagram here, so
 * writing only the Instagram fields would silently switch Messenger's inbound
 * off. The current set is read first and the union is written, which also makes
 * the call idempotent: when nothing would change, nothing is sent.
 */
export async function ensureIgPageSubscription(
  pageId: string | null,
  accessTokenCipher: string | null,
): Promise<IgSubscriptionResult> {
  if (!pageId) {
    return {
      ok: false,
      fields: [],
      error: "No Facebook Page is linked to this Instagram account.",
    };
  }
  const token = tokenOf(accessTokenCipher);
  if (!token) {
    return {
      ok: false,
      fields: [],
      error: "Stored Page token could not be read — reconnect this account.",
    };
  }

  const current = await readIgPageFields(pageId, token);
  if (!current.ok) return { ok: false, fields: [], error: current.error };

  const merged = [...new Set([...current.fields, ...REQUIRED_IG_PAGE_FIELDS])];
  const unchanged =
    current.subscribed && REQUIRED_IG_PAGE_FIELDS.every((f) => current.fields.includes(f));
  if (unchanged) return { ok: true, fields: current.fields, error: null };

  const url = new URL(`${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("subscribed_fields", merged.join(","));

  const res = await fetch(url.toString(), { method: "POST" });
  const json: { success?: boolean; error?: { message?: string } } = await res
    .json()
    .catch(() => ({}));
  if (!res.ok || json.error) {
    return {
      ok: false,
      fields: current.fields,
      error: json.error?.message ?? `Meta returned HTTP ${res.status}`,
    };
  }
  return { ok: true, fields: merged, error: null };
}
