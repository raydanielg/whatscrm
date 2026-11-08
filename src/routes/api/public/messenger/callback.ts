/**
 * Meta OAuth callback for Facebook Messenger (Pages) linking.
 *
 * Exchanges the short-lived code for a user token, upgrades to a long-lived
 * token, lists the user's Facebook Pages, and persists each page (with its
 * page access token) to `messenger_accounts`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getPlatformBranding } from "@/lib/admin/platform-branding.functions";
import { encryptToken } from "@/lib/instagram/token-crypto.server";
import { sbAny } from "@/lib/supabase/untyped";

const GRAPH = "https://graph.facebook.com/v21.0";

function esc(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
function safeReturn(url: string) {
  // Only allow same-origin absolute paths to prevent open redirect / javascript: schemes.
  return /^\/[^/\\]/.test(url) ? url : "/settings";
}
async function html(title: string, message: string, returnTo: string, ok: boolean) {
  const t = esc(title);
  const m = esc(message);
  const r = safeReturn(returnTo);
  const rHtml = esc(r);
  const brandName = esc((await getPlatformBranding()).platformName);
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title>
<style>body{font-family:-apple-system,Inter,system-ui,sans-serif;background:#0b0b0d;color:#f6f6f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#141418;border:1px solid #26262c;border-radius:8px;padding:32px;max-width:420px;text-align:center}.ok{color:#22c55e}.err{color:#ef4444}a{color:#075e54;text-decoration:none;font-weight:600}</style>
</head><body><div class="card"><h1 class="${ok ? "ok" : "err"}">${t}</h1><p>${m}</p><p><a href="${rHtml}">Return to ${brandName} →</a></p><script>setTimeout(()=>{try{window.opener&&window.opener.postMessage({type:"messenger-oauth",ok:${ok ? "true" : "false"}},"*");}catch(e){}if(window.opener){setTimeout(()=>window.close(),1200)}else{location.href=${JSON.stringify(r)}}},600)</script></div></body></html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (error) return html("Messenger link cancelled", error, "/settings", false);
  if (!code || !state)
    return html("Missing OAuth params", "Meta did not return a code.", "/settings", false);

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return html(
      "Not configured",
      "META_APP_ID or META_APP_SECRET is missing. Add them in project secrets.",
      "/settings",
      false,
    );
  }

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

  const { data: stateRow, error: stateErr } = await supabaseAdmin
    .from("messenger_oauth_states")
    .select("workspace_id, user_id, redirect_uri, return_to, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (stateErr || !stateRow)
    return html("Invalid state", "OAuth session expired or unknown.", "/settings", false);
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await sbAny(supabaseAdmin).from("messenger_oauth_states").delete().eq("state", state);
    return html(
      "Expired",
      "OAuth session expired. Please try again.",
      stateRow.return_to || "/settings",
      false,
    );
  }
  await sbAny(supabaseAdmin).from("messenger_oauth_states").delete().eq("state", state);

  // 1) Short-lived user token
  const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", stateRow.redirect_uri);
  tokenUrl.searchParams.set("code", code);
  const tokRes = await fetch(tokenUrl.toString());
  const tokJson: any = await tokRes.json();
  if (!tokRes.ok || !tokJson.access_token) {
    return html(
      "Token exchange failed",
      tokJson.error?.message ?? "Meta rejected the code.",
      stateRow.return_to || "/settings",
      false,
    );
  }

  // 2) Long-lived token
  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", tokJson.access_token);
  const longRes = await fetch(longUrl.toString());
  const longJson: any = await longRes.json();
  const userToken: string = longJson.access_token ?? tokJson.access_token;
  const expiresIn: number | null = longJson.expires_in ?? tokJson.expires_in ?? null;

  // 3) Pages
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,category,access_token,picture{data{url}}&access_token=${encodeURIComponent(userToken)}`,
  );
  const pagesJson: any = await pagesRes.json();
  if (!pagesRes.ok) {
    return html(
      "Failed to list Pages",
      pagesJson.error?.message ?? "Meta refused Pages listing.",
      stateRow.return_to || "/settings",
      false,
    );
  }

  const pages: any[] = pagesJson.data ?? [];
  if (pages.length === 0) {
    return html(
      "No Facebook Pages found",
      "The selected Facebook account manages no Pages. Create or get admin access to a Page and retry.",
      stateRow.return_to || "/settings",
      false,
    );
  }

  const nowIso = new Date().toISOString();
  const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const rows = pages.map((p) => ({
    workspace_id: stateRow.workspace_id,
    page_id: p.id,
    page_name: p.name ?? null,
    category: p.category ?? null,
    profile_picture_url: p.picture?.data?.url ?? null,
    access_token_ciphertext: encryptToken(p.access_token as string),
    token_expires_at: tokenExpiresAt,
    scopes: ["pages_show_list", "pages_messaging", "pages_manage_metadata"],
    status: "connected",
    status_reason: null,
    connected_by: stateRow.user_id,
    last_verified_at: nowIso,
    metadata: { linked_via: "meta_oauth" },
  }));

  const { error: upErr } = await supabaseAdmin
    .from("messenger_accounts")
    .upsert(rows, { onConflict: "workspace_id,page_id" });
  if (upErr) return html("Save failed", upErr.message, stateRow.return_to || "/settings", false);

  // Without an app subscription on each Page, Meta sends no webhooks and the
  // Inbox never updates. Best-effort: the Pages panel can re-arm it later.
  const { setPageSubscription } = await import("@/lib/messenger/capabilities.server");
  await Promise.all(
    rows.map(async (r) => {
      const res = await setPageSubscription(r.page_id, r.access_token_ciphertext, true).catch(
        (e: Error) => ({ ok: false, error: e.message }),
      );
      if (!res.ok)
        console.warn("[messenger-oauth] page subscription failed:", r.page_id, res.error);
    }),
  );

  return html(
    "Messenger connected",
    `Linked ${rows.length} Facebook Page${rows.length === 1 ? "" : "s"}. You can close this window.`,
    stateRow.return_to || "/settings",
    true,
  );
}

export const Route = createFileRoute("/api/public/messenger/callback")({
  server: { handlers: { GET: handler } },
});
