/**
 * Meta App credential status + connection verification (Messenger).
 *
 * Security model:
 *  - Values of META_APP_ID / META_APP_SECRET are NEVER returned. The App ID is
 *    only ever returned masked (last 4 digits), the secret only as a boolean +
 *    length hint.
 *  - Workspace admins only (`is_workspace_admin`).
 *  - Verification uses the app access token (`{app_id}|{app_secret}`) which is
 *    built and used strictly server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const GRAPH = "https://graph.facebook.com/v21.0";

export type CheckState = "ok" | "warn" | "fail";

export interface MetaCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  remedy?: string;
}

export interface MetaAppStatus {
  checkedAt: string;
  appIdPresent: boolean;
  appSecretPresent: boolean;
  /** e.g. "••••••1234" — never the full value. */
  appIdMasked: string | null;
  appSecretLength: number | null;
  appName: string | null;
  pagesConnected: number;
  pagesHealthy: number;
  callbackUrl: string;
  checks: MetaCheck[];
}

const Input = z.object({
  workspaceId: z.string().uuid(),
  origin: z.string().url().optional(),
});

function mask(value: string): string {
  const tail = value.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(12, value.length - 4)))}${tail}`;
}

export const getMetaAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<MetaAppStatus> => {
    const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin", {
      _workspace_id: data.workspaceId,
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("Unauthorized: only workspace admins can view Meta app settings.");

    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";
    const verifyToken =
      process.env["META_WEBHOOK_VERIFY_TOKEN"] ??
      process.env["MESSENGER_WEBHOOK_VERIFY_TOKEN"] ??
      "";
    const checks: MetaCheck[] = [];

    checks.push(
      appId
        ? { id: "app_id", label: "META_APP_ID stored", state: "ok", detail: `Configured (${mask(appId)}).` }
        : {
            id: "app_id",
            label: "META_APP_ID stored",
            state: "fail",
            detail: "Not configured.",
            remedy: "Configure META_APP_ID as a server-side secret, never in client code.",
          },
    );
    checks.push(
      appSecret
        ? {
            id: "app_secret",
            label: "META_APP_SECRET stored",
            state: "ok",
            detail: `Configured (${appSecret.length} characters, value hidden).`,
          }
        : {
            id: "app_secret",
            label: "META_APP_SECRET stored",
            state: "fail",
            detail: "Not configured.",
            remedy: "Configure META_APP_SECRET as a server-side secret. It signs webhooks and exchanges OAuth codes.",
          },
    );

    checks.push(
      verifyToken
        ? {
            id: "verify_token",
            label: "META_WEBHOOK_VERIFY_TOKEN stored",
            state: "ok",
            detail: `Configured (${verifyToken.length} characters, value hidden). Used for webhook subscription challenge.`,
          }
        : {
            id: "verify_token",
            label: "META_WEBHOOK_VERIFY_TOKEN stored",
            state: "fail",
            detail: "Not configured — Meta cannot complete the webhook subscription challenge.",
            remedy:
              "Set META_WEBHOOK_VERIFY_TOKEN (any random string) in environment secrets, then enter the same value in Meta app → Webhooks → Edit subscription → Verify Token.",
          },
    );

    let appName: string | null = null;
    if (appId && appSecret) {
      try {
        const res = await fetch(
          `${GRAPH}/${encodeURIComponent(appId)}?fields=id,name,link&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
        );
        const json: { id?: string; name?: string; error?: { message?: string } } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || json.error) {
          checks.push({
            id: "credentials",
            label: "Credentials accepted by Meta",
            state: "fail",
            detail: json.error?.message ?? `Meta returned HTTP ${res.status}.`,
            remedy:
              "The App ID and App Secret don't match a live Meta app. Re-copy both from developers.facebook.com → your app → Settings → Basic.",
          });
        } else {
          appName = json.name ?? null;
          checks.push({
            id: "credentials",
            label: "Credentials accepted by Meta",
            state: "ok",
            detail: `Authenticated as “${json.name ?? appId}”.`,
          });

          // Webhook subscription fields on the app.
          try {
            const subRes = await fetch(
              `${GRAPH}/${encodeURIComponent(appId)}/subscriptions?access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
            );
            const subJson: {
              data?: Array<{ object?: string; callback_url?: string; active?: boolean; fields?: Array<{ name?: string } | string> }>;
              error?: { message?: string };
            } = await subRes.json().catch(() => ({}));
            const page = (subJson.data ?? []).find((s) => s.object === "page");
            if (!page) {
              checks.push({
                id: "webhook",
                label: "Messenger webhook subscribed",
                state: "warn",
                detail: "No `page` webhook subscription found on this app.",
                remedy:
                  "In the Meta app → Webhooks → Page, subscribe using the callback URL below and the fields messages, messaging_postbacks, message_deliveries, message_reads.",
              });
            } else {
              const fields = (page.fields ?? []).map((f) => (typeof f === "string" ? f : (f.name ?? "")));
              const missing = ["messages", "messaging_postbacks"].filter((f) => !fields.includes(f));
              checks.push({
                id: "webhook",
                label: "Messenger webhook subscribed",
                state: missing.length ? "warn" : "ok",
                detail: missing.length
                  ? `Subscribed, but missing field(s): ${missing.join(", ")}.`
                  : `Subscribed (${fields.length} field${fields.length === 1 ? "" : "s"}).`,
                ...(missing.length
                  ? { remedy: "Add the missing fields in Meta app → Webhooks → Page → Edit subscription." }
                  : {}),
              });
            }
          } catch {
            checks.push({
              id: "webhook",
              label: "Messenger webhook subscribed",
              state: "warn",
              detail: "Could not read webhook subscriptions from Meta.",
            });
          }
        }
      } catch (err) {
        checks.push({
          id: "credentials",
          label: "Credentials accepted by Meta",
          state: "fail",
          detail: err instanceof Error ? err.message : "Network error contacting Meta Graph API.",
          remedy: "Retry the check; if it keeps failing, Meta Graph may be unreachable from the server.",
        });
      }
    }

    // Linked Facebook Pages for this workspace.
    const { data: pages } = await context.supabase
      .from("messenger_accounts")
      .select("id, page_name, status")
      .eq("workspace_id", data.workspaceId);
    const rows = (pages ?? []) as Array<{ status: string | null; page_name: string | null }>;
    const healthy = rows.filter((r) => r.status === "connected" || r.status === "active").length;
    checks.push({
      id: "pages",
      label: "Facebook Pages linked",
      state: rows.length === 0 ? "warn" : healthy === 0 ? "fail" : "ok",
      detail:
        rows.length === 0
          ? "No Facebook Page connected yet."
          : `${healthy} of ${rows.length} linked Page${rows.length === 1 ? "" : "s"} healthy.`,
      ...(healthy < rows.length || rows.length === 0
        ? { remedy: "Open API Configurations → Messenger Accounts and connect (or reconnect) a Page." }
        : {}),
    });

    const origin = data.origin?.replace(/\/$/, "") ?? "";
    return {
      checkedAt: new Date().toISOString(),
      appIdPresent: Boolean(appId),
      appSecretPresent: Boolean(appSecret),
      appIdMasked: appId ? mask(appId) : null,
      appSecretLength: appSecret ? appSecret.length : null,
      appName,
      pagesConnected: rows.length,
      pagesHealthy: healthy,
      callbackUrl: `${origin}/api/public/messenger/callback`,
      checks,
    };
  });
