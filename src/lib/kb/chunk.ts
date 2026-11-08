/**
 * Text chunking utilities for the AI Knowledge Base.
 * Splits markdown/plain text into semantically meaningful chunks for embedding.
 */

export interface Chunk {
  index: number;
  content: string;
  tokens: number;
}

// Rough token estimate — 1 token ≈ 4 chars for English/mixed content.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const DEFAULT_TARGET = 500; // target ~500 tokens per chunk (≈2000 chars)
const DEFAULT_MAX = 800;    // hard cap ≈ 3200 chars
const DEFAULT_OVERLAP = 60; // ~60 tokens of overlap (≈240 chars)

/**
 * Chunk markdown/plain text on paragraph boundaries first, falling back
 * to sentence boundaries for very long paragraphs. Adds a small overlap
 * so retrieval doesn't miss information straddling a boundary.
 */
export function chunkText(
  text: string,
  opts: { target?: number; max?: number; overlap?: number } = {},
): Chunk[] {
  const target = opts.target ?? DEFAULT_TARGET;
  const max = opts.max ?? DEFAULT_MAX;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  // Split into paragraphs (double newline). Preserve headings on their own line
  // by treating markdown headers as paragraph boundaries too.
  const paragraphs = clean
    .split(/\n{2,}/g)
    .flatMap((p) => p.split(/\n(?=#{1,6}\s)/g))
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let buf = "";
  let bufTokens = 0;

  const flush = () => {
    const content = buf.trim();
    if (!content) return;
    chunks.push({ index: chunks.length, content, tokens: bufTokens });
    // seed next buffer with overlap tail
    if (overlap > 0) {
      const tail = content.slice(-overlap * 4);
      buf = tail + "\n";
      bufTokens = estimateTokens(buf);
    } else {
      buf = "";
      bufTokens = 0;
    }
  };

  for (const p of paragraphs) {
    const pTokens = estimateTokens(p);

    // Oversized paragraph — hard-split by sentences.
    if (pTokens > max) {
      // flush whatever we have first
      if (bufTokens > 0) flush();
      const sentences = p.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g);
      let sBuf = "";
      let sTok = 0;
      for (const s of sentences) {
        const t = estimateTokens(s);
        if (sTok + t > max && sBuf) {
          chunks.push({ index: chunks.length, content: sBuf.trim(), tokens: sTok });
          sBuf = overlap > 0 ? sBuf.slice(-overlap * 4) + " " : "";
          sTok = estimateTokens(sBuf);
        }
        sBuf += (sBuf ? " " : "") + s;
        sTok += t;
      }
      if (sBuf.trim()) {
        chunks.push({ index: chunks.length, content: sBuf.trim(), tokens: sTok });
      }
      continue;
    }

    if (bufTokens + pTokens > target && bufTokens > 0) {
      flush();
    }
    buf += (buf ? "\n\n" : "") + p;
    bufTokens += pTokens;

    if (bufTokens >= target) flush();
  }
  if (buf.trim()) flush();

  return chunks;
}

export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
