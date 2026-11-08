import { createFileRoute } from "@tanstack/react-router";
import { sbAny } from "@/lib/supabase/untyped";

function popupResult(origin: string, success: boolean): Response {
  const payload = JSON.stringify({ type: "wacrm:google-workspace-oauth", success }).replace(/</g, "\\u003c");
  const target = JSON.stringify(origin).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>Google Workspace</title><p>${success ? "Google account connected. You can close this window." : "Google connection failed. Close this window and try again."}</p><script>window.opener?.postMessage(${payload},${target});window.close();</script>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const Route = createFileRoute("/api/public/integrations/google-workspace/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const canonical = new URL(process.env.APP_ORIGIN || request.url).origin;
        const query = new URL(request.url).searchParams;
        const state = query.get("state") ?? "";
        if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(state)) return popupResult(canonical, false);
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: row, error } = await sbAny(supabaseAdmin)
          .from("integration_oauth_states")
          .delete()
          .eq("state", state)
          .eq("provider_id", "google-workspace")
          .select("workspace_id,user_id,return_origin,expires_at")
          .maybeSingle();
        if (error || !row || new Date(row.expires_at).getTime() < Date.now() || row.return_origin !== canonical)
          return popupResult(canonical, false);
        const code = query.get("code");
        if (!code || query.has("error")) return popupResult(canonical, false);
        try {
          const { exchangeGoogleWorkspaceCode } = await import("@/lib/integrations/google-oauth.server");
          const { encryptConnectorSecret } = await import("@/lib/integrations/connector-config.server");
          const token = await exchangeGoogleWorkspaceCode(code, canonical);
          if (!token.refresh_token) throw new Error("Google did not grant offline access");
          const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${token.access_token}` },
          });
          if (!userInfo.ok) throw new Error(`Google account lookup failed (${userInfo.status})`);
          const { z } = await import("zod");
          const { email } = z.object({ email: z.string().email() }).parse(await userInfo.json());
          const { error: saveError } = await sbAny(supabaseAdmin).from("installed_integrations").upsert({
            workspace_id: row.workspace_id,
            user_id: row.user_id,
            provider_id: "google-workspace",
            account_email: email,
            connection_key_cipher: encryptConnectorSecret(token.refresh_token),
            status: "active",
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "workspace_id,provider_id,user_id" });
          if (saveError) throw new Error(saveError.message);
          return popupResult(canonical, true);
        } catch (cause) {
          console.error("Google Workspace OAuth callback failed", cause);
          return popupResult(canonical, false);
        }
      },
    },
  },
});
