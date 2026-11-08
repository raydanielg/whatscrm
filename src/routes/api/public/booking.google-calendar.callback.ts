import { createFileRoute } from "@tanstack/react-router";
import { sbAny } from "@/lib/supabase/untyped";

function popupResult(origin: string, success: boolean): Response {
  const payload = JSON.stringify({ type: "wacrm:calendar-oauth", provider: "google", success }).replace(/</g, "\\u003c");
  const target = JSON.stringify(origin).replace(/</g, "\\u003c");
  return new Response(`<!doctype html><meta charset="utf-8"><title>Google Calendar</title><p>${success ? "Calendar connected." : "Calendar connection failed."}</p><script>window.opener?.postMessage(${payload},${target});window.close();</script>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const Route = createFileRoute("/api/public/booking/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(process.env.APP_ORIGIN || request.url).origin;
        const query = new URL(request.url).searchParams;
        const state = query.get("state") ?? "";
        if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(state)) return popupResult(origin, false);
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const db = sbAny(supabaseAdmin);
        const { data: row, error } = await db.from("integration_oauth_states")
          .delete().eq("state", state).eq("provider_id", "google-calendar")
          .select("workspace_id,user_id,return_origin,expires_at").maybeSingle();
        if (error || !row || row.return_origin !== origin || new Date(row.expires_at).getTime() < Date.now())
          return popupResult(origin, false);
        const code = query.get("code");
        if (!code || query.has("error")) return popupResult(origin, false);
        try {
          const { exchangeGoogleCalendarCode } = await import("@/lib/integrations/google-oauth.server");
          const { encryptConnectorSecret } = await import("@/lib/integrations/connector-config.server");
          const token = await exchangeGoogleCalendarCode(code, origin);
          if (!token.refresh_token) throw new Error("Google did not grant offline access");
          const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${token.access_token}` },
          });
          if (!profile.ok) throw new Error(`Google account lookup failed (${profile.status})`);
          const { z } = await import("zod");
          const { email } = z.object({ email: z.string().email() }).parse(await profile.json());
          const ciphertext = encryptConnectorSecret(token.refresh_token);
          const { data: existing } = await db.from("calendar_accounts")
            .select("id").eq("user_id", row.user_id).eq("provider", "google").eq("account_email", email).maybeSingle();
          const payload = {
            workspace_id: row.workspace_id, user_id: row.user_id, provider: "google",
            account_email: email, display_name: email, calendar_id: "primary",
            connection_key_ciphertext: ciphertext, status: "connected", enabled: true,
            scopes: ["https://www.googleapis.com/auth/calendar"],
            last_sync_error: null, updated_at: new Date().toISOString(),
          };
          const result = existing
            ? await db.from("calendar_accounts").update(payload).eq("id", existing.id)
            : await db.from("calendar_accounts").insert({ ...payload, is_primary: true });
          if (result.error) throw new Error(result.error.message);
          return popupResult(origin, true);
        } catch (cause) {
          console.error("Google Calendar OAuth callback failed", cause);
          return popupResult(origin, false);
        }
      },
    },
  },
});
