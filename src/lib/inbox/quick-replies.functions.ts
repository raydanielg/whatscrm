import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuickReply = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

const normalizeShortcut = (s: string | null | undefined): string | null => {
  const trimmed = (s ?? "").replace(/^\//, "").trim().toLowerCase();
  return trimmed || null;
};

export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; search?: string }) =>
    z.object({ workspaceId: z.string().uuid(), search: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("quick_replies")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .order("usage_count", { ascending: false })
      .order("updated_at", { ascending: false });

    const term = data.search?.trim();
    if (term) {
      const escaped = term.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${escaped}%,body.ilike.%${escaped}%,shortcut.ilike.%${escaped}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as QuickReply[];
  });

export const createQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      workspaceId: string;
      title: string;
      body: string;
      shortcut?: string | null;
      category?: string | null;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          title: z.string().trim().min(1).max(120),
          body: z.string().trim().min(1).max(4000),
          shortcut: z.string().trim().max(32).nullish(),
          category: z.string().trim().max(60).nullish(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      created_by: context.userId,
      title: data.title,
      body: data.body,
      shortcut: normalizeShortcut(data.shortcut),
      category: data.category?.trim() || null,
    };
    const { data: inserted, error } = await context.supabase
      .from("quick_replies")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;
    return inserted as QuickReply;
  });

export const updateQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      title?: string;
      body?: string;
      shortcut?: string | null;
      category?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          title: z.string().trim().min(1).max(120).optional(),
          body: z.string().trim().min(1).max(4000).optional(),
          shortcut: z.string().trim().max(32).nullish(),
          category: z.string().trim().max(60).nullish(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.body !== undefined) patch.body = data.body;
    if (data.shortcut !== undefined) patch.shortcut = normalizeShortcut(data.shortcut);
    if (data.category !== undefined) patch.category = data.category?.trim() || null;

    const { data: updated, error } = await context.supabase
      .from("quick_replies")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return updated as QuickReply;
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quick_replies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const bumpQuickReplyUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: current, error: readError } = await context.supabase
      .from("quick_replies")
      .select("usage_count")
      .eq("id", data.id)
      .single();
    if (readError) throw readError;
    const { error } = await context.supabase
      .from("quick_replies")
      .update({ usage_count: (current?.usage_count ?? 0) + 1 })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
