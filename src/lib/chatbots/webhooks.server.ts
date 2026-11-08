/**
 * Chatbot lifecycle webhook dispatcher.
 *
 * Server-only. Signs payloads with HMAC-SHA256 using each endpoint's shared
 * secret, POSTs the JSON body, and logs the attempt to
 * `chatbot_webhook_deliveries`. Fire-and-forget: callers use `emitChatbotEvent`
 * which never throws — a broken subscriber must never block a chatbot mutation.
 */
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";

export type ChatbotWebhookEvent =
  | "chatbot.created"
  | "chatbot.updated"
  | "chatbot.paused"
  | "chatbot.activated"
  | "chatbot.restored"
  | "chatbot.deleted"
  | "chatbot.purged"
  | "chatbot.duplicated"
  | "chatbot.installed.disabled"
  | "chatbot.installed.reenabled"
  | "chatbot.installed.uninstalled";

export interface EmitOptions {
  workspaceId: string;
  event: ChatbotWebhookEvent;
  chatbotId?: string | null;
  actorId?: string | null;
  data: Record<string, unknown>;
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

function sign(secret: string, ts: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

async function deliver(
  supabase: SupabaseClient,
  hook: WebhookRow,
  opts: EmitOptions,
  body: string,
  deliveryId: string,
): Promise<void> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = sign(hook.secret, ts, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let status: number | null = null;
  let respText: string | null = null;
  let err: string | null = null;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wacrm-event": opts.event,
        "x-wacrm-delivery": deliveryId,
        "x-wacrm-timestamp": ts,
        "x-wacrm-signature": `v1=${signature}`,
        "user-agent": "WACRM-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });
    status = res.status;
    respText = (await res.text().catch(() => ""))?.slice(0, 2000) ?? null;
    if (!res.ok) err = `HTTP ${res.status}`;
  } catch (e) {
    err = e instanceof Error ? e.message.slice(0, 500) : "delivery failed";
  } finally {
    clearTimeout(timer);
  }
  const ok = !err && status !== null && status >= 200 && status < 300;
  await supabase
    .from("chatbot_webhook_deliveries" as never)
    .update({
      status: ok ? "success" : "failed",
      response_status: status,
      response_body: respText,
      attempts: 1,
      error: err,
      delivered_at: new Date().toISOString(),
    } as never)
    .eq("id", deliveryId);
  await supabase
    .from("chatbot_webhooks" as never)
    .update({
      last_delivered_at: new Date().toISOString(),
      last_error: ok ? null : err,
      failure_count: ok ? 0 : (undefined as unknown as number),
    } as never)
    .eq("id", hook.id);
  if (!ok) {
    // best-effort increment
    await sbAny(supabase).rpc("increment_webhook_failure" as never, { p_id: hook.id } as never).then(
      () => undefined,
      () => undefined,
    );
  }
}

/**
 * Emit a chatbot lifecycle event. Never throws; failures are logged only.
 * The subscriber list is read with the service client because the HMAC
 * signing `secret` column is not readable by app users (any member could
 * otherwise forge signed deliveries). The workspace scope is applied
 * explicitly via `workspace_id`, and delivery logging still uses the
 * caller's RLS-bound client.
 */
export async function emitChatbotEvent(
  supabase: SupabaseClient,
  opts: EmitOptions,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: hooks, error } = await supabaseAdmin
      .from("chatbot_webhooks" as never)
      .select("id,url,secret,events,active")
      .eq("workspace_id", opts.workspaceId)
      .eq("active", true);
    if (error || !hooks?.length) return;


    const matching = (hooks as unknown as WebhookRow[]).filter((h) =>
      h.events.includes(opts.event),
    );
    if (!matching.length) return;

    const payload = {
      id: crypto.randomUUID(),
      event: opts.event,
      workspace_id: opts.workspaceId,
      chatbot_id: opts.chatbotId ?? null,
      actor_id: opts.actorId ?? null,
      occurred_at: new Date().toISOString(),
      data: opts.data,
    };
    const body = JSON.stringify(payload);

    await Promise.all(
      matching.map(async (hook) => {
        const { data: rec } = await supabase
          .from("chatbot_webhook_deliveries" as never)
          .insert({
            webhook_id: hook.id,
            workspace_id: opts.workspaceId,
            event: opts.event,
            chatbot_id: opts.chatbotId ?? null,
            payload,
            status: "pending",
          } as never)
          .select("id")
          .maybeSingle();
        const deliveryId = (rec as { id?: string } | null)?.id;
        if (!deliveryId) return;
        // fire-and-forget; do not await bubble errors
        await deliver(supabase, hook, opts, body, deliveryId).catch(() => undefined);
      }),
    );
  } catch {
    // swallow — webhook plumbing must never break mutations
  }
}
