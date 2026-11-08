/**
 * Google Gemini access for every server-side AI call.
 *
 * Gemini exposes an OpenAI-compatible endpoint, so the existing chat and
 * embedding code only needs a different base URL, key and model id. The key
 * is read from GEMINI_API_KEY (a Worker secret) and is never logged.
 *
 * Server-only.
 */

export const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
export const GEMINI_CHAT_URL = `${GEMINI_OPENAI_BASE}/chat/completions`;
export const GEMINI_EMBED_URL = `${GEMINI_OPENAI_BASE}/embeddings`;

/** Default chat model. Fast, cheap, and available on every Gemini key. */
export const GEMINI_DEFAULT_CHAT_MODEL = "gemini-3.1-flash-lite";

/**
 * Embedding model. `output_dimensions` below keeps the 1536-dim pgvector
 * column working without a migration.
 */
export const GEMINI_EMBED_MODEL = "gemini-embedding-001";
export const GEMINI_EMBED_DIMS = 1536;

export function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

/** Throws a clear error when the secret is not configured. */
export function requireGeminiApiKey(): string {
  const key = geminiApiKey();
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

/**
 * Maps a model id to one Gemini accepts.
 * - "google/gemini-2.5-flash" (gateway style) becomes "gemini-2.5-flash".
 * - Any "gemini-*" id passes through unchanged.
 * - Non-Gemini ids (openai/*, anthropic/*, auto, free, ...) fall back to the
 *   default chat model, because those providers are no longer reachable.
 */
export function geminiChatModel(model: string | null | undefined): string {
  const m = (model ?? "").trim();
  if (m.startsWith("google/")) return m.slice("google/".length);
  if (m.startsWith("gemini-")) return m;
  return GEMINI_DEFAULT_CHAT_MODEL;
}
