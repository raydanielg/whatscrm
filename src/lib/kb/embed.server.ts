/**
 * Server-only helper that calls Gemini's OpenAI-compatible embeddings endpoint.
 * gemini-embedding-001 is asked for 1536 dims so it indexes directly into the
 * existing pgvector HNSW column.
 */

import { GEMINI_EMBED_URL, GEMINI_EMBED_MODEL, GEMINI_EMBED_DIMS, requireGeminiApiKey } from "@/lib/ai/gemini.server";

export const EMBED_MODEL = GEMINI_EMBED_MODEL;
export const EMBED_DIMS = GEMINI_EMBED_DIMS;

// OpenAI text-embedding-3-* supports up to 2048 inputs and 300k tokens per request.
const BATCH_SIZE = 96;

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const key = requireGeminiApiKey();

  const out: number[][] = new Array(inputs.length);
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const res = await fetch(GEMINI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: batch,
        dimensions: EMBED_DIMS,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding request failed (${res.status}): ${body || res.statusText}`);
    }
    const json: {
      data?: Array<{ index?: number; embedding?: number[] }>;
    } = await res.json();
    if (!Array.isArray(json.data)) {
      throw new Error("Embedding response had no data array");
    }
    // Some OpenAI-compatible providers omit `index`; fall back to array order.
    json.data.forEach((row, pos) => {
      const slot = typeof row.index === "number" ? row.index : pos;
      if (Array.isArray(row.embedding)) out[i + slot] = row.embedding;
    });
    for (let k = i; k < i + batch.length; k++) {
      if (!Array.isArray(out[k])) {
        throw new Error(`Embedding missing for chunk ${k} (batch returned ${json.data.length} rows)`);
      }
    }
  }
  return out;
}

export async function embedOne(input: string): Promise<number[]> {
  const [v] = await embedTexts([input]);
  return v;
}

// Format a JS number[] as a pgvector literal: "[0.1,0.2,...]"
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}
