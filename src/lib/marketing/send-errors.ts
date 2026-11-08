/**
 * Distinguishable failure reasons for campaign sends.
 *
 * Every send failure used to surface as one string, so "the sender is
 * disconnected", "the template was rejected by Meta" and "this contact has no
 * phone number" were indistinguishable in the queue's `last_error` and in the
 * UI. They need different actions from the operator, so they get different
 * kinds.
 */

export type CampaignSendFailure =
  /** Campaign configuration is incomplete — cannot be sent at all. */
  | "config_invalid"
  /** No template chosen, or it no longer exists. */
  | "template_missing"
  /** Template exists but Meta has not approved it. */
  | "template_not_approved"
  /** Required template variables are unmapped or empty. */
  | "variables_missing"
  /** The template's WhatsApp account is not in this workspace. */
  | "sender_invalid"
  /** The sender exists but is not connected. */
  | "sender_disconnected"
  /** The audience resolved to nothing sendable. */
  | "audience_empty"
  /** This contact cannot receive WhatsApp (no/!valid number, opted out). */
  | "recipient_invalid"
  /** Meta accepted the call but returned no message id. */
  | "provider_no_receipt"
  /** Meta rejected the send. */
  | "provider_rejected"
  /** A database read/write failed. */
  | "persistence";

/** Failures the operator can fix by editing the campaign. */
const CONFIGURATION_FAILURES = new Set<CampaignSendFailure>([
  "config_invalid",
  "template_missing",
  "template_not_approved",
  "variables_missing",
  "sender_invalid",
  "sender_disconnected",
  "audience_empty",
]);

export class CampaignSendError extends Error {
  readonly kind: CampaignSendFailure;

  constructor(kind: CampaignSendFailure, message: string) {
    super(message);
    this.name = "CampaignSendError";
    this.kind = kind;
  }

  /**
   * True when the whole campaign is misconfigured, as opposed to one recipient
   * failing. A configuration failure should stop the run rather than burn
   * through every recipient producing the same error.
   */
  get isConfiguration(): boolean {
    return CONFIGURATION_FAILURES.has(this.kind);
  }
}

/** Strings that must never reach a stored error or a toast. */
const SECRET_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g,
  /\b(EAA[A-Za-z0-9]{20,})\b/g,
  /\b(access[_-]?token|app[_-]?secret|api[_-]?key|authorization|bearer|password)\b\s*[:=]?\s*\S*/gi,
  /\b[A-Za-z0-9_-]{40,}\b/g,
];

/** Remove anything credential-shaped from a message before storing or showing it. */
export function redactSendError(text: string): string {
  return SECRET_PATTERNS.reduce((out, re) => out.replace(re, "[redacted]"), text);
}

/**
 * Normalise any thrown value into a safe, classified failure.
 *
 * Provider clients throw their own error shapes, and supabase-js throws plain
 * objects that are not `Error` instances, so `instanceof Error` alone loses the
 * message.
 */
export function normalizeSendError(error: unknown): CampaignSendError {
  if (error instanceof CampaignSendError) {
    return new CampaignSendError(error.kind, redactSendError(error.message));
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : typeof error === "string"
          ? error
          : "";

  const safe = redactSendError(message.trim());
  if (!safe) {
    return new CampaignSendError(
      "provider_rejected",
      "The provider rejected the message without a reason.",
    );
  }
  return new CampaignSendError("provider_rejected", safe);
}
