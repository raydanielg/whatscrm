/**
 * WhatsApp Business Account management — server functions.
 *
 * All endpoints are workspace-scoped: `requireSupabaseAuth` middleware puts
 * an authenticated Supabase client on `context`, and every query goes
 * through RLS (owners/admins manage; members read).
 *
 * Design choices for multi-tenant / multi-account:
 *  - One `channel_accounts` row per (WABA, phone number). Multiple rows per
 *    workspace, multiple rows across workspaces are fully supported.
 *  - Raw access tokens are never persisted. Each row stores the NAME of the
 *    edge secret that holds the token (`access_token_secret_name`).
 *  - Business profile, verification status, and token health are refreshed
 *    on demand by calling Meta's Graph API from the server.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseChannelAccountRows } from "@/lib/messaging/channel-account-schema";

import { assertWritableProvider } from "@/lib/inbox/provider-validation";
import { sbAny } from "@/lib/supabase/untyped";


const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------------------------------------------------------------------------
// list accounts for the current workspace
// ---------------------------------------------------------------------------


/** Admin-only lookup of a channel account's secret column values. */
async function loadAccountSecrets(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  workspaceId: string,
  accountId: string,
  actorId?: string | null,
): Promise<{ verify_token: string | null; access_token_secret_name: string | null; app_secret_name: string | null }> {
  const { data } = await sbAny(supabase).rpc("channel_account_secrets", {
    _workspace_id: workspaceId,
    _account_id: accountId,
  });

  // Audit the secret access
  if (actorId) {
    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "secrets.view",
      severity: "warning",
      workspaceId,
      actorId,
      resourceType: "channel_account",
      resourceId: accountId,
      data: { action: "view_secret_metadata" },
    });
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | { verify_token: string | null; access_token_secret_name: string | null; app_secret_name: string | null }
    | null;
  return row ?? { verify_token: null, access_token_secret_name: null, app_secret_name: null };
}

export const listChannelAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("channel_accounts" as never)
      .select(
        // Secret columns (verify_token / *_secret_name) are admin-only and are
        // merged in below through the permission-checked RPC.
        "id, workspace_id, inbox_id, provider, display_name, phone_number, phone_number_id, waba_id, business_id, status, status_reason, metadata, is_default, last_verified_at, created_at, updated_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: secrets } = await sbAny(context.supabase).rpc("channel_account_secrets" as never, {
      _workspace_id: data.workspaceId,
    } as never);
    
    // Audit mass secret view
    const secretsList = (secrets ?? []) as any[];
    if (secretsList.length > 0) {
      const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
      void recordServerAuditEvent({
        eventType: "secrets.list",
        severity: "warning",
        workspaceId: data.workspaceId,
        actorId: context.userId,
        resourceType: "channel_account",
        data: { count: secretsList.length },
      });
    }

    const secretById = new Map(
      ((secrets ?? []) as Array<{ id: string; verify_token: string | null; access_token_secret_name: string | null; app_secret_name: string | null }>)
        .map((s) => [s.id, s]),
    );
    const merged = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      verify_token: secretById.get(String(r.id))?.verify_token ?? null,
      access_token_secret_name: secretById.get(String(r.id))?.access_token_secret_name ?? null,
      app_secret_name: secretById.get(String(r.id))?.app_secret_name ?? null,
    }));
    // Validate at the boundary: malformed/legacy rows are dropped instead of
    // reaching the inbox, and the response is always `{ accounts: [...] }`.
    const parsed = parseChannelAccountRows(merged, "listChannelAccounts");
    return { accounts: parsed.accounts, invalid: parsed.invalid };
  });


// ---------------------------------------------------------------------------
// connect account — create a channel_accounts row
// ---------------------------------------------------------------------------

const ConnectSchema = z.object({
  workspaceId: z.string().uuid(),
  inboxId: z.string().uuid().optional(),
  displayName: z.string().min(1).max(200),
  phoneNumber: z.string().min(3).max(32).optional(),
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1),
  businessId: z.string().optional(),
  accessTokenSecretName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).max(512),
  appSecretName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).max(512).optional(),
  verifyToken: z.string().min(8).max(128),
  isDefault: z.boolean().optional(),
  // Free-form on purpose: the strict check happens in the handler so unknown
  // values return a descriptive 4xx instead of a generic schema error.
  provider: z.string().max(120).optional(),

});

async function requireWorkspaceAdmin(
  supabase: ReturnType<typeof requireSupabaseAuth extends unknown ? never : never> | any, // eslint-disable-line @typescript-eslint/no-explicit-any
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") throw new Error("Forbidden — workspace admin required");
}

export const connectChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Reject unroutable/unknown providers with a 4xx before any auth-scoped
    // write happens; the default stays WhatsApp Cloud for existing callers.
    const provider = assertWritableProvider(data.provider ?? "whatsapp_cloud");

    await requireWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);

    if (data.isDefault) {
      await context.supabase
        .from("channel_accounts" as never)
        .update({ is_default: false } as never)
        .eq("workspace_id", data.workspaceId);
    }

    const { data: row, error } = await context.supabase
      .from("channel_accounts" as never)
      .insert({
        workspace_id: data.workspaceId,
        inbox_id: data.inboxId ?? null,
        provider,

        display_name: data.displayName,
        phone_number: data.phoneNumber ?? null,
        phone_number_id: data.phoneNumberId,
        waba_id: data.wabaId,
        business_id: data.businessId ?? null,
        access_token_secret_name: data.accessTokenSecretName,
        app_secret_name: data.appSecretName ?? null,
        verify_token: data.verifyToken,
        status: "pending",
        is_default: data.isDefault ?? false,
        created_by: context.userId,
      } as never)
      .select("id, workspace_id, inbox_id, provider, display_name, phone_number, phone_number_id, waba_id, business_id, status, status_reason, metadata, is_default, last_verified_at, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "channel_account.connect",
      severity: "info",
      workspaceId: data.workspaceId,
      actorId: context.userId,
      resourceType: "channel_account",
      resourceId: String((row as any).id),
      data: { provider, phone_number_id: data.phoneNumberId },
    });

    return { account: row };
  });

// ---------------------------------------------------------------------------
// update account (rename, reassign inbox, change secret names, disable/enable)
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(200).optional(),
  inboxId: z.string().uuid().nullable().optional(),
  accessTokenSecretName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).max(512).optional(),
  appSecretName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).max(512).nullable().optional(),
  verifyToken: z.string().min(8).max(128).optional(),
  isDefault: z.boolean().optional(),
  // Strictly checked in the handler (clear 4xx for unknown values).
  provider: z.string().max(120).optional(),
});

export const updateChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const provider =
      data.provider === undefined ? undefined : assertWritableProvider(data.provider);

    const { data: existing } = await context.supabase
      .from("channel_accounts" as never)
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Not found");
    const ws = (existing as { workspace_id: string }).workspace_id;
    await requireWorkspaceAdmin(context.supabase, ws, context.userId);

    if (data.isDefault) {
      await context.supabase
        .from("channel_accounts" as never)
        .update({ is_default: false } as never)
        .eq("workspace_id", ws)
        .neq("id", data.id);
    }

    const patch: Record<string, unknown> = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.inboxId !== undefined) patch.inbox_id = data.inboxId;
    if (data.accessTokenSecretName !== undefined) patch.access_token_secret_name = data.accessTokenSecretName;
    if (data.appSecretName !== undefined) patch.app_secret_name = data.appSecretName;
    if (data.verifyToken !== undefined) patch.verify_token = data.verifyToken;
    if (data.isDefault !== undefined) patch.is_default = data.isDefault;
    if (provider !== undefined) patch.provider = provider;


    const { data: row, error } = await context.supabase
      .from("channel_accounts" as never)
      .update(patch as never)
      .eq("id", data.id)
      .select("id, workspace_id, inbox_id, provider, display_name, phone_number, phone_number_id, waba_id, business_id, status, status_reason, metadata, is_default, last_verified_at, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    const rotatesSecrets = data.accessTokenSecretName !== undefined || data.appSecretName !== undefined || data.verifyToken !== undefined;
    
    void recordServerAuditEvent({
      eventType: rotatesSecrets ? "secrets.rotate" : "channel_account.update",
      severity: rotatesSecrets ? "warning" : "info",
      workspaceId: ws,
      actorId: context.userId,
      resourceType: "channel_account",
      resourceId: data.id,
      data: { 
        updated_fields: Object.keys(patch),
        rotates_secrets: rotatesSecrets 
      },
    });

    return { account: row };
  });

// ---------------------------------------------------------------------------
// disconnect — mark as disconnected, preserve history
// ---------------------------------------------------------------------------

export const disconnectChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("channel_accounts" as never)
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Not found");
    await requireWorkspaceAdmin(context.supabase, (existing as { workspace_id: string }).workspace_id, context.userId);

    const { error } = await context.supabase
      .from("channel_accounts" as never)
      .update({ status: "disconnected", status_reason: "manually disconnected" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("channel_accounts" as never)
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Not found");
    await requireWorkspaceAdmin(context.supabase, (existing as { workspace_id: string }).workspace_id, context.userId);

    const { error } = await context.supabase
      .from("channel_accounts" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Meta Graph helpers (server-only, called inside handlers)
// ---------------------------------------------------------------------------

async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = (body as { error?: { message?: string } } | null)?.error?.message ?? `Graph ${res.status}`;
    const e = new Error(err) as Error & { status?: number; raw?: unknown };
    e.status = res.status;
    e.raw = body;
    throw e;
  }
  return body as T;
}

async function graphPost<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const err = (parsed as { error?: { message?: string } } | null)?.error?.message ?? `Graph ${res.status}`;
    throw new Error(err);
  }
  return parsed as T;
}

/**
 * Structured, human-actionable diagnosis of a connection failure so the UI can
 * say exactly which field/secret is wrong and where to fix it.
 */
export interface ConnectionDiagnosis {
  /** The thing the user must fix. */
  field:
    | "access_token_secret"
    | "access_token_value"
    | "permissions"
    | "phone_number_id"
    | "waba_id"
    | "app_secret"
    | "unknown";
  /** Short label of the field as shown in the UI. */
  fieldLabel: string;
  /** Where in WACRM / Meta to fix it. */
  where: string;
  /** Step-by-step fix. */
  fix: string;
  /** Raw provider message, for the details section. */
  raw: string;
}

class MissingSecretError extends Error {
  constructor(public secretName: string) {
    super(
      `Access token secret "${secretName}" is not set. Add it under Cloud → Secrets (Settings → WhatsApp → Advanced shows which name this account uses).`,
    );
    this.name = "MissingSecretError";
  }
}

export function diagnoseConnectionError(
  err: unknown,
  ctx: { secretName: string; phoneNumberId?: string | null; wabaId?: string | null },
): ConnectionDiagnosis {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (err instanceof MissingSecretError || lower.includes("is not set")) {
    return {
      field: "access_token_secret",
      fieldLabel: `Access token secret (${ctx.secretName})`,
      where: "Cloud → Secrets",
      fix: `Create a secret named exactly ${ctx.secretName} and paste your permanent Meta System User token as its value. The name must match the "Access token secret name" field on this account (Settings → WhatsApp → Edit account → Advanced).`,
      raw,
    };
  }

  if (
    lower.includes("access token") ||
    lower.includes("session has expired") ||
    lower.includes("oauthexception") && lower.includes("invalid")
  ) {
    return {
      field: "access_token_value",
      fieldLabel: `Access token value (stored in ${ctx.secretName})`,
      where: "Meta Business Settings → System Users, then Cloud → Secrets",
      fix: `The token stored in ${ctx.secretName} is expired or invalid. Generate a new permanent System User token in Meta (Business Settings → System Users → Generate new token) and update the ${ctx.secretName} secret with the new value.`,
      raw,
    };
  }

  if (lower.includes("permission") || lower.includes("scope") || lower.includes("(#200)")) {
    return {
      field: "permissions",
      fieldLabel: "Meta token permissions",
      where: "Meta Business Settings → System Users → Generate new token",
      fix: "Regenerate the token with both whatsapp_business_messaging and whatsapp_business_management selected, and make sure the System User is assigned to your app AND your WhatsApp Business Account as an asset. Then update the secret value.",
      raw,
    };
  }

  if (
    lower.includes("unsupported get request") ||
    lower.includes("does not exist") ||
    lower.includes("cannot be loaded") ||
    lower.includes("(#100)")
  ) {
    return {
      field: "phone_number_id",
      fieldLabel: "Phone number ID",
      where: "Settings → WhatsApp → Edit account (Phone number ID)",
      fix: `Meta could not load ID ${ctx.phoneNumberId ?? "(empty)"}. Copy the Phone number ID (not the phone number itself) from Meta App Dashboard → WhatsApp → API Setup and paste it into the Phone number ID field. Check the WABA ID ${ctx.wabaId ?? "(empty)"} in the same place.`,
      raw,
    };
  }

  return {
    field: "unknown",
    fieldLabel: "WhatsApp connection",
    where: "Settings → WhatsApp → Edit account, and Cloud → Secrets",
    fix: "Meta rejected the request. Verify the Phone number ID, WABA ID, and that the access token secret holds a current System User token with WhatsApp permissions.",
    raw,
  };
}

function readAccessToken(secretName: string | null | undefined): string {
  const name = secretName ?? "WHATSAPP_ACCESS_TOKEN";
  const token = process.env[name];
  if (!token || token.trim() === "") throw new MissingSecretError(name);
  return token;
}

// ---------------------------------------------------------------------------
// test / reconnect — probe Meta and refresh status
// ---------------------------------------------------------------------------

interface PhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  quality_rating?: string;
  name_status?: string;
  platform_type?: string;
  throughput?: { level?: string };
}

interface DebugTokenInfo {
  data?: {
    app_id?: string;
    application?: string;
    expires_at?: number;
    is_valid?: boolean;
    scopes?: string[];
    error?: { message?: string };
  };
}

export const testChannelAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: acc } = await context.supabase
      .from("channel_accounts" as never)
      .select("id, workspace_id, provider, phone_number_id, waba_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!acc) throw new Error("Not found");
    const row = acc as unknown as {
      id: string; workspace_id: string; provider: string;
      phone_number_id: string | null; waba_id: string | null;
    };
    await requireWorkspaceAdmin(context.supabase, row.workspace_id, context.userId);

    const accSecrets = await loadAccountSecrets(context.supabase as never, row.workspace_id, data.id);
    const secretName = accSecrets.access_token_secret_name ?? "WHATSAPP_ACCESS_TOKEN";
    let token: string;
    try { token = readAccessToken(accSecrets.access_token_secret_name); }
    catch (err) {
      const diagnosis = diagnoseConnectionError(err, {
        secretName,
        phoneNumberId: row.phone_number_id,
        wabaId: row.waba_id,
      });
      await sbAny(context.supabase).from("channel_accounts" as never).update({
        status: "error", status_reason: diagnosis.raw,
      } as never).eq("id", row.id);
      return { ok: false, error: diagnosis.raw, diagnosis };
    }

    try {
      const phone = await graphGet<PhoneNumberInfo>(
        `/${row.phone_number_id}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,name_status,platform_type,throughput`,
        token,
      );
      let tokenInfo: DebugTokenInfo | null = null;
      try {
        tokenInfo = await graphGet<DebugTokenInfo>(
          `/debug_token?input_token=${encodeURIComponent(token)}`,
          token,
        );
      } catch {
        // debug_token may require app access token; ignore
      }
      const expiresAt = tokenInfo?.data?.expires_at
        ? new Date(tokenInfo.data.expires_at * 1000).toISOString()
        : null;
      const isValid = tokenInfo?.data?.is_valid ?? true;

      // A valid phone/token does not make inbound messaging operational by
      // itself. Meta only delivers WABA webhooks after the app is subscribed.
      // Establish that subscription as part of verification so an account
      // cannot be marked connected while the Inbox receives nothing.
      if (isValid && row.waba_id) {
        try {
          await graphPost<{ success?: boolean }>(
            `/${row.waba_id}/subscribed_apps`,
            token,
            {},
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unable to subscribe the app to this WABA";
          await sbAny(context.supabase).from("channel_accounts" as never).update({
            status: "error",
            status_reason: `Webhook subscription failed: ${message}`,
          } as never).eq("id", row.id);
          return {
            ok: false as const,
            error: message,
            diagnosis: {
              field: "permissions" as const,
              fieldLabel: "Meta webhook subscription",
              where: "Meta Business Settings → System Users → Generate new token",
              raw: message,
              fix: "Grant the token whatsapp_business_management permission, then verify the account again.",
            },
            phone,
            tokenExpiresAt: expiresAt,
          };
        }
      }

      const status = isValid ? "connected" : "error";
      await sbAny(context.supabase).from("channel_accounts" as never).update({
        status,
        status_reason: isValid ? null : (tokenInfo?.data?.error?.message ?? "token invalid"),
        phone_number: phone.display_phone_number ?? undefined,
        last_verified_at: new Date().toISOString(),
        metadata: {
          verified_name: phone.verified_name,
          code_verification_status: phone.code_verification_status,
          quality_rating: phone.quality_rating,
          name_status: phone.name_status,
          platform_type: phone.platform_type,
          throughput: phone.throughput,
          token_expires_at: expiresAt,
          token_scopes: tokenInfo?.data?.scopes ?? null,
        },
      } as never).eq("id", row.id);

      if (!isValid) {
        const diagnosis = diagnoseConnectionError(
          new Error(tokenInfo?.data?.error?.message ?? "Access token is no longer valid"),
          { secretName, phoneNumberId: row.phone_number_id, wabaId: row.waba_id },
        );
        return { ok: false as const, error: diagnosis.raw, diagnosis, phone, tokenExpiresAt: expiresAt };
      }
      return { ok: true as const, phone, tokenExpiresAt: expiresAt };
    } catch (err) {
      const diagnosis = diagnoseConnectionError(err, {
        secretName,
        phoneNumberId: row.phone_number_id,
        wabaId: row.waba_id,
      });
      await sbAny(context.supabase).from("channel_accounts" as never).update({
        status: "error", status_reason: diagnosis.raw,
      } as never).eq("id", row.id);
      return { ok: false, error: diagnosis.raw, diagnosis };
    }
  });

// ---------------------------------------------------------------------------
// business profile — get / update
// ---------------------------------------------------------------------------

interface BusinessProfileResponse {
  data?: Array<{
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    messaging_product?: string;
    profile_picture_url?: string;
    websites?: string[];
    vertical?: string;
  }>;
}

const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";

export const fetchBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: acc } = await context.supabase
      .from("channel_accounts" as never)
      .select("workspace_id, phone_number_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!acc) throw new Error("Not found");
    const row = acc as unknown as { workspace_id: string; phone_number_id: string };
    await requireWorkspaceAdmin(context.supabase, row.workspace_id, context.userId);

    const token = readAccessToken(
      (await loadAccountSecrets(context.supabase as never, row.workspace_id, data.id)).access_token_secret_name,
    );
    const res = await graphGet<BusinessProfileResponse>(
      `/${row.phone_number_id}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
      token,
    );
    return { profile: res.data?.[0] ?? null };
  });

const UpdateProfileSchema = z.object({
  id: z.string().uuid(),
  about: z.string().max(139).optional(),
  address: z.string().max(256).optional(),
  description: z.string().max(512).optional(),
  email: z.string().email().max(128).optional(),
  websites: z.array(z.string().url()).max(2).optional(),
  vertical: z.enum([
    "UNDEFINED","OTHER","AUTO","BEAUTY","APPAREL","EDU","ENTERTAIN","EVENT_PLAN",
    "FINANCE","GROCERY","GOVT","HOTEL","HEALTH","NONPROFIT","PROF_SERVICES",
    "RETAIL","TRAVEL","RESTAURANT","NOT_A_BIZ",
  ]).optional(),
});

export const updateBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpdateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: acc } = await context.supabase
      .from("channel_accounts" as never)
      .select("workspace_id, phone_number_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!acc) throw new Error("Not found");
    const row = acc as unknown as { workspace_id: string; phone_number_id: string };
    await requireWorkspaceAdmin(context.supabase, row.workspace_id, context.userId);

    const token = readAccessToken(
      (await loadAccountSecrets(context.supabase as never, row.workspace_id, data.id)).access_token_secret_name,
    );
    const payload: Record<string, unknown> = { messaging_product: "whatsapp" };
    if (data.about !== undefined) payload.about = data.about;
    if (data.address !== undefined) payload.address = data.address;
    if (data.description !== undefined) payload.description = data.description;
    if (data.email !== undefined) payload.email = data.email;
    if (data.websites !== undefined) payload.websites = data.websites;
    if (data.vertical !== undefined) payload.vertical = data.vertical;

    await graphPost(`/${row.phone_number_id}/whatsapp_business_profile`, token, payload);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// list phone numbers on a WABA (helper for connect wizard)
// ---------------------------------------------------------------------------

const ListWabaSchema = z.object({
  wabaId: z.string().min(1),
  accessTokenSecretName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).max(512),
});

export const listWabaPhoneNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListWabaSchema.parse(input))
  .handler(async ({ data }) => {
    const token = readAccessToken(data.accessTokenSecretName);
    const res = await graphGet<{ data?: PhoneNumberInfo[] }>(
      `/${data.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,name_status,platform_type`,
      token,
    );
    return { phoneNumbers: res.data ?? [] };
  });
