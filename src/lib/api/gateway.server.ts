/**
 * Enterprise API Gateway core.
 *
 * Responsibilities:
 *  - Bearer API key authentication (SHA-256 hashed lookup in `api_keys`)
 *  - Scope-based authorization
 *  - Ad-hoc rate limiting (per api_key + route bucket, backed by `rate_limit_buckets`)
 *  - Structured request/response logging into `api_gateway_logs`
 *  - Standardized JSON error envelopes
 *
 * NOTE: This is a lightweight DB-backed limiter. For enterprise-scale bursts
 * (>500 req/s per key), replace with a Redis/Upstash sliding window.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { missingScopes, type ApiScope, type ApiScopeGrant } from "@/lib/api/scopes";
import {
  parseBearer,
  readSecurityHeader,
  MAX_SECURITY_HEADER_LENGTH,
} from "@/lib/api/request-guards";
import { sbAny } from "@/lib/supabase/untyped";

export type { ApiScope } from "@/lib/api/scopes";

export interface GatewayContext {
  supabase: SupabaseClient;
  organizationId: string;
  apiKeyId: string;
  scopes: ApiScopeGrant[];
  requestId: string;
  startedAt: number;
  method: string;
  path: string;
  version: string;
  ip: string | null;
  userAgent: string | null;
}

const JSON_HEADERS = {
  "Content-Type": "application/vnd.api+json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-API-Version": "v1",
} as const;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
  };
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export type ApiError =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation_error"
  | "internal_error"
  | "bad_request";

const STATUS: Record<ApiError, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  validation_error: 422,
  internal_error: 500,
  bad_request: 400,
};

export function jsonError(
  code: ApiError,
  message: string,
  extra: Record<string, unknown> = {},
  requestId?: string,
): Response {
  return new Response(
    JSON.stringify({
      errors: [{ status: String(STATUS[code]), code, title: message, ...extra }],
      meta: { request_id: requestId },
    }),
    {
      status: STATUS[code],
      headers: {
        ...JSON_HEADERS,
        ...corsHeaders(),
        ...(STATUS[code] === 401
          ? { "WWW-Authenticate": 'Bearer realm="wacrm", charset="UTF-8"' }
          : {}),
      },
    },
  );
}

export function jsonOk<T>(
  data: T,
  init: { status?: number; requestId?: string; meta?: Record<string, unknown> } = {},
): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: { request_id: init.requestId, ...(init.meta ?? {}) },
    }),
    { status: init.status ?? 200, headers: { ...JSON_HEADERS, ...corsHeaders() } },
  );
}

/**
 * Enforce that a request carries `x-active-org: <organizationId>` matching the
 * caller's authoritative organization (e.g. the tenant an API key belongs to,
 * or the session's active org).
 *
 * Purpose: defense in depth against confused-deputy calls where a client
 * switches tenants after auth is issued — a request destined for org-B must
 * not be processed while the client thinks it is still on org-A.
 *
 *  - Missing header  → 400 `bad_request`
 *  - Malformed value → 400 `bad_request`
 *  - Mismatched org  → 403 `forbidden`
 *  - Matching org    → `null` (caller proceeds)
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function enforceActiveOrgHeader(
  request: Request,
  expectedOrgId: string,
  requestId?: string,
): Response | null {
  const raw = request.headers.get("x-active-org");
  if (!raw) {
    return jsonError(
      "bad_request",
      "Missing required header: x-active-org",
      { header: "x-active-org" },
      requestId,
    );
  }
  const value = raw.trim();
  if (!UUID_RE.test(value)) {
    return jsonError(
      "bad_request",
      "Invalid x-active-org header",
      { header: "x-active-org" },
      requestId,
    );
  }
  if (value !== expectedOrgId) {
    return jsonError(
      "forbidden",
      "Active organization does not match authenticated context",
      { expected: expectedOrgId, received: value },
      requestId,
    );
  }
  return null;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function serverAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Validate the shape of every security-relevant header before authenticating.
 * Returns a coarse failure reason; all failures map onto a standardized 401 so
 * that probing clients cannot distinguish between them.
 */
function validateSecurityHeaders(req: Request): "missing_bearer" | "malformed_bearer" | null {
  // Reject oversized / injected values on headers we act upon.
  for (const name of ["x-active-org", "idempotency-key", "x-request-id"]) {
    const raw = req.headers.get(name);
    if (raw !== null && raw.trim() !== "" && readSecurityHeader(req, name) === null) {
      return "malformed_bearer";
    }
  }
  const bearer = parseBearer(req);
  if (bearer.ok) {
    return bearer.token.length > MAX_SECURITY_HEADER_LENGTH ? "malformed_bearer" : null;
  }
  return bearer.reason === "missing" ? "missing_bearer" : "malformed_bearer";
}

function extractBearer(req: Request): string | null {
  const bearer = parseBearer(req);
  return bearer.ok ? bearer.token : null;
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/**
 * Ad-hoc DB rate limiter. Uses fixed windows keyed by (api_key, path).
 * NOT for extreme burst traffic; move to Redis for that.
 */
async function checkRateLimit(
  supabase: SupabaseClient,
  bucketKey: string,
  organizationId: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = new Date();
  const bucketStart = new Date(
    Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );

  const { data: existing } = await supabase
    .from("rate_limit_buckets")
    .select("id, count")
    .eq("bucket_key", bucketKey)
    .eq("window_start", bucketStart.toISOString())
    .maybeSingle();

  const count = (existing?.count ?? 0) + 1;
  if (existing) {
    await sbAny(supabase).from("rate_limit_buckets").update({ count }).eq("id", existing.id);
  } else {
    await sbAny(supabase).from("rate_limit_buckets").insert({
      bucket_key: bucketKey,
      window_start: bucketStart.toISOString(),
      window_seconds: windowSeconds,
      count,
      workspace_id: organizationId,
    });
  }

  const resetAt = bucketStart.getTime() + windowSeconds * 1000;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

export interface AuthenticateOptions {
  requiredScopes: ApiScope[];
  rateLimit?: { limit: number; windowSeconds: number };
}

async function logRequest(
  supabase: SupabaseClient,
  ctx: Partial<GatewayContext> & { method: string; path: string; version: string },
  statusCode: number,
  error?: string,
) {
  try {
    await sbAny(supabase)
      .from("api_gateway_logs")
      .insert({
        organization_id: ctx.organizationId ?? null,
        api_key_id: ctx.apiKeyId ?? null,
        method: ctx.method,
        path: ctx.path,
        version: ctx.version,
        status_code: statusCode,
        latency_ms: ctx.startedAt ? Date.now() - ctx.startedAt : null,
        ip: ctx.ip ?? null,
        user_agent: ctx.userAgent ?? null,
        error: error ?? null,
      });
  } catch {
    /* logging is best-effort */
  }
}

/**
 * Wrap a v1 handler with auth + scope + rate limit + logging.
 */
export function withGateway(
  opts: AuthenticateOptions,
  handler: (ctx: GatewayContext, req: Request) => Promise<Response>,
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method === "OPTIONS") return preflight();

    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const base = {
      method: request.method,
      path: url.pathname,
      version: "v1",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      startedAt: started,
    };

    const supabase = serverAdminClient();

    const headerFailure = validateSecurityHeaders(request);
    if (headerFailure) {
      const res = jsonError(
        "unauthorized",
        headerFailure === "missing_bearer"
          ? "Missing bearer token"
          : "Malformed authentication header",
        {},
        requestId,
      );
      void logRequest(supabase, base, 401, headerFailure);
      return res;
    }
    const raw = extractBearer(request)!;

    const hashed = hashKey(raw);
    const { data: keyRow, error: keyErr } = await supabase
      .from("api_keys")
      .select("id, organization_id, scopes, revoked_at, expires_at, hashed_key, ip_allowlist")
      .eq("hashed_key", hashed)
      .maybeSingle();

    if (keyErr || !keyRow) {
      const res = jsonError("unauthorized", "Invalid API key", {}, requestId);
      void logRequest(supabase, base, 401, "invalid_key");
      return res;
    }

    // Constant-time comparison of hash (defensive; single-row match already implies equality)
    const a = Buffer.from(keyRow.hashed_key);
    const b = Buffer.from(hashed);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      const res = jsonError("unauthorized", "Invalid API key", {}, requestId);
      void logRequest(supabase, base, 401, "hash_mismatch");
      return res;
    }

    if (keyRow.revoked_at) {
      const res = jsonError("unauthorized", "API key revoked", {}, requestId);
      void logRequest(
        supabase,
        { ...base, apiKeyId: keyRow.id, organizationId: keyRow.organization_id },
        401,
        "revoked",
      );
      return res;
    }
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      const res = jsonError("unauthorized", "API key expired", {}, requestId);
      void logRequest(
        supabase,
        { ...base, apiKeyId: keyRow.id, organizationId: keyRow.organization_id },
        401,
        "expired",
      );
      return res;
    }

    const allowlist = (keyRow.ip_allowlist ?? []) as string[];
    if (allowlist.length > 0) {
      const ip = base.ip;
      if (!ip || !allowlist.includes(ip)) {
        const res = jsonError("forbidden", "IP not allowed for this API key", { ip }, requestId);
        void logRequest(
          supabase,
          { ...base, apiKeyId: keyRow.id, organizationId: keyRow.organization_id },
          403,
          "ip_not_allowed",
        );
        return res;
      }
    }

    const scopes = (keyRow.scopes ?? []) as ApiScopeGrant[];
    const missing = missingScopes(scopes, opts.requiredScopes);
    if (missing.length > 0) {
      const res = jsonError(
        "forbidden",
        `Missing required scope(s): ${missing.join(", ")}`,
        { required: opts.requiredScopes, granted: scopes },
        requestId,
      );
      void logRequest(
        supabase,
        { ...base, apiKeyId: keyRow.id, organizationId: keyRow.organization_id },
        403,
        "missing_scope",
      );
      return res;
    }

    // Rate limit
    const rl = opts.rateLimit ?? { limit: 600, windowSeconds: 60 };
    const bucketKey = `apikey:${keyRow.id}:${url.pathname}`;
    const rlResult = await checkRateLimit(
      supabase,
      bucketKey,
      keyRow.organization_id,
      rl.limit,
      rl.windowSeconds,
    );
    const rateHeaders = {
      "X-RateLimit-Limit": String(rl.limit),
      "X-RateLimit-Remaining": String(rlResult.remaining),
      "X-RateLimit-Reset": String(Math.floor(rlResult.resetAt / 1000)),
    };
    if (!rlResult.allowed) {
      const res = new Response(
        JSON.stringify({
          errors: [{ status: "429", code: "rate_limited", title: "Rate limit exceeded" }],
          meta: { request_id: requestId },
        }),
        {
          status: 429,
          headers: {
            ...JSON_HEADERS,
            ...corsHeaders(),
            ...rateHeaders,
            "Retry-After": String(rl.windowSeconds),
          },
        },
      );
      void logRequest(
        supabase,
        { ...base, apiKeyId: keyRow.id, organizationId: keyRow.organization_id },
        429,
        "rate_limited",
      );
      return res;
    }

    // Update last_used_at (fire and forget)
    void sbAny(supabase)
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id);

    const ctx: GatewayContext = {
      supabase,
      organizationId: keyRow.organization_id,
      apiKeyId: keyRow.id,
      scopes,
      requestId,
      startedAt: started,
      method: request.method,
      path: url.pathname,
      version: "v1",
      ip: base.ip,
      userAgent: base.userAgent,
    };

    try {
      const res = await handler(ctx, request);
      // Merge rate limit + request id headers
      const merged = new Headers(res.headers);
      Object.entries(rateHeaders).forEach(([k, v]) => merged.set(k, v));
      merged.set("X-Request-ID", requestId);
      Object.entries(corsHeaders()).forEach(([k, v]) => merged.set(k, v));
      const finalRes = new Response(res.body, { status: res.status, headers: merged });
      void logRequest(supabase, ctx, res.status);
      return finalRes;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unhandled error";
      void logRequest(supabase, ctx, 500, message);
      return jsonError("internal_error", "An unexpected error occurred", {}, requestId);
    }
  };
}

export async function parseJson<T>(req: Request): Promise<T | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
