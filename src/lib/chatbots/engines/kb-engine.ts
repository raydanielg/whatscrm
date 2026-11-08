/**
 * KbEngine — Retrieval-Augmented Generation layer.
 *
 * Wraps the platform's existing `retrieveKbContext` helper so the chatbot
 * pipeline can call a stable interface. Also formats retrieved chunks into
 * an LLM-ready block with numbered citations.
 */
import type { KbCitation } from "./types";

export interface KbHit {
  article_id: string;
  title?: string;
  content?: string;
  similarity?: number;
}

export interface KbRetrieveOpts {
  workspaceId: string;
  query: string;
  matchCount?: number;
  minSimilarity?: number;
  supabaseRpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export const KbEngine = {
  async retrieve(opts: KbRetrieveOpts): Promise<KbCitation[]> {
    try {
      const { retrieveKbContext } = await import("@/lib/kb/kb.functions");
      const hits = (await retrieveKbContext({
        supabaseRpc: opts.supabaseRpc,
        workspaceId: opts.workspaceId,
        query: opts.query,
        matchCount: opts.matchCount ?? 5,
        minSimilarity: opts.minSimilarity ?? 0.25,
      })) as unknown as KbHit[];
      return hits.map((h) => ({
        article_id: h.article_id,
        title: h.title ?? "Article",
        similarity: h.similarity ?? 0,
        content: h.content ?? "",
      }));
    } catch {
      return [];
    }
  },

  /** Build the LLM-ready context block with numbered citations. */
  format(citations: KbCitation[]): string {
    if (citations.length === 0) return "";
    return citations
      .slice(0, 5)
      .map((c, i) => `[${i + 1}] ${c.title}\n${(c.content ?? "").slice(0, 900)}`)
      .join("\n\n");
  },
};
