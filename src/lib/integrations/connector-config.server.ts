import { encryptConnectionKey, decryptConnectionKey } from "@/lib/booking/providers/crypto.server";
import { sbAny } from "@/lib/supabase/untyped";

export function encryptConnectorSecret(value: string): string {
  const secret = process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (!secret || Buffer.from(secret, "base64").length !== 32) {
    throw new Error(
      "An administrator must configure APP_USER_CONNECTION_KEY_SECRET (32 bytes, base64) before storing integration credentials.",
    );
  }
  return encryptConnectionKey(value);
}

export async function googleOAuthConfig() {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data, error } = await sbAny(supabaseAdmin)
    .from("google_oauth_settings")
    .select("client_id_cipher,client_secret_cipher")
    .eq("provider_id", "google-workspace")
    .maybeSingle();
  if (error && error.code !== "PGRST205" && error.code !== "42P01") throw new Error(error.message);
  const clientId = data?.client_id_cipher
    ? decryptConnectionKey(data.client_id_cipher)
    : process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  const clientSecret = data?.client_secret_cipher
    ? decryptConnectionKey(data.client_secret_cipher)
    : process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
  return { clientId, clientSecret };
}
