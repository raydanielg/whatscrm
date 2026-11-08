/** Direct Google Workspace OAuth and API access. Secrets stay on the server. */
import { decryptConnectionKey } from "@/lib/booking/providers/crypto.server";
import { googleOAuthConfig } from "./connector-config.server";

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/contacts.readonly",
];

export function googleWorkspaceCallback(origin: string): string {
  return `${new URL(origin).origin}/api/public/integrations/google-workspace/callback`;
}

export function googleCalendarCallback(origin: string): string {
  return `${new URL(origin).origin}/api/public/booking/google-calendar/callback`;
}

export async function googleWorkspaceAuthorizationUrl(origin: string, state: string): Promise<string> {
  const { clientId, clientSecret } = await googleOAuthConfig();
  if (!clientId || !clientSecret) throw new Error("Configure Google OAuth client ID and secret in Platform Settings → Integrations.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleWorkspaceCallback(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_WORKSPACE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function googleCalendarAuthorizationUrl(origin: string, state: string): Promise<string> {
  const { clientId, clientSecret } = await googleOAuthConfig();
  if (!clientId || !clientSecret) throw new Error("Configure Google OAuth client ID and secret in Platform Settings → Integrations.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleCalendarCallback(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: URLSearchParams): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const data = await response.json() as { access_token?: string; refresh_token?: string };
  if (!data.access_token) throw new Error("Google did not return an access token");
  return { access_token: data.access_token, refresh_token: data.refresh_token };
}

export async function exchangeGoogleWorkspaceCode(code: string, origin: string) {
  const { clientId, clientSecret } = await googleOAuthConfig();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return tokenRequest(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleWorkspaceCallback(origin),
    grant_type: "authorization_code",
  }));
}

export async function exchangeGoogleCalendarCode(code: string, origin: string) {
  const { clientId, clientSecret } = await googleOAuthConfig();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return tokenRequest(new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: googleCalendarCallback(origin), grant_type: "authorization_code",
  }));
}

export async function googleAccessTokenFromRefreshToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = await googleOAuthConfig();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  const token = await tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  }));
  return token.access_token;
}

export async function googleWorkspaceAccessToken(ciphertext: string): Promise<string> {
  const refreshToken = decryptConnectionKey(ciphertext);
  return googleAccessTokenFromRefreshToken(refreshToken);
}

export async function googleWorkspaceFetch(ciphertext: string, path: string, init?: RequestInit): Promise<Response> {
  if (!/^\/(oauth2|gmail|drive|calendar|people)\//.test(path)) throw new Error("Unsupported Google API path");
  const token = await googleWorkspaceAccessToken(ciphertext);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`https://www.googleapis.com${path}`, { ...init, headers });
}
