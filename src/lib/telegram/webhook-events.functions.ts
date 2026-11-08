/**
 * Telegram webhook event log — list, retry and clear.
 *
 * Every inbound call to `/api/public/webhooks/telegram/<accountId>` is recorded
 * in `telegram_webhook_events` with its verification status and any processing
 * error. Failed ingests can be replayed from the stored payload.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface TelegramWebhookEvent {
  id: string;
  account_id: string | null;
  update_id: number | null;
  verified: boolean;
  status: string;
  error_message: string | null;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
  payload: Record<string, JsonValue>;
}

export const listTelegramWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; status?: string | null; limit?: number }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z.string().max(32).nullish(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("telegram_webhook_events" as never)
      .select(
        "id, account_id, update_id, verified, status, error_message, retry_count, last_retry_at, created_at, payload",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { events: (rows ?? []) as unknown as TelegramWebhookEvent[] };
  });

export const retryTelegramWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { eventId: string }) =>
    z.object({ eventId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS: the read below only succeeds for members of the owning workspace.
    const { data: eventRaw, error } = await context.supabase
      .from("telegram_webhook_events" as never)
      .select("id, workspace_id, account_id, payload, retry_count")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const event = eventRaw as unknown as {
      id: string;
      workspace_id: string | null;
      account_id: string | null;
      payload: Record<string, unknown>;
      retry_count: number;
    } | null;
    if (!event) throw new Error("Event not found");
    if (!event.account_id) throw new Error("Event has no linked Telegram account");
    if (!event.payload || Object.keys(event.payload).length === 0) {
      throw new Error("No stored payload to replay for this event");
    }

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: acctRaw } = await supabaseAdmin
      .from("telegram_accounts" as never)
      .select("id, workspace_id, bot_id, bot_username, webhook_secret, status")
      .eq("id", event.account_id)
      .maybeSingle();
    const account = acctRaw as unknown as {
      id: string;
      workspace_id: string;
      bot_id: string;
      bot_username: string | null;
      webhook_secret: string;
      status: string;
    } | null;
    if (!account) throw new Error("Telegram account no longer exists");

    const { processUpdate } = await import("./webhook.server");
    let status = "processed";
    let errorMessage: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handled = await processUpdate(supabaseAdmin as any, account, event.payload);
      if (!handled) status = "ignored";
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    await supabaseAdmin
      .from("telegram_webhook_events" as never)
      .update({
        status,
        error_message: errorMessage,
        retry_count: (event.retry_count ?? 0) + 1,
        last_retry_at: new Date().toISOString(),
      } as never)
      .eq("id", event.id);

    return { status, error: errorMessage };
  });

export const clearTelegramWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Deletion is restricted to workspace owners/admins by RLS.
    const { error } = await context.supabase
      .from("telegram_webhook_events" as never)
      .delete()
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
