/**
 * Webhook dispatch engine — signs, sends, retries. Server-only.
 *
 * Signature: `wh_signature = t=<unix>,v1=<hex-hmac-sha256(t + '.' + body)>` — Stripe-style,
 * replay-resistant. Consumers verify by recomputing HMAC and comparing timing-safe.
 */
import { sbAny } from "@/lib/supabase/untyped";

export { WEBHOOK_EVENTS } from "./events";

export function randomSecret(): { full: string; prefix: string; hash_p: Promise<string> } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const full = `whsec_${b64}`;
  return { full, prefix: full.slice(0, 12), hash_p: sha256Hex(full) };
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildSignatureHeader(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = await hmacHex(secret, `${timestamp}.${body}`);
  return `t=${timestamp},v1=${v1}`;
}

/** Exponential backoff: 30s, 1m, 5m, 15m, 1h, 6h, 12h, 24h capped. */
export function nextAttemptDelayMs(attempt: number): number {
  const table = [30, 60, 300, 900, 3600, 21600, 43200, 86400];
  const idx = Math.min(attempt, table.length - 1);
  const base = table[idx] * 1000;
  const jitter = Math.floor(Math.random() * (base * 0.1));
  return base + jitter;
}

export type DeliveryRow = {
  id: string;
  endpoint_id: string;
  organization_id: string;
  event_type: string;
  event_id: string;
  payload: unknown;
  attempt: number;
  max_attempts: number;
};

export type EndpointRow = {
  id: string;
  url: string;
  headers: Record<string, string>;
  timeout_ms: number;
  status: string;
  consecutive_failures: number;
};

/**
 * Send one webhook attempt. Updates the delivery row with the outcome and
 * updates endpoint health. Returns 'succeeded' | 'retrying' | 'dead_letter'.
 */
export async function sendOneDelivery(
  admin: any,
  delivery: DeliveryRow,
  endpoint: EndpointRow,
  signingSecret: string,
): Promise<"succeeded" | "retrying" | "dead_letter"> {
  const body = JSON.stringify({
    id: delivery.event_id,
    type: delivery.event_type,
    created_at: new Date().toISOString(),
    data: delivery.payload,
  });
  const sig = await buildSignatureHeader(signingSecret, body);
  const attempt = delivery.attempt + 1;

  const start = Date.now();
  let response_status: number | null = null;
  let response_body: string | null = null;
  let error_message: string | null = null;
  const response_headers: Record<string, string> = {};

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), endpoint.timeout_ms);
    const res = await fetch(endpoint.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "WACRM-Webhooks/1.0",
        "x-wacrm-event": delivery.event_type,
        "x-wacrm-event-id": delivery.event_id,
        "x-wacrm-delivery-id": delivery.id,
        "x-wacrm-signature": sig,
        "x-wacrm-attempt": String(attempt),
        ...(endpoint.headers ?? {}),
      },
      body,
    });
    clearTimeout(timer);
    response_status = res.status;
    res.headers.forEach((v, k) => { response_headers[k] = v; });
    // Cap body to avoid runaway storage.
    const raw = await res.text();
    response_body = raw.length > 8192 ? raw.slice(0, 8192) + "" : raw;
  } catch (e: any) {
    error_message = e?.name === "AbortError" ? `timeout after ${endpoint.timeout_ms}ms` : (e?.message ?? "network error");
  }
  const duration_ms = Date.now() - start;
  const ok = response_status !== null && response_status >= 200 && response_status < 300;

  const now = new Date().toISOString();
  let outcome: "succeeded" | "retrying" | "dead_letter";
  const patch: Record<string, unknown> = {
    attempt,
    response_status,
    response_headers,
    response_body,
    duration_ms,
    error_message,
    last_attempted_at: now,
    locked_at: null,
    locked_by: null,
  };
  if (!delivery.attempt) patch.first_attempted_at = now;

  if (ok) {
    outcome = "succeeded";
    patch.status = "succeeded";
    patch.succeeded_at = now;
  } else if (attempt >= delivery.max_attempts) {
    outcome = "dead_letter";
    patch.status = "dead_letter";
    patch.dead_letter_at = now;
  } else {
    outcome = "retrying";
    patch.status = "pending";
    patch.next_attempt_at = new Date(Date.now() + nextAttemptDelayMs(attempt)).toISOString();
  }
  await sbAny(admin).from("webhook_deliveries").update(patch).eq("id", delivery.id);

  // Update endpoint health.
  const epPatch: Record<string, unknown> = {
    last_status_code: response_status,
    updated_at: now,
  };
  if (ok) {
    epPatch.last_success_at = now;
    epPatch.consecutive_failures = 0;
  } else {
    epPatch.last_failure_at = now;
    epPatch.consecutive_failures = endpoint.consecutive_failures + 1;
    // Auto-disable after 20 consecutive failures.
    if (endpoint.consecutive_failures + 1 >= 20 && endpoint.status === "active") {
      epPatch.status = "disabled";
      epPatch.auto_disabled_at = now;
      epPatch.auto_disabled_reason = "20 consecutive failures";
    }
  }
  await sbAny(admin).from("webhook_endpoints").update(epPatch).eq("id", endpoint.id);

  return outcome;
}

/**
 * Lease and dispatch up to `limit` pending deliveries. Worker id is used to
 * scope leases so multiple concurrent workers don't collide. Returns counts.
 */
export async function drainQueue(admin: any, limit = 25, workerId = crypto.randomUUID()) {
  const nowIso = new Date().toISOString();
  // Reclaim stale leases (>2 min old).
  await admin
    .from("webhook_deliveries")
    .update({ locked_at: null, locked_by: null })
    .lt("locked_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .eq("status", "delivering");

  // Select due jobs.
  const { data: due } = await admin
    .from("webhook_deliveries")
    .select("id")
    .in("status", ["pending"])
    .lte("next_attempt_at", nowIso)
    .is("locked_at", null)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  const ids = (due ?? []).map((r: any) => r.id);
  if (!ids.length) return { leased: 0, succeeded: 0, retrying: 0, dead_letter: 0 };

  // Lease.
  await admin
    .from("webhook_deliveries")
    .update({ status: "delivering", locked_at: nowIso, locked_by: workerId })
    .in("id", ids)
    .is("locked_at", null);

  const { data: leased } = await admin
    .from("webhook_deliveries")
    .select("*")
    .in("id", ids)
    .eq("locked_by", workerId);

  // Fetch endpoints in one round trip.
  const epIds = Array.from(new Set((leased ?? []).map((d: any) => d.endpoint_id)));
  const { data: eps } = await admin
    .from("webhook_endpoints")
    .select("*")
    .in("id", epIds);
  const epsById: Record<string, any> = {};
  for (const e of eps ?? []) epsById[e.id] = e;

  // Load plaintext secrets in one round trip (service-role-only table).
  const { data: secretRows } = await admin
    .from("webhook_endpoint_secrets")
    .select("endpoint_id, secret")
    .in("endpoint_id", epIds);
  const secretByEp: Record<string, string> = {};
  for (const s of secretRows ?? []) secretByEp[s.endpoint_id] = s.secret;

  const counts = { leased: leased?.length ?? 0, succeeded: 0, retrying: 0, dead_letter: 0 };
  for (const d of leased ?? []) {
    const ep = epsById[d.endpoint_id];
    const secret = secretByEp[d.endpoint_id];
    if (!ep || ep.status !== "active" || !secret) {
      await sbAny(admin).from("webhook_deliveries").update({
        status: "cancelled",
        error_message: !secret ? "missing signing secret" : `endpoint ${ep?.status ?? "missing"}`,
        locked_at: null, locked_by: null,
      }).eq("id", d.id);
      continue;
    }
    const outcome = await sendOneDelivery(admin, d as DeliveryRow, ep as EndpointRow, secret);
    counts[outcome] += 1;
  }
  return counts;
}
