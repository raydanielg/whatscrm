import { createFileRoute } from "@tanstack/react-router";
import { sbAny } from "@/lib/supabase/untyped";

function popupResult(origin: string, success: boolean): Response {
  const payload = JSON.stringify({ type: "wacrm:calendar-oauth", provider: "microsoft", success }).replace(/</g, "\\u003c");
  const target = JSON.stringify(origin).replace(/</g, "\\u003c");
  return new Response(`<!doctype html><meta charset="utf-8"><title>Microsoft Calendar</title><p>${success ? "Calendar connected." : "Calendar connection failed."}</p><script>window.opener?.postMessage(${payload},${target});window.close();</script>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'", "Referrer-Policy": "no-referrer" },
  });
}

export const Route = createFileRoute("/api/public/booking/microsoft-calendar/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const origin = new URL(process.env.APP_ORIGIN || request.url).origin;
    const query = new URL(request.url).searchParams;
    const state = query.get("state") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(state)) return popupResult(origin, false);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const db = sbAny(supabaseAdmin);
    const { data: row, error } = await db.from("integration_oauth_states")
      .delete().eq("state", state).eq("provider_id", "microsoft-calendar")
      .select("workspace_id,user_id,return_origin,expires_at").maybeSingle();
    if (error || !row || row.return_origin !== origin || new Date(row.expires_at).getTime() < Date.now()) return popupResult(origin, false);
    const code = query.get("code");
    if (!code || query.has("error")) return popupResult(origin, false);
    try {
      const { exchangeMicrosoftCalendarCode } = await import("@/lib/integrations/microsoft-calendar-oauth.server");
      const { encryptConnectorSecret } = await import("@/lib/integrations/connector-config.server");
      const token = await exchangeMicrosoftCalendarCode(code, origin);
      if (!token.refresh_token) throw new Error("Microsoft did not grant offline access");
      const profile = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!profile.ok) throw new Error(`Microsoft account lookup failed (${profile.status})`);
      const me = await profile.json() as { mail?: string; userPrincipalName?: string; displayName?: string };
      const email = me.mail || me.userPrincipalName;
      if (!email) throw new Error("Microsoft account has no email");
      const ciphertext = encryptConnectorSecret(token.refresh_token);
      const { data: existing } = await db.from("calendar_accounts").select("id")
        .eq("user_id", row.user_id).eq("provider", "microsoft").eq("account_email", email).maybeSingle();
      const payload = { workspace_id: row.workspace_id, user_id: row.user_id, provider: "microsoft", account_email: email,
        display_name: me.displayName || email, connection_key_ciphertext: ciphertext, status: "connected", enabled: true,
        scopes: ["User.Read", "Calendars.ReadWrite"], last_sync_error: null, updated_at: new Date().toISOString() };
      const result = existing
        ? await db.from("calendar_accounts").update(payload).eq("id", existing.id)
        : await db.from("calendar_accounts").insert({ ...payload, is_primary: true });
      if (result.error) throw new Error(result.error.message);
      return popupResult(origin, true);
    } catch (cause) { console.error("Microsoft Calendar OAuth callback failed", cause); return popupResult(origin, false); }
  } } },
});
