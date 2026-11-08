/**
 * Contact matching rule CRUD + preview server functions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  findContactByPhone,
  toE164,
  toNational,
  lastNDigits,
  digitsOnly,
  type MatchingRule,
  type MatchStrategy,
} from "./phone-matching";
import { sbAny } from "@/lib/supabase/untyped";

const StrategySchema = z.enum(["exact", "e164", "national", "last_n_digits"]);

const WorkspaceScoped = z.object({ workspaceId: z.string().uuid() });

const RuleInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  priority: z.number().int().min(1).max(1000).default(100),
  strategy: StrategySchema,
  default_country_code: z.string().max(6).nullable().optional(),
  digits_to_match: z.number().int().min(4).max(15).nullable().optional(),
  enabled: z.boolean().default(true),
  label: z.string().max(120).nullable().optional(),
});

export const listMatchingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => WorkspaceScoped.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contact_matching_rules")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("priority", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as MatchingRule[];
  });

export const upsertMatchingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => RuleInput.parse(v))
  .handler(async ({ data, context }) => {
    const { workspaceId, id, ...rest } = data;
    const payload = {
      workspace_id: workspaceId,
      created_by: context.userId,
      ...rest,
    };
    const q = id
      ? sbAny(context.supabase).from("contact_matching_rules").update(payload).eq("id", id).select("*").single()
      : sbAny(context.supabase).from("contact_matching_rules").insert(payload).select("*").single();
    const { data: row, error } = await q;
    if (error) throw error;
    return row as MatchingRule;
  });

export const deleteMatchingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contact_matching_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/**
 * Preview: given a raw phone and the workspace's rules, return the normalized
 * variants plus the first contact each rule would match. Handy for admins
 * validating their configuration.
 */
export const previewMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    WorkspaceScoped.extend({ rawPhone: z.string().min(1).max(64) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: rules } = await context.supabase
      .from("contact_matching_rules")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("enabled", true)
      .order("priority", { ascending: true });
    const list = (rules ?? []) as MatchingRule[];

    const previews = list.map((r) => {
      let normalized: string | null = null;
      if (r.strategy === "exact") normalized = data.rawPhone;
      else if (r.strategy === "e164") normalized = toE164(data.rawPhone, r.default_country_code);
      else if (r.strategy === "national") normalized = toNational(data.rawPhone, r.default_country_code);
      else if (r.strategy === "last_n_digits")
        normalized = lastNDigits(data.rawPhone, r.digits_to_match ?? 8);
      return { rule: r, normalized };
    });

    const winner = await findContactByPhone(
      context.supabase,
      data.workspaceId,
      data.rawPhone,
      list,
    );

    return {
      digits: digitsOnly(data.rawPhone),
      previews,
      matchedContact: winner,
    };
  });

export type { MatchingRule, MatchStrategy };
