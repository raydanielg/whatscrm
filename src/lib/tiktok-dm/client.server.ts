/**
 * TikTok API for Business calls used by Business Messaging, plus token
 * storage/refresh for `tiktok_business_accounts`.
 *
 * Access tokens live ~24h and refresh tokens ~30 days; `validAccessToken`
 * refreshes on demand and flags the account for reauthorization when the
 * refresh token is gone.
 */
import { decryptToken, encryptToken } from "@/lib/instagram/token-crypto.server";
import type { Admin, FetchImpl } from "@/lib/social-inbox/platforms.server";
import { TIKTOK_BUSINESS_API_BASE, explainTikTokDmError, tiktokSendTextBody } from "./protocol";

export const TIKTOK_DM_ENV = ["TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET"] as const;

export function tiktokDmAppCreds(): { appId: string; secret: string } | null {
  const appId = process.env.TIKTOK_BUSINESS_APP_ID?.trim();
  const secret = process.env.TIKTOK_BUSINESS_APP_SECRET?.trim();
  return appId && secret ? { appId, secret } : null;
}

function requireCreds() {
  const creds = tiktokDmAppCreds();
  if (!creds) throw new Error("TIKTOK_BUSINESS_APP_ID and TIKTOK_BUSINESS_APP_SECRET are not set on the server.");
  return creds;
}

interface ApiEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown; token?: string },
  fetchImpl: FetchImpl = fetch,
): Promise<T> {
  const url = new URL(`${TIKTOK_BUSINESS_API_BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetchImpl(url.toString(), {
    method: init.method,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { "Access-Token": init.token } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || json.code !== 0) {
    throw new Error(explainTikTokDmError(json.code ?? res.status, json.message ?? res.statusText));
  }
  return json.data as T;
}

export interface TikTokTokenData {
  open_id: string;
  scope?: string;
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

const inSeconds = (s: number | undefined) =>
  typeof s === "number" && s > 0 ? new Date(Date.now() + s * 1000).toISOString() : null;

export async function exchangeTikTokDmCode(code: string, redirectUri: string, fetchImpl?: FetchImpl) {
  const { appId, secret } = requireCreds();
  return call<TikTokTokenData>(
    "/tt_user/oauth2/token/",
    {
      method: "POST",
      body: {
        client_id: appId,
        client_secret: secret,
        grant_type: "authorization_code",
        auth_code: code,
        redirect_uri: redirectUri,
      },
    },
    fetchImpl,
  );
}

export async function fetchTikTokBusinessProfile(businessId: string, token: string, fetchImpl?: FetchImpl) {
  return call<{ username?: string; display_name?: string; profile_image?: string }>(
    "/business/get/",
    {
      method: "GET",
      token,
      query: { business_id: businessId, fields: JSON.stringify(["username", "display_name", "profile_image"]) },
    },
    fetchImpl,
  );
}

export function tokenColumns(t: TikTokTokenData) {
  return {
    access_token: encryptToken(t.access_token),
    refresh_token: t.refresh_token ? encryptToken(t.refresh_token) : null,
    expires_at: inSeconds(t.expires_in),
    refresh_expires_at: inSeconds(t.refresh_token_expires_in),
  };
}

export interface TikTokBusinessAccountRow {
  id: string;
  workspace_id: string;
  business_id: string;
  username: string | null;
  display_name: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  status: string;
}

export async function validAccessToken(
  admin: Admin,
  row: TikTokBusinessAccountRow,
  fetchImpl?: FetchImpl,
): Promise<string> {
  const fresh = !row.expires_at || new Date(row.expires_at).getTime() > Date.now() + 5 * 60 * 1000;
  if (fresh) return decryptToken(row.access_token);

  const refreshUsable =
    row.refresh_token && (!row.refresh_expires_at || new Date(row.refresh_expires_at).getTime() > Date.now());
  if (!refreshUsable) {
    await admin
      .from("tiktok_business_accounts")
      .update({ status: "reauth_required", last_error: "TikTok authorization expired. Reconnect the account." })
      .eq("id", row.id);
    throw new Error("TikTok authorization expired. Reconnect the TikTok Business account.");
  }

  const { appId, secret } = requireCreds();
  const t = await call<TikTokTokenData>(
    "/tt_user/oauth2/refresh_token/",
    {
      method: "POST",
      body: {
        client_id: appId,
        client_secret: secret,
        grant_type: "refresh_token",
        refresh_token: decryptToken(row.refresh_token!),
      },
    },
    fetchImpl,
  );
  await admin
    .from("tiktok_business_accounts")
    .update({ ...tokenColumns(t), status: "active", last_error: null, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return t.access_token;
}

export async function sendTikTokDmText(args: {
  token: string;
  businessId: string;
  conversationId: string;
  text: string;
  referencedMessageId?: string | null;
  fetchImpl?: FetchImpl;
}): Promise<string | null> {
  const data = await call<{ message?: { message_id?: string } }>(
    "/business/message/send/",
    { method: "POST", token: args.token, body: tiktokSendTextBody(args) },
    args.fetchImpl,
  );
  return data?.message?.message_id ?? null;
}

/** App-level DIRECT_MESSAGE webhook callback (one per TikTok app). */
export async function getTikTokDmWebhook(fetchImpl?: FetchImpl): Promise<string | null> {
  const { appId, secret } = requireCreds();
  const data = await call<{ callback_url?: string } | null>(
    "/business/webhook/list/",
    { method: "GET", query: { app_id: appId, secret, event_type: "DIRECT_MESSAGE" } },
    fetchImpl,
  );
  return data?.callback_url ?? null;
}

export async function setTikTokDmWebhook(callbackUrl: string, fetchImpl?: FetchImpl): Promise<void> {
  const { appId, secret } = requireCreds();
  await call(
    "/business/webhook/update/",
    {
      method: "POST",
      body: { app_id: appId, secret, event_type: "DIRECT_MESSAGE", callback_url: callbackUrl },
    },
    fetchImpl,
  );
}
