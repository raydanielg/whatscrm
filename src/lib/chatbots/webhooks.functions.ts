/**
 * CRUD server functions for chatbot lifecycle webhook endpoints.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export const CHATBOT_WEBHOOK_EVENTS = [
  "chatbot.created",
  "chatbot.updated",
  "chatbot.paused",
  "chatbot.activated",
  "chatbot.restored",
  "chatbot.deleted",
  "chatbot.purged",
  "chatbot.duplicated",
  "chatbot.installed.disabled",
  "chatbot.installed.reenabled",
  "chatbot.installed.uninstalled",
] as const;

export type ChatbotWebhookEventName = (typeof CHATBOT_WEBHOOK_EVENTS)[number];

export interface ChatbotWebhook {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  /** Only returned to workspace admins on create/update; never listed. */
  secret?: string;
  events: string[];
  active: boolean;
  last_delivered_at: string | null;
  last_error: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatbotWebhookDelivery {
  id: string;
  webhook_id: string;
  workspace_id: string;
  event: string;
  chatbot_id: string | null;
  payload: JsonValue;
  status: "pending" | "success" | "failed";
  response_status: number | null;
  response_body: string | null;
  attempts: number;
  error: string | null;
  delivered_at: string | null;
  created_at: string;
}

const eventSchema = z.enum(CHATBOT_WEBHOOK_EVENTS);

/** Columns any workspace member may read — never includes the signing secret. */
const SAFE_COLUMNS =
  "id,workspace_id,name,url,events,active,created_by,last_delivered_at,last_error,failure_count,created_at,updated_at";

/** The signing secret is admin-only; members get member-safe rows. */
async function assertWorkspaceAdmin(
  supabase: { rpc: (fn: never, args: never) => PromiseLike<{ data: unknown }> },
  workspaceId: string,
  userId: string,
) {
  const { data: isAdmin } = await sbAny(supabase).rpc("is_workspace_admin" as never, {
    _workspace_id: workspaceId,
    _user_id: userId,
  } as never);
  if (!isAdmin) throw new Error("Only workspace owners and admins can manage webhooks");
}

export const listChatbotWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("chatbot_webhooks" as never)
      .select(SAFE_COLUMNS)
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotWebhook[];
  });

export const upsertChatbotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        url: z.string().url().max(2000),
        events: z.array(eventSchema).min(1),
        active: z.boolean().optional(),
        rotateSecret: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { randomBytes } = await import("node:crypto");
    const { id, workspaceId, rotateSecret, ...rest } = data;
    // The `secret` column is not writable/readable by the `authenticated` role,
    // so credential handling runs through the service client — gated on an
    // explicit admin check first.
    await assertWorkspaceAdmin(sbAny(context.supabase) as never, workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    if (id) {
      const patch: Record<string, unknown> = { ...rest };
      if (rotateSecret) patch.secret = randomBytes(32).toString("hex");
      const { data: row, error } = await supabaseAdmin
        .from("chatbot_webhooks" as never)
        .update(patch as never)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row as unknown as ChatbotWebhook;
    }
    const insert = {
      ...rest,
      workspace_id: workspaceId,
      secret: randomBytes(32).toString("hex"),
      created_by: context.userId,
    };
    const { data: row, error } = await supabaseAdmin
      .from("chatbot_webhooks" as never)
      .insert(insert as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as ChatbotWebhook;
  });


export const deleteChatbotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("chatbot_webhooks" as never)
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listChatbotWebhookDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        webhookId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("chatbot_webhook_deliveries" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId);
    if (data.webhookId) q = q.eq("webhook_id", data.webhookId) as typeof q;
    const { data: rows, error } = await q
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotWebhookDelivery[];
  });

export const testChatbotWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("chatbot_webhooks" as never)
      .select("id,workspace_id,url,events,active")
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Webhook not found");
    const { emitChatbotEvent } = await import("./webhooks.server");
    await emitChatbotEvent(sbAny(context.supabase), {
      workspaceId: data.workspaceId,
      event: "chatbot.updated",
      chatbotId: null,
      actorId: context.userId,
      data: { test: true, message: "Ping from your workspace" },
    });
    return { ok: true };
  });
