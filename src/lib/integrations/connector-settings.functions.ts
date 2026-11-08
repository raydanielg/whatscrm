import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

async function assertSuperadmin(client: Parameters<typeof sbAny>[0], userId: string) {
  const { data, error } = await sbAny(client)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (error) throw new Error("Unable to verify platform role");
  if (!data) throw new Error("Only a superadmin can configure platform integrations");
}

export const getGoogleConnectorSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { googleOAuthConfig } = await import("./connector-config.server");
    const config = await googleOAuthConfig();
    const secret = process.env.APP_USER_CONNECTION_KEY_SECRET;
    return {
      clientConfigured: !!config.clientId,
      gatewayConfigured: !!config.clientSecret,
      encryptionConfigured: !!secret && Buffer.from(secret, "base64").length === 32,
    };
  });

export const saveGoogleConnectorSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) =>
    z
      .object({
        clientAPIKey: z.string().trim().max(8192).optional(),
        backendAPIKey: z.string().trim().max(8192).optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { googleOAuthConfig, encryptConnectorSecret } = await import("./connector-config.server");
    const current = await googleOAuthConfig();
    const client = data.clientAPIKey || current.clientId;
    const backend = data.backendAPIKey || current.clientSecret;
    if (!client || !backend)
      throw new Error("Both the Google OAuth client ID and client secret are required");
    const payload = {
      provider_id: "google-workspace",
      client_id_cipher: encryptConnectorSecret(client),
      client_secret_cipher: encryptConnectorSecret(backend),
      updated_at: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin).from("google_oauth_settings").upsert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGoogleConnectorSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin)
      .from("google_oauth_settings")
      .delete()
      .eq("provider_id", "google-workspace");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
