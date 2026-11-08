/**
 * Inbound health checks for Messenger and Instagram.
 *
 * WhatsApp had `runWhatsAppHealthChecks`; these two channels had nothing. The
 * only thing "Verify" ever exercised was the outbound Graph API — a valid Page
 * token and a reachable Page — so an account reported "Connected" while Meta's
 * inbound deliveries were being refused at the door. That is the reported
 * symptom: Messenger messages appear only after a manual Sync (the polling
 * path, the one thing that does not need the webhook) and Instagram messages
 * never appear at all.
 *
 * The report is split in two on purpose:
 *
 *   - `platform` — deployment-level, identical for every account on the
 *     channel: the app secret, the verify token, the public domain, the two
 *     self-probes against our own callback URL, and the app-level webhook
 *     subscription in the Meta dashboard. These run even when no account is
 *     connected, because a broken app secret is exactly what stops the first
 *     account from ever working.
 *   - `accounts` — per Page / per IG account: stored token, its scopes, the
 *     Page's webhook subscription, and whether anything has actually arrived.
 *
 * Anything that needs a decrypted token is read with the service-role client
 * *after* the account row has been resolved through the caller's RLS-scoped
 * client, so workspace membership is still what decides visibility.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import type { HealthStatus } from "./health.functions";
import type { MetaChannel } from "./meta-health.server";

export type { HealthStatus };

export interface ChannelHealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  /** Concrete next step when the check is not ok. */
  remedy?: string;
}

export interface ChannelAccountHealth {
  accountId: string;
  displayName: string;
  /** Page id, @username — whatever identifies the account at a glance. */
  subtitle: string | null;
  status: HealthStatus;
  checks: ChannelHealthCheck[];
}

export interface ChannelHealthReport {
  channel: MetaChannel;
  checkedAt: string;
  callbackUrl: string;
  status: HealthStatus;
  problems: number;
  /** Deployment-level checks, shared by every account on this channel. */
  platform: ChannelHealthCheck[];
  accounts: ChannelAccountHealth[];
}

const WorkspaceInput = z.object({ workspaceId: z.string().uuid() });

/** Scopes each channel's inbound + reply path genuinely needs. */
const REQUIRED_SCOPES: Record<MetaChannel, string[]> = {
  messenger: ["pages_messaging", "pages_manage_metadata"],
  instagram: ["instagram_manage_messages", "pages_manage_metadata"],
};

/** The webhook object each channel is delivered under in the Meta dashboard. */
const WEBHOOK_OBJECT: Record<MetaChannel, string> = {
  messenger: "page",
  instagram: "instagram",
};

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = { ok: 0, unknown: 1, warn: 2, error: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function rollUp(checks: ChannelHealthCheck[]): HealthStatus {
  return checks.reduce<HealthStatus>((s, c) => worst(s, c.status), "ok");
}

function countProblems(checks: ChannelHealthCheck[]): number {
  return checks.filter((c) => c.status === "error" || c.status === "warn").length;
}

/* -------------------------------------------------------------------------- */
/*                             platform-level checks                          */
/* -------------------------------------------------------------------------- */

/**
 * Everything that is true of the deployment rather than of one account.
 *
 * Ordered so the first failure is the one to fix first: without the app secret
 * nothing downstream can work, and reporting six red lines when one variable
 * is missing just buries the answer.
 */
async function platformChecks(
  channel: MetaChannel,
  origin: string,
  callbackUrl: string,
): Promise<ChannelHealthCheck[]> {
  const {
    readMetaEnv,
    isUnreachableHost,
    probeVerifyChallenge,
    probeSignedDelivery,
    readAppSubscriptions,
  } = await import("./meta-health.server");

  const env = readMetaEnv(channel);
  const publicUrl = new URL(origin);
  const host = publicUrl.host;
  const channelLabel = channel === "messenger" ? "Messenger" : "Instagram";
  const checks: ChannelHealthCheck[] = [];

  // 1. App secret — the handler returns 500 without it, for every delivery.
  checks.push(
    env.appSecret
      ? {
          id: "app_secret",
          label: "App secret",
          status: "ok",
          detail: "META_APP_SECRET is set, so inbound signatures can be verified.",
        }
      : {
          id: "app_secret",
          label: "App secret",
          status: "error",
          detail:
            `META_APP_SECRET is not set. The ${channelLabel} webhook rejects every inbound ` +
            "delivery with HTTP 500 before reading it, so no message can ever reach the Inbox.",
          remedy:
            "Add META_APP_SECRET (Meta → App settings → Basic → App secret) to the server " +
            "environment and redeploy. This is the one variable that stops inbound entirely.",
        },
  );

  // 2. Verify token — without it Meta cannot even complete the subscription.
  checks.push(
    env.verifyToken
      ? {
          id: "verify_token",
          label: "Webhook verify token",
          status: "ok",
          detail: `Configured via ${env.verifyTokenSource}.`,
        }
      : {
          id: "verify_token",
          label: "Webhook verify token",
          status: "error",
          detail:
            "No verify token configured, so Meta's subscription handshake answers HTTP 500 " +
            "and the webhook can never be (re)verified.",
          remedy: `Set ${env.verifyTokenCandidates.join(" or ")} and use the same value in Meta.`,
        },
  );

  // 3. Public domain — Meta will not retry its way past an unroutable host.
  checks.push(
    isUnreachableHost(host)
      ? {
          id: "app_domain",
          label: "Public domain",
          status: "error",
          detail: `Serving on ${host}, which Meta cannot reach from the internet.`,
          remedy:
            "Deploy to a public domain and point the callback URL in Meta at it. Inbound " +
            "webhooks cannot work on localhost or a preview host.",
        }
      : publicUrl.protocol !== "https:"
        ? {
            id: "app_domain",
            label: "Public domain",
            status: "error",
            detail: `${origin} uses HTTP; Meta requires an HTTPS webhook callback.`,
            remedy: "Set APP_ORIGIN to this deployment's public HTTPS origin and use its HTTPS callback URL in Meta.",
          }
      : {
          id: "app_domain",
          label: "Public domain",
          status: "ok",
          detail: `Serving on the public domain ${host}.`,
        },
  );

  // 4. The subscription handshake, replayed exactly as Meta performs it.
  if (!env.verifyToken) {
    checks.push({
      id: "callback_verify",
      label: "Callback verification",
      status: "unknown",
      detail: "Skipped — there is no verify token to present.",
    });
  } else {
    const probe = await probeVerifyChallenge(callbackUrl, env.verifyToken);
    // Cloudflare Workers can fail to reach their own public hostname from
    // inside themselves (a platform-level self-fetch quirk), answering 522
    // even though Meta — a real external caller — gets a normal 200 with the
    // challenge echoed back in well under a second. Verified directly against
    // this deployment: an external GET with the real token round-trips fine.
    // Treating that as a hard "error" sends people chasing a token/URL
    // mismatch that doesn't exist, so it's downgraded to a warning that
    // points at the one check that can't lie — Meta's own dashboard.
    const isSelfProbeQuirk = probe.status === 522;
    checks.push(
      probe.echoed
        ? {
            id: "callback_verify",
            label: "Callback verification",
            status: "ok",
            detail: `${callbackUrl} echoed Meta's challenge.`,
          }
        : isSelfProbeQuirk
          ? {
              id: "callback_verify",
              label: "Callback verification",
              status: "warn",
              detail:
                `${callbackUrl} answered HTTP 522 when this server probed itself. This is a known ` +
                "Cloudflare Workers limitation with self-fetches, not a sign the webhook is broken " +
                "for real callers — Meta reaches this same URL over the public internet, not from inside the Worker.",
              remedy:
                "Use Meta's \"Verify and Save\" on this exact callback URL in the App Dashboard — " +
                "that is the authoritative check, since it calls the URL the same way Meta's real webhook deliveries do.",
            }
          : {
              id: "callback_verify",
              label: "Callback verification",
              status: "error",
              detail: probe.transportError
                ? `${callbackUrl} could not be reached: ${probe.transportError}`
                : `${callbackUrl} answered HTTP ${probe.status} without echoing the challenge${
                    probe.body ? ` (${probe.body})` : ""
                  }.`,
              remedy:
                "Confirm Meta's callback URL is exactly this URL and its verify token matches " +
                `${env.verifyTokenSource ?? env.verifyTokenCandidates[0]}.`,
            },
    );
  }

  // 5. A real signed delivery. This is the check that catches the reported bug:
  //    it fails the same way Meta's own POSTs are failing right now.
  if (!env.appSecret) {
    checks.push({
      id: "inbound_delivery",
      label: "Signed inbound delivery",
      status: "unknown",
      detail: "Skipped — no app secret to sign the probe with.",
    });
  } else {
    const probe = await probeSignedDelivery(callbackUrl, channel, env.appSecret);
    if (probe.ok) {
      checks.push({
        id: "inbound_delivery",
        label: "Signed inbound delivery",
        status: "ok",
        detail: "A signed test delivery was accepted — the inbound path works end to end.",
      });
    } else if (probe.transportError) {
      checks.push({
        id: "inbound_delivery",
        label: "Signed inbound delivery",
        status: "error",
        detail: `The webhook could not be reached: ${probe.transportError}`,
        remedy: "Make sure the deployed app answers POST on its own public callback URL.",
      });
    } else if (probe.status === 401) {
      checks.push({
        id: "inbound_delivery",
        label: "Signed inbound delivery",
        status: "error",
        detail:
          "The webhook rejected a correctly signed delivery (HTTP 401), so META_APP_SECRET " +
          "does not match the app Meta signs with.",
        remedy:
          "Copy the App secret from the same Meta app that owns this webhook into " +
          "META_APP_SECRET. A secret from a different app fails exactly like this.",
      });
    } else {
      checks.push({
        id: "inbound_delivery",
        label: "Signed inbound delivery",
        status: "error",
        detail: `The webhook answered HTTP ${probe.status}${probe.body ? `: ${probe.body}` : ""}.`,
        remedy:
          "Check the server logs for this request — Meta's real deliveries are failing the " +
          "same way, which is why messages only appear after a manual sync.",
      });
    }
  }

  // 6. App-level subscription. A Page can be wired up correctly and still
  //    deliver nothing when the app has no subscription for this object.
  if (!env.appId || !env.appSecret) {
    checks.push({
      id: "app_subscription",
      label: "App webhook subscription",
      status: "unknown",
      detail: "Skipped — META_APP_ID and META_APP_SECRET are both needed to read it.",
      remedy: env.appId ? undefined : "Set META_APP_ID to enable this check.",
    });
  } else {
    const wanted = WEBHOOK_OBJECT[channel];
    const subs = await readAppSubscriptions(env.appId, env.appSecret);
    if (!subs.ok) {
      checks.push({
        id: "app_subscription",
        label: "App webhook subscription",
        status: "unknown",
        detail: `Meta would not report the app's subscriptions: ${subs.error}`,
        remedy: "Confirm META_APP_ID and META_APP_SECRET belong to the same Meta app.",
      });
    } else {
      const sub = subs.subscriptions.find((s) => s.object === wanted);
      if (!sub) {
        const found = subs.subscriptions.map((s) => s.object);
        checks.push({
          id: "app_subscription",
          label: "App webhook subscription",
          status: "error",
          detail:
            `The Meta app has no "${wanted}" webhook subscription` +
            (found.length ? `, only: ${found.join(", ")}.` : " at all.") +
            ` No ${channelLabel} event will ever be delivered.`,
          remedy:
            `In Meta → App → Webhooks, add the "${wanted}" object, point it at ${callbackUrl}, ` +
            'and subscribe the "messages" field.',
        });
      } else if (!sub.fields.includes("messages")) {
        checks.push({
          id: "app_subscription",
          label: "App webhook subscription",
          status: "error",
          detail:
            `The "${wanted}" subscription exists but does not include the "messages" field` +
            (sub.fields.length ? ` (only ${sub.fields.join(", ")}).` : "."),
          remedy: `Subscribe the "messages" field on the "${wanted}" object in Meta → App → Webhooks.`,
        });
      } else {
        // The subscription can be live but aimed somewhere else entirely —
        // a stale preview URL is a common leftover and looks healthy in Meta.
        const mismatch =
          sub.callbackUrl && sub.callbackUrl.replace(/\/$/, "") !== callbackUrl.replace(/\/$/, "");
        checks.push({
          id: "app_subscription",
          label: "App webhook subscription",
          status: mismatch ? "warn" : sub.active ? "ok" : "warn",
          detail: mismatch
            ? `Subscribed with the "messages" field, but Meta delivers to ${sub.callbackUrl}, not ${callbackUrl}.`
            : sub.active
              ? `"${wanted}" subscribed with fields: ${sub.fields.join(", ")}.`
              : `"${wanted}" is subscribed but marked inactive by Meta.`,
          remedy: mismatch
            ? `Update the callback URL in Meta → App → Webhooks to ${callbackUrl}.`
            : sub.active
              ? undefined
              : "Re-verify the callback URL in Meta to reactivate the subscription.",
        });
      }
    }
  }

  return checks;
}

/**
 * Inbound traffic actually recorded for this workspace, from the shared
 * delivery log. Attribution to a workspace only exists for deliveries whose
 * account could be resolved, so a zero here alongside a green probe means Meta
 * is not sending — not that we dropped anything.
 */
async function deliveryActivityCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  channel: MetaChannel,
  workspaceId: string,
): Promise<ChannelHealthCheck> {
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data, error } = await sbAny(supabase)
    .from("inbound_webhook_deliveries" as never)
    .select("status, signature_verified, received_at")
    .eq("provider", channel)
    .eq("workspace_id", workspaceId)
    .gte("received_at", since)
    .limit(1000);

  if (error) {
    return {
      id: "delivery_log",
      label: "Delivery log (24h)",
      status: "unknown",
      detail: `Could not read the delivery log: ${error.message}`,
    };
  }

  const rows = (data ?? []) as Array<{
    status: string | null;
    signature_verified: boolean | null;
    received_at: string;
  }>;
  const failed = rows.filter((r) => r.status === "failed").length;
  const rejected = rows.filter(
    (r) => r.status === "rejected" || r.signature_verified === false,
  ).length;

  if (rows.length === 0) {
    return {
      id: "delivery_log",
      label: "Delivery log (24h)",
      status: "warn",
      detail: "No inbound deliveries recorded for this workspace in the last 24 hours.",
      remedy:
        "Send yourself a message on this channel. If the probes above are green and nothing " +
        "is recorded, Meta is not delivering — check the subscription in the Meta dashboard.",
    };
  }
  if (rejected > 0) {
    return {
      id: "delivery_log",
      label: "Delivery log (24h)",
      status: "error",
      detail: `${rejected} of ${rows.length} deliveries failed signature verification.`,
      remedy: "META_APP_SECRET does not match the app Meta signs with — correct it and redeploy.",
    };
  }
  if (failed > 0) {
    return {
      id: "delivery_log",
      label: "Delivery log (24h)",
      status: "warn",
      detail: `${failed} of ${rows.length} deliveries were accepted but failed while processing.`,
      remedy: "Check the server logs for the processing error; the message was not materialised.",
    };
  }
  return {
    id: "delivery_log",
    label: "Delivery log (24h)",
    status: "ok",
    detail: `${rows.length} inbound deliver${rows.length === 1 ? "y" : "ies"} processed.`,
  };
}

/* -------------------------------------------------------------------------- */
/*                              token / scope checks                          */
/* -------------------------------------------------------------------------- */

async function tokenChecks(
  channel: MetaChannel,
  cipher: string | null,
  appId: string | null,
  appSecret: string | null,
): Promise<{ checks: ChannelHealthCheck[]; token: string | null }> {
  const checks: ChannelHealthCheck[] = [];
  const reconnect =
    channel === "messenger"
      ? "Reconnect this Page from Messenger Accounts to store a fresh token."
      : "Reconnect this account from Instagram to store a fresh token.";

  if (!cipher) {
    checks.push({
      id: "token_stored",
      label: "Stored access token",
      status: "error",
      detail: "No access token is stored for this account.",
      remedy: reconnect,
    });
    return { checks, token: null };
  }

  const { decryptToken } = await import("@/lib/instagram/token-crypto.server");
  let token: string;
  try {
    token = decryptToken(cipher);
  } catch (err) {
    checks.push({
      id: "token_stored",
      label: "Stored access token",
      status: "error",
      detail: `The stored token could not be decrypted: ${err instanceof Error ? err.message : String(err)}`,
      remedy:
        "APP_USER_CONNECTION_KEY_SECRET / META_TOKEN_ENCRYPTION_KEY has changed since the " +
        `account was linked. Restore the original key, or ${reconnect.toLowerCase()}`,
    });
    return { checks, token: null };
  }

  checks.push({
    id: "token_stored",
    label: "Stored access token",
    status: "ok",
    detail: "An access token is stored and could be decrypted.",
  });

  const { debugToken } = await import("./meta-health.server");
  const info = await debugToken(token, appId, appSecret);

  if (!info.ok) {
    checks.push({
      id: "token_valid",
      label: "Token validity",
      status: "unknown",
      detail: `Meta would not introspect the token: ${info.error}`,
    });
    checks.push({
      id: "permissions",
      label: "Granted permissions",
      status: "unknown",
      detail: "Skipped — the token probe did not return scopes.",
    });
    return { checks, token };
  }

  if (info.isValid === false) {
    checks.push({
      id: "token_valid",
      label: "Token validity",
      status: "error",
      detail: info.error ?? "Meta reports this access token is no longer valid.",
      remedy: reconnect,
    });
  } else {
    const expiresAt = info.expiresAt ? new Date(info.expiresAt) : null;
    const expiresSoon =
      expiresAt !== null && expiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
    checks.push({
      id: "token_valid",
      label: "Token validity",
      status: expiresSoon ? "warn" : "ok",
      detail: expiresAt
        ? `Valid until ${expiresAt.toLocaleString()}.`
        : "Valid, with no expiry reported.",
      remedy: expiresSoon
        ? "Reconnect the account to mint a long-lived token before this one lapses."
        : undefined,
    });
  }

  const required = REQUIRED_SCOPES[channel];
  const missing = required.filter((s) => !info.scopes.includes(s));
  checks.push(
    info.scopes.length === 0
      ? {
          id: "permissions",
          label: "Granted permissions",
          status: "unknown",
          detail: "Meta did not report any scopes for this token.",
        }
      : missing.length > 0
        ? {
            id: "permissions",
            label: "Granted permissions",
            status: "error",
            detail: `Missing permission${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
            remedy: "Re-authorize the account and grant the missing permissions in Meta's dialog.",
          }
        : {
            id: "permissions",
            label: "Granted permissions",
            status: "ok",
            detail: `Granted: ${required.join(", ")}.`,
          },
  );

  return { checks, token };
}

/** GET /{page-id}/subscribed_apps — is the Page delivering to this app? */
async function pageSubscriptionCheck(
  pageId: string | null,
  token: string | null,
  channelLabel: string,
): Promise<ChannelHealthCheck> {
  if (!pageId) {
    return {
      id: "page_subscription",
      label: "Page webhook subscription",
      status: "error",
      detail: "No Facebook Page is linked to this account, so Meta has nothing to deliver from.",
      remedy: "Reconnect and pick the Page this account is attached to.",
    };
  }
  if (!token) {
    return {
      id: "page_subscription",
      label: "Page webhook subscription",
      status: "unknown",
      detail: "Skipped — no usable access token.",
    };
  }

  const { readPageSubscriptionWithToken } = await import("./meta-health.server");
  const sub = await readPageSubscriptionWithToken(pageId, token);

  if (!sub.ok) {
    return {
      id: "page_subscription",
      label: "Page webhook subscription",
      status: "error",
      detail: `Meta would not report the Page's subscription: ${sub.error}`,
      remedy: "The token likely lacks pages_manage_metadata. Re-authorize and retry.",
    };
  }
  if (!sub.subscribed) {
    return {
      id: "page_subscription",
      label: "Page webhook subscription",
      status: "error",
      detail: `This Page is not subscribed to the app, so Meta sends it no ${channelLabel} events.`,
      remedy: "Use Reconnect on this account — it re-arms the Page subscription.",
    };
  }
  if (!sub.fields.includes("messages")) {
    return {
      id: "page_subscription",
      label: "Page webhook subscription",
      status: "error",
      detail:
        'The Page is subscribed but without the "messages" field' +
        (sub.fields.length ? ` (only ${sub.fields.join(", ")}).` : "."),
      remedy: "Use Reconnect to re-subscribe with the full field set.",
    };
  }
  return {
    id: "page_subscription",
    label: "Page webhook subscription",
    status: "ok",
    detail: `Subscribed with fields: ${sub.fields.join(", ")}.`,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Messenger                                 */
/* -------------------------------------------------------------------------- */

export const runMessengerHealthChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WorkspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<ChannelHealthReport> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { publicMetaOrigin } = await import("./meta-health.server");
    const origin = publicMetaOrigin(getRequest().url);
    const callbackUrl = `${origin}/api/public/webhooks/messenger`;

    const platform = await platformChecks("messenger", origin, callbackUrl);
    platform.push(await deliveryActivityCheck(context.supabase, "messenger", data.workspaceId));

    const { data: rows, error } = await context.supabase
      .from("messenger_accounts")
      .select("id, page_id, page_name, status, status_reason")
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);

    const accountRows = (rows ?? []) as Array<{
      id: string;
      page_id: string;
      page_name: string | null;
      status: string | null;
      status_reason: string | null;
    }>;

    const { readMetaEnv } = await import("./meta-health.server");
    const env = readMetaEnv("messenger");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

    const accounts: ChannelAccountHealth[] = [];
    for (const acc of accountRows) {
      const checks: ChannelHealthCheck[] = [];

      if (acc.status && acc.status !== "connected") {
        checks.push({
          id: "account_status",
          label: "Account status",
          status: acc.status === "disconnected" ? "warn" : "error",
          detail: acc.status_reason ?? `This Page is marked "${acc.status}".`,
          remedy: "Reconnect the Page to resume inbound delivery.",
        });
      }

      // Ciphertext is admin-only; the row above was resolved under RLS first.
      const { data: tokenRow } = await sbAny(supabaseAdmin)
        .from("messenger_accounts" as never)
        .select("access_token_ciphertext")
        .eq("id", acc.id)
        .maybeSingle();

      const { checks: tokChecks, token } = await tokenChecks(
        "messenger",
        (tokenRow as { access_token_ciphertext?: string | null } | null)?.access_token_ciphertext ??
          null,
        env.appId,
        env.appSecret,
      );
      checks.push(...tokChecks);
      checks.push(await pageSubscriptionCheck(acc.page_id, token, "Messenger"));

      // Did anything actually land? Threads are keyed to the Page id.
      const { data: convRows } = await context.supabase
        .from("conversations")
        .select("last_message_at")
        .eq("workspace_id", data.workspaceId)
        .eq("channel", "messenger")
        .contains("metadata", { page_id: acc.page_id })
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);
      const lastAt = (convRows ?? [])[0]?.last_message_at as string | null | undefined;

      checks.push(
        !lastAt
          ? {
              id: "inbound_activity",
              label: "Inbound activity",
              status: "warn",
              detail: "No Messenger thread has ever been created for this Page.",
              remedy: "Message the Page from another Facebook account to produce a first thread.",
            }
          : lastAt < since
            ? {
                id: "inbound_activity",
                label: "Inbound activity",
                status: "warn",
                detail: `Last thread activity was ${new Date(lastAt).toLocaleString()}.`,
                remedy:
                  "Quiet for over 24 hours. Send a test message — if it does not appear, the " +
                  "platform checks above say why.",
              }
            : {
                id: "inbound_activity",
                label: "Inbound activity",
                status: "ok",
                detail: `Last thread activity ${new Date(lastAt).toLocaleString()}.`,
              },
      );

      accounts.push({
        accountId: acc.id,
        displayName: acc.page_name ?? acc.page_id,
        subtitle: `Page ${acc.page_id}`,
        status: rollUp(checks),
        checks,
      });
    }

    const status = worst(
      rollUp(platform),
      accounts.reduce<HealthStatus>((s, a) => worst(s, a.status), "ok"),
    );
    return {
      channel: "messenger",
      checkedAt: new Date().toISOString(),
      callbackUrl,
      status,
      problems: countProblems(platform) + accounts.reduce((n, a) => n + countProblems(a.checks), 0),
      platform,
      accounts,
    };
  });

/* -------------------------------------------------------------------------- */
/*                                  Instagram                                 */
/* -------------------------------------------------------------------------- */

export const runInstagramHealthChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WorkspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<ChannelHealthReport> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { publicMetaOrigin } = await import("./meta-health.server");
    const origin = publicMetaOrigin(getRequest().url);
    const callbackUrl = `${origin}/api/public/webhooks/instagram`;

    const platform = await platformChecks("instagram", origin, callbackUrl);
    platform.push(await deliveryActivityCheck(context.supabase, "instagram", data.workspaceId));

    // Events Meta delivered that matched no linked IG account. These are pure
    // signal: delivery is working and the account mapping is what is wrong.
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const { count: orphanCount } = await sbAny(context.supabase)
      .from("instagram_webhook_events" as never)
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("status", "orphaned")
      .gte("created_at", since);
    if ((orphanCount ?? 0) > 0) {
      platform.push({
        id: "orphaned_events",
        label: "Unmatched events",
        status: "error",
        detail:
          `${orphanCount} Instagram event${orphanCount === 1 ? "" : "s"} arrived in the last 24h ` +
          "for an IG account that is not linked here, so they were dropped.",
        remedy:
          "Link the Instagram professional account that received the message, or reconnect it " +
          "if its IG user id changed.",
      });
    }

    const { data: rows, error } = await context.supabase
      .from("instagram_accounts")
      .select("id, ig_user_id, username, name, page_id, status, status_reason")
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);

    const accountRows = (rows ?? []) as Array<{
      id: string;
      ig_user_id: string;
      username: string | null;
      name: string | null;
      page_id: string | null;
      status: string | null;
      status_reason: string | null;
    }>;

    const { readMetaEnv } = await import("./meta-health.server");
    const env = readMetaEnv("instagram");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const accounts: ChannelAccountHealth[] = [];
    for (const acc of accountRows) {
      const checks: ChannelHealthCheck[] = [];

      if (acc.status && acc.status !== "connected") {
        checks.push({
          id: "account_status",
          label: "Account status",
          status: acc.status === "disconnected" ? "warn" : "error",
          detail: acc.status_reason ?? `This account is marked "${acc.status}".`,
          remedy: "Reconnect the account to resume inbound delivery.",
        });
      }

      const { data: tokenRow } = await sbAny(supabaseAdmin)
        .from("instagram_accounts" as never)
        .select("access_token_ciphertext")
        .eq("id", acc.id)
        .maybeSingle();

      const { checks: tokChecks, token } = await tokenChecks(
        "instagram",
        (tokenRow as { access_token_ciphertext?: string | null } | null)?.access_token_ciphertext ??
          null,
        env.appId,
        env.appSecret,
      );
      checks.push(...tokChecks);
      checks.push(await pageSubscriptionCheck(acc.page_id, token, "Instagram"));

      // Instagram keeps its own event table, so inbound is directly countable.
      const { data: evRows } = await sbAny(context.supabase)
        .from("instagram_webhook_events" as never)
        .select("status, created_at")
        .eq("instagram_account_id", acc.id)
        .gte("created_at", since)
        .limit(500);
      const events = (evRows ?? []) as Array<{ status: string | null; created_at: string }>;

      checks.push(
        events.length === 0
          ? {
              id: "inbound_activity",
              label: "Inbound activity",
              status: "warn",
              detail: "No Instagram events received for this account in the last 24 hours.",
              remedy:
                "Send a DM to this account from another Instagram profile. Note that Meta only " +
                "delivers DMs when the account is a professional account with messaging enabled " +
                "and connected to the linked Page.",
            }
          : {
              id: "inbound_activity",
              label: "Inbound activity",
              status: "ok",
              detail: `${events.length} event${events.length === 1 ? "" : "s"} received in the last 24h.`,
            },
      );

      accounts.push({
        accountId: acc.id,
        displayName: acc.username ? `@${acc.username}` : (acc.name ?? acc.ig_user_id),
        subtitle: acc.page_id ? `Page ${acc.page_id}` : "No Page linked",
        status: rollUp(checks),
        checks,
      });
    }

    const status = worst(
      rollUp(platform),
      accounts.reduce<HealthStatus>((s, a) => worst(s, a.status), "ok"),
    );
    return {
      channel: "instagram",
      checkedAt: new Date().toISOString(),
      callbackUrl,
      status,
      problems: countProblems(platform) + accounts.reduce((n, a) => n + countProblems(a.checks), 0),
      platform,
      accounts,
    };
  });
