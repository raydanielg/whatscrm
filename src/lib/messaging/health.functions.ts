/**
 * Meta WhatsApp integration health checks.
 *
 * Runs a set of live probes per connected WhatsApp Cloud account so admins
 * are alerted when the integration silently degrades:
 *
 *   - access token secret missing / token expired or invalid
 *   - required Graph permissions not granted
 *   - the app is not subscribed to the WABA (webhook not active)
 *   - the callback URL is unreachable or rejects the verify token
 *   - the app is still running on a preview domain (not published), so Meta
 *     cannot reach a stable callback URL
 *   - inbound deliveries stalled / dead-lettered envelopes piling up
 *
 * Everything is read through the caller's RLS-scoped Supabase client.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions Meta requires for Cloud API messaging + webhook management. */
const REQUIRED_SCOPES = ["whatsapp_business_messaging", "whatsapp_business_management"] as const;

export type HealthStatus = "ok" | "warn" | "error" | "unknown";

export interface HealthCheck {
  id:
    | "token_secret"
    | "token_valid"
    | "permissions"
    | "webhook_subscription"
    | "callback_reachable"
    | "app_domain"
    | "delivery_activity";
  label: string;
  status: HealthStatus;
  detail: string;
  /** Concrete next step when the check is not ok. */
  remedy?: string;
}

export interface AccountHealth {
  channelAccountId: string;
  displayName: string;
  phoneNumber: string | null;
  status: HealthStatus;
  checks: HealthCheck[];
}

export interface HealthReport {
  checkedAt: string;
  callbackUrl: string;
  status: HealthStatus;
  problems: number;
  accounts: AccountHealth[];
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(
      (parsed as { error?: { message?: string } } | null)?.error?.message ?? `Graph ${res.status}`,
    );
  }
  return parsed as T;
}

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = { ok: 0, unknown: 1, warn: 2, error: 3 };
  return rank[a] >= rank[b] ? a : b;
}

interface AccountRow {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  access_token_secret_name: string | null;
  app_secret_name: string | null;
  verify_token: string | null;
  status: string | null;
}

export const runWhatsAppHealthChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        channelAccountId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<HealthReport> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const callbackUrl = `${origin}/api/public/webhooks/whatsapp`;
    const host = new URL(origin).host;
    const isPreviewHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");

    let query = context.supabase
      .from("channel_accounts" as never)
      .select(
        "id, display_name, phone_number, phone_number_id, waba_id, status",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "whatsapp_cloud");
    if (data.channelAccountId) query = query.eq("id", data.channelAccountId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    // Secret references are admin-only; merged in via the permission-checked RPC.
    const { data: secrets } = await sbAny(context.supabase).rpc("channel_account_secrets" as never, {
      _workspace_id: data.workspaceId,
      _account_id: data.channelAccountId ?? null,
    } as never);
    const secretById = new Map(
      ((secrets ?? []) as Array<{
        id: string;
        verify_token: string | null;
        access_token_secret_name: string | null;
        app_secret_name: string | null;
      }>).map((s) => [s.id, s]),
    );
    const accounts = ((rows ?? []) as Array<{ id: string }>).map((r) => ({
      ...r,
      ...(secretById.get(r.id) ?? {
        verify_token: null,
        access_token_secret_name: null,
        app_secret_name: null,
      }),
    })) as unknown as AccountRow[];

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await context.supabase
      .from("webhook_events" as never)
      .select("channel_account_id, received_at, processed, dead_letter_at")
      .eq("provider", "whatsapp_cloud")
      .eq("workspace_id", data.workspaceId)
      .gte("received_at", since)
      .limit(2000);
    const recent = (events ?? []) as Array<{
      channel_account_id: string | null;
      received_at: string;
      processed: boolean;
      dead_letter_at: string | null;
    }>;

    const results: AccountHealth[] = [];

    for (const acc of accounts) {
      const checks: HealthCheck[] = [];

      // 1. Access token secret present -------------------------------------
      const secretName = acc.access_token_secret_name ?? "WHATSAPP_ACCESS_TOKEN";
      const token = process.env[secretName];
      checks.push(
        token
          ? { id: "token_secret", label: "Access token secret", status: "ok", detail: `${secretName} is configured.` }
          : {
              id: "token_secret",
              label: "Access token secret",
              status: "error",
              detail: `Secret ${secretName} is not set on the server.`,
              remedy: `Add the ${secretName} secret with a permanent System User token from Meta.`,
            },
      );

      if (!acc.app_secret_name) {
        checks.push({
          id: "token_secret",
          label: "App secret",
          status: "warn",
          detail: "No app secret configured — inbound payload signatures cannot be verified.",
          remedy: "Save your Meta app secret and reference it on this account so X-Hub-Signature-256 is validated.",
        });
      }

      // 2 & 3. Token validity + permissions --------------------------------
      if (!token) {
        checks.push({
          id: "token_valid",
          label: "Token validity",
          status: "unknown",
          detail: "Skipped — no token available to probe.",
        });
        checks.push({
          id: "permissions",
          label: "Graph permissions",
          status: "unknown",
          detail: "Skipped — no token available to probe.",
        });
      } else {
        try {
          const info = await graphGet<{
            data?: {
              is_valid?: boolean;
              expires_at?: number;
              scopes?: string[];
              error?: { message?: string };
            };
          }>(`/debug_token?input_token=${encodeURIComponent(token)}`, token);
          const d = info.data ?? {};
          const expiresAt = d.expires_at ? new Date(d.expires_at * 1000) : null;
          const expiresSoon =
            expiresAt !== null && expiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

          if (d.is_valid === false) {
            checks.push({
              id: "token_valid",
              label: "Token validity",
              status: "error",
              detail: d.error?.message ?? "Meta reports this access token is no longer valid.",
              remedy: `Generate a new token in Meta and update the ${secretName} secret.`,
            });
          } else if (expiresSoon) {
            checks.push({
              id: "token_valid",
              label: "Token validity",
              status: "warn",
              detail: `Token expires ${expiresAt!.toLocaleString()}.`,
              remedy: "Swap in a permanent System User token so messaging does not stop.",
            });
          } else {
            checks.push({
              id: "token_valid",
              label: "Token validity",
              status: "ok",
              detail: expiresAt ? `Valid until ${expiresAt.toLocaleString()}.` : "Valid, no expiry reported.",
            });
          }

          const scopes = d.scopes ?? [];
          const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
          checks.push(
            scopes.length === 0
              ? {
                  id: "permissions",
                  label: "Graph permissions",
                  status: "unknown",
                  detail: "Meta did not report any scopes for this token.",
                }
              : missing.length > 0
                ? {
                    id: "permissions",
                    label: "Graph permissions",
                    status: "error",
                    detail: `Missing permission${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
                    remedy:
                      "Re-authorize the app in Meta Business settings and grant the missing WhatsApp permissions.",
                  }
                : {
                    id: "permissions",
                    label: "Graph permissions",
                    status: "ok",
                    detail: `Granted: ${REQUIRED_SCOPES.join(", ")}.`,
                  },
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            id: "token_valid",
            label: "Token validity",
            status: "error",
            detail: msg,
            remedy: `Verify the ${secretName} secret holds a current Meta access token.`,
          });
          checks.push({
            id: "permissions",
            label: "Graph permissions",
            status: "unknown",
            detail: "Could not read scopes because the token probe failed.",
          });
        }

        // 4. Webhook subscription on the WABA ------------------------------
        if (!acc.waba_id) {
          checks.push({
            id: "webhook_subscription",
            label: "Webhook subscription",
            status: "error",
            detail: "No WhatsApp Business Account ID saved on this account.",
            remedy: "Add the WABA ID in Settings → WhatsApp so the subscription can be verified.",
          });
        } else {
          try {
            const subs = await graphGet<{
              data?: Array<{
                whatsapp_business_api_data?: { id?: string; name?: string };
                subscribed_fields?: string[];
              }>;
            }>(`/${acc.waba_id}/subscribed_apps`, token);
            const apps = subs.data ?? [];
            if (apps.length === 0) {
              checks.push({
                id: "webhook_subscription",
                label: "Webhook subscription",
                status: "error",
                detail: "No app is subscribed to this WABA — Meta will not deliver any webhooks.",
                remedy:
                  "In Meta → WhatsApp → Configuration, subscribe your app to this WABA and enable the messages field.",
              });
            } else {
              const fields = apps.flatMap((a) => a.subscribed_fields ?? []);
              const hasMessages = fields.length === 0 || fields.includes("messages");
              checks.push({
                id: "webhook_subscription",
                label: "Webhook subscription",
                status: hasMessages ? "ok" : "warn",
                detail: hasMessages
                  ? `Subscribed app: ${apps[0]?.whatsapp_business_api_data?.name ?? "connected"}${
                      fields.length ? ` · fields: ${Array.from(new Set(fields)).join(", ")}` : ""
                    }`
                  : `Subscribed, but the "messages" field is not enabled (${fields.join(", ")}).`,
                remedy: hasMessages
                  ? undefined
                  : "Enable the messages and message_status webhook fields in Meta → WhatsApp → Configuration.",
              });
            }
          } catch (err) {
            checks.push({
              id: "webhook_subscription",
              label: "Webhook subscription",
              status: "error",
              detail: err instanceof Error ? err.message : String(err),
              remedy:
                "The token likely lacks whatsapp_business_management, or the WABA ID is wrong. Re-authorize and retry.",
            });
          }
        }
      }

      // 5. Callback reachability (Meta's real subscription challenge) -------
      if (!acc.verify_token) {
        checks.push({
          id: "callback_reachable",
          label: "Callback URL",
          status: "error",
          detail: "No verify token saved for this account.",
          remedy: "Generate a verify token in the setup wizard and paste the same value into Meta.",
        });
      } else {
        const challenge = `hc-${Math.random().toString(36).slice(2, 12)}`;
        const probe = new URL(callbackUrl);
        probe.searchParams.set("hub.mode", "subscribe");
        probe.searchParams.set("hub.verify_token", acc.verify_token);
        probe.searchParams.set("hub.challenge", challenge);
        try {
          const res = await fetch(probe.toString(), { method: "GET" });
          const body = (await res.text()).trim();
          const echoed = res.ok && body === challenge;
          checks.push({
            id: "callback_reachable",
            label: "Callback URL",
            status: echoed ? "ok" : "error",
            detail: echoed
              ? `${callbackUrl} answered Meta's verification challenge.`
              : `Endpoint responded HTTP ${res.status} without echoing the challenge.`,
            remedy: echoed
              ? undefined
              : "Make sure Meta uses this exact callback URL and the same verify token.",
          });
        } catch {
          checks.push({
            id: "callback_reachable",
            label: "Callback URL",
            status: "error",
            detail: "The callback URL could not be reached from the server.",
            remedy: "Publish the app so the webhook endpoint is reachable on a public domain.",
          });
        }
      }

      // 6. App domain published --------------------------------------------
      checks.push(
        isPreviewHost
          ? {
              id: "app_domain",
              label: "App domain",
              status: "error",
              detail: `Running on ${host}, which Meta cannot call reliably.`,
              remedy:
                "Publish the app (or connect a custom domain), then point Meta's callback URL at the published domain.",
            }
          : {
              id: "app_domain",
              label: "App domain",
              status: "ok",
              detail: `Serving on the public domain ${host}.`,
            },
      );

      // 7. Inbound delivery activity ---------------------------------------
      const mine = recent.filter((e) => e.channel_account_id === acc.id);
      const dead = mine.filter((e) => e.dead_letter_at).length;
      checks.push(
        dead > 0
          ? {
              id: "delivery_activity",
              label: "Delivery processing",
              status: "warn",
              detail: `${dead} envelope${dead === 1 ? "" : "s"} dead-lettered in the last 24h.`,
              remedy: "Review the dead-letter queue below and reprocess after fixing the cause.",
            }
          : mine.length === 0
            ? {
                id: "delivery_activity",
                label: "Delivery processing",
                status: "warn",
                detail: "No inbound webhooks received in the last 24 hours.",
                remedy: "Send a test message to this number to confirm Meta is delivering events.",
              }
            : {
                id: "delivery_activity",
                label: "Delivery processing",
                status: "ok",
                detail: `${mine.length} envelope${mine.length === 1 ? "" : "s"} received in the last 24h.`,
              },
      );

      results.push({
        channelAccountId: acc.id,
        displayName: acc.display_name ?? acc.phone_number ?? acc.id,
        phoneNumber: acc.phone_number,
        status: checks.reduce<HealthStatus>((s, c) => worst(s, c.status), "ok"),
        checks,
      });
    }

    const overall = results.reduce<HealthStatus>((s, a) => worst(s, a.status), "ok");
    const problems = results.reduce(
      (n, a) => n + a.checks.filter((c) => c.status === "error" || c.status === "warn").length,
      0,
    );

    return {
      checkedAt: new Date().toISOString(),
      callbackUrl,
      status: accounts.length === 0 ? "unknown" : overall,
      problems,
      accounts: results,
    };
  });
