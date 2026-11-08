/**
 * WhatsApp-style rich text parsing for the mobile app.
 *
 * Self-contained mirror of the web app's `src/lib/inbox/rich-text.ts` — pure TS,
 * no React / React Native imports so it can be unit tested in isolation.
 *
 * Supported syntax:
 *   *bold*  _italic_  ~strikethrough~  `monospace`  ```fenced code```
 *   "> quote" at line start, "- " / "* " bullets, "1. " numbered lists
 *   bare http(s):// and www. URLs are auto-linked
 */

export type RichMarker = "*" | "_" | "~" | "`" | "```";

export type RichInline =
  | { type: "text"; value: string }
  | { type: "bold"; children: RichInline[] }
  | { type: "italic"; children: RichInline[] }
  | { type: "strike"; children: RichInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; value: string };

export type RichNode =
  | { type: "paragraph"; children: RichInline[] }
  | { type: "quote"; children: RichInline[] }
  | { type: "bullet"; children: RichInline[] }
  | { type: "ordered"; marker: string; children: RichInline[] }
  | { type: "codeblock"; value: string };

export interface ToggleWrapResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const INLINE_MARKERS: Record<string, "bold" | "italic" | "strike" | "code"> = {
  "*": "bold",
  _: "italic",
  "~": "strike",
  "`": "code",
};

/** ASCII punctuation — `\p{P}` unicode escapes are not safe on all Hermes builds. */
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const URL_RE = /(https?:\/\/[^\s<>()[\]]+|www\.[^\s<>()[\]]+)/gi;
const TRAILING_PUNCT_RE = /[.,!?;:'"]+$/;

function isWhitespace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

/** Start-of-string / end-of-string, whitespace or punctuation all count as a boundary. */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || isWhitespace(ch) || PUNCTUATION.includes(ch);
}

/**
 * Index of the closing marker for the opening marker at `open`, or -1 when the
 * run is not a valid formatting span.
 */
function findClosing(text: string, open: number, marker: string): number {
  if (!isBoundary(text[open - 1])) return -1;
  const first = text[open + 1];
  if (first === undefined || isWhitespace(first) || first === marker) return -1;
  for (let j = open + 2; j < text.length; j++) {
    if (text[j] !== marker) continue;
    if (isWhitespace(text[j - 1])) continue;
    if (!isBoundary(text[j + 1])) continue;
    return j;
  }
  return -1;
}

function linkify(text: string): RichInline[] {
  const out: RichInline[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text))) {
    let raw = m[0];
    const trailing = raw.match(TRAILING_PUNCT_RE);
    if (trailing) raw = raw.slice(0, raw.length - trailing[0].length);
    if (!raw) continue;
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "link", href: /^www\./i.test(raw) ? `https://${raw}` : raw, value: raw });
    last = m.index + raw.length;
    URL_RE.lastIndex = last;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function parseInline(text: string): RichInline[] {
  const out: RichInline[] = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    out.push(...linkify(buf));
    buf = "";
  };

  for (let i = 0; i < text.length;) {
    const ch = text[i];
    const kind = INLINE_MARKERS[ch];
    if (kind) {
      const close = findClosing(text, i, ch);
      if (close > i + 1) {
        const inner = text.slice(i + 1, close);
        flush();
        if (kind === "code") out.push({ type: "code", value: inner });
        else out.push({ type: kind, children: parseInline(inner) });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }

  flush();
  return out;
}

/** Reads a ``` fenced block starting at `start`, or null when it is never closed. */
function readFence(lines: string[], start: number): { value: string; next: number } | null {
  const trimmed = lines[start].trim();
  const after = trimmed.slice(3);
  if (after.endsWith("```") && after.length > 3) {
    return { value: after.slice(0, after.length - 3), next: start + 1 };
  }

  const body: string[] = [];
  if (after) body.push(after);
  for (let i = start + 1; i < lines.length; i++) {
    const idx = lines[i].indexOf("```");
    if (idx < 0) {
      body.push(lines[i]);
      continue;
    }
    if (idx > 0) body.push(lines[i].slice(0, idx));
    return { value: body.join("\n"), next: i + 1 };
  }
  return null;
}

/** Parses WhatsApp-flavoured text into a flat list of block nodes. */
export function parseRichText(text: string | null | undefined): RichNode[] {
  if (!text) return [];
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks: RichNode[] = [];

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const fence = readFence(lines, i);
      if (fence) {
        blocks.push({ type: "codeblock", value: fence.value });
        i = fence.next;
        continue;
      }
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      const parts = [quote[1]];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j].match(/^\s*>\s?(.*)$/);
        if (!next) break;
        parts.push(next[1]);
      }
      blocks.push({ type: "quote", children: parseInline(parts.join("\n")) });
      i = j;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bullet", children: parseInline(bullet[1]) });
      i++;
      continue;
    }

    const ordered = line.match(/^\s*(\d{1,3})[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({ type: "ordered", marker: `${ordered[1]}.`, children: parseInline(ordered[2]) });
      i++;
      continue;
    }

    blocks.push({ type: "paragraph", children: parseInline(line) });
    i++;
  }

  return blocks;
}

function inlineToPlain(nodes: RichInline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.value;
        case "code":
          return n.value;
        case "link":
          return n.value;
        default:
          return inlineToPlain(n.children);
      }
    })
    .join("");
}

/** Removes every formatting marker, keeping the readable text (used for previews). */
export function stripFormatting(text: string | null | undefined): string {
  if (!text) return "";
  return parseRichText(text)
    .map((b) => {
      switch (b.type) {
        case "codeblock":
          return b.value;
        case "ordered":
          return `${b.marker} ${inlineToPlain(b.children)}`;
        case "bullet":
          return `• ${inlineToPlain(b.children)}`;
        default:
          return inlineToPlain(b.children);
      }
    })
    .join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Wraps (or unwraps, when already wrapped) the selected range in `marker` and
 * reports where the selection should sit afterwards.
 */
export function toggleWrap(
  text: string,
  selStart: number,
  selEnd: number,
  marker: RichMarker,
): ToggleWrapResult {
  const src = text ?? "";
  const len = marker.length;
  let start = clamp(Math.min(selStart, selEnd), 0, src.length);
  let end = clamp(Math.max(selStart, selEnd), 0, src.length);

  // Empty selection: drop a marker pair and park the caret between them.
  if (start === end) {
    return {
      text: `${src.slice(0, start)}${marker}${marker}${src.slice(start)}`,
      selectionStart: start + len,
      selectionEnd: start + len,
    };
  }

  // Keep leading/trailing whitespace outside the markers so the span stays valid.
  while (start < end && isWhitespace(src[start])) start++;
  while (end > start && isWhitespace(src[end - 1])) end--;
  if (start === end) {
    return { text: src, selectionStart: selStart, selectionEnd: selEnd };
  }

  const selected = src.slice(start, end);

  // Already wrapped inside the selection → strip the markers.
  if (selected.length > len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, selected.length - len);
    return {
      text: `${src.slice(0, start)}${inner}${src.slice(end)}`,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Markers sit just outside the selection → strip those instead.
  if (src.slice(start - len, start) === marker && src.slice(end, end + len) === marker) {
    return {
      text: `${src.slice(0, start - len)}${selected}${src.slice(end + len)}`,
      selectionStart: start - len,
      selectionEnd: start - len + selected.length,
    };
  }

  return {
    text: `${src.slice(0, start)}${marker}${selected}${marker}${src.slice(end)}`,
    selectionStart: start + len,
    selectionEnd: start + len + selected.length,
  };
}
