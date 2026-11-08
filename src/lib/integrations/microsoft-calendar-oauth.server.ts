/** App-owned Microsoft Calendar OAuth. Credentials and refresh tokens remain server-side. */
const scopes = ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.ReadWrite"];

function config() {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  if (!clientId || !clientSecret) throw new Error("Configure MICROSOFT_CALENDAR_CLIENT_ID and MICROSOFT_CALENDAR_CLIENT_SECRET on the server");
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) throw new Error("Invalid Microsoft tenant");
  return { clientId, clientSecret, tenant };
}

export function microsoftCalendarCallback(origin: string) {
  return `${new URL(origin).origin}/api/public/booking/microsoft-calendar/callback`;
}

export function microsoftCalendarAuthorizationUrl(origin: string, state: string) {
  const { clientId, tenant } = config();
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: microsoftCalendarCallback(origin), response_mode: "query", scope: scopes.join(" "), state }).toString();
  return url.toString();
}

async function tokenRequest(params: URLSearchParams) {
  const { tenant } = config();
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params,
  });
  if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status})`);
  const token = await response.json() as { access_token?: string; refresh_token?: string };
  if (!token.access_token) throw new Error("Microsoft did not return an access token");
  return token;
}

export async function exchangeMicrosoftCalendarCode(code: string, origin: string) {
  const { clientId, clientSecret } = config();
  return tokenRequest(new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: microsoftCalendarCallback(origin), grant_type: "authorization_code", scope: scopes.join(" ") }));
}

export async function microsoftAccessTokenFromRefreshToken(refreshToken: string) {
  const { clientId, clientSecret } = config();
  const token = await tokenRequest(new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token", scope: scopes.join(" ") }));
  return token.access_token!;
}

export async function microsoftGraphFetch(refreshToken: string, path: string, init?: RequestInit) {
  if (!path.startsWith("/me") || path.startsWith("//")) throw new Error("Unsupported Microsoft Graph path");
  const accessToken = await microsoftAccessTokenFromRefreshToken(refreshToken);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers });
}
