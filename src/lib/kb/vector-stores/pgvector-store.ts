/**
 * pgvector-backed implementation of KbVectorStore. Uses the workspace-scoped
 * Supabase client (RLS applies) plus the `match_kb_chunks` RPC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { toVectorLiteral } from "../embed.server";
import type {
  KbVectorStore, VectorChunk, VectorSearchHit, VectorSearchParams,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export class PgVectorStore implements KbVectorStore {
  readonly name = "pgvector";

  constructor(private readonly supabase: AnyClient) {}

  async replaceArticleChunks(articleId: string, chunks: VectorChunk[]): Promise<void> {
    await this.deleteArticleChunks(articleId);
    if (!chunks.length) return;
    const rows = chunks.map((c) => ({
      article_id: c.articleId,
      workspace_id: c.workspaceId,
      chunk_index: c.chunkIndex,
      content: c.content,
      tokens: c.tokens,
      embedding: toVectorLiteral(c.embedding) as unknown as number[],
      embedding_model: c.embeddingModel,
    }));
    const { error } = await this.supabase.from("kb_chunks" as never).insert(rows as never);
    if (error) throw new Error(`pgvector insert failed: ${error.message}`);
  }

  async deleteArticleChunks(articleId: string): Promise<void> {
    const { error } = await this.supabase
      .from("kb_chunks" as never)
      .delete()
      .eq("article_id", articleId);
    if (error) throw new Error(`pgvector delete failed: ${error.message}`);
  }

  async search(params: VectorSearchParams): Promise<VectorSearchHit[]> {
    const { data, error } = await this.supabase.rpc("match_kb_chunks" as never, {
      p_workspace_id: params.workspaceId,
      p_query_embedding: toVectorLiteral(params.queryEmbedding),
      p_match_count: params.matchCount,
      p_min_similarity: params.minSimilarity,
      p_only_published: params.onlyPublished,
    } as never);
    if (error) throw new Error(`pgvector search failed: ${error.message}`);
    return (data ?? []) as unknown as VectorSearchHit[];
  }
}
