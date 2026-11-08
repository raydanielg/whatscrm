/**
 * Shared server-only probes for the Meta-delivered inbound channels
 * (Messenger and Instagram).
 *
 * WhatsApp already had a thorough health check; Messenger and Instagram had
 * none. Connecting either channel only ever exercised the OUTBOUND Graph API
 * — token valid, page reachable — which is why an account could sit there
 * showing "Connected / healthy" while not a single inbound message arrived.
 * Every check in here targets the INBOUND path instead: the one the account
 * panels could not see.
 *
 * The two probes are deliberately "the real thing": they call our own public
 * webhook URL exactly the way Meta does — a `hub.challenge` GET and an
 * `X-Hub-Signature-256`-signed POST. Anything that breaks Meta's delivery
 * (missing app secret, wrong verify token, an origin Meta cannot reach, a
 * proxy that strips the signature header) breaks these the same way.
 *
 * Decrypted tokens and secrets never leave this module.
 */
import { createHmac } from "node:crypto";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** A probe must never hang the health check — an unreachable host just fails. */
const PROBE_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- environment ------------------------------ */

export type MetaChannel = "messenger" | "instagram";

export interface MetaEnv {
  appId: string | null;
  appSecret: string | null;
  /** The verify token this channel's GET handler actually compares against. */
  verifyToken: string | null;
  /** Name of the variable that supplied `verifyToken`, for the remedy text. */
  verifyTokenSource: string | null;
  /** Every variable name the channel's handler reads, in precedence order. */
  verifyTokenCandidates: string[];
}

/**
 * Resolve the environment exactly the way the webhook handlers resolve it, so
 * the report can never disagree with the code that serves Meta's callbacks.
 * Mirrors `verifyMessengerWebhook` / `verifyInstagramWebhook`.
 */
export function readMetaEnv(channel: MetaChannel): MetaEnv {
  const candidates =
    channel === "messenger"
      ? ["META_WEBHOOK_VERIFY_TOKEN", "MESSENGER_WEBHOOK_VERIFY_TOKEN"]
      : ["META_WEBHOOK_VERIFY_TOKEN", "IG_WEBHOOK_VERIFY_TOKEN"];

  let verifyToken: string | null = null;
  let verifyTokenSource: string | null = null;
  for (const name of candidates) {
    const value = process.env[name];
    if (value) {
      verifyToken = value;
      verifyTokenSource = name;
      break;
    }
  }

  return {
    appId: process.env.META_APP_ID || null,
    appSecret: process.env.META_APP_SECRET || null,
    verifyToken,
    verifyTokenSource,
    verifyTokenCandidates: candidates,
  };
}

/** Hosts Meta cannot call back reliably, so inbound silently never arrives. */
export function isUnreachableHost(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0") ||
    host.endsWith(".local") ||
    host.includes("id-preview--")
  );
}

/** Use the configured public origin when a reverse proxy gives the server an HTTP URL. */
export function publicMetaOrigin(
  requestUrl: string,
  configuredOrigin = process.env.APP_ORIGIN,
): string {
  const requestOrigin = new URL(requestUrl).origin;
  if (!configuredOrigin) return requestOrigin;
  try {
    const configured = new URL(configuredOrigin);
    return configured.protocol === "https:" || configured.protocol === "http:"
      ? configured.origin
      : requestOrigin;
  } catch {
    return requestOrigin;
  }
}

/* --------------------------------- probes -------------------------------- */

export interface ProbeResult {
  ok: boolean;
  /** HTTP status, or null when the endpoint could not be reached at all. */
  status: number | null;
  /** Response body, trimmed and truncated — handlers answer in plain text. */
  body: string;
  /** Set when the request itself failed (DNS, TLS, timeout). */
  transportError: string | null;
}

async function runProbe(url: string, init?: RequestInit): Promise<ProbeResult> {
  try {
    const res = await fetchWithTimeout(url, init);
    const body = (await res.text()).trim().slice(0, 300);
    return { ok: res.ok, status: res.status, body, transportError: null };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `No response within ${PROBE_TIMEOUT_MS / 1000}s`
          : err.message
        : String(err);
    return { ok: false, status: null, body: "", transportError: message };
  }
}

/**
 * Replay Meta's subscription handshake: GET with `hub.mode=subscribe` and a
 * random challenge the endpoint has to echo back verbatim.
 */
export async function probeVerifyChallenge(
  callbackUrl: string,
  verifyToken: string,
): Promise<ProbeResult & { echoed: boolean; challenge: string }> {
  const challenge = `hc-${Math.random().toString(36).slice(2, 12)}`;
  const url = new URL(callbackUrl);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", verifyToken);
  url.searchParams.set("hub.challenge", challenge);

  const result = await runProbe(url.toString(), { method: "GET" });
  return { ...result, challenge, echoed: result.ok && result.body === challenge };
}

/**
 * Replay a real signed delivery.
 *
 * The payload carries an empty `entry` array, so both handlers walk their
 * normal path — signature check, idempotency claim, `processEntries` — and
 * then find nothing to materialise. No conversation, contact or message is
 * ever created by a probe. A nonce keeps each run distinct so it is not
 * dropped as a duplicate redelivery, at the cost of one row in
 * `inbound_webhook_deliveries` per run (the button is manual).
 *
 * What the result tells us, and nothing else can:
 *   500 → `META_APP_SECRET` is not set on the server; every real delivery
 *         from Meta is being refused the same way, which is exactly the
 *         "messages only arrive after a manual Sync" symptom.
 *   401 → the secret is set but does not match the app Meta signs with.
 *   200 → the inbound path is live end to end.
 */
export async function probeSignedDelivery(
  callbackUrl: string,
  channel: MetaChannel,
  appSecret: string,
): Promise<ProbeResult> {
  const body = JSON.stringify({
    object: channel === "messenger" ? "page" : "instagram",
    entry: [],
    // Namespaced so it is obvious in the delivery log that this was us.
    _health_probe: { at: new Date().toISOString(), nonce: Math.random().toString(36).slice(2) },
  });
  const signature = `sha256=${createHmac("sha256", appSecret).update(body, "utf8").digest("hex")}`;

  return await runProbe(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
    },
    body,
  });
}

/* ---------------------------- Graph: app subscriptions -------------------- */

export interface AppSubscription {
  object: string;
  callbackUrl: string | null;
  fields: string[];
  active: boolean;
}

export interface AppSubscriptionsResult {
  ok: boolean;
  subscriptions: AppSubscription[];
  error: string | null;
}

/**
 * GET /{app-id}/subscriptions with an app access token.
 *
 * This is the app-level wiring in the Meta dashboard — the webhook product a
 * Page or IG account is delivered under. A Page can be subscribed to the app
 * and still deliver nothing when the app itself has no `page` / `instagram`
 * subscription carrying the `messages` field, which is the usual reason
 * Instagram DMs never arrive while Messenger (sometimes) does.
 */
export async function readAppSubscriptions(
  appId: string,
  appSecret: string,
): Promise<AppSubscriptionsResult> {
  const token = `${appId}|${appSecret}`;
  const url = `${GRAPH_BASE}/${encodeURIComponent(appId)}/subscriptions?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetchWithTimeout(url);
    const json: {
      data?: Array<{
        object?: string;
        callback_url?: string;
        active?: boolean;
        fields?: Array<{ name?: string } | string>;
      }>;
      error?: { message?: string };
    } = await res.json().catch(() => ({}));

    if (!res.ok || json.error) {
      return {
        ok: false,
        subscriptions: [],
        error: json.error?.message ?? `Meta returned HTTP ${res.status}`,
      };
    }

    const subscriptions = (json.data ?? []).map((row) => ({
      object: String(row.object ?? ""),
      callbackUrl: row.callback_url ?? null,
      active: row.active !== false,
      // Meta returns either [{name, version}] or a bare string list.
      fields: (row.fields ?? [])
        .map((f) => (typeof f === "string" ? f : (f.name ?? "")))
        .filter(Boolean),
    }));

    return { ok: true, subscriptions, error: null };
  } catch (err) {
    return {
      ok: false,
      subscriptions: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** GET /{page-id}/subscribed_apps for a plaintext token. */
export async function readPageSubscriptionWithToken(
  pageId: string,
  token: string,
): Promise<{ ok: boolean; subscribed: boolean; fields: string[]; error: string | null }> {
  try {
    const res = await fetchWithTimeout(
      `${GRAPH_BASE}/${encodeURIComponent(pageId)}/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(token)}`,
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
  } catch (err) {
    return {
      ok: false,
      subscribed: false,
      fields: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Introspect a plaintext token: validity, expiry and granted scopes. */
export async function debugToken(
  token: string,
  appId: string | null,
  appSecret: string | null,
): Promise<{
  ok: boolean;
  isValid: boolean | null;
  expiresAt: string | null;
  scopes: string[];
  error: string | null;
}> {
  // An app access token is the correct inspector; fall back to self-inspection
  // when the app credentials are not configured (the app-secret check already
  // reports that separately, so this must not fail the whole account).
  const inspector = appId && appSecret ? `${appId}|${appSecret}` : token;
  try {
    const res = await fetchWithTimeout(
      `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(inspector)}`,
    );
    const json: {
      data?: {
        is_valid?: boolean;
        expires_at?: number;
        scopes?: string[];
        error?: { message?: string };
      };
      error?: { message?: string };
    } = await res.json().catch(() => ({}));

    if (!res.ok || json.error) {
      return {
        ok: false,
        isValid: null,
        expiresAt: null,
        scopes: [],
        error: json.error?.message ?? `Meta returned HTTP ${res.status}`,
      };
    }

    const info = json.data ?? {};
    return {
      ok: true,
      isValid: info.is_valid ?? null,
      // 0 means "never expires" for Page tokens, not "expired at the epoch".
      expiresAt:
        typeof info.expires_at === "number" && info.expires_at > 0
          ? new Date(info.expires_at * 1000).toISOString()
          : null,
      scopes: info.scopes ?? [],
      error: info.error?.message ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      isValid: null,
      expiresAt: null,
      scopes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
