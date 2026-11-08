/**
 * Server-side tool registry for the AI Conversation Engine.
 *
 * Tools are declared with a Zod input schema and an async executor. They are
 * exposed to the AI SDK via `tool()` and can be selected per conversation.
 * Add domain tools here — every tool must be safe to run on behalf of the
 * caller (RLS applies since executors receive the authenticated Supabase
 * client via context).
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTION_TOOL_CATALOG, buildActionTools } from "./action-tools.server";

export interface ToolContext {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  conversationId: string;
}

export function buildConversationTools(ctx: ToolContext, enabled?: string[]): ToolSet {
  const all = {
    current_time: tool({
      description: "Get the current server time in ISO-8601. Use when the user asks for the date/time.",
      inputSchema: z.object({
        timezone: z.string().nullable().describe("IANA timezone, e.g. 'Europe/Oslo'. Null for UTC."),
      }),
      execute: async ({ timezone }) => {
        const now = new Date();
        if (!timezone) return { iso: now.toISOString(), timezone: "UTC" };
        try {
          return {
            iso: now.toISOString(),
            local: now.toLocaleString("en-US", { timeZone: timezone }),
            timezone,
          };
        } catch {
          return { iso: now.toISOString(), timezone: "UTC", error: "invalid timezone" };
        }
      },
    }),

    search_knowledge_base: tool({
      description:
        "Search the workspace knowledge base for relevant articles. Call whenever the user asks about product docs, policies, or how-to content.",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query."),
        limit: z.number().nullable().describe("Max hits, default 5."),
      }),
      execute: async ({ query, limit }) => {
        try {
          const { searchKb } = await import("@/lib/kb/kb.functions");
          const hits = await searchKb({
            data: {
              workspaceId: ctx.workspaceId,
              query,
              matchCount: limit ?? 5,
              minSimilarity: 0.2,
            },
          });
          return {
            hits: (hits ?? []).slice(0, limit ?? 5).map((h) => ({
              title: h.title,
              snippet: h.content.slice(0, 240),
              similarity: h.similarity,
              article_id: h.article_id,
            })),
          };
        } catch (e) {
          return { hits: [], error: e instanceof Error ? e.message : "kb search failed" };
        }
      },
    }),

    lookup_customer: tool({
      description: "Look up a customer by phone, email, or ID. Use when the user references a specific customer.",
      inputSchema: z.object({
        query: z.string().describe("Phone number, email, or customer id."),
      }),
      execute: async ({ query }) => {
        const q = query.trim();
        const { data } = await ctx.supabase
          .from("customers" as never)
          .select("id,name,email,phone,company")
          .eq("workspace_id", ctx.workspaceId)
          .or(`email.eq.${q},phone.eq.${q},id.eq.${q}`)
          .limit(3);
        return { matches: data ?? [] };
      },
    }),

    save_note: tool({
      description: "Save a short internal note against this conversation for the agent to review later.",
      inputSchema: z.object({
        note: z.string().min(3),
      }),
      execute: async ({ note }) => {
        const { error } = await ctx.supabase
          .from("ai_conversation_messages" as never)
          .insert({
            conversation_id: ctx.conversationId,
            workspace_id: ctx.workspaceId,
            role: "system",
            content: `NOTE: ${note}`,
            metadata: { kind: "note", by: ctx.userId },
          } as never);
        return { saved: !error, error: error?.message };
      },
    }),
    ...buildActionTools(ctx),
  } as const;

  if (!enabled || enabled.length === 0) return all as ToolSet;
  const filtered: ToolSet = {};
  for (const key of enabled) {
    if (key in all) filtered[key] = (all as ToolSet)[key];
  }
  return filtered;
}

/** Client-safe metadata for a picker UI. */
export const CONVERSATION_TOOL_CATALOG = [
  { name: "current_time",          label: "Current time",           group: "Utility",   description: "Server clock / timezone helper." },
  { name: "search_knowledge_base", label: "Search knowledge base",  group: "Knowledge", description: "RAG search over workspace KB." },
  { name: "lookup_customer",       label: "Lookup customer",        group: "CRM",       description: "Find a customer by phone/email/id." },
  { name: "save_note",             label: "Save internal note",     group: "Productivity", description: "Append a note to this conversation." },
  ...ACTION_TOOL_CATALOG,
] as const;

export { ACTION_TOOL_CATALOG } from "./action-tools.server";
