/**
 * Chatbot Template Marketplace — server functions.
 *
 * Featured/community templates, favorites, clone into a real chatbot,
 * import/export/share, and version snapshots.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

export const CHATBOT_TEMPLATE_CATEGORIES = [
  "Sales",
  "Customer Support",
  "Lead Generation",
  "Healthcare",
  "Education",
  "Real Estate",
  "Restaurant",
  "E-commerce",
  "Appointments",
  "Finance",
  "HR",
  "IT Support",
] as const;

const ConfigSchema = z
  .object({
    system_prompt: z.string().max(20000).optional().default(""),
    welcome_message: z.string().max(2000).optional().default(""),
    fallback_message: z.string().max(2000).optional().default(""),
    personality: z.string().max(500).nullable().optional(),
    tone: z.string().max(60).nullable().optional(),
    language: z.string().max(20).nullable().optional(),
    greeting: z.string().max(1000).nullable().optional(),
    escalation_prompt: z.string().max(2000).nullable().optional(),
    model: z.string().max(100).nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(32000).optional(),
    rag_enabled: z.boolean().optional(),
    handoff_enabled: z.boolean().optional(),
    handoff_keywords: z.array(z.string()).max(50).optional(),
    flow: z.unknown().optional(),
  })
  .passthrough();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.workspace_id) throw new Error("No workspace found for user");
  return data.workspace_id as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(supabase: any, userId: string, workspaceId: string): Promise<void> {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Admin permission required");
  }
}

/* ------------------------------ list templates ---------------------------- */

export const listChatbotTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: templates }, { data: favs }, { data: usage }] = await Promise.all([
      supabase
        .from("chatbot_templates")
        .select(
          "id, workspace_id, owner_user_id, name, description, category, icon, tags, is_featured, is_public_in_workspace, is_community, share_slug, version, usage_count, forked_from_template_id, created_at, updated_at",
        )
        .order("is_featured", { ascending: false })
        .order("usage_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(500),
      sbAny(supabase).from("chatbot_template_favorites").select("template_id").eq("user_id", userId),
      supabase
        .from("chatbot_template_usage")
        .select("template_id, used_at")
        .eq("user_id", userId)
        .order("used_at", { ascending: false })
        .limit(50),
    ]);
    const favIds = new Set((favs ?? []).map((f: { template_id: string }) => f.template_id));
    const recent: string[] = [];
    for (const u of (usage ?? []) as { template_id: string }[]) {
      if (!recent.includes(u.template_id)) recent.push(u.template_id);
    }
    return {
      templates: (templates ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        is_favorite: favIds.has(t.id as string),
      })),
      categories: CHATBOT_TEMPLATE_CATEGORIES,
      recentlyUsedIds: recent.slice(0, 20),
    };
  });

/* -------------------------------- get one --------------------------------- */

export const getChatbotTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: tpl, error } = await sbAny(context.supabase)
      .from("chatbot_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !tpl) throw new Error("Template not found");
    const { data: versions } = await sbAny(context.supabase)
      .from("chatbot_template_versions")
      .select("id, version, changelog, created_at, created_by")
      .eq("template_id", data.id)
      .order("version", { ascending: false });
    return { template: tpl, versions: versions ?? [] };
  });

/* ---------------------- preview install (diff vs existing) ---------------------- */

const DIFFABLE_KEYS = [
  "system_prompt",
  "welcome_message",
  "fallback_message",
  "personality",
  "tone",
  "language",
  "greeting",
  "escalation_prompt",
  "model",
  "temperature",
  "max_tokens",
  "rag_enabled",
  "handoff_enabled",
  "handoff_keywords",
] as const;

type DiffValue = string | number | boolean | string[] | null;
type DiffField = {
  key: string;
  label: string;
  current: DiffValue;
  incoming: DiffValue;
  status: "added" | "removed" | "changed";
};

const LABELS: Record<string, string> = {
  system_prompt: "System prompt",
  welcome_message: "Welcome message",
  fallback_message: "Fallback message",
  personality: "Personality",
  tone: "Tone",
  language: "Language",
  greeting: "Greeting",
  escalation_prompt: "Escalation prompt",
  model: "Model",
  temperature: "Temperature",
  max_tokens: "Max tokens",
  rag_enabled: "Knowledge Base (RAG)",
  handoff_enabled: "Human handoff",
  handoff_keywords: "Handoff keywords",
};

const STRING_KEYS = [
  "system_prompt",
  "welcome_message",
  "fallback_message",
  "personality",
  "tone",
  "language",
  "greeting",
  "escalation_prompt",
  "model",
] as const;
const NUMBER_KEYS = ["temperature", "max_tokens"] as const;
const BOOL_KEYS = ["rag_enabled", "handoff_enabled"] as const;

function normStr(v: unknown): DiffValue {
  if (v == null || v === "") return null;
  return String(v);
}
function normNum(v: unknown): DiffValue {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normBool(v: unknown): DiffValue {
  if (v == null) return null;
  return !!v;
}
function normArr(v: unknown): DiffValue {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map((x) => String(x));
}
function eq(a: DiffValue, b: DiffValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}
function statusOf(a: DiffValue, b: DiffValue): DiffField["status"] {
  return a === null ? "added" : b === null ? "removed" : "changed";
}

export const previewTemplateInstall = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        templateId: z.string().uuid(),
        workspaceId: z.string().uuid().optional(),
        name: z.string().min(1).max(120).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = data.workspaceId ?? (await resolveWorkspaceId(sbAny(context.supabase), context.userId));
    const { data: tpl, error: tplErr } = await sbAny(context.supabase)
      .from("chatbot_templates")
      .select("id, name, version, config")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Template not found");

    const searchName = (data.name?.trim() || (tpl.name as string)).trim();
    const { data: existing } = await sbAny(context.supabase)
      .from("chatbots")
      .select(
        "id, name, status, installed_from_template_id, installed_at, disabled_at, updated_at, system_prompt, welcome_message, fallback_message, personality, tone, language, greeting, escalation_prompt, model, temperature, max_tokens, rag_enabled, handoff_enabled, handoff_keywords",
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .ilike("name", searchName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tplName = tpl.name as string;
    const tplVersion = tpl.version as number;

    if (!existing) {
      return {
        workspaceId,
        hasExisting: false as const,
        template: { name: tplName, version: tplVersion },
        existing: null,
        diffs: [] as DiffField[],
      };
    }

    const cur = existing as unknown as Record<string, unknown>;
    const inc = (tpl.config ?? {}) as Record<string, unknown>;
    const diffs: DiffField[] = [];
    for (const key of STRING_KEYS) {
      const a = normStr(cur[key]);
      const b = normStr(inc[key]);
      if (!eq(a, b)) diffs.push({ key, label: LABELS[key], current: a, incoming: b, status: statusOf(a, b) });
    }
    for (const key of NUMBER_KEYS) {
      const a = normNum(cur[key]);
      const b = normNum(inc[key]);
      if (!eq(a, b)) diffs.push({ key, label: LABELS[key], current: a, incoming: b, status: statusOf(a, b) });
    }
    for (const key of BOOL_KEYS) {
      const a = normBool(cur[key]);
      const b = normBool(inc[key]);
      if (!eq(a, b)) diffs.push({ key, label: LABELS[key], current: a, incoming: b, status: statusOf(a, b) });
    }
    {
      const a = normArr(cur.handoff_keywords);
      const b = normArr(inc.handoff_keywords);
      if (!eq(a, b))
        diffs.push({ key: "handoff_keywords", label: LABELS.handoff_keywords, current: a, incoming: b, status: statusOf(a, b) });
    }

    return {
      workspaceId,
      hasExisting: true as const,
      template: { name: tplName, version: tplVersion },
      existing: {
        id: existing.id as string,
        name: existing.name as string,
        status: (existing.status as string) ?? "draft",
        disabled: !!existing.disabled_at,
        installedFromSameTemplate: existing.installed_from_template_id === tpl.id,
        updatedAt: (existing.updated_at as string) ?? "",
      },
      diffs,
    };
  });




/* --------------------------------- upsert --------------------------------- */

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().min(1).max(60),
  icon: z.string().max(60).default("Bot"),
  tags: z.array(z.string().max(40)).max(20).default([]),
  config: ConfigSchema,
  is_public_in_workspace: z.boolean().default(true),
  is_community: z.boolean().default(false),
  changelog: z.string().max(1000).optional(),
});

export const upsertChatbotTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => UpsertInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      workspace_id: workspaceId,
      owner_user_id: userId,
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      icon: data.icon,
      tags: data.tags,
      config: data.config,
      is_public_in_workspace: data.is_public_in_workspace,
      is_community: data.is_community,
    };

    if (data.id) {
      // Fetch current for versioning
      const { data: current } = await supabase
        .from("chatbot_templates")
        .select("version, config")
        .eq("id", data.id)
        .maybeSingle();
      const nextVersion = ((current?.version as number) ?? 1) + 1;
      // Snapshot old version
      if (current) {
        await sbAny(supabase).from("chatbot_template_versions").insert({
          template_id: data.id,
          version: current.version,
          config: current.config,
          changelog: data.changelog ?? null,
          created_by: userId,
        });
      }
      payload.version = nextVersion;
      const { data: updated, error } = await supabase
        .from("chatbot_templates")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: updated.id, updated: true };
    }
    const { data: inserted, error } = await supabase
      .from("chatbot_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

/* --------------------------------- delete --------------------------------- */

export const deleteChatbotTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("chatbot_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- favorite -------------------------------- */

export const toggleChatbotTemplateFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ templateId: z.string().uuid(), favorite: z.boolean() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.favorite) {
      await supabase
        .from("chatbot_template_favorites")
        .upsert(
          { user_id: userId, template_id: data.templateId },
          { onConflict: "user_id,template_id" },
        );
    } else {
      await supabase
        .from("chatbot_template_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("template_id", data.templateId);
    }
    return { ok: true };
  });

/* -------------------------- feature (admin-only) -------------------------- */

export const setChatbotTemplateFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ id: z.string().uuid(), featured: z.boolean() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tpl } = await supabase
      .from("chatbot_templates")
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!tpl?.workspace_id) throw new Error("Template not found");
    await requireAdmin(supabase, userId, tpl.workspace_id);
    const { error } = await supabase
      .from("chatbot_templates")
      .update({ is_featured: data.featured })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- clone -> chatbot ----------------------------- */

export const cloneTemplateToChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        templateId: z.string().uuid(),
        workspaceId: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let workspaceId = data.workspaceId ?? (await resolveWorkspaceId(supabase, userId));
    if (data.workspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!member) throw new Error("You are not a member of the selected workspace");
      workspaceId = data.workspaceId;
    }
    const { data: tpl, error: tplErr } = await supabase
      .from("chatbot_templates")
      .select("id, name, description, config, usage_count")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Template not accessible");

    const cfg = ConfigSchema.parse(tpl.config ?? {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: any = {
      workspace_id: workspaceId,
      name: data.name?.trim() || `${tpl.name}`,

      description: tpl.description ?? null,
      status: "draft",
      system_prompt: cfg.system_prompt ?? "",
      welcome_message: cfg.welcome_message ?? "",
      fallback_message: cfg.fallback_message ?? "",
      personality: cfg.personality ?? null,
      tone: cfg.tone ?? null,
      language: cfg.language ?? null,
      greeting: cfg.greeting ?? null,
      escalation_prompt: cfg.escalation_prompt ?? null,
      model: cfg.model ?? null,
      temperature: cfg.temperature ?? 0.7,
      max_tokens: cfg.max_tokens ?? 1024,
      rag_enabled: cfg.rag_enabled ?? false,
      handoff_enabled: cfg.handoff_enabled ?? false,
      handoff_keywords: cfg.handoff_keywords ?? [],
      flow: cfg.flow ?? {},
      installed_from_template_id: data.templateId,
      installed_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await supabase
      .from("chatbots")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await Promise.all([
      sbAny(supabase).from("chatbot_template_usage").insert({
        user_id: userId,
        workspace_id: workspaceId,
        template_id: data.templateId,
        action: "clone",
      }),
      supabase
        .from("chatbot_templates")
        .update({ usage_count: ((tpl as { usage_count?: number }).usage_count ?? 0) + 1 })
        .eq("id", data.templateId),
    ]);

    return { chatbotId: inserted.id as string };
  });

/* ------------------------ duplicate template ------------------------------ */

export const cloneChatbotTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ templateId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const { data: src, error: e1 } = await supabase
      .from("chatbot_templates")
      .select("name, description, category, icon, tags, config")
      .eq("id", data.templateId)
      .maybeSingle();
    if (e1 || !src) throw new Error("Template not accessible");
    const { data: inserted, error } = await supabase
      .from("chatbot_templates")
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        name: `${src.name} (copy)`,
        description: src.description,
        category: src.category,
        icon: src.icon,
        tags: src.tags,
        config: src.config,
        is_public_in_workspace: false,
        is_community: false,
        forked_from_template_id: data.templateId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

/* ------------------------ create template from bot ------------------------ */

export const createTemplateFromChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        chatbotId: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional().nullable(),
        category: z.string().min(1).max(60),
        icon: z.string().max(60).default("Bot"),
        tags: z.array(z.string().max(40)).max(20).default([]),
        is_public_in_workspace: z.boolean().default(true),
        is_community: z.boolean().default(false),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const { data: bot, error: be } = await supabase
      .from("chatbots")
      .select(
        "system_prompt, welcome_message, fallback_message, personality, tone, language, greeting, escalation_prompt, model, temperature, max_tokens, rag_enabled, handoff_enabled, handoff_keywords, flow",
      )
      .eq("id", data.chatbotId)
      .maybeSingle();
    if (be || !bot) throw new Error("Chatbot not accessible");
    const { data: inserted, error } = await supabase
      .from("chatbot_templates")
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        icon: data.icon,
        tags: data.tags,
        config: bot,
        is_public_in_workspace: data.is_public_in_workspace,
        is_community: data.is_community,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

/* ------------------------------- import JSON ------------------------------ */

const ImportInput = z.object({
  json: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    category: z.string().max(60).default("Customer Support"),
    icon: z.string().max(60).default("Bot"),
    tags: z.array(z.string()).max(20).default([]),
    config: ConfigSchema,
  }),
});

export const importChatbotTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ImportInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const { data: inserted, error } = await supabase
      .from("chatbot_templates")
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        name: data.json.name,
        description: data.json.description ?? null,
        category: data.json.category,
        icon: data.json.icon,
        tags: data.json.tags,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: data.json.config as any,
        is_public_in_workspace: false,
        is_community: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

/* -------------------------------- share URL ------------------------------- */

export const ensureChatbotTemplateShareSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("chatbot_templates")
      .select("share_slug")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.share_slug) return { slug: existing.share_slug as string };
    const slug = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join("");
    const { error } = await supabase
      .from("chatbot_templates")
      .update({ share_slug: slug })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { slug };
  });

/* -------------------------- restore prior version ------------------------- */

export const restoreChatbotTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ templateId: z.string().uuid(), version: z.number().int().positive() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("chatbot_template_versions")
      .select("config")
      .eq("template_id", data.templateId)
      .eq("version", data.version)
      .maybeSingle();
    if (!v) throw new Error("Version not found");
    const { data: current } = await supabase
      .from("chatbot_templates")
      .select("version, config")
      .eq("id", data.templateId)
      .maybeSingle();
    if (!current) throw new Error("Template not found");
    await sbAny(supabase).from("chatbot_template_versions").insert({
      template_id: data.templateId,
      version: current.version,
      config: current.config,
      changelog: `Snapshot before restore to v${data.version}`,
      created_by: userId,
    });
    await supabase
      .from("chatbot_templates")
      .update({ config: v.config, version: (current.version as number) + 1 })
      .eq("id", data.templateId);
    return { ok: true };
  });
