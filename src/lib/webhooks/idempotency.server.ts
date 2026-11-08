/**
 * Shared inbound-webhook security layer — server-only.
 *
 * Two concerns, one module:
 *
 *  1. **Authenticity** — timing-safe HMAC verification helpers for the
 *     signature schemes used by our receivers (Meta `X-Hub-Signature-256`,
 *     Twilio `X-Twilio-Signature`, plain shared-secret tokens).
 *  2. **Idempotency** — every verified delivery is claimed in
 *     `inbound_webhook_deliveries` on a unique `(provider, delivery_key)`
 *     pair *before* any conversation/message work happens. Providers retry
 *     aggressively (Meta, Telegram and Twilio all redeliver on timeouts), so
 *     the unique index — not a read-then-write check — is what guarantees a
 *     retry can never create a second conversation or message.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookProvider =
  | "messenger"
  | "instagram"
  | "telegram"
  | "email"
  | "sms"
  | "integration";

/* ------------------------------ signatures ------------------------------ */

/** Constant-time comparison that never throws on length mismatch. */
export function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a ?? "", "utf8");
  const bb = Buffer.from(b ?? "", "utf8");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/**
 * Meta (Messenger / Instagram / WhatsApp) `X-Hub-Signature-256`:
 * `sha256=<hex hmac of the raw request body with the app secret>`.
 */
export function verifyMetaSignature(
  rawBody: string,
  headerValue: string | null,
  appSecret: string,
): boolean {
  if (!headerValue || !appSecret) return false;
  const provided = headerValue.startsWith("sha256=")
    ? headerValue.slice("sha256=".length)
    : headerValue;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeCompare(provided.toLowerCase(), expected);
}

/**
 * Twilio `X-Twilio-Signature`: base64 HMAC-SHA1 over the full request URL
 * followed by every POST parameter sorted by key and concatenated as
 * `key + value`. https://www.twilio.com/docs/usage/security
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  headerValue: string | null,
): boolean {
  if (!headerValue || !authToken) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
  return safeCompare(headerValue, expected);
}

/* ------------------------------ idempotency ----------------------------- */

export interface ClaimArgs {
  provider: WebhookProvider;
  /** Provider-unique delivery id (message id, update id, event id, SID). */
  deliveryKey: string;
  workspaceId?: string | null;
  payload?: unknown;
  signatureVerified?: boolean;
}

export interface ClaimResult {
  /** `false` when this exact delivery was already recorded (a retry). */
  fresh: boolean;
  id: string | null;
}

// Postgres unique-violation
const UNIQUE_VIOLATION = "23505";

/**
 * Atomically claim a delivery. Returns `{ fresh: false }` when the provider
 * has already delivered this exact event — callers must ack (2xx) and skip.
 */
export async function claimWebhookDelivery(args: ClaimArgs): Promise<ClaimResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;

  const { data, error } = await admin
    .from("inbound_webhook_deliveries")
    .insert({
      provider: args.provider,
      delivery_key: args.deliveryKey,
      workspace_id: args.workspaceId ?? null,
      signature_verified: args.signatureVerified ?? true,
      status: "received",
      payload: (args.payload ?? {}) as Record<string, unknown>,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    const msg = String((error as { message?: string }).message ?? "").toLowerCase();
    if (code === UNIQUE_VIOLATION || msg.includes("duplicate key")) {
      return { fresh: false, id: null };
    }
    // Storage problems must not drop real traffic — process the delivery.
    console.error("[webhook-idempotency] claim failed:", error);
    return { fresh: true, id: null };
  }

  return { fresh: true, id: (data as { id: string } | null)?.id ?? null };
}

/**
 * Mark a claimed delivery as processed / ignored / failed.
 *
 * `workspaceId` backfills the tenant this delivery turned out to belong to.
 * Meta's envelopes identify a Page or IG account, not a workspace, so the
 * owning tenant is only known after `processEntries` has resolved the account
 * — by which point the row has already been claimed. Without this the row
 * keeps `workspace_id = NULL`, and the table's RLS policy requires a non-null
 * workspace, so workspace members could never see a single Messenger or
 * Instagram delivery: the inbound log looked permanently empty even while
 * deliveries were arriving.
 */
export async function completeWebhookDelivery(
  id: string | null,
  status: "processed" | "ignored" | "failed",
  errorMessage?: string | null,
  workspaceId?: string | null,
): Promise<void> {
  if (!id) return;
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const patch: Record<string, unknown> = {
    status,
    error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null,
    processed_at: new Date().toISOString(),
  };
  // Only ever set it, never clear one that a caller already knew up front.
  if (workspaceId) patch.workspace_id = workspaceId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any).from("inbound_webhook_deliveries").update(patch).eq("id", id);
}

/** Record a rejected (unverified) delivery for auditing. Best-effort. */
export async function recordRejectedDelivery(args: {
  provider: WebhookProvider;
  deliveryKey: string;
  workspaceId?: string | null;
  reason: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("inbound_webhook_deliveries").insert({
      provider: args.provider,
      delivery_key: args.deliveryKey,
      workspace_id: args.workspaceId ?? null,
      signature_verified: false,
      status: "rejected",
      error_message: args.reason.slice(0, 1000),
      processed_at: new Date().toISOString(),
    });
  } catch {
    /* auditing must never break the response */
  }
}
