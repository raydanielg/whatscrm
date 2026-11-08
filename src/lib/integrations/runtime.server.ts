/**
 * Server-side action dispatcher. Loaded on-demand from server functions.
 * Uses simple `fetch` calls — no per-provider SDKs — so it stays edge-safe.
 *
 * Individual providers implement one of the strategies:
 *   - webhook_url  → POST JSON payload to the stored URL
 *   - api_key      → provider-specific REST call using the config credentials
 *   - oauth2       → resolved via the App User Connector / gateway layer already
 *                     scaffolded in `src/lib/messaging/*` and reused here.
 *
 * Every action returns a normalized `ActionResult`. The workflow engine consumes
 * this shape and does not need per-provider knowledge.
 */

import { BRAND_NAME } from "@/lib/branding/brand";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getProvider } from "./core";

export interface ActionResult {
  ok: boolean;
  status?: number;
  data?: string | null;
  error?: string;
  latencyMs: number;
}

export interface ActionContext {
  userId?: string;
  workspaceId?: string;
  providerId: string;
  capabilityId: string;
  config: Record<string, string | boolean | undefined>;
  input: Record<string, unknown>;
}

/** Verify inbound webhook signature. Used by `/api/public/integrations/webhook/*`. */
export function verifyInboundSignature(opts: {
  secret: string | undefined;
  header: string | null;
  rawBody: string;
}): boolean {
  if (!opts.secret) return true; // no secret configured → open
  if (!opts.header) return false;
  const expected = createHmac("sha256", opts.secret).update(opts.rawBody).digest("hex");
  const a = Buffer.from(opts.header.replace(/^sha256=/, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function callWebhook(url: string, body: unknown, extraHeaders?: Record<string, string>): Promise<ActionResult> {
  const t = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(extraHeaders ?? {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: text, latencyMs: Date.now() - t };
  } catch (e) {
    return { ok: false, error: (e as Error).message, latencyMs: Date.now() - t };
  }
}

// (safeJson removed — payloads returned as raw strings for serialization safety.)

function authHeaders(config: ActionContext["config"]): Record<string, string> {
  const scheme = String(config.auth_scheme ?? "bearer");
  const cred = String(config.credential ?? "");
  if (!cred) return {};
  if (scheme === "bearer") return { Authorization: `Bearer ${cred}` };
  if (scheme === "basic")  return { Authorization: `Basic ${Buffer.from(cred).toString("base64")}` };
  if (scheme === "custom_header") {
    const h = String(config.custom_header_name ?? "X-Api-Key");
    return { [h]: cred };
  }
  return {};
}

/**
 * Central dispatcher. New providers plug in with one `case`.
 * Core app calls `runIntegrationAction(...)` and never knows which vendor executed.
 */
export async function runIntegrationAction(ctx: ActionContext): Promise<ActionResult> {
  const t = Date.now();
  const provider = getProvider(ctx.providerId);
  if (!provider) return { ok: false, error: `Unknown provider: ${ctx.providerId}`, latencyMs: 0 };

  const capability = provider.capabilities.find((c) => c.id === ctx.capabilityId);
  if (!capability) return { ok: false, error: `Unknown capability: ${ctx.capabilityId}`, latencyMs: 0 };
  if (capability.kind !== "action") return { ok: false, error: "Capability is a trigger, not an action.", latencyMs: 0 };

  // Provider-specific dispatch
  switch (ctx.providerId) {
    // ── Webhook-URL providers: uniform push ──────────────────────────────
    case "discord": {
      const url = String(ctx.config.webhook_url ?? "");
      if (!url) return { ok: false, error: "Missing webhook URL", latencyMs: 0 };
      return callWebhook(url, {
        username: ctx.config.username ?? BRAND_NAME,
        content: ctx.input.text ?? JSON.stringify(ctx.input),
      });
    }
    case "zapier":
    case "make":
    case "n8n": {
      const url = String(ctx.config.webhook_url ?? "");
      if (!url) return { ok: false, error: "Missing webhook URL", latencyMs: 0 };
      const headers: Record<string, string> = {};
      const auth = ctx.config.auth_header;
      if (auth) headers.Authorization = String(auth);
      return callWebhook(url, ctx.input, headers);
    }

    // ── Resend ────────────────────────────────────────────────────────────
    case "resend": {
      const key = String(ctx.config.api_key ?? "");
      const from = String(ctx.config.from_email ?? "");
      if (!key || !from) return { ok: false, error: "Resend not configured", latencyMs: 0 };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: ctx.input.to,
          subject: ctx.input.subject,
          html: ctx.input.html,
        }),
      });
      const data = await res.text();
      return { ok: res.ok, status: res.status, data, latencyMs: Date.now() - t };
    }

    // ── Mailgun ──────────────────────────────────────────────────────────
    case "mailgun": {
      const domain = String(ctx.config.domain ?? "");
      const key = String(ctx.config.api_key ?? "");
      const region = String(ctx.config.region ?? "US");
      const host = region === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net";
      if (!domain || !key) return { ok: false, error: "Mailgun not configured", latencyMs: 0 };
      const form = new URLSearchParams();
      form.set("from", String(ctx.input.from ?? `${BRAND_NAME} <mailgun@${domain}>`));
      form.set("to", String(ctx.input.to ?? ""));
      form.set("subject", String(ctx.input.subject ?? ""));
      form.set("html", String(ctx.input.html ?? ""));
      const res = await fetch(`https://${host}/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const data = await res.text();
      return { ok: res.ok, status: res.status, data, latencyMs: Date.now() - t };
    }

    // ── Universal HTTP connector ─────────────────────────────────────────
    case "http-connector": {
      const base = String(ctx.config.base_url ?? "").replace(/\/$/, "");
      const path = String(ctx.input.path ?? "");
      const method = String(ctx.input.method ?? "GET").toUpperCase();
      if (!base) return { ok: false, error: "Missing base URL", latencyMs: 0 };
      const controller = new AbortController();
      const timeout = Number(ctx.config.timeout_ms ?? 10000);
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(`${base}${path.startsWith("/") ? "" : "/"}${path}`, {
          method,
          signal: controller.signal,
          headers: { "Content-Type": "application/json", ...authHeaders(ctx.config) },
          body: ["POST", "PUT", "PATCH"].includes(method) ? JSON.stringify(ctx.input.body ?? {}) : undefined,
        });
        const data = await res.text();
        return { ok: res.ok, status: res.status, data, latencyMs: Date.now() - t };
      } catch (e) {
        return { ok: false, error: (e as Error).message, latencyMs: Date.now() - t };
      } finally {
        clearTimeout(timer);
      }
    }

    // ── OAuth-backed providers (Google/MS/Zoom/Slack/Teams): delegated ──
    // Workspace calls use direct Google OAuth. Other providers report their
    // connection status until a native adapter is configured.
    case "google-workspace":
      return (await import("./google-workspace-runtime.server")).runGoogleWorkspaceAction(ctx);
    case "google-calendar":
    case "google-drive":
    case "google-sheets":
    case "google-contacts":
    case "microsoft-365":
    case "microsoft-teams":
    case "zoom":
    case "slack":
      return {
        ok: false,
        error: "Per-user OAuth connection required. Connect this integration under Settings → Integrations to activate.",
        latencyMs: Date.now() - t,
      };

    // ── S3 / R2: signed URL flow ─────────────────────────────────────────
    case "aws-s3":
    case "cloudflare-r2":
      return {
        ok: false,
        error: "Object storage actions run through the storage abstraction. Use `getSignedUploadUrl` from `@/lib/storage`.",
        latencyMs: Date.now() - t,
      };

    // ── Triggers ─────────────────────────────────────────────────────────
    case "webhook-trigger":
      return { ok: false, error: "webhook-trigger is a trigger, not an action.", latencyMs: 0 };
  }

  return { ok: false, error: `No runtime for provider ${ctx.providerId}`, latencyMs: Date.now() - t };
}
