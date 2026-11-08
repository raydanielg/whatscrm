/**
 * Authenticated server functions for the Live Chat platform:
 *   - listVisitors: recent visitors for the current workspace inbox.
 *   - listRoutingRules / upsertRoutingRule / deleteRoutingRule:
 *     workspace admins configure how widget conversations are routed.
 *
 * Auth: `requireSupabaseAuth` gives us an RLS-scoped supabase client and the
 * caller's userId. All queries use it, so RLS (workspace membership) enforces
 * isolation. We resolve the caller's workspace from the `workspaces` table
 * (owner or membership), matching the pattern used elsewhere in the app.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

const WorkspaceInput = z.object({ workspaceId: z.string().uuid() });

export const listVisitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => WorkspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("livechat_visitors")
      .select("id, visitor_key, display_name, email, phone, country, city, device, browser, os, language, timezone, ip_address, utm_source, utm_medium, utm_campaign, last_referrer, last_page, last_seen_at, first_seen_at, visits_count, page_views, contact_id")
      .eq("workspace_id", data.workspaceId)
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getVisitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z.object({ visitorId: z.string().uuid(), workspaceId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: visitor, error } = await context.supabase
      .from("livechat_visitors")
      .select("*")
      .eq("id", data.visitorId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visitor) return null;

    const { data: events } = await context.supabase
      .from("livechat_visitor_events")
      .select("id, event_type, event_name, url, referrer, properties, created_at, session_id")
      .eq("visitor_id", data.visitorId)
      .order("created_at", { ascending: false })
      .limit(500);

    const v = visitor as { contact_id: string | null };
    let contact: Record<string, unknown> | null = null;
    if (v.contact_id) {
      const { data: c } = await context.supabase
        .from("contacts")
        .select("id, name, email, phone, avatar_url, company_id, lifecycle_stage, tags")
        .eq("id", v.contact_id)
        .maybeSingle();
      contact = (c as Record<string, unknown> | null) ?? null;
    }

    const { data: sessions } = await context.supabase
      .from("chatbot_sessions")
      .select("id, status, started_at, ended_at, conversation_id")
      .eq("visitor_id", data.visitorId)
      .order("started_at", { ascending: false })
      .limit(50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(
      JSON.stringify({ visitor, events: events ?? [], contact, sessions: sessions ?? [] }),
    ) as any;
  });

export const mergeVisitorWithContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        visitorId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        contactId: z.string().uuid(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    // Verify workspace membership via RLS-scoped select first.
    const { data: v } = await context.supabase
      .from("livechat_visitors")
      .select("id")
      .eq("id", data.visitorId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!v) throw new Error("Visitor not found");
    const { data: c } = await context.supabase
      .from("contacts")
      .select("id")
      .eq("id", data.contactId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!c) throw new Error("Contact not found");

    const { mergeVisitorIntoContact } = await import("@/lib/livechat/visitor-engine.server");
    const merged = await mergeVisitorIntoContact(
      data.visitorId,
      data.workspaceId,
      data.contactId,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify(merged)) as any;
  });

export const searchContactsForMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().max(120),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const q = data.query.trim();
    let builder = context.supabase
      .from("contacts")
      .select("id, name, email, phone, avatar_url")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (q.length > 0) {
      const like = `%${sanitizeSearchTerm(q)}%`;
      builder = builder.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


const RuleInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  priority: z.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(true),
  matchPages: z.array(z.string()).default([]),
  matchKeywords: z.array(z.string()).default([]),
  matchCountry: z.array(z.string()).default([]),
  matchLanguage: z.array(z.string()).default([]),
  matchBusinessHours: z.boolean().nullable().default(null),
  matchVip: z.boolean().nullable().default(null),
  matchPriority: z.array(z.enum(["low", "normal", "high", "urgent"])).default([]),
  requiredSkills: z.array(z.string()).default([]),
  strategy: z
    .enum(["auto", "round_robin", "least_busy", "department", "skill"])
    .default("auto"),
  customConditions: z.record(z.string(), z.unknown()).default({}),
  routeTo: z.enum(["ai", "department", "agent", "queue"]).default("ai"),
  departmentId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  chatbotId: z.string().uuid().nullable().optional(),
  autoMessage: z.string().max(500).nullable().optional(),
});

export const listRoutingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => WorkspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("livechat_routing_rules")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => RuleInput.parse(raw))
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId,
      name: data.name,
      priority: data.priority,
      enabled: data.enabled,
      match_pages: data.matchPages,
      match_keywords: data.matchKeywords,
      match_country: data.matchCountry,
      match_language: data.matchLanguage,
      match_business_hours: data.matchBusinessHours,
      match_vip: data.matchVip,
      match_priority: data.matchPriority,
      required_skills: data.requiredSkills,
      strategy: data.strategy,
      custom_conditions: data.customConditions,
      route_to: data.routeTo,
      department_id: data.departmentId ?? null,
      agent_id: data.agentId ?? null,
      chatbot_id: data.chatbotId ?? null,
      auto_message: data.autoMessage ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("livechat_routing_rules")
        .update(payload as never)
        .eq("id", data.id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("livechat_routing_rules")
      .insert(payload as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("livechat_routing_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
