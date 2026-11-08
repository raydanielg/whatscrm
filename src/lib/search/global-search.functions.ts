/**
 * AI-powered global search — natural language search across every entity
 * in the workspace, plus recent/saved searches and business insights.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";
import { GEMINI_CHAT_URL, GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

// ==================== Types ====================

export type SearchScope =
  | "all"
  | "contact"
  | "company"
  | "lead"
  | "deal"
  | "task"
  | "conversation"
  | "campaign"
  | "knowledge";

// A JSON-serializable value (safe for TanStack server-function return types).
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface SearchHit {
  id: string;
  entity: SearchScope;
  title: string;
  subtitle: string | null;
  extra: string | null;
  score: number;
  href: string;
}

export interface GlobalSearchResult {
  query: string;
  expandedTerms: string[];
  intent: string | null;
  aiSummary: string | null;
  suggestions: string[];
  totalHits: number;
  groups: Record<SearchScope, SearchHit[]>;
  tookMs: number;
}

export interface RecentSearch {
  id: string;
  query: string;
  scope: string | null;
  resultCount: number;
  createdAt: string;
}

export interface SavedSearch {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  query: string;
  scope: string | null;
  filters: Json;
  isShared: boolean;
  isPinned: boolean;
  color: string | null;
  icon: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchInsight {
  title: string;
  detail: string;
  kind: "trend" | "opportunity" | "risk" | "observation";
  entities?: string[];
}

export interface SearchInsightsResult {
  topQueries: { query: string; count: number }[];
  totals: {
    contacts: number;
    companies: number;
    leads: number;
    deals: number;
    tasks: number;
    conversations: number;
    campaigns: number;
    knowledge: number;
  };
  trends: SearchInsight[];
  businessInsights: SearchInsight[];
  generatedAt: string;
}

// ==================== Helpers ====================

const HIT_LIMIT = 8;
const AI_MODEL = GEMINI_DEFAULT_CHAT_MODEL;

function esc(v: string): string {
  return v.replace(/[%_,]/g, (m) => `\\${m}`);
}

/** Expand a natural-language query into keyword terms + intent using Lovable AI. */
async function expandQuery(
  q: string,
): Promise<{ terms: string[]; intent: string | null; suggestions: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallback = {
    terms: q
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 6),
    intent: null as string | null,
    suggestions: [] as string[],
  };
  if (!apiKey || q.length < 3) return fallback;
  try {
    const res = await fetch(GEMINI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You expand CRM search queries. Output strict JSON: " +
              '{"terms":[""],"intent":"one short label like find_contact, find_deal, find_conversation, general","suggestions":["natural-language follow-up query",""]} ' +
              "Return 2-6 keyword terms (lowercase, no punctuation) that broaden or complete the user's intent. " +
              "Return up to 3 helpful suggested follow-up queries. Do not invent proper nouns not present.",
          },
          { role: "user", content: q },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { terms?: unknown; intent?: unknown; suggestions?: unknown };
    const terms = Array.isArray(parsed.terms)
      ? (parsed.terms as unknown[])
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 6)
      : fallback.terms;
    const suggestions = Array.isArray(parsed.suggestions)
      ? (parsed.suggestions as unknown[])
          .filter((t): t is string => typeof t === "string")
          .slice(0, 3)
      : [];
    const intent = typeof parsed.intent === "string" ? parsed.intent : null;
    return { terms: Array.from(new Set([q.toLowerCase(), ...terms])), intent, suggestions };
  } catch {
    return fallback;
  }
}

/** Score a hit against the raw query — used for cross-entity ranking. */
function scoreHit(hit: Omit<SearchHit, "score">, q: string, terms: string[]): number {
  const hay = [hit.title, hit.subtitle ?? "", hit.extra ?? ""].join(" ").toLowerCase();
  const query = q.toLowerCase();
  let s = 0;
  if (hit.title.toLowerCase() === query) s += 100;
  if (hit.title.toLowerCase().startsWith(query)) s += 50;
  if (hay.includes(query)) s += 20;
  for (const t of terms) {
    if (t && hay.includes(t)) s += 5;
  }
  return s;
}

// ==================== Global Search ====================

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().min(1).max(500),
        scope: z
          .enum([
            "all",
            "contact",
            "company",
            "lead",
            "deal",
            "task",
            "conversation",
            "campaign",
            "knowledge",
          ])
          .optional()
          .default("all"),
        useAi: z.boolean().optional().default(true),
        logHistory: z.boolean().optional().default(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<GlobalSearchResult> => {
    const started = Date.now();
    const { supabase, userId } = context;
    const q = data.query.trim();
    const like = `%${sanitizeSearchTerm(esc(q))}%`;

    const includes = (s: SearchScope) => data.scope === "all" || data.scope === s;

    // AI query expansion (parallel with entity searches)
    const expandP = data.useAi
      ? expandQuery(q)
      : Promise.resolve({ terms: [q.toLowerCase()], intent: null, suggestions: [] });

    // Parallel entity searches
    const ws = data.workspaceId;
    // Labels a deal that carries no currency of its own — "USD" here made every
    // such result read as dollars regardless of the tenant's setting.
    const fallbackCurrency = await resolveWorkspaceCurrency(ws);
    const contactsP = includes("contact")
      ? supabase
          .from("contacts")
          .select("id, first_name, last_name, display_name, email, phone, job_title")
          .eq("workspace_id", ws)
          .is("deleted_at", null)
          .or(
            `display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like},job_title.ilike.${like}`,
          )
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const companiesP = includes("company")
      ? supabase
          .from("companies")
          .select("id, name, industry, website, city, country")
          .eq("workspace_id", ws)
          .is("deleted_at", null)
          .or(`name.ilike.${like},website.ilike.${like},industry.ilike.${like},city.ilike.${like}`)
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const leadsP = includes("lead")
      ? supabase
          .from("leads")
          .select("id, first_name, last_name, email, company_name, status, source")
          .eq("workspace_id", ws)
          .is("deleted_at", null)
          .or(
            `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},company_name.ilike.${like}`,
          )
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const dealsP = includes("deal")
      ? supabase
          .from("deals")
          .select("id, title, amount, currency, status")
          .eq("workspace_id", ws)
          .is("deleted_at", null)
          .ilike("title", like)
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const tasksP = includes("task")
      ? supabase
          .from("tasks")
          .select("id, title, description, status, priority, due_at")
          .eq("workspace_id", ws)
          .or(`title.ilike.${like},description.ilike.${like}`)
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const convsP = includes("conversation")
      ? supabase
          .from("conversations")
          .select("id, subject, last_message_preview, status, updated_at")
          .eq("workspace_id", ws)
          .or(`subject.ilike.${like},last_message_preview.ilike.${like}`)
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const campaignsP = includes("campaign")
      ? supabase
          .from("campaigns")
          .select("id, name, description, status, type")
          .eq("workspace_id", ws)
          .or(`name.ilike.${like},description.ilike.${like}`)
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    const kbP = includes("knowledge")
      ? supabase
          .from("kb_articles")
          .select("id, title, summary, status, tags")
          .eq("workspace_id", ws)
          .or(`title.ilike.${like},summary.ilike.${like},content_md.ilike.${like}`)
          .limit(HIT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [expand, contacts, companies, leads, deals, tasks, convs, campaigns, kb] =
      (await Promise.all([
        expandP,
        contactsP,
        companiesP,
        leadsP,
        dealsP,
        tasksP,
        convsP,
        campaignsP,
        kbP,
      ])) as any;

    const terms = expand.terms as string[];

    // Map to unified hits
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapContact = (r: any): SearchHit => {
      const title =
        r.display_name ||
        [r.first_name, r.last_name].filter(Boolean).join(" ") ||
        r.email ||
        "Contact";
      const base = {
        id: r.id,
        entity: "contact" as const,
        title,
        subtitle: r.job_title || r.email || null,
        extra: r.phone || null,
        href: `/contacts/${r.id}`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapCompany = (r: any): SearchHit => {
      const base = {
        id: r.id,
        entity: "company" as const,
        title: r.name,
        subtitle: r.industry || null,
        extra: [r.city, r.country].filter(Boolean).join(", ") || r.website || null,
        href: `/companies/${r.id}`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapLead = (r: any): SearchHit => {
      const title = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Lead";
      const base = {
        id: r.id,
        entity: "lead" as const,
        title,
        subtitle: r.company_name || r.email || null,
        extra: [r.status, r.source].filter(Boolean).join(" · ") || null,
        href: `/leads/${r.id}`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapDeal = (r: any): SearchHit => {
      const base = {
        id: r.id,
        entity: "deal" as const,
        title: r.title,
        subtitle: `${r.currency ?? fallbackCurrency} ${Number(r.amount ?? 0).toLocaleString()}`,
        extra: r.status || null,
        href: `/deals`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapTask = (r: any): SearchHit => {
      const base = {
        id: r.id,
        entity: "task" as const,
        title: r.title,
        subtitle: (r.description as string | null)?.slice(0, 120) ?? null,
        extra: [r.status, r.priority].filter(Boolean).join(" · ") || null,
        href: `/dashboard`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapConv = (r: any): SearchHit => {
      const base = {
        id: r.id,
        entity: "conversation" as const,
        title: r.subject || "(no subject)",
        subtitle: (r.last_message_preview as string | null)?.slice(0, 160) ?? null,
        extra: r.status || null,
        href: `/inbox?conversationId=${r.id}`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapCampaign = (r: any): SearchHit => {
      const base = {
        id: r.id,
        entity: "campaign" as const,
        title: r.name,
        subtitle: (r.description as string | null)?.slice(0, 160) ?? null,
        extra: [r.type, r.status].filter(Boolean).join(" · ") || null,
        href: `/campaigns`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapKb = (r: any): SearchHit => {
      const tags = Array.isArray(r.tags) ? (r.tags as string[]).slice(0, 3).join(" · ") : null;
      const base = {
        id: r.id,
        entity: "knowledge" as const,
        title: r.title,
        subtitle: (r.summary as string | null)?.slice(0, 160) ?? null,
        extra: tags || r.status || null,
        href: `/knowledge?article=${r.id}`,
      };
      return { ...base, score: scoreHit(base, q, terms) };
    };

    const groups: Record<SearchScope, SearchHit[]> = {
      all: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contact: (contacts.data ?? [])
        .map(mapContact)
        .sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: (companies.data ?? [])
        .map(mapCompany)
        .sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lead: (leads.data ?? []).map(mapLead).sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deal: (deals.data ?? []).map(mapDeal).sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      task: (tasks.data ?? []).map(mapTask).sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conversation: (convs.data ?? [])
        .map(mapConv)
        .sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      campaign: (campaigns.data ?? [])
        .map(mapCampaign)
        .sort((a: SearchHit, b: SearchHit) => b.score - a.score),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      knowledge: (kb.data ?? []).map(mapKb).sort((a: SearchHit, b: SearchHit) => b.score - a.score),
    };

    // Top-ranked cross-entity list ("Suggested results")
    groups.all = (Object.keys(groups) as SearchScope[])
      .filter((k) => k !== "all")
      .flatMap((k) => groups[k])
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const totalHits = groups.all.length
      ? (Object.keys(groups) as SearchScope[])
          .filter((k) => k !== "all")
          .reduce((n, k) => n + groups[k].length, 0)
      : 0;

    // Fire-and-forget: log to search history
    if (data.logHistory && q.length >= 2) {
      void sbAny(supabase).from("search_history").insert({
        workspace_id: ws,
        user_id: userId,
        query: q,
        scope: data.scope,
        result_count: totalHits,
      });
    }

    // Optional AI summary of the top hits
    let aiSummary: string | null = null;
    if (data.useAi && totalHits > 0 && process.env.GEMINI_API_KEY) {
      try {
        const preview = groups.all
          .slice(0, 6)
          .map((h, i) => `${i + 1}. [${h.entity}] ${h.title} — ${h.subtitle ?? ""}`)
          .join("\n");
        const res = await fetch(GEMINI_CHAT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: AI_MODEL,
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content:
                  "You summarize CRM search results in ONE sentence (max 25 words). Do not list items. Be specific and actionable.",
              },
              { role: "user", content: `Query: "${q}"\nResults:\n${preview}` },
            ],
          }),
        });
        if (res.ok) {
          const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          aiSummary = j.choices?.[0]?.message?.content?.trim() ?? null;
        }
      } catch {
        // ignore
      }
    }

    return {
      query: q,
      expandedTerms: terms,
      intent: expand.intent,
      aiSummary,
      suggestions: expand.suggestions,
      totalHits,
      groups,
      tookMs: Date.now() - started,
    };
  });

// ==================== Recent searches ====================

export const getRecentSearches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional().default(10),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<RecentSearch[]> => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("search_history")
      .select("id, query, scope, result_count, created_at")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    const seen = new Set<string>();
    const out: RecentSearch[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows ?? []) as any[]) {
      const key = (r.query as string).toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: r.id,
        query: r.query,
        scope: r.scope,
        resultCount: r.result_count ?? 0,
        createdAt: r.created_at,
      });
    }
    return out;
  });

export const clearRecentSearches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await sbAny(supabase)
      .from("search_history")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId);
    return { ok: true };
  });

// ==================== Saved searches ====================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSaved(r: any): SavedSearch {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    userId: r.user_id,
    name: r.name,
    query: r.query,
    scope: r.scope,
    filters: (r.filters as Json) ?? {},
    isShared: !!r.is_shared,
    isPinned: !!r.is_pinned,
    color: r.color,
    icon: r.icon,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const listSavedSearches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<SavedSearch[]> => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map(mapSaved);
  });

export const saveSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        query: z.string().min(1).max(500),
        scope: z.string().optional(),
        filters: z.record(z.unknown()).optional().default({}),
        isShared: z.boolean().optional().default(false),
        isPinned: z.boolean().optional().default(false),
        color: z.string().nullish(),
        icon: z.string().nullish(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<SavedSearch> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("saved_searches")
      .insert({
        workspace_id: data.workspaceId,
        user_id: userId,
        name: data.name,
        query: data.query,
        scope: data.scope ?? null,
        filters: data.filters as Json,
        is_shared: data.isShared,
        is_pinned: data.isPinned,
        color: data.color ?? null,
        icon: data.icon ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSaved(row);
  });

export const updateSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        query: z.string().min(1).max(500).optional(),
        scope: z.string().nullish(),
        filters: z.record(z.unknown()).optional(),
        isShared: z.boolean().optional(),
        isPinned: z.boolean().optional(),
        color: z.string().nullish(),
        icon: z.string().nullish(),
        touchLastUsed: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<SavedSearch> => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.query !== undefined) patch.query = data.query;
    if (data.scope !== undefined) patch.scope = data.scope;
    if (data.filters !== undefined) patch.filters = data.filters;
    if (data.isShared !== undefined) patch.is_shared = data.isShared;
    if (data.isPinned !== undefined) patch.is_pinned = data.isPinned;
    if (data.color !== undefined) patch.color = data.color;
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.touchLastUsed) patch.last_used_at = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (sbAny(supabase).from("saved_searches") as any)
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSaved(row);
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await sbAny(supabase).from("saved_searches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== Insights Dashboard ====================

export const getSearchInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<SearchInsightsResult> => {
    const { supabase, userId } = context;
    const ws = data.workspaceId;

    // Top queries (last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: qrows } = await supabase
      .from("search_history")
      .select("query")
      .eq("workspace_id", ws)
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(500);
    const counts = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (qrows ?? []) as any[]) {
      const k = String(r.query).toLowerCase().trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const topQueries = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([query, count]) => ({ query, count }));

    // Totals across entities (parallel counts, best-effort)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const c = (table: string) =>
      sbAny(db).from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws);

    const [contacts, companies, leads, deals, tasks, conversations, campaigns, knowledge] =
      await Promise.all([
        c("contacts"),
        c("companies"),
        c("leads"),
        c("deals"),
        c("tasks"),
        c("conversations"),
        c("campaigns"),
        c("kb_articles"),
      ]);

    const totals = {
      contacts: contacts.count ?? 0,
      companies: companies.count ?? 0,
      leads: leads.count ?? 0,
      deals: deals.count ?? 0,
      tasks: tasks.count ?? 0,
      conversations: conversations.count ?? 0,
      campaigns: campaigns.count ?? 0,
      knowledge: knowledge.count ?? 0,
    };

    // Fetch a light "signals" bundle for AI to reason over
    const [openDealsRes, hotLeadsRes, staleConvsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("title, amount, currency, status, expected_close_date")
        .eq("workspace_id", ws)
        .is("deleted_at", null)
        .not("status", "in", "(won,lost)")
        .order("amount", { ascending: false })
        .limit(8),
      supabase
        .from("leads")
        .select("first_name, last_name, company_name, status, source")
        .eq("workspace_id", ws)
        .is("deleted_at", null)
        .in("status", ["qualified", "new"])
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("conversations")
        .select("subject, status, updated_at")
        .eq("workspace_id", ws)
        .neq("status", "resolved")
        .order("updated_at", { ascending: true })
        .limit(8),
    ]);

    // AI insights
    let trends: SearchInsight[] = [];
    let businessInsights: SearchInsight[] = [];
    if (process.env.GEMINI_API_KEY) {
      try {
        const context = {
          totals,
          topQueries,
          openDeals: openDealsRes.data ?? [],
          hotLeads: hotLeadsRes.data ?? [],
          staleConversations: staleConvsRes.data ?? [],
        };
        const res = await fetch(GEMINI_CHAT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: AI_MODEL,
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You analyze CRM data and return concise operator insights. Output strict JSON: " +
                  '{"trends":[{"title":"","detail":"","kind":"trend|observation"}],' +
                  '"businessInsights":[{"title":"","detail":"","kind":"opportunity|risk|observation"}]}. ' +
                  "Trends focus on patterns in search queries and volumes. Business insights focus on pipeline, leads, and conversations. " +
                  "Each 'detail' is 1 sentence. Max 4 items per section. No fluff, no headings, no markdown.",
              },
              { role: "user", content: JSON.stringify(context) },
            ],
          }),
        });
        if (res.ok) {
          const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const raw = j.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(raw) as { trends?: unknown; businessInsights?: unknown };
          const norm = (arr: unknown): SearchInsight[] =>
            Array.isArray(arr)
              ? (arr as unknown[])
                  .map((x): SearchInsight | null => {
                    if (!x || typeof x !== "object") return null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const o = x as any;
                    if (!o.title || !o.detail) return null;
                    return {
                      title: String(o.title),
                      detail: String(o.detail),
                      kind: (["trend", "opportunity", "risk", "observation"] as const).includes(
                        o.kind,
                      )
                        ? o.kind
                        : "observation",
                    };
                  })
                  .filter((x): x is SearchInsight => x !== null)
                  .slice(0, 4)
              : [];
          trends = norm(parsed.trends);
          businessInsights = norm(parsed.businessInsights);
        }
      } catch {
        // ignore
      }
    }

    return {
      topQueries,
      totals,
      trends,
      businessInsights,
      generatedAt: new Date().toISOString(),
    };
  });
