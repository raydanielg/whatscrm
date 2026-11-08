/**
 * Selects the active vector store. Reads `KB_VECTOR_STORE` at call time.
 * Add new backends here — the rest of the codebase depends only on
 * `KbVectorStore`, so a new provider is a one-file change plus this switch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PgVectorStore } from "./pgvector-store";
import type { KbVectorStore } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export function getVectorStore(supabase: AnyClient): KbVectorStore {
  const provider = (process.env.KB_VECTOR_STORE || "pgvector").toLowerCase();
  switch (provider) {
    case "pgvector":
    default:
      return new PgVectorStore(supabase);
    // case "pinecone": return new PineconeVectorStore(...);
    // case "qdrant":   return new QdrantVectorStore(...);
    // case "weaviate": return new WeaviateVectorStore(...);
  }
}

export type { KbVectorStore } from "./types";
