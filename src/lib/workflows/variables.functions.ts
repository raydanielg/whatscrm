import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { VariableScope } from "./variables";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * CRUD server functions for workflow variables.
 * All queries scope by the caller's workspace (RLS enforces access).
 */

const ScopeEnum = z.enum([
  "global",
  "workflow",
  "environment",
  "contact",
  "deal",
  "conversation",
  "organization",
  "custom",
]);

async function resolveWorkspaceId(supabase: {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  };
}, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const row = data as { workspace_id?: string } | null;
  if (!row?.workspace_id) throw new Error("No workspace found for current user");
  return row.workspace_id;
}

/* --------------------------------- List ---------------------------------- */

const ListInput = z.object({
  scope: ScopeEnum.optional(),
  automationId: z.string().uuid().optional(),
  includeSecrets: z.boolean().optional(),
});

export const listVariables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase as never, userId);
    let query = supabase
      .from("workflow_variables")
      .select("id, scope, automation_id, key, value, data_type, description, is_secret, updated_at")
      .eq("workspace_id", workspaceId)
      .order("scope")
      .order("key");
    if (data.scope) query = query.eq("scope", data.scope);
    if (data.automationId) query = query.eq("automation_id", data.automationId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string;
      scope: VariableScope;
      automation_id: string | null;
      key: string;
      value: unknown;
      data_type: string;
      description: string | null;
      is_secret: boolean;
      updated_at: string;
    }>;
    return {
      items: list.map((r) => ({
        ...r,
        value: (r.is_secret && !data.includeSecrets ? "••••••••" : r.value) as unknown as string,
      })),
    } as {
      items: Array<{
        id: string;
        scope: VariableScope;
        automation_id: string | null;
        key: string;
        value: string;
        data_type: string;
        description: string | null;
        is_secret: boolean;
        updated_at: string;
      }>;
    };
  });

/* -------------------------------- Upsert --------------------------------- */

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  scope: ScopeEnum,
  automationId: z.string().uuid().nullable().optional(),
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Keys must be identifiers"),
  value: z.unknown(),
  dataType: z.enum(["string", "number", "boolean", "json", "date", "secret"]).default("string"),
  description: z.string().nullable().optional(),
  isSecret: z.boolean().optional(),
});

export const upsertVariable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => UpsertInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase as never, userId);
    const automation_id = data.scope === "workflow" ? data.automationId ?? null : null;
    if (data.scope === "workflow" && !automation_id) {
      throw new Error("workflow-scoped variables require an automationId");
    }
    const row = {
      workspace_id: workspaceId,
      scope: data.scope,
      automation_id,
      key: data.key,
      value: JSON.parse(JSON.stringify(data.value ?? null)) as never,
      data_type: data.dataType,
      description: data.description ?? null,
      is_secret: !!data.isSecret,
      created_by: userId,
    };
    if (data.id) {
      const { error } = await sbAny(supabase).from("workflow_variables").update(row as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabase
      .from("workflow_variables")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

/* -------------------------------- Delete --------------------------------- */

const DeleteInput = z.object({ id: z.string().uuid() });

export const deleteVariable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase as never, userId);
    const { error } = await supabase
      .from("workflow_variables")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- Preview -------------------------------- */

const PreviewInput = z.object({
  template: z.string(),
  automationId: z.string().uuid().optional(),
  sample: z.record(z.unknown()).optional(),
});

export const previewExpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => PreviewInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await resolveWorkspaceId(supabase as never, userId);
    let query = supabase
      .from("workflow_variables")
      .select("scope, key, value, is_secret")
      .eq("workspace_id", workspaceId);
    if (data.automationId) {
      query = query.or(`automation_id.is.null,automation_id.eq.${data.automationId}`);
    } else {
      query = query.is("automation_id", null);
    }
    const { data: rows } = await query;
    const { composeBag, interpolate, redactSecrets } = await import("./variables");
    const scoped = ((rows ?? []) as Array<{ scope: VariableScope; key: string; value: unknown; is_secret: boolean }>);
    const bag = composeBag(scoped, data.sample ?? {});
    const preview = redactSecrets(bag, scoped);
    const output = interpolate(data.template, preview);
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);
    return { output: outputStr, bagKeys: Object.keys(preview) };
  });
