/**
 * Human-friendly translations for Meta Graph API errors.
 *
 * Meta returns terse, developer-oriented errors ("(#100) Invalid parameter").
 * These helpers turn them into something an admin can act on, while keeping
 * the raw diagnostic fields available for server-side logging.
 *
 * This module is client-safe: no server-only imports.
 */

export type MetaStage =
  | "resolve_app"
  | "upload_session"
  | "upload_bytes"
  | "template_submit";

export type ParsedMetaError = {
  /** Raw message returned by Meta, if any. */
  rawMessage?: string;
  /** Meta error code (e.g. 190, 100, 131047). */
  code?: number;
  /** Meta error subcode. */
  subcode?: number;
  /** Meta error type (e.g. OAuthException). */
  type?: string;
  /** User-facing title/message Meta sometimes supplies. */
  userTitle?: string;
  userMessage?: string;
  /** Support trace id — worth logging, useless to end users. */
  traceId?: string;
  /** HTTP status of the failing request. */
  status?: number;
};

/** Extract the useful diagnostic fields from a Graph API error body. */
export function parseMetaError(status: number, body: unknown): ParsedMetaError {
  const err = (body as { error?: Record<string, unknown> } | null)?.error;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : undefined);
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  return {
    status,
    rawMessage: str(err?.message) ?? (typeof body === "string" ? body.slice(0, 300) : undefined),
    code: num(err?.code),
    subcode: num(err?.error_subcode),
    type: str(err?.type),
    userTitle: str(err?.error_user_title),
    userMessage: str(err?.error_user_msg),
    traceId: str(err?.fbtrace_id),
  };
}

const STAGE_LABEL: Record<MetaStage, string> = {
  resolve_app: "Could not verify your Meta access token",
  upload_session: "Meta refused to start the media upload",
  upload_bytes: "The header file could not be uploaded to Meta",
  template_submit: "Meta rejected this template",
};

/** A friendly headline + an actionable hint for a parsed Meta error. */
export type FriendlyMetaError = { message: string; hint: string };

export function explainMetaError(stage: MetaStage, parsed: ParsedMetaError): FriendlyMetaError {
  const headline = STAGE_LABEL[stage] ?? "The WhatsApp request failed";
  const detail = parsed.userMessage ?? parsed.rawMessage;

  const withDetail = (hint: string): FriendlyMetaError => ({
    message: detail ? `${headline}: ${detail}` : headline,
    hint,
  });

  // Auth / permission problems — by far the most common cause.
  if (parsed.code === 190 || parsed.type === "OAuthException" || parsed.status === 401) {
    return withDetail(
      "Your access token is expired or invalid. Generate a new permanent System User token in Meta Business Settings and update the access-token secret under Cloud → Secrets.",
    );
  }
  if (parsed.code === 10 || parsed.code === 200 || parsed.code === 294 || parsed.status === 403) {
    return withDetail(
      "The token is missing permissions. It needs whatsapp_business_management and whatsapp_business_messaging, and the System User must have access to this WhatsApp Business Account.",
    );
  }
  if (parsed.code === 4 || parsed.code === 80007 || parsed.code === 613 || parsed.status === 429) {
    return withDetail("Meta is rate-limiting this account. Wait a few minutes and try again.");
  }
  if (parsed.code === 1 || parsed.code === 2 || (parsed.status ?? 0) >= 500) {
    return withDetail("This is a temporary problem on Meta's side. Retry in a minute.");
  }

  switch (stage) {
    case "upload_session":
    case "upload_bytes":
      if (parsed.code === 100) {
        return withDetail(
          "Meta rejected the file. Check that the type and size match WhatsApp's header limits (JPEG/PNG images, MP4 video, PDF documents).",
        );
      }
      return withDetail(
        "Try a smaller file or a different format. If it keeps failing, re-check the WhatsApp account's App ID and access token.",
      );
    case "template_submit":
      if (/sample templates cannot be edited or deleted/i.test(detail ?? "")) {
        return withDetail(
          "Sample templates are pre-approved by Meta and are read-only. Create a new template with your own name and copy the content across, or add a language variant instead.",
        );
      }
      // (#192) and friends: a button parameter Meta could not parse. Name the
      // field and how to fix it — this is never a token problem.
      if (parsed.code === 192 || /is not a valid phone number/i.test(detail ?? "")) {
        return withDetail(
          "A call button holds an invalid phone number. Use international E.164 format with the country code and no spaces, dashes or extensions — e.g. +14155551234 — then resubmit.",
        );
      }
      if (/is not a valid URI/i.test(detail ?? "")) {
        return withDetail(
          "A URL button holds an invalid link. Use an absolute https:// link, and keep any {{variable}} at the very end of the URL.",
        );
      }
      if (parsed.code === 100) {
        return withDetail(
          parsed.rawMessage?.includes("Param components")
            ? "Meta rejected one of the template components named above. Fix that field in the template editor and resubmit."
            : "One of the template fields is invalid — usually a mismatch between {{variables}} in the body and the example values, or a missing media header sample.",
        );
      }
      if (parsed.code === 132000 || parsed.code === 132001) {
        return withDetail(
          "A template with this name and language already exists. Rename it, or edit the existing template instead.",
        );
      }
      if (parsed.code === 132005 || parsed.code === 132007) {
        return withDetail(
          "The template content breaks WhatsApp's formatting rules. Remove trailing spaces, emoji-only content, and consecutive newlines, then resubmit.",
        );
      }
      return withDetail(
        "Review the template name, category, and body variables against WhatsApp's template guidelines, then submit again.",
      );
    default:
      return withDetail("Re-check the WhatsApp account credentials in Settings, then try again.");
  }
}

/**
 * Marker appended to a friendly error message when the failure is transient
 * (network blip, Meta rate limit, Meta 5xx) and retrying is worth it. It is
 * stripped before anything is shown to the user.
 */
export const RETRYABLE_MARKER = "::retryable::";

/**
 * Is this Meta failure worth retrying automatically? Auth, permission and
 * validation errors are not — they need a human to change something.
 */
export function isTransientMetaError(parsed: ParsedMetaError): boolean {
  if (parsed.status === 429) return true;
  if ((parsed.status ?? 0) >= 500) return true;
  // 1/2 = unknown/temporary API error, 4/80007/613 = rate limiting.
  return [1, 2, 4, 613, 80007].includes(parsed.code ?? -1);
}

/**
 * Encode a friendly error as a single Error message. The hint is placed on a
 * second line so the UI can show it as a toast description.
 */
export function toFriendlyErrorMessage(
  friendly: FriendlyMetaError,
  options: { retryable?: boolean } = {},
): string {
  const base = friendly.hint ? `${friendly.message}\n${friendly.hint}` : friendly.message;
  return options.retryable ? `${base}\n${RETRYABLE_MARKER}` : base;
}

/** Does this error message describe a transient failure? */
export function isRetryableMessage(message: string): boolean {
  return message.includes(RETRYABLE_MARKER);
}

/** Split a message produced by `toFriendlyErrorMessage` back into parts. */
export function splitFriendlyMessage(message: string): { title: string; description?: string } {
  const clean = message
    .split("\n")
    .filter((line) => line.trim() !== RETRYABLE_MARKER)
    .join("\n");
  const [title, ...rest] = clean.split("\n");
  const description = rest.join("\n").trim();
  return { title: title.trim(), description: description || undefined };
}

/** Compact, log-safe representation of a Meta failure (never includes tokens). */
export function metaErrorLogData(stage: MetaStage, parsed: ParsedMetaError): Record<string, unknown> {
  return {
    stage,
    status: parsed.status,
    code: parsed.code,
    subcode: parsed.subcode,
    type: parsed.type,
    fbtrace_id: parsed.traceId,
    metaMessage: parsed.rawMessage,
    metaUserMessage: parsed.userMessage,
  };
}
