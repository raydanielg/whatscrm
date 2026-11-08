/**
 * Provider registry — the single place that maps a provider name to its
 * implementation. Add Twilio / 360dialog here later; nothing else changes.
 */

import type { MessagingProvider, ProviderName, ChannelAccountRecord, ProviderCredentials } from "./types";
import { whatsappCloudProvider } from "./providers/whatsapp-cloud.server";
import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { ProviderError } from "./errors";
import { sbAny } from "@/lib/supabase/untyped";

const registry: Record<ProviderName, MessagingProvider | undefined> = {
  whatsapp_cloud: whatsappCloudProvider,
  twilio: undefined,       // reserved
  dialog360: undefined,    // reserved
  custom: undefined,
};

export function getProvider(name: ProviderName): MessagingProvider {
  const p = registry[name];
  if (!p) throw new ProviderError("validation", `Provider not implemented: ${name}`);
  return p;
}

/** Load a channel account row and return it in normalized shape. */
export async function loadChannelAccount(id: string): Promise<ChannelAccountRecord> {
  const { data, error } = await supabaseAdmin
    .from("channel_accounts" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new ProviderError("not_found", `channel account ${id} not found`);
  const row = data as unknown as {
    id: string; workspace_id: string; provider: ProviderName;
    phone_number_id: string | null; waba_id: string | null; verify_token: string | null;
    webhook_signature_algo: string; access_token_secret_name: string | null;
    app_secret_name: string | null; external_account_id: string | null;
    status: string | null; display_name: string | null; phone_number: string | null;
  };
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    verifyToken: row.verify_token,
    webhookSignatureAlgo: row.webhook_signature_algo ?? "sha256",
    accessTokenSecretName: row.access_token_secret_name,
    appSecretName: row.app_secret_name,
    externalAccountId: row.external_account_id,
    // Selected and mapped so `account.status === "connected"` is a real check.
    status: row.status ?? null,
    displayName: row.display_name ?? null,
    phoneNumber: row.phone_number ?? null,
  };
}

/**
 * Resolve a secret by NAME from the environment.
 *
 * Self-hosted installs frequently misconfigure this in two ways:
 *  - the env var holds the *name* of another env var (indirection), e.g.
 *    `APP_SECRET_NAME=WHATSAPP_APP_SECRET`; we dereference one level.
 *  - the primary name is absent but a conventional alias is present; we try
 *    the fallback names in order.
 */
export function resolveSecretByName(
  primary: string,
  fallbacks: string[] = [],
): string | undefined {
  const names = [primary, ...fallbacks];
  for (const name of names) {
    if (!name) continue;
    let value = process.env[name];
    // One level of indirection: the value is itself a valid env var name.
    if (value && /^[A-Z][A-Z0-9_]{2,}$/.test(value.trim()) && process.env[value.trim()]) {
      value = process.env[value.trim()];
    }
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Resolve provider credentials for a channel account. Access tokens are
 * looked up from environment variables by the secret NAME stored on the
 * account row — never stored in the DB as raw values.
 */
/**
 * Resolve the Meta app secret used for `X-Hub-Signature-256` verification.
 *
 * When the account row names a secret we read EXACTLY that name (with one
 * level of name indirection). Conventional aliases are only consulted when
 * the account has no configured name — otherwise a stale alias would be used
 * to HMAC the payload and every signature check would fail (or, worse, pass
 * against the wrong app).
 */
export function resolveAppSecret(account: ChannelAccountRecord): {
  secret: string | undefined;
  secretName: string;
} {
  const configured = account.appSecretName?.trim();
  if (configured) {
    return { secret: resolveSecretByName(configured), secretName: configured };
  }
  return {
    secret: resolveSecretByName("WHATSAPP_APP_SECRET", ["META_APP_SECRET", "APP_SECRET"]),
    secretName: "WHATSAPP_APP_SECRET",
  };
}

export function loadCredentials(account: ChannelAccountRecord): ProviderCredentials {
  const accessTokenName = account.accessTokenSecretName ?? "WHATSAPP_ACCESS_TOKEN";
  const accessToken = resolveSecretByName(accessTokenName, [
    "WHATSAPP_ACCESS_TOKEN",
    "META_ACCESS_TOKEN",
  ]);
  if (!accessToken) {
    throw new ProviderError("auth", `Missing access token secret: ${accessTokenName}`);
  }
  return {
    accessToken,
    appSecret: resolveAppSecret(account).secret,
    phoneNumberId: account.phoneNumberId ?? undefined,
    wabaId: account.wabaId ?? undefined,
  };
}

/** Route an inbound webhook body to a specific channel_account row. */
export async function routeWebhookToAccount(
  provider: ProviderName,
  body: unknown,
): Promise<ChannelAccountRecord | null> {
  const impl = getProvider(provider);
  const routing = impl.extractAccountRouting?.(body);
  if (!routing) return null;
  const filters: Record<string, string> = { provider };
  if (routing.phoneNumberId) filters.phone_number_id = routing.phoneNumberId;
  if (routing.externalAccountId) filters.external_account_id = routing.externalAccountId;

  let query = sbAny(supabaseAdmin).from("channel_accounts" as never).select("id").eq("provider", provider);
  if (routing.phoneNumberId) query = query.eq("phone_number_id", routing.phoneNumberId);
  if (routing.externalAccountId) query = query.eq("external_account_id", routing.externalAccountId);
  const { data } = await query.limit(1).maybeSingle();
  if (data) return loadChannelAccount((data as { id: string }).id);

  // Meta envelopes without message metadata use entry.id, which is the WABA
  // ID. Older account rows may not have external_account_id populated, so
  // route those events through the canonical waba_id column as a fallback.
  if (provider === "whatsapp_cloud" && routing.externalAccountId) {
    const { data: wabaAccount } = await supabaseAdmin
      .from("channel_accounts" as never)
      .select("id")
      .eq("provider", provider)
      .eq("waba_id", routing.externalAccountId)
      .limit(1)
      .maybeSingle();
    if (wabaAccount) return loadChannelAccount((wabaAccount as { id: string }).id);
  }

  return null;
}
