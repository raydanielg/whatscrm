/**
 * Vector store abstraction for the Knowledge Base.
 *
 * The core RAG pipeline (chunking, embedding, retrieval) speaks to this
 * interface, not directly to a specific database. Today the only concrete
 * implementation is `PgVectorStore` (Supabase + pgvector). Future backends —
 * Pinecone, Weaviate, Qdrant, Turbopuffer, etc. — plug in by implementing
 * this interface and registering themselves in `factory.ts`. The rest of the
 * app never has to change.
 */

export interface VectorChunk {
  articleId: string;
  workspaceId: string;
  chunkIndex: number;
  content: string;
  tokens: number;
  embedding: number[];
  embeddingModel: string;
}

export interface VectorSearchHit {
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

export interface VectorSearchParams {
  workspaceId: string;
  queryEmbedding: number[];
  matchCount: number;
  minSimilarity: number;
  onlyPublished: boolean;
}

/**
 * Any vector backend must satisfy this contract. Implementations are
 * responsible for their own persistence, indexing, and error surfacing.
 */
export interface KbVectorStore {
  /** Human-readable identifier, useful in logs and analytics. */
  readonly name: string;

  /** Replace all stored chunks for a given article. */
  replaceArticleChunks(articleId: string, chunks: VectorChunk[]): Promise<void>;

  /** Delete every stored chunk for an article (e.g. article deleted). */
  deleteArticleChunks(articleId: string): Promise<void>;

  /** Semantic search bounded to a workspace. */
  search(params: VectorSearchParams): Promise<VectorSearchHit[]>;
}
