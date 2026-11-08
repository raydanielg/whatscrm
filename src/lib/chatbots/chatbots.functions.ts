/**
 * AI Chatbot Builder — CRUD + runtime chat with RAG and human handoff.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitChatbotEvent, type ChatbotWebhookEvent } from "./webhooks.server";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

async function emit(
  supabase: SupabaseClient,
  workspaceId: string,
  event: ChatbotWebhookEvent,
  actorId: string | null,
  chatbotId: string | null,
  data: Record<string, unknown>,
) {
  await emitChatbotEvent(supabase, { workspaceId, event, chatbotId, actorId, data });
}

/**
 * Server-side workspace-role authorization. Complements RLS with clear 403s
 * and enforces the stricter "purge/uninstall = admin/owner" rule that RLS
 * (which allows any of owner/admin/manager) doesn't express.
 *
 * Resolves the workspace either directly, or by looking up the bot ids and
 * asserting they all live in a single workspace the caller can manage at
 * the requested tier.
 */
async function assertChatbotRole(
  supabase: SupabaseClient,
  userId: string,
  input: { workspaceId?: string; ids?: string[] },
  allowed: ReadonlyArray<"owner" | "admin" | "manager" | "agent" | "viewer">,
): Promise<string> {
  let workspaceId = input.workspaceId ?? null;
  if (!workspaceId && input.ids?.length) {
    const { data: rows, error } = await supabase
      .from("chatbots" as never)
      .select("workspace_id")
      .in("id", input.ids);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set(((rows ?? []) as unknown as Array<{ workspace_id: string }>).map((r) => r.workspace_id)));
    if (ids.length === 0) throw new Error("Chatbot not found");
    if (ids.length > 1) throw new Error("Chatbots must belong to the same workspace");
    workspaceId = ids[0];
  }
  if (!workspaceId) throw new Error("Workspace context required");
  const { data: mem, error: mErr } = await supabase
    .from("workspace_members" as never)
    .select("role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  const row = mem as unknown as { role: string; status: string } | null;
  if (!row) throw new Error("Forbidden: not a member of this workspace");
  if (row.status === "suspended") throw new Error("Forbidden: your membership is suspended");
  if (!allowed.includes(row.role as (typeof allowed)[number])) {
    throw new Error(`Forbidden: this action requires role ${allowed.join(" / ")}`);
  }
  return workspaceId;
}


export type ChatbotStatus = "draft" | "active" | "paused" | "archived";
export type ChatbotChannel =
  | "whatsapp" | "instagram" | "messenger" | "telegram" | "livechat" | "web" | "sms" | "email";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Chatbot {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  status: ChatbotStatus;
  language: string | null;
  provider_id: string | null;
  model: string | null;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  welcome_message: string;
  fallback_message: string;
  rag_enabled: boolean;
  rag_min_similarity: number;
  rag_match_count: number;
  handoff_enabled: boolean;
  handoff_keywords: string[];
  flow: JsonValue;
  personality: string | null;
  tone: string | null;
  greeting: string | null;
  escalation_prompt: string | null;
  organization_prompt: string | null;
  department_prompt: string | null;
  department_id: string | null;
  total_sessions: number;
  total_messages: number;
  deleted_at: string | null;
  installed_from_template_id: string | null;
  installed_at: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  uninstalled_reason: string | null;
  created_at: string;
  updated_at: string;
}


export interface ChatbotDeployment {
  id: string;
  chatbot_id: string;
  channel: ChatbotChannel;
  channel_account_id: string | null;
  enabled: boolean;
  business_hours_only: boolean;
  config: JsonValue;
  created_at: string;
}

export interface ChatbotSession {
  id: string;
  chatbot_id: string;
  channel: string;
  external_id: string | null;
  status: "active" | "handed_off" | "closed";
  message_count: number;
  last_message_at: string | null;
  handoff_reason: string | null;
  created_at: string;
}

export interface ChatbotMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  citations: JsonValue;
  latency_ms: number | null;
  model: string | null;
  created_at: string;
}


// ==================== CRUD ====================

export const listChatbots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    trashed: z.boolean().optional(),
    search: z.string().max(200).optional(),
    status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("chatbots" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId);
    q = (data.trashed
      ? q.not("deleted_at", "is", null)
      : q.is("deleted_at", null)) as typeof q;
    if (data.status) q = q.eq("status", data.status) as typeof q;
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[%,]/g, " ");
      q = q.or(`name.ilike.%${sanitizeSearchTerm(s)}%,description.ilike.%${sanitizeSearchTerm(s)}%`) as typeof q;
    }
    const { data: rows, error } = await q.order("updated_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Chatbot[];
  });

export const getChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("chatbots" as never).select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as Chatbot | null;
  });

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  language: z.string().max(10).nullable().optional(),
  provider_id: z.string().uuid().nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(50).max(8000).optional(),
  system_prompt: z.string().max(8000).optional(),
  welcome_message: z.string().max(1000).optional(),
  fallback_message: z.string().max(1000).optional(),
  rag_enabled: z.boolean().optional(),
  rag_min_similarity: z.number().min(0).max(1).optional(),
  rag_match_count: z.number().int().min(1).max(20).optional(),
  handoff_enabled: z.boolean().optional(),
  handoff_keywords: z.array(z.string()).optional(),
  flow: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }).optional(),
  personality: z.string().max(2000).nullable().optional(),
  tone: z.string().max(40).nullable().optional(),
  greeting: z.string().max(1000).nullable().optional(),
  escalation_prompt: z.string().max(4000).nullable().optional(),
  organization_prompt: z.string().max(4000).nullable().optional(),
  department_prompt: z.string().max(4000).nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
});

export const upsertChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => upsertInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertChatbotRole(sbAny(context.supabase), context.userId, { workspaceId: data.workspaceId }, ["owner", "admin", "manager"]);
    const { id, workspaceId, ...rest } = data;
    const payload = { ...rest, workspace_id: workspaceId, created_by: context.userId };
    if (id) {
      const { data: row, error } = await sbAny(context.supabase)
        .from("chatbots" as never).update(payload as never).eq("id", id).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      const bot = row as unknown as Chatbot;
      await emit(sbAny(context.supabase), workspaceId, "chatbot.updated", context.userId, bot.id, {
        name: bot.name, status: bot.status,
      });
      return bot;
    }
    const { data: row, error } = await sbAny(context.supabase)
      .from("chatbots" as never).insert(payload as never).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    const bot = row as unknown as Chatbot;
    await emit(sbAny(context.supabase), workspaceId, "chatbot.created", context.userId, bot.id, {
      name: bot.name, status: bot.status,
    });
    return bot;
  });

/** Soft-delete: move chatbot(s) to trash by stamping deleted_at. */
export const deleteChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: data.ids }, ["owner", "admin", "manager"]);
    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await emit(sbAny(context.supabase), workspaceId, "chatbot.deleted", context.userId, id, { ids: data.ids });
    }
    return { ok: true, count: data.ids.length };
  });

/** Restore soft-deleted chatbot(s) from trash. */
export const restoreChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: data.ids }, ["owner", "admin", "manager"]);
    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .update({ deleted_at: null } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await emit(sbAny(context.supabase), workspaceId, "chatbot.restored", context.userId, id, { ids: data.ids });
    }
    return { ok: true, count: data.ids.length };
  });

/** Permanently delete chatbot(s). Only trashed bots may be hard-deleted. */
export const purgeChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: data.ids }, ["owner", "admin"]);
    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .delete()
      .in("id", data.ids)
      .not("deleted_at", "is", null);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await emit(sbAny(context.supabase), workspaceId, "chatbot.purged", context.userId, id, { ids: data.ids });
    }
    return { ok: true, count: data.ids.length };
  });

/** Bulk status change (activate / pause / archive / mark draft). */
export const bulkUpdateChatbotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1),
    status: z.enum(["draft", "active", "paused", "archived"]),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const workspaceId = await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: data.ids }, ["owner", "admin", "manager"]);
    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .update({ status: data.status } as never)
      .in("id", data.ids)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    const evt: ChatbotWebhookEvent =
      data.status === "paused" ? "chatbot.paused" :
      data.status === "active" ? "chatbot.activated" :
      "chatbot.updated";
    for (const id of data.ids) {
      await emit(sbAny(context.supabase), workspaceId, evt, context.userId, id, { status: data.status });
    }
    return { ok: true, count: data.ids.length };
  });

/** Duplicate a chatbot within the same workspace. Copies core config + KB sources. */
export const duplicateChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: [data.id] }, ["owner", "admin", "manager"]);
    const { data: src, error: e1 } = await sbAny(context.supabase)
      .from("chatbots" as never).select("*").eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Chatbot not found");
    const s = src as unknown as Chatbot & Record<string, unknown>;
    const {
      id: _id, created_at: _c, updated_at: _u, deleted_at: _d,
      total_sessions: _ts, total_messages: _tm, ...rest
    } = s;
    const insertRow = {
      ...rest,
      name: `${s.name} (Copy)`,
      status: "draft" as const,
      created_by: context.userId,
    };
    const { data: newRow, error: e2 } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .insert(insertRow as never)
      .select("*")
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    const created = newRow as unknown as Chatbot;

    // Copy KB source links (categories + articles)
    const { data: sources } = await sbAny(context.supabase)
      .from("chatbot_kb_sources" as never)
      .select("workspace_id, category_id, article_id")
      .eq("chatbot_id", data.id);
    const rows = (sources ?? []) as unknown as Array<{
      workspace_id: string; category_id: string | null; article_id: string | null;
    }>;
    if (rows.length) {
      await sbAny(context.supabase).from("chatbot_kb_sources" as never).insert(
        rows.map((r) => ({ ...r, chatbot_id: created.id })) as never,
      );
    }
    await emit(sbAny(context.supabase), created.workspace_id, "chatbot.duplicated", context.userId, created.id, {
      source_id: data.id, name: created.name,
    });
    return created;
  });

/** Disable an installed template bot: pause + stamp disabled_at/reason + audit log. */
export const disableInstalledChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: [data.id] }, ["owner", "admin", "manager"]);
    const { data: existing, error: e1 } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .select("id, workspace_id, name, status, installed_from_template_id")
      .eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!existing) throw new Error("Chatbot not found");
    const row = existing as unknown as {
      id: string; workspace_id: string; name: string;
      status: string; installed_from_template_id: string | null;
    };
    if (!row.installed_from_template_id) throw new Error("This chatbot was not installed from a template");

    const nowIso = new Date().toISOString();
    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .update({
        status: "paused",
        disabled_at: nowIso,
        disabled_reason: data.reason?.trim() || null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await sbAny(context.supabase).from("audit_logs" as never).insert({
      workspace_id: row.workspace_id,
      actor_id: context.userId,
      action: "update",
      resource_type: "chatbot",
      resource_id: row.id,
      changes: { status: { from: row.status, to: "paused" }, disabled_at: nowIso },
      metadata: {
        event: "chatbot.installed.disabled",
        template_id: row.installed_from_template_id,
        name: row.name,
        reason: data.reason?.trim() || null,
      },
    } as never);

    await emit(sbAny(context.supabase), row.workspace_id, "chatbot.installed.disabled", context.userId, row.id, {
      template_id: row.installed_from_template_id, reason: data.reason?.trim() || null,
    });
    return { ok: true };
  });

/** Re-enable a previously disabled installed template bot: clear disabled_at + activate + audit log. */
export const reEnableInstalledChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: [data.id] }, ["owner", "admin", "manager"]);
    const { data: existing, error: e1 } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .select("id, workspace_id, name, status, installed_from_template_id, disabled_at, disabled_reason, deleted_at")
      .eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!existing) throw new Error("Chatbot not found");
    const row = existing as unknown as {
      id: string; workspace_id: string; name: string; status: string;
      installed_from_template_id: string | null; disabled_at: string | null;
      disabled_reason: string | null; deleted_at: string | null;
    };
    if (!row.installed_from_template_id) throw new Error("This chatbot was not installed from a template");
    if (row.deleted_at) throw new Error("Uninstalled bots cannot be re-enabled. Reinstall from the marketplace instead.");
    if (!row.disabled_at) throw new Error("Chatbot is not disabled");

    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .update({
        status: "active",
        disabled_at: null,
        disabled_reason: null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await sbAny(context.supabase).from("audit_logs" as never).insert({
      workspace_id: row.workspace_id,
      actor_id: context.userId,
      action: "update",
      resource_type: "chatbot",
      resource_id: row.id,
      changes: { status: { from: row.status, to: "active" }, disabled_at: { from: row.disabled_at, to: null } },
      metadata: {
        event: "chatbot.installed.reenabled",
        template_id: row.installed_from_template_id,
        name: row.name,
        previous_reason: row.disabled_reason,
      },
    } as never);

    await emit(sbAny(context.supabase), row.workspace_id, "chatbot.installed.reenabled", context.userId, row.id, {
      template_id: row.installed_from_template_id, previous_reason: row.disabled_reason,
    });
    return { ok: true };
  });

/** Uninstall an installed template bot: soft-delete + audit log with reason. */
export const uninstallInstalledChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await assertChatbotRole(sbAny(context.supabase), context.userId, { ids: [data.id] }, ["owner", "admin"]);
    const { data: existing, error: e1 } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .select("id, workspace_id, name, installed_from_template_id")
      .eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!existing) throw new Error("Chatbot not found");
    const row = existing as unknown as {
      id: string; workspace_id: string; name: string; installed_from_template_id: string | null;
    };
    if (!row.installed_from_template_id) throw new Error("This chatbot was not installed from a template");

    const nowIso = new Date().toISOString();
    const { error } = await sbAny(context.supabase)
      .from("chatbots" as never)
      .update({
        deleted_at: nowIso,
        uninstalled_reason: data.reason?.trim() || null,
        status: "archived",
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await sbAny(context.supabase).from("audit_logs" as never).insert({
      workspace_id: row.workspace_id,
      actor_id: context.userId,
      action: "delete",
      resource_type: "chatbot",
      resource_id: row.id,
      metadata: {
        event: "chatbot.installed.uninstalled",
        template_id: row.installed_from_template_id,
        name: row.name,
        reason: data.reason?.trim() || null,
      },
    } as never);

    await emit(sbAny(context.supabase), row.workspace_id, "chatbot.installed.uninstalled", context.userId, row.id, {
      template_id: row.installed_from_template_id, reason: data.reason?.trim() || null,
    });
    return { ok: true };
  });



// ==================== Deployments ====================

export const listDeployments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ chatbotId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("chatbot_deployments" as never)
      .select("*").eq("chatbot_id", data.chatbotId)
      .order("channel");
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotDeployment[];
  });

export const upsertDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    chatbotId: z.string().uuid(),
    channel: z.enum(["whatsapp","instagram","messenger","telegram","livechat","web","sms","email"]),
    channel_account_id: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    business_hours_only: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await assertChatbotRole(sbAny(context.supabase), context.userId, { workspaceId: data.workspaceId }, ["owner", "admin", "manager"]);
    const values = {
      workspace_id: data.workspaceId, chatbot_id: data.chatbotId, channel: data.channel,
      channel_account_id: data.channel_account_id ?? null,
      enabled: data.enabled ?? true,
      business_hours_only: data.business_hours_only ?? false,
      config: data.config ?? {},
    };

    // The unique key treats NULL accounts as distinct, so upsert would insert a
    // duplicate row on every Connect click. Update the existing row instead.
    if (values.channel_account_id === null) {
      const { data: existing, error: findErr } = await sbAny(context.supabase)
        .from("chatbot_deployments" as never)
        .select("id")
        .eq("chatbot_id", data.chatbotId)
        .eq("channel", data.channel)
        .is("channel_account_id", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (findErr) throw new Error(findErr.message);
      const existingId = (existing as unknown as { id: string } | null)?.id;
      if (existingId) {
        const { data: row, error } = await sbAny(context.supabase)
          .from("chatbot_deployments" as never)
          .update(values as never)
          .eq("id", existingId)
          .select("*").maybeSingle();
        if (error) throw new Error(error.message);
        return row as unknown as ChatbotDeployment;
      }
    }

    const { data: row, error } = await sbAny(context.supabase)
      .from("chatbot_deployments" as never)
      .upsert(values as never, { onConflict: "chatbot_id,channel,channel_account_id" })
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as ChatbotDeployment;
  });

export const removeDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: dep, error: dErr } = await sbAny(context.supabase)
      .from("chatbot_deployments" as never)
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    const depRow = dep as unknown as { workspace_id: string } | null;
    if (!depRow) throw new Error("Deployment not found");
    await assertChatbotRole(sbAny(context.supabase), context.userId, { workspaceId: depRow.workspace_id }, ["owner", "admin", "manager"]);
    // Remove every row for this bot+channel so earlier duplicates can't keep it "Live".
    const { data: target } = await sbAny(context.supabase)
      .from("chatbot_deployments" as never)
      .select("chatbot_id, channel, channel_account_id")
      .eq("id", data.id)
      .maybeSingle();
    const t = target as unknown as
      { chatbot_id: string; channel: string; channel_account_id: string | null } | null;
    let q = sbAny(context.supabase).from("chatbot_deployments" as never).delete();
    if (t) {
      q = q.eq("chatbot_id", t.chatbot_id).eq("channel", t.channel);
      q = t.channel_account_id === null
        ? q.is("channel_account_id", null)
        : q.eq("channel_account_id", t.channel_account_id);
    } else {
      q = q.eq("id", data.id);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== Sessions & Messages ====================

export const listChatbotSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    chatbotId: z.string().uuid(),
    limit: z.number().int().min(1).max(200).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("chatbot_sessions" as never)
      .select("*").eq("chatbot_id", data.chatbotId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotSession[];
  });

export const listSessionMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ sessionId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("chatbot_messages" as never)
      .select("*").eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotMessage[];
  });

// ==================== Runtime chat ====================

const runtimeInput = z.object({
  chatbotId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  channel: z.string().default("web"),
  externalId: z.string().nullable().optional(),
  message: z.string().min(1).max(4000),
});

export interface ChatbotReply {
  sessionId: string;
  reply: string;
  citations: Array<{ article_id: string; title: string; similarity: number }>;
  handoff: boolean;
  handoffReason?: string;
  latencyMs: number;
  model: string;
}

export const chatbotChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => runtimeInput.parse(v))
  .handler(async ({ data, context }): Promise<ChatbotReply> => {
    const start = Date.now();

    // Per-workspace rate limit (60 req/min/user/bot). Fails-open on errors.
    try {
      const { enforceAIRateLimit } = await import("@/lib/ai/rate-limiter.server");
      // Load bot workspace up front for the bucket key.
      const { data: wsRow } = await sbAny(context.supabase)
        .from("chatbots" as never).select("workspace_id").eq("id", data.chatbotId).maybeSingle();
      const workspaceId = (wsRow as { workspace_id?: string } | null)?.workspace_id;
      if (workspaceId) {
        await enforceAIRateLimit({
          workspaceId, userId: context.userId, feature: `chatbot:${data.chatbotId}`, limit: 60,
        });
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Rate limit";
      if (msg.toLowerCase().includes("rate limit")) throw e;
    }

    // Load bot
    const { data: botRow, error: botErr } = await sbAny(context.supabase)
      .from("chatbots" as never).select("*").eq("id", data.chatbotId).maybeSingle();
    if (botErr) throw new Error(botErr.message);
    if (!botRow) throw new Error("Chatbot not found");
    const bot = botRow as unknown as Chatbot;

    // Basic input safety: strip obvious prompt-injection markers before persisting.
    const cleaned = data.message
      .replace(/<\s*\/?\s*system\s*>/gi, "")
      .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

    // Ensure session
    let sessionId = data.sessionId;
    if (!sessionId) {
      const { data: sess, error } = await sbAny(context.supabase)
        .from("chatbot_sessions" as never)
        .insert({
          workspace_id: bot.workspace_id,
          chatbot_id: bot.id,
          channel: data.channel,
          external_id: data.externalId ?? null,
          status: "active",
          flow_state: null,
        } as never).select("id, flow_state").maybeSingle();
      if (error) throw new Error(error.message);
      sessionId = (sess as unknown as { id: string }).id;
    }

    // Persist user message
    await sbAny(context.supabase).from("chatbot_messages" as never).insert({
      workspace_id: bot.workspace_id, session_id: sessionId,
      role: "user", content: cleaned,
    } as never);

    // ================= Deterministic flow (Visual Builder) =================
    // If the bot has a flow authored in the builder, execute one step. Only
    // fall through to the LLM path when the flow terminates or requests an
    // AI fallback.
    try {
      const { adaptChatbotFlow } = await import("./flow-adapter");
      const { FlowEngine } = await import("./engines/flow-engine");
      const { graph, aiExitIds } = adaptChatbotFlow(bot.flow as never);
      if (graph.nodes.length > 0) {
        // Load or seed the flow state on the session row.
        const { data: sessRow } = await sbAny(context.supabase)
          .from("chatbot_sessions" as never)
          .select("flow_state").eq("id", sessionId).maybeSingle();
        const prev = (sessRow as { flow_state?: { currentNodeId?: string | null; variables?: Record<string, string>; awaitingInputFor?: string | null } | null } | null)?.flow_state ?? null;
        const state = {
          currentNodeId: prev?.currentNodeId ?? null,
          variables: prev?.variables ?? {},
          awaitingInputFor: prev?.awaitingInputFor ?? null,
        };
        const step = FlowEngine.step(graph, state, cleaned, "unknown");
        const hitAiExit = step.state.currentNodeId ? aiExitIds.has(step.state.currentNodeId) : false;

        if (step.handoff) {
          await sbAny(context.supabase).from("chatbot_sessions" as never)
            .update({ status: "handed_off", handoff_reason: step.handoff.reason, handed_off_at: new Date().toISOString(), flow_state: step.state } as never)
            .eq("id", sessionId);
          const reply = "Connecting you with a human agent";
          await sbAny(context.supabase).from("chatbot_messages" as never).insert({
            workspace_id: bot.workspace_id, session_id: sessionId,
            role: "assistant", content: reply, latency_ms: Date.now() - start,
          } as never);
          return { sessionId, reply, citations: [], handoff: true, handoffReason: step.handoff.reason, latencyMs: Date.now() - start, model: "" };
        }

        // Persist flow progress.
        await sbAny(context.supabase).from("chatbot_sessions" as never)
          .update({ flow_state: step.state } as never).eq("id", sessionId);

        if (step.reply && !hitAiExit) {
          await sbAny(context.supabase).from("chatbot_messages" as never).insert({
            workspace_id: bot.workspace_id, session_id: sessionId,
            role: "assistant", content: step.reply, latency_ms: Date.now() - start,
          } as never);
          return {
            sessionId, reply: step.reply, citations: [], handoff: false,
            latencyMs: Date.now() - start, model: "flow",
          };
        }
        // Otherwise the flow either finished, matched no branch, or hit an AI node —
        // continue into the LLM path below.
      }
    } catch (err) {
      console.warn("[chatbot] flow execution failed, falling back to LLM:", (err as Error).message);
    }

    // Handoff keyword detection (safety net after the flow)
    const lower = cleaned.toLowerCase();
    const hasHandoff = bot.handoff_enabled &&
      (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
    if (hasHandoff) {
      await sbAny(context.supabase).from("chatbot_sessions" as never)
        .update({ status: "handed_off", handoff_reason: "keyword", handed_off_at: new Date().toISOString() } as never)
        .eq("id", sessionId);
      const reply = "Connecting you with a human agent";
      await sbAny(context.supabase).from("chatbot_messages" as never).insert({
        workspace_id: bot.workspace_id, session_id: sessionId,
        role: "assistant", content: reply, latency_ms: Date.now() - start,
      } as never);
      return {
        sessionId, reply, citations: [], handoff: true, handoffReason: "keyword",
        latencyMs: Date.now() - start, model: "",
      };
    }


    // RAG retrieval
    let citations: ChatbotReply["citations"] = [];
    let ragContext = "";
    if (bot.rag_enabled) {
      try {
        const { retrieveKbContext } = await import("@/lib/kb/kb.functions");
        const hits = await retrieveKbContext({
          supabaseRpc: (fn, args) => sbAny(context.supabase).rpc(fn as never, args as never) as never,
          workspaceId: bot.workspace_id,
          query: cleaned,
          matchCount: bot.rag_match_count ?? 5,
          minSimilarity: bot.rag_min_similarity ?? 0.25,
        });
        citations = hits.slice(0, 5).map((h) => ({
          article_id: (h as { article_id: string }).article_id,
          title: (h as { title?: string }).title ?? "Article",
          similarity: (h as { similarity?: number }).similarity ?? 0,
        }));
        ragContext = hits
          .slice(0, 5)
          .map((h, i) => `[${i + 1}] ${(h as { title?: string }).title ?? ""}\n${(h as { content?: string }).content ?? ""}`)
          .join("\n\n");
      } catch (kbErr) {
        // Log RAG failure so systemic outages surface in monitoring instead of silently degrading answer quality.
        console.warn("[chatbot] RAG retrieval failed:", (kbErr as Error).message);
      }
    }


    // Load recent history (last 10 msgs)
    const { data: histRows } = await sbAny(context.supabase)
      .from("chatbot_messages" as never)
      .select("role,content").eq("session_id", sessionId)
      .order("created_at", { ascending: false }).limit(10);
    const history = ((histRows ?? []) as { role: string; content: string }[]).reverse();

    // Layered system prompt: system > organization > department > personality > tone > language > RAG
    const sys = [
      bot.system_prompt || "You are a helpful AI assistant.",
      bot.organization_prompt ? `Organization context:\n${bot.organization_prompt}` : "",
      bot.department_prompt ? `Department context:\n${bot.department_prompt}` : "",
      bot.personality ? `Personality:\n${bot.personality}` : "",
      bot.tone ? `Communication tone: ${bot.tone}.` : "",
      bot.language ? `Reply in language code "${bot.language}" unless the user explicitly writes in another language.` : "",
      bot.escalation_prompt ? `Escalation guidance:\n${bot.escalation_prompt}` : "",
      ragContext ? `Knowledge base context:\n${ragContext}\n\nCite sources as [1], [2] where relevant.` : "",
    ].filter(Boolean).join("\n\n");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: sys },
      ...history.map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: m.content })),
    ];

    // Call AI
    let reply = bot.fallback_message;
    let model = bot.model ?? "";
    let providerKind = "";
    try {
      const { runChat } = await import("@/lib/ai/complete.functions");
      const res = await runChat({
        workspaceId: bot.workspace_id,
        userId: context.userId,
        feature: "chatbot",
        primaryProviderId: bot.provider_id,
        request: {
          messages,
          model: bot.model || "google/gemini-2.5-flash",
          temperature: bot.temperature ?? 0.4,
          max_tokens: bot.max_tokens ?? 800,
        },
      });
      reply = res.content?.trim() || bot.fallback_message;
      model = res.model || model;
      providerKind = res.providerKind;
    } catch {
      // fallback message will be used
    }

    // Persist assistant message
    await sbAny(context.supabase).from("chatbot_messages" as never).insert({
      workspace_id: bot.workspace_id, session_id: sessionId,
      role: "assistant", content: reply,
      citations, latency_ms: Date.now() - start,
      model, provider_kind: providerKind,
    } as never);

    // Update session/bot counters
    await sbAny(context.supabase).from("chatbot_sessions" as never)
      .update({ last_message_at: new Date().toISOString(), message_count: (history.length + 2) } as never)
      .eq("id", sessionId);

    return {
      sessionId, reply, citations, handoff: false,
      latencyMs: Date.now() - start, model,
    };
  });

// ==================== Analytics ====================

export const chatbotAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    chatbotId: z.string().uuid(),
    days: z.number().int().min(1).max(90).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const days = data.days ?? 14;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    // 1) Sessions in window
    const sessRes = await sbAny(context.supabase)
      .from("chatbot_sessions" as never)
      .select("id,created_at,status,message_count,metadata,handed_off_at,handoff_reason")
      .eq("chatbot_id", data.chatbotId)
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    const sessions = (sessRes.data ?? []) as Array<{
      id: string; created_at: string; status: string; message_count: number;
      metadata: Record<string, JsonValue> | null; handed_off_at: string | null; handoff_reason: string | null;
    }>;
    const sessionIds = sessions.map((s) => s.id);

    // 2) Messages for those sessions
    type Msg = { role: string; content: string; latency_ms: number | null; citations: JsonValue; created_at: string; session_id: string };
    let messages: Msg[] = [];
    if (sessionIds.length) {
      // Chunk to avoid IN clause overflow
      const chunkSize = 200;
      for (let i = 0; i < sessionIds.length; i += chunkSize) {
        const chunk = sessionIds.slice(i, i + chunkSize);
        const mRes = await sbAny(context.supabase)
          .from("chatbot_messages" as never)
          .select("role,content,latency_ms,citations,created_at,session_id")
          .in("session_id", chunk);
        messages = messages.concat((mRes.data ?? []) as Msg[]);
      }
    }

    // Bot fallback message for fallback-rate detection
    const botRes = await sbAny(context.supabase)
      .from("chatbots" as never)
      .select("fallback_message")
      .eq("id", data.chatbotId)
      .maybeSingle();
    const fallbackText = ((botRes.data as { fallback_message?: string } | null)?.fallback_message ?? "").trim().toLowerCase();

    const totalSessions = sessions.length;
    const handoffs = sessions.filter((s) => s.status === "handed_off").length;
    const resolved = sessions.filter((s) => s.status === "closed").length;
    const resolvedByAI = sessions.filter((s) => s.status === "closed" && !s.handed_off_at).length;

    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    const userMsgs = messages.filter((m) => m.role === "user");
    const latencies = assistantMsgs.map((m) => m.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const p95Latency = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;

    const fallbackMsgs = fallbackText
      ? assistantMsgs.filter((m) => m.content.trim().toLowerCase() === fallbackText).length
      : 0;
    const kbMsgs = assistantMsgs.filter((m) => Array.isArray(m.citations) && (m.citations as unknown[]).length > 0).length;

    // Confidence / CSAT / intents pulled from session.metadata (populated by runtime hooks when available)
    const confidences: number[] = [];
    const csats: number[] = [];
    const intentCounts = new Map<string, number>();
    for (const s of sessions) {
      const md = (s.metadata ?? {}) as Record<string, JsonValue>;
      if (typeof md.confidence === "number") confidences.push(md.confidence);
      if (typeof md.csat === "number") csats.push(md.csat);
      const intent = typeof md.intent === "string" ? md.intent : null;
      if (intent) intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    }
    const avgConfidence = confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) : null;
    const avgCsat = csats.length ? Math.round((csats.reduce((a, b) => a + b, 0) / csats.length) * 100) / 100 : null;
    const topIntents = Array.from(intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([intent, count]) => ({ intent, count }));

    // Time series (per day): sessions, messages, handoffs
    const dayKey = (iso: string) => iso.slice(0, 10);
    const dayMap = new Map<string, { date: string; sessions: number; messages: number; handoffs: number; resolved: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      dayMap.set(d, { date: d, sessions: 0, messages: 0, handoffs: 0, resolved: 0 });
    }
    for (const s of sessions) {
      const k = dayKey(s.created_at);
      const row = dayMap.get(k); if (!row) continue;
      row.sessions += 1;
      if (s.status === "handed_off") row.handoffs += 1;
      if (s.status === "closed") row.resolved += 1;
    }
    for (const m of messages) {
      const k = dayKey(m.created_at);
      const row = dayMap.get(k); if (row) row.messages += 1;
    }
    const series = Array.from(dayMap.values());

    // Most asked questions — normalize user messages
    const qCounts = new Map<string, number>();
    for (const m of userMsgs) {
      const norm = m.content.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
      if (norm.length < 3) continue;
      qCounts.set(norm, (qCounts.get(norm) ?? 0) + 1);
    }
    const topQuestions = Array.from(qCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([question, count]) => ({ question, count }));

    // Response time: first-user -> first-assistant per session
    const bySession = new Map<string, Msg[]>();
    for (const m of messages) {
      const arr = bySession.get(m.session_id) ?? [];
      arr.push(m); bySession.set(m.session_id, arr);
    }
    const firstResponses: number[] = [];
    for (const arr of bySession.values()) {
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const u = arr.find((x) => x.role === "user");
      const a = arr.find((x) => x.role === "assistant" && (!u || x.created_at > u.created_at));
      if (u && a) firstResponses.push(new Date(a.created_at).getTime() - new Date(u.created_at).getTime());
    }
    const avgFirstResponseMs = firstResponses.length
      ? Math.round(firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length)
      : 0;

    // Handoff reasons
    const reasonCounts = new Map<string, number>();
    for (const s of sessions) {
      if (s.status === "handed_off") {
        const r = s.handoff_reason || "unspecified";
        reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
      }
    }
    const handoffReasons = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count }));

    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
    return {
      days,
      sessions: totalSessions,
      messages: messages.length,
      userMessages: userMsgs.length,
      assistantMessages: assistantMsgs.length,
      handoffs,
      resolved,
      resolvedByAI,
      avgLatency,
      p95Latency,
      avgFirstResponseMs,
      fallbackMessages: fallbackMsgs,
      knowledgeMessages: kbMsgs,
      avgConfidence,
      avgCsat,
      handoffRate: pct(handoffs, totalSessions),
      resolutionRate: pct(resolved, totalSessions),
      aiResolutionRate: pct(resolvedByAI, totalSessions),
      fallbackRate: pct(fallbackMsgs, assistantMsgs.length),
      knowledgeUsage: pct(kbMsgs, assistantMsgs.length),
      series,
      topQuestions,
      topIntents,
      handoffReasons,
    };
  });


// ==================== Knowledge Sources ====================

export interface ChatbotKbSource {
  id: string;
  chatbot_id: string;
  workspace_id: string;
  article_id: string | null;
  category_id: string | null;
  created_at: string;
}

export const listChatbotKbSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ chatbotId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<ChatbotKbSource[]> => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("chatbot_kb_sources" as never)
      .select("*")
      .eq("chatbot_id", data.chatbotId);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotKbSource[];
  });

export const setChatbotKbSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      chatbotId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      articleIds: z.array(z.string().uuid()).optional().default([]),
      categoryIds: z.array(z.string().uuid()).optional().default([]),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const supabase = sbAny(context.supabase);
    // Replace strategy: delete then insert.
    const { error: delErr } = await supabase
      .from("chatbot_kb_sources" as never)
      .delete()
      .eq("chatbot_id", data.chatbotId);
    if (delErr) throw new Error(delErr.message);
    const rows = [
      ...data.articleIds.map((id) => ({
        chatbot_id: data.chatbotId,
        workspace_id: data.workspaceId,
        article_id: id,
        category_id: null,
      })),
      ...data.categoryIds.map((id) => ({
        chatbot_id: data.chatbotId,
        workspace_id: data.workspaceId,
        article_id: null,
        category_id: id,
      })),
    ];
    if (rows.length === 0) return { count: 0 };
    const { error } = await supabase
      .from("chatbot_kb_sources" as never)
      .insert(rows as never);
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });

/** Ingest one or more inline text documents (txt/md/csv) into kb_articles. */
export const ingestInlineKbDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      docs: z.array(
        z.object({
          title: z.string().min(1).max(300),
          filename: z.string().optional(),
          content: z.string().min(1),
          sourceType: z.enum(["markdown", "txt", "csv"]).default("txt"),
        }),
      ).min(1).max(20),
    }).parse(v),
  )
  .handler(async ({ data, context }): Promise<{ id: string; title: string }[]> => {
    const supabase = sbAny(context.supabase);
    const nowIso = new Date().toISOString();
    const payload = data.docs.map((d) => ({
      workspace_id: data.workspaceId,
      category_id: null,
      slug: (d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) ||
        crypto.randomUUID().slice(0, 8)),
      title: d.title.slice(0, 300),
      summary: null,
      content_md: d.content,
      status: "draft" as const,
      tags: [] as string[],
      keywords: [] as string[],
      is_faq: false,
      faq_question: null,
      is_training: true,
      language: "en",
      source_type: d.sourceType,
      source_filename: d.filename ?? null,
      source_path: null,
      version: 1,
      needs_reindex: true,
      published_at: null,
      archived_at: null,
      created_by: context.userId,
      updated_by: context.userId,
      updated_at: nowIso,
    }));
    const { data: rows, error } = await supabase
      .from("kb_articles" as never)
      .insert(payload as never)
      .select("id, title");
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as { id: string; title: string }[];
  });
