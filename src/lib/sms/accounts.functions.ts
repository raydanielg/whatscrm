/**
 * SMS channel account management — list, connect, update, disconnect.
 *
 * An SMS account is a real sending/receiving number (Twilio by default).
 * Inbound webhooks resolve the workspace by matching the delivered `To`
 * number against `sms_accounts.phone_digits`, and conversations link to the
 * row through `conversations.metadata.account_id` — the same projection the
 * Inbox uses for Telegram, Messenger and Instagram.
 *
 * The provider auth token is encrypted at rest with the shared token crypto
 * helper and is never returned to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SmsAccountSummary {
  id: string;
  provider: string;
  display_name: string;
  phone_number: string;
  account_sid: string | null;
  status: string;
  status_reason: string | null;
  connected_at: string;
  last_verified_at: string | null;
  /** True when a provider auth token is stored (value never leaves the server). */
  has_auth_token: boolean;
}

// `auth_token_ciphertext` is not readable by signed-in users (column-level
// grant); the boolean flag is resolved server-side instead.
const SELECT =
  "id, provider, display_name, phone_number, account_sid, status, status_reason, connected_at, last_verified_at";

type Row = Omit<SmsAccountSummary, "has_auth_token">;

/** Resolve which of the given accounts have a stored auth token. */
async function tokenFlags(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await supabaseAdmin
    .from("sms_accounts" as never)
    .select("id, auth_token_ciphertext")
    .in("id", ids);
  return new Set(
    ((data ?? []) as Array<{ id: string; auth_token_ciphertext: string | null }>)
      .filter((r) => !!r.auth_token_ciphertext)
      .map((r) => r.id),
  );
}

function toSummary(row: Row, hasToken: boolean): SmsAccountSummary {
  return { ...row, has_auth_token: hasToken };
}

const phoneField = z
  .string()
  .trim()
  .min(6)
  .max(24)
  .regex(/^\+?[0-9 ()\-.]+$/, "Enter a phone number in international format, e.g. +14155550123");

export const listSmsAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sms_accounts" as never)
      .select(SELECT)
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as Row[];
    const flags = await tokenFlags(list.map((r) => r.id));
    return { accounts: list.map((r) => toSummary(r, flags.has(r.id))) };
  });

export const connectSmsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      workspaceId: string;
      displayName: string;
      phoneNumber: string;
      provider?: "twilio" | "messagebird" | "vonage" | "custom";
      accountSid?: string | null;
      authToken?: string | null;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          displayName: z.string().trim().min(1).max(120),
          phoneNumber: phoneField,
          provider: z.enum(["twilio", "messagebird", "vonage", "custom"]).default("twilio"),
          accountSid: z.string().trim().max(120).nullish(),
          authToken: z.string().trim().max(400).nullish(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    let cipher: string | null = null;
    if (data.authToken) {
      const { encryptToken } = await import("@/lib/instagram/token-crypto.server");
      cipher = encryptToken(data.authToken);
    }

    const { data: saved, error } = await context.supabase
      .from("sms_accounts" as never)
      .insert({
        workspace_id: data.workspaceId,
        provider: data.provider ?? "twilio",
        display_name: data.displayName,
        phone_number: data.phoneNumber,
        account_sid: data.accountSid ?? null,
        auth_token_ciphertext: cipher,
        webhook_secret: (await import("node:crypto")).randomBytes(24).toString("base64url"),
        status: "connected",
        connected_by: context.userId,
        last_verified_at: new Date().toISOString(),
      } as never)
      .select(`${SELECT}, workspace_id`)
      .maybeSingle();

    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate")) {
        throw new Error("That number is already connected for this provider.");
      }
      throw new Error(error.message);
    }

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "sms_account.connect",
      severity: "info",
      workspaceId: (saved as any)?.workspace_id ?? data.workspaceId,
      actorId: context.userId,
      resourceType: "sms_account",
      resourceId: (saved as any)?.id,
      data: { provider: data.provider, phone_number: data.phoneNumber },
    });

    return { account: toSummary(saved as unknown as Row, true) };
  });

export const updateSmsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      displayName?: string;
      accountSid?: string | null;
      authToken?: string | null;
      status?: "connected" | "disconnected";
    }) =>
      z
        .object({
          id: z.string().uuid(),
          displayName: z.string().trim().min(1).max(120).optional(),
          accountSid: z.string().trim().max(120).nullish(),
          authToken: z.string().trim().max(400).nullish(),
          status: z.enum(["connected", "disconnected"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.accountSid !== undefined) patch.account_sid = data.accountSid;
    if (data.authToken) {
      const { encryptToken } = await import("@/lib/instagram/token-crypto.server");
      patch.auth_token_ciphertext = encryptToken(data.authToken);
    }
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.status_reason = data.status === "disconnected" ? "Disabled by an administrator" : null;
    }

    const { data: saved, error } = await context.supabase
      .from("sms_accounts" as never)
      .update(patch as never)
      .eq("id", data.id)
      .select(`${SELECT}, workspace_id`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("SMS account not found, or you cannot manage it.");

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    const rotatesSecrets = !!data.authToken;
    
    void recordServerAuditEvent({
      eventType: rotatesSecrets ? "secrets.rotate" : "sms_account.update",
      severity: rotatesSecrets ? "warning" : "info",
      workspaceId: (saved as any).workspace_id,
      actorId: context.userId,
      resourceType: "sms_account",
      resourceId: data.id,
      data: { 
        updated_fields: Object.keys(patch),
        rotates_secrets: rotatesSecrets 
      },
    });

    const row = saved as unknown as Row;
    const flags = await tokenFlags([row.id]);
    return { account: toSummary(row, flags.has(row.id)) };
  });

export const deleteSmsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sms_accounts" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
