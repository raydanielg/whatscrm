import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Workflow Template Marketplace — server functions.
 *
 * Handles CRUD, favorites, clone-to-automation, import/export/share, and
 * admin-only featured toggles. RLS on `workflow_templates` handles most
 * visibility rules; these functions add server-side workspace resolution,
 * role gating, and safe JSON graph normalization.
 */

const GraphSchema = z.object({
  nodes: z.array(z.record(z.unknown())).default([]),
  edges: z.array(z.record(z.unknown())).default([]),
});

const CATEGORIES = [
  "Sales",
  "Support",
  "Marketing",
  "Customer Success",
  "HR",
  "Internal Automation",
  "Lead Qualification",
  "AI",
  "WhatsApp",
  "CRM",
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
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

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: templates }, { data: favs }, { data: usage }] = await Promise.all([
      supabase
        .from("workflow_templates")
        .select("id, workspace_id, owner_user_id, name, description, category, icon, tags, is_featured, is_public_in_workspace, share_slug, usage_count, forked_from_template_id, created_at, updated_at")
        .order("is_featured", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(500),
      sbAny(supabase).from("workflow_template_favorites").select("template_id").eq("user_id", userId),
      supabase
        .from("workflow_template_usage")
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
      categories: CATEGORIES,
      recentlyUsedIds: recent.slice(0, 20),
    };
  });

/* -------------------------------- get one --------------------------------- */

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: tpl, error } = await context.supabase
      .from("workflow_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !tpl) throw new Error("Template not found");
    return tpl;
  });

/* --------------------------------- upsert --------------------------------- */

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().min(1).max(60),
  icon: z.string().max(60).default("Workflow"),
  tags: z.array(z.string().max(40)).max(20).default([]),
  graph: GraphSchema,
  is_public_in_workspace: z.boolean().default(true),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => UpsertInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const payload: any = {
      workspace_id: workspaceId,
      owner_user_id: userId,
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      icon: data.icon,
      tags: data.tags,
      graph: data.graph,
      is_public_in_workspace: data.is_public_in_workspace,
    };
    if (data.id) {
      const { data: updated, error } = await supabase
        .from("workflow_templates")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: updated.id, updated: true };
    }
    const { data: inserted, error } = await supabase
      .from("workflow_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

/* --------------------------------- delete --------------------------------- */

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("workflow_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- favorite -------------------------------- */

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ templateId: z.string().uuid(), favorite: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.favorite) {
      await supabase
        .from("workflow_template_favorites")
        .upsert({ user_id: userId, template_id: data.templateId }, { onConflict: "user_id,template_id" });
    } else {
      await supabase
        .from("workflow_template_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("template_id", data.templateId);
    }
    return { ok: true };
  });

/* -------------------------- feature (admin-only) -------------------------- */

export const setFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid(), featured: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tpl } = await supabase
      .from("workflow_templates")
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!tpl?.workspace_id) throw new Error("Template not found");
    await requireAdmin(supabase, userId, tpl.workspace_id);
    const { error } = await supabase
      .from("workflow_templates")
      .update({ is_featured: data.featured })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- clone -> automation -------------------------- */

export const cloneTemplateToWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ templateId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const { data: tpl, error: tplErr } = await supabase
      .from("workflow_templates")
      .select("id, name, description, graph")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Template not accessible");

    const graph = GraphSchema.parse(tpl.graph ?? { nodes: [], edges: [] });
    const firstTrigger =
      (graph.nodes as Array<{ type?: string }>).find((n) => typeof n.type === "string" && n.type.startsWith("trigger."))
        ?.type ?? "trigger.manual";

    const { data: inserted, error } = await supabase
      .from("automations")
      .insert({
        workspace_id: workspaceId,
        name: `${tpl.name} (from template)`,
        description: tpl.description ?? null,
        trigger_type: firstTrigger,
        status: "draft",
        graph: graph as any,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Track usage
    await sbAny(supabase).from("workflow_template_usage").insert({
      user_id: userId,
      workspace_id: workspaceId,
      template_id: data.templateId,
    });

    return { automationId: inserted.id as string };
  });

/* ------------------------------ clone template ---------------------------- */

export const cloneTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ templateId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const { data: src, error: e1 } = await supabase
      .from("workflow_templates")
      .select("name, description, category, icon, tags, graph")
      .eq("id", data.templateId)
      .maybeSingle();
    if (e1 || !src) throw new Error("Template not accessible");
    const { data: inserted, error } = await supabase
      .from("workflow_templates")
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        name: `${src.name} (copy)`,
        description: src.description,
        category: src.category,
        icon: src.icon,
        tags: src.tags,
        graph: src.graph,
        is_public_in_workspace: false,
        forked_from_template_id: data.templateId,
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
    category: z.string().max(60).default("Internal Automation"),
    icon: z.string().max(60).default("Workflow"),
    tags: z.array(z.string()).max(20).default([]),
    graph: GraphSchema,
  }),
});

export const importTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ImportInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase, userId);
    const { data: inserted, error } = await supabase
      .from("workflow_templates")
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        name: data.json.name,
        description: data.json.description ?? null,
        category: data.json.category,
        icon: data.json.icon,
        tags: data.json.tags,
        graph: data.json.graph as any,
        is_public_in_workspace: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

/* -------------------------------- share URL ------------------------------- */

export const ensureShareSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("workflow_templates")
      .select("share_slug")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.share_slug) return { slug: existing.share_slug as string };
    // 12-char base36 slug
    const slug = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 36)
        .toString(36),
    ).join("");
    const { error } = await supabase
      .from("workflow_templates")
      .update({ share_slug: slug })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { slug };
  });
