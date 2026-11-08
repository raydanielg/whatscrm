/**
 * Shared request-header validation and standardized security denials.
 *
 * Every rejected security check in the app must produce the SAME response
 * shape so that callers (pg_cron, external integrators, our own SDK) can
 * reliably distinguish authentication failures from application errors:
 *
 *   401 unauthorized -> caller did not prove identity (missing/invalid credential)
 *   403 forbidden    -> identity proven, but not allowed (IP, scope, tenant)
 *
 * Body envelope (stable):
 *   { "error": "<code>", "code": "<code>", "message": "...", "request_id": "..." }
 *
 * This module is deliberately dependency-free (no node:crypto) so it can be
 * imported from client-reachable route files without leaking server-only code
 * into the browser bundle.
 */

export type SecurityDenialCode =
  | "unauthorized"
  | "invalid_credentials"
  | "malformed_header"
  | "forbidden"
  | "ip_not_allowed"
  | "insufficient_scope"
  | "tenant_mismatch";

const DENIAL_STATUS: Record<SecurityDenialCode, 401 | 403> = {
  unauthorized: 401,
  invalid_credentials: 401,
  malformed_header: 401,
  forbidden: 403,
  ip_not_allowed: 403,
  insufficient_scope: 403,
  tenant_mismatch: 403,
};

const DEFAULT_MESSAGE: Record<SecurityDenialCode, string> = {
  unauthorized: "Authentication required",
  invalid_credentials: "Invalid credentials",
  malformed_header: "Malformed authentication header",
  forbidden: "Access denied",
  ip_not_allowed: "Source IP is not allowed",
  insufficient_scope: "Insufficient scope for this operation",
  tenant_mismatch: "Organization context does not match credentials",
};

/** Maximum accepted length of any single security-relevant header value. */
export const MAX_SECURITY_HEADER_LENGTH = 4096;

/** Rejects control characters / CR-LF injection attempts inside header values. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface SecurityDenialOptions {
  /** Correlation id echoed back to the caller and useful in logs. */
  requestId?: string;
  /** Overrides the default human-readable message. */
  message?: string;
  /** Value for the WWW-Authenticate header on 401 responses. */
  challenge?: string;
  /** Extra response headers (never used to leak details about the secret). */
  headers?: Record<string, string>;
}

/**
 * Build a standardized 401/403 response. Never include the expected credential,
 * a diff, or any hint about *why* a token failed beyond the coarse code.
 */
export function securityDenied(
  code: SecurityDenialCode,
  options: SecurityDenialOptions = {},
): Response {
  const status = DENIAL_STATUS[code];
  const requestId = options.requestId;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(options.headers ?? {}),
  };
  if (status === 401) {
    headers["WWW-Authenticate"] = options.challenge ?? 'Bearer realm="wacrm", charset="UTF-8"';
  }
  if (requestId) headers["X-Request-Id"] = requestId;

  return new Response(
    JSON.stringify({
      error: code,
      code,
      message: options.message ?? DEFAULT_MESSAGE[code],
      ...(requestId ? { request_id: requestId } : {}),
    }),
    { status, headers },
  );
}

/** Convenience aliases so call sites read clearly. */
export const unauthorized = (o?: SecurityDenialOptions) => securityDenied("unauthorized", o);
export const forbidden = (o?: SecurityDenialOptions) => securityDenied("forbidden", o);

/**
 * Length-independent-ish constant-time string comparison.
 * Pure JS (no node:crypto) so this module stays client-bundle safe.
 */
export function safeCompare(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  if (len === 0) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Validate the *shape* of a security-relevant header value before it is used.
 * Returns the trimmed value, or `null` when the header is absent or unusable
 * (empty, oversized, or containing control characters / header-injection bytes).
 */
export function readSecurityHeader(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (raw === null) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > MAX_SECURITY_HEADER_LENGTH) return null;
  if (CONTROL_CHARS.test(value)) return null;
  return value;
}

/**
 * Parse an `Authorization: Bearer <token>` header.
 * Returns the token, or a discriminated failure reason for the caller to map
 * onto a standardized denial.
 */
export function parseBearer(
  request: Request,
): { ok: true; token: string } | { ok: false; reason: "missing" | "malformed" } {
  const raw = request.headers.get("authorization");
  if (raw === null || raw.trim() === "") return { ok: false, reason: "missing" };
  const value = raw.trim();
  if (value.length > MAX_SECURITY_HEADER_LENGTH || CONTROL_CHARS.test(value)) {
    return { ok: false, reason: "malformed" };
  }
  const match = /^Bearer[ \t]+([\x21-\x7e]+)$/i.exec(value);
  if (!match) return { ok: false, reason: "malformed" };
  return { ok: true, token: match[1]! };
}

/**
 * Guard for internal cron endpoints under /api/public/hooks/*.
 *
 * Fails CLOSED: if INTERNAL_CRON_TOKEN is unset, every request is rejected.
 * Returns a standardized 401 Response when the request must be rejected, or
 * `null` when the caller is authorized and processing may continue.
 *
 * Must be called before loading the admin client or doing any work.
 */
export function guardCronRequest(request: Request, requestId?: string): Response | null {
  const cronToken = process.env.INTERNAL_CRON_TOKEN ?? "";
  const providedCronToken = readSecurityHeader(request, "x-cron-token") ?? "";
  if (!cronToken || !safeCompare(providedCronToken, cronToken)) {
    return securityDenied("unauthorized", {
      requestId,
      message: "Invalid or missing cron token",
      challenge: 'CronToken realm="wacrm"',
    });
  }
  return null;
}
