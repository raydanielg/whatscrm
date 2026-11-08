/**
 * AI Knowledge Base — categories, articles, versions, semantic search (RAG),
 * suggestions, and AI answer generation.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { chunkText, estimateTokens, slugify } from "./chunk";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

// ==================== Types ====================

export type KbStatus = "draft" | "published" | "archived";
export type KbSourceType = "manual" | "markdown" | "pdf" | "docx" | "url" | "import";
import { sbAny } from "@/lib/supabase/untyped";

export interface KbCategory {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KbArticle {
  id: string;
  workspace_id: string;
  category_id: string | null;
  slug: string;
  title: string;
  summary: string | null;
  content_md: string;
  status: KbStatus;
  tags: string[];
  keywords: string[];
  is_faq: boolean;
  faq_question: string | null;
  is_training: boolean;
  language: string | null;
  source_type: KbSourceType;
  source_filename: string | null;
  source_path: string | null;
  version: number;
  view_count: number;
  helpful_count: number;
  unhelpful_count: number;
  ai_use_count: number;
  last_indexed_at: string | null;
  needs_reindex: boolean;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbSearchHit {
  chunk_id: string;
  article_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
  title: string;
  slug: string;
  summary: string | null;
  category_id: string | null;
  is_faq: boolean;
}

// ==================== Categories ====================

export const listKbCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<KbCategory[]> => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("kb_categories" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as KbCategory[];
  });

export const upsertKbCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        parentId: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(120),
        slug: z.string().optional(),
        description: z.string().optional().nullable(),
        color: z.string().optional().nullable(),
        icon: z.string().optional().nullable(),
        sortOrder: z.number().int().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbCategory> => {
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      workspace_id: data.workspaceId,
      parent_id: data.parentId ?? null,
      name: data.name,
      slug: data.slug || slugify(data.name),
      description: data.description ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
      sort_order: data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      created_by: context.userId,
    };
    const { data: row, error } = await sbAny(context.supabase)
      .from("kb_categories" as never)
      .upsert(payload as never, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as KbCategory;
  });

export const deleteKbCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("kb_categories" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== Articles ====================

export const listKbArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        search: z.string().optional(),
        isFaq: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbArticle[]> => {
    let q = sbAny(context.supabase)
      .from("kb_articles" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.categoryId !== undefined) {
      q =
        data.categoryId === null ? q.is("category_id", null) : q.eq("category_id", data.categoryId);
    }
    if (typeof data.isFaq === "boolean") q = q.eq("is_faq", data.isFaq);
    if (data.search && data.search.trim()) {
      const term = `%${sanitizeSearchTerm(data.search)}%`;
      q = q.or(`title.ilike.${term},summary.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as KbArticle[];
  });

export const getKbArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<KbArticle> => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("kb_articles" as never)
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as KbArticle;
  });

const articleInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  slug: z.string().optional(),
  title: z.string().min(1).max(300),
  summary: z.string().optional().nullable(),
  contentMd: z.string().default(""),
  status: z.enum(["draft", "published", "archived"]).optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  isFaq: z.boolean().optional(),
  faqQuestion: z.string().optional().nullable(),
  isTraining: z.boolean().optional(),
  language: z.string().optional(),
  sourceType: z.enum(["manual", "markdown", "pdf", "docx", "url", "import"]).optional(),
  sourceFilename: z.string().optional().nullable(),
  sourcePath: z.string().optional().nullable(),
  versionNote: z.string().optional(),
});

export const upsertKbArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => articleInput.parse(v))
  .handler(async ({ data, context }): Promise<KbArticle> => {
    const supabase = sbAny(context.supabase);

    let existing: KbArticle | null = null;
    if (data.id) {
      const { data: row } = await supabase
        .from("kb_articles" as never)
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      existing = (row ?? null) as unknown as KbArticle | null;
    }

    const contentChanged = !existing || existing.content_md !== data.contentMd;
    const nextVersion = existing ? (contentChanged ? existing.version + 1 : existing.version) : 1;

    const nowIso = new Date().toISOString();
    const status = data.status ?? existing?.status ?? "draft";
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      workspace_id: data.workspaceId,
      category_id: data.categoryId ?? existing?.category_id ?? null,
      slug: data.slug || existing?.slug || slugify(data.title) || crypto.randomUUID().slice(0, 8),
      title: data.title,
      summary: data.summary ?? existing?.summary ?? null,
      content_md: data.contentMd,
      status,
      tags: data.tags ?? existing?.tags ?? [],
      keywords: data.keywords ?? existing?.keywords ?? [],
      is_faq: data.isFaq ?? existing?.is_faq ?? false,
      faq_question: data.faqQuestion ?? existing?.faq_question ?? null,
      is_training: data.isTraining ?? existing?.is_training ?? false,
      language: data.language ?? existing?.language ?? "en",
      source_type: data.sourceType ?? existing?.source_type ?? "manual",
      source_filename: data.sourceFilename ?? existing?.source_filename ?? null,
      source_path: data.sourcePath ?? existing?.source_path ?? null,
      version: nextVersion,
      needs_reindex: contentChanged ? true : (existing?.needs_reindex ?? true),
      published_at:
        status === "published"
          ? (existing?.published_at ?? nowIso)
          : (existing?.published_at ?? null),
      archived_at: status === "archived" ? nowIso : null,
      updated_at: nowIso,
      updated_by: context.userId,
      ...(existing ? {} : { created_by: context.userId }),
    };

    const { data: row, error } = await supabase
      .from("kb_articles" as never)
      .upsert(payload as never, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const article = row as unknown as KbArticle;

    // Save version snapshot when content changed
    if (contentChanged) {
      await supabase.from("kb_article_versions" as never).insert({
        article_id: article.id,
        workspace_id: article.workspace_id,
        version: article.version,
        title: article.title,
        summary: article.summary,
        content_md: article.content_md,
        editor_id: context.userId,
        note: data.versionNote ?? null,
      } as never);
    }

    return article;
  });

export const deleteKbArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("kb_articles" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listKbArticleVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ articleId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("kb_article_versions" as never)
      .select("*")
      .eq("article_id", data.articleId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Array<{
      id: string;
      version: number;
      title: string;
      summary: string | null;
      content_md: string;
      note: string | null;
      editor_id: string | null;
      created_at: string;
    }>;
  });

// ==================== Indexing (embeddings) ====================

export const reindexKbArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ articleId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ chunks: number }> => {
    const supabase = sbAny(context.supabase);
    const { data: aRow, error: aErr } = await supabase
      .from("kb_articles" as never)
      .select("id, workspace_id, title, summary, content_md")
      .eq("id", data.articleId)
      .single();
    if (aErr) throw new Error(aErr.message);
    const article = aRow as unknown as {
      id: string;
      workspace_id: string;
      title: string;
      summary: string | null;
      content_md: string;
    };

    // Prepend title+summary so retrieval matches even from the header.
    const header = [article.title, article.summary].filter(Boolean).join("\n\n");
    const body = article.content_md || "";
    const chunks = chunkText(header ? `${header}\n\n${body}` : body);

    const { getVectorStore } = await import("./vector-stores/factory");
    const store = getVectorStore(supabase);

    // Remove old chunks via the abstraction (so a swapped backend cleans itself).
    await store.deleteArticleChunks(article.id);

    if (!chunks.length) {
      await sbAny(supabase)
        .from("kb_articles" as never)
        .update({
          last_indexed_at: new Date().toISOString(),
          needs_reindex: false,
        } as never)
        .eq("id", article.id);
      return { chunks: 0 };
    }

    const { embedTexts, EMBED_MODEL } = await import("./embed.server");
    const vectors = await embedTexts(chunks.map((c) => c.content));

    await store.replaceArticleChunks(
      article.id,
      chunks.map((c, i) => ({
        articleId: article.id,
        workspaceId: article.workspace_id,
        chunkIndex: c.index,
        content: c.content,
        tokens: c.tokens,
        embedding: vectors[i],
        embeddingModel: EMBED_MODEL,
      })),
    );

    await sbAny(supabase)
      .from("kb_articles" as never)
      .update({
        last_indexed_at: new Date().toISOString(),
        needs_reindex: false,
      } as never)
      .eq("id", article.id);

    return { chunks: chunks.length };
  });

export const reindexKbWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        force: z.boolean().optional().default(false),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("kb_articles" as never)
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .in("status", ["published", "draft"])
      .limit(data.limit);
    if (!data.force) q = q.eq("needs_reindex", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
    let total = 0;
    for (const id of ids) {
      try {
        const r = await reindexKbArticle({ data: { articleId: id } });
        total += r.chunks;
      } catch {
        /* continue on individual failures */
      }
    }
    return { articles: ids.length, chunks: total };
  });

// ==================== Semantic search / RAG ====================

export const searchKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().min(1).max(2000),
        matchCount: z.number().int().min(1).max(20).default(6),
        minSimilarity: z.number().min(0).max(1).default(0.2),
        onlyPublished: z.boolean().default(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbSearchHit[]> => {
    const { embedOne } = await import("./embed.server");
    const { getVectorStore } = await import("./vector-stores/factory");
    const vec = await embedOne(data.query);
    const store = getVectorStore(sbAny(context.supabase));
    return (await store.search({
      workspaceId: data.workspaceId,
      queryEmbedding: vec,
      matchCount: data.matchCount,
      minSimilarity: data.minSimilarity,
      onlyPublished: data.onlyPublished,
    })) as unknown as KbSearchHit[];
  });

/**
 * Retrieve top KB context blocks for grounding an AI reply.
 * Returns an empty array when nothing relevant is found.
 */
export async function retrieveKbContext(params: {
  supabaseRpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  workspaceId: string;
  query: string;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<KbSearchHit[]> {
  try {
    const { embedOne, toVectorLiteral } = await import("./embed.server");
    const vec = await embedOne(params.query);
    const { data, error } = await params.supabaseRpc("match_kb_chunks", {
      p_workspace_id: params.workspaceId,
      p_query_embedding: toVectorLiteral(vec),
      p_match_count: params.matchCount ?? 5,
      p_min_similarity: params.minSimilarity ?? 0.25,
      p_only_published: true,
    });
    if (error) return [];
    return (data ?? []) as KbSearchHit[];
  } catch {
    return [];
  }
}

// ==================== AI answer generation ====================

export const generateKbAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        question: z.string().min(1).max(2000),
        conversationId: z.string().uuid().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { runChat, resolveDefaultModel } = await import("../ai/complete.functions");

    const { embedOne, toVectorLiteral } = await import("./embed.server");
    const vec = await embedOne(data.question);
    const { data: rowsRaw, error } = await sbAny(context.supabase).rpc(
      "match_kb_chunks" as never,
      {
        p_workspace_id: data.workspaceId,
        p_query_embedding: toVectorLiteral(vec),
        p_match_count: 6,
        p_min_similarity: 0.2,
        p_only_published: true,
      } as never,
    );
    if (error) throw new Error(error.message);
    const hits = (rowsRaw ?? []) as unknown as KbSearchHit[];

    if (!hits.length) {
      return {
        answer: "I couldn't find anything in the knowledge base for that question yet.",
        sources: [] as KbSearchHit[],
        model: "",
      };
    }

    const contextBlock = hits
      .map((h, i) => `[${i + 1}] ${h.title}\n${h.content}`)
      .join("\n\n---\n\n");

    const res = await runChat({
      workspaceId: data.workspaceId,
      userId: context.userId,
      feature: "kb_answer",
      request: {
        model: await resolveDefaultModel(data.workspaceId),
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You are an assistant grounded strictly in the provided knowledge base excerpts. " +
              "Answer clearly and concisely in the user's language. " +
              "Cite sources inline using [n] where n is the excerpt number. " +
              "If the excerpts do not contain the answer, say so honestly.",
          },
          {
            role: "user",
            content: `Question: ${data.question}\n\nKnowledge base excerpts:\n\n${contextBlock}`,
          },
        ],
      },
    });

    // record analytics
    try {
      const rows = hits.slice(0, 3).map((h) => ({
        article_id: h.article_id,
        workspace_id: data.workspaceId,
        event_type: "answer_generated",
        user_id: context.userId,
        conversation_id: data.conversationId ?? null,
        metadata: { similarity: h.similarity } as Record<string, unknown>,
      }));
      if (rows.length) {
        await sbAny(context.supabase)
          .from("kb_article_events" as never)
          .insert(rows as never);
      }
    } catch {
      /* non-fatal */
    }

    return {
      answer: (res.content || "").trim(),
      sources: hits,
      model: res.model,
    };
  });

// ==================== Suggestions for a conversation ====================

export const suggestKbForConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        matchCount: z.number().int().min(1).max(10).default(5),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbSearchHit[]> => {
    // Pull last inbound message as the query.
    const { data: convRow } = await sbAny(context.supabase)
      .from("conversations")
      .select("workspace_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    const workspaceId = (convRow as { workspace_id?: string } | null)?.workspace_id;
    if (!workspaceId) return [];

    const { data: msgs } = await sbAny(context.supabase)
      .from("messages")
      .select("body, direction, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(8);
    const lines = ((msgs ?? []) as Array<{ body: string | null; direction: string }>)
      .filter((m) => (m.body ?? "").trim())
      .slice(0, 5)
      .reverse();
    if (!lines.length) return [];
    const query = lines
      .map((m) => m.body)
      .join(" \n ")
      .slice(0, 2000);

    const { embedOne, toVectorLiteral } = await import("./embed.server");
    const vec = await embedOne(query);
    const { data: rows, error } = await sbAny(context.supabase).rpc(
      "match_kb_chunks" as never,
      {
        p_workspace_id: workspaceId,
        p_query_embedding: toVectorLiteral(vec),
        p_match_count: data.matchCount,
        p_min_similarity: 0.25,
        p_only_published: true,
      } as never,
    );
    if (error) return [];
    return (rows ?? []) as unknown as KbSearchHit[];
  });

// ==================== Analytics ====================

export const trackKbEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        articleId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        eventType: z.enum(["view", "helpful", "unhelpful", "suggested", "search_hit"]),
        conversationId: z.string().uuid().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const supabase = sbAny(context.supabase);
    await sbAny(supabase)
      .from("kb_article_events" as never)
      .insert({
        article_id: data.articleId,
        workspace_id: data.workspaceId,
        event_type: data.eventType,
        user_id: context.userId,
        conversation_id: data.conversationId ?? null,
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
      } as never);

    // Increment counters
    const column =
      data.eventType === "view"
        ? "view_count"
        : data.eventType === "helpful"
          ? "helpful_count"
          : data.eventType === "unhelpful"
            ? "unhelpful_count"
            : data.eventType === "suggested"
              ? "ai_use_count"
              : null;
    if (column) {
      // Read → increment → write (RLS-safe)
      const { data: row } = await supabase
        .from("kb_articles" as never)
        .select(column)
        .eq("id", data.articleId)
        .maybeSingle();
      const current = (row as Record<string, number> | null)?.[column] ?? 0;
      await supabase
        .from("kb_articles" as never)
        .update({ [column]: current + 1 } as never)
        .eq("id", data.articleId);
    }
    return { ok: true };
  });

export const kbAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("kb_articles" as never)
      .select(
        "id, title, view_count, helpful_count, unhelpful_count, ai_use_count, status, updated_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("view_count", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as Array<{
      id: string;
      title: string;
      view_count: number;
      helpful_count: number;
      unhelpful_count: number;
      ai_use_count: number;
      status: KbStatus;
      updated_at: string;
    }>;
    const totals = list.reduce(
      (acc, r) => ({
        articles: acc.articles + 1,
        views: acc.views + (r.view_count || 0),
        helpful: acc.helpful + (r.helpful_count || 0),
        unhelpful: acc.unhelpful + (r.unhelpful_count || 0),
        aiUses: acc.aiUses + (r.ai_use_count || 0),
      }),
      { articles: 0, views: 0, helpful: 0, unhelpful: 0, aiUses: 0 },
    );
    return { totals, top: list.slice(0, 10) };
  });

// ==================== Import from uploaded storage file ====================

export const importKbFromStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        storagePath: z.string(),
        filename: z.string(),
        title: z.string().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        extractedText: z.string().min(1),
        sourceType: z.enum(["pdf", "docx", "markdown", "txt", "csv"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbArticle> => {
    const supabase = sbAny(context.supabase);
    const title = (data.title || data.filename.replace(/\.[a-z0-9]+$/i, "")).slice(0, 300);
    const nowIso = new Date().toISOString();
    const payload = {
      workspace_id: data.workspaceId,
      category_id: data.categoryId ?? null,
      slug: slugify(title) || crypto.randomUUID().slice(0, 8),
      title,
      summary: null,
      content_md: data.extractedText,
      status: "draft" as KbStatus,
      tags: [] as string[],
      keywords: [] as string[],
      is_faq: false,
      faq_question: null,
      is_training: true,
      language: "en",
      source_type: data.sourceType,
      source_filename: data.filename,
      source_path: data.storagePath,
      version: 1,
      needs_reindex: true,
      published_at: null,
      archived_at: null,
      created_by: context.userId,
      updated_by: context.userId,
      updated_at: nowIso,
    };
    const { data: row, error } = await supabase
      .from("kb_articles" as never)
      .insert(payload as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const article = row as unknown as KbArticle;

    await supabase.from("kb_article_versions" as never).insert({
      article_id: article.id,
      workspace_id: article.workspace_id,
      version: 1,
      title: article.title,
      summary: article.summary,
      content_md: article.content_md,
      editor_id: context.userId,
      note: `Imported from ${data.filename}`,
    } as never);

    return article;
  });

// export shared token estimator for the client's UI hints
export const kbEstimateTokens = estimateTokens;

// ==================== Collections ====================

export interface KbCollection {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export const listKbCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<KbCollection[]> => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("kb_collections" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as KbCollection[];
  });

export const upsertKbCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(200),
        slug: z.string().optional(),
        description: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        isPublic: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbCollection> => {
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      workspace_id: data.workspaceId,
      name: data.name,
      slug: data.slug || slugify(data.name),
      description: data.description ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
      is_public: data.isPublic ?? false,
      updated_at: new Date().toISOString(),
      created_by: context.userId,
    };
    const { data: row, error } = await sbAny(context.supabase)
      .from("kb_collections" as never)
      .upsert(payload as never, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as KbCollection;
  });

export const deleteKbCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("kb_collections" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setKbCollectionArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        collectionId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        articleIds: z.array(z.string().uuid()),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const supabase = sbAny(context.supabase);
    await supabase
      .from("kb_collection_articles" as never)
      .delete()
      .eq("collection_id", data.collectionId);
    if (data.articleIds.length) {
      const rows = data.articleIds.map((id, i) => ({
        collection_id: data.collectionId,
        article_id: id,
        workspace_id: data.workspaceId,
        sort_order: i,
      }));
      const { error } = await supabase
        .from("kb_collection_articles" as never)
        .insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { count: data.articleIds.length };
  });

export const listKbCollectionArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ collectionId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<string[]> => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("kb_collection_articles" as never)
      .select("article_id, sort_order")
      .eq("collection_id", data.collectionId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<{ article_id: string }>).map((r) => r.article_id);
  });

// ==================== URL ingest ====================

export const ingestKbFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        url: z.string().url(),
        categoryId: z.string().uuid().nullable().optional(),
        autoPublish: z.boolean().optional().default(false),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<KbArticle> => {
    const { extractFromUrl } = await import("./url-ingest.server");
    const extracted = await extractFromUrl(data.url);
    if (!extracted.text || extracted.text.length < 50) {
      throw new Error("The page did not yield enough readable text to ingest");
    }
    const title = (extracted.title || extracted.finalUrl).slice(0, 300);
    const nowIso = new Date().toISOString();
    const status: KbStatus = data.autoPublish ? "published" : "draft";

    const payload = {
      workspace_id: data.workspaceId,
      category_id: data.categoryId ?? null,
      slug: slugify(title) || crypto.randomUUID().slice(0, 8),
      title,
      summary: `Imported from ${extracted.finalUrl}`,
      content_md: extracted.text,
      status,
      tags: ["web"] as string[],
      keywords: [] as string[],
      is_faq: false,
      faq_question: null,
      is_training: true,
      language: "en",
      source_type: "url" as const,
      source_filename: null,
      source_path: extracted.finalUrl,
      version: 1,
      needs_reindex: true,
      published_at: status === "published" ? nowIso : null,
      archived_at: null,
      created_by: context.userId,
      updated_by: context.userId,
      updated_at: nowIso,
    };
    const { data: row, error } = await sbAny(context.supabase)
      .from("kb_articles" as never)
      .insert(payload as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const article = row as unknown as KbArticle;

    await sbAny(context.supabase)
      .from("kb_article_versions" as never)
      .insert({
        article_id: article.id,
        workspace_id: article.workspace_id,
        version: 1,
        title: article.title,
        summary: article.summary,
        content_md: article.content_md,
        editor_id: context.userId,
        note: `Ingested from ${extracted.finalUrl}`,
      } as never);

    return article;
  });

// ==================== Extended analytics (time series) ====================

export const kbAnalyticsTimeseries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(30),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await sbAny(context.supabase)
      .from("kb_article_events" as never)
      .select("event_type, created_at")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", since)
      .limit(5000);
    if (error) throw new Error(error.message);
    const events = (rows ?? []) as Array<{ event_type: string; created_at: string }>;
    const buckets = new Map<string, Record<string, number>>();
    for (const e of events) {
      const day = e.created_at.slice(0, 10);
      const bucket = buckets.get(day) ?? {};
      bucket[e.event_type] = (bucket[e.event_type] ?? 0) + 1;
      bucket.total = (bucket.total ?? 0) + 1;
      buckets.set(day, bucket);
    }
    const series = Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, counts]) => ({ day, ...counts }));
    return { series, totalEvents: events.length };
  });
