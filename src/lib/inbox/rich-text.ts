/**
 * WhatsApp-style rich text for the inbox.
 *
 * Messages are stored and sent as plain text with WhatsApp's markers
 * (`*bold*`, `_italic_`, `~strike~`, `` `mono` ``, ``` blocks, `>` quotes and
 * list prefixes). That keeps the wire format identical for every channel —
 * we only change how the text is *shown* in bubbles and how the composer
 * helps you type the markers.
 *
 * Everything here is pure so it can be unit-tested and reused by the composer
 * (toggling markers around a selection) and the bubble (rendering).
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "mono"; value: string }
  | { type: "link"; href: string; value: string };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "bullet"; children: InlineNode[] }
  | { type: "ordered"; marker: string; children: InlineNode[] }
  | { type: "code"; value: string };

/** The inline markers the composer can toggle around a selection. */
export type FormatMarker = "*" | "_" | "~" | "`";

const MARKERS: Record<FormatMarker, "bold" | "italic" | "strike" | "mono"> = {
  "*": "bold",
  _: "italic",
  "~": "strike",
  "`": "mono",
};

/**
 * WhatsApp only treats a marker as formatting when it hugs its content and
 * sits on a word boundary — `2*3*4` stays literal, `a *b* c` turns bold.
 */
const BOUNDARY_BEFORE = /[\s([{<"'“‘>*_~`]/;
const BOUNDARY_AFTER = /[\s)\]}>.,;:!?"'”’*_~`]/;

function isBoundaryBefore(text: string, index: number): boolean {
  if (index <= 0) return true;
  return BOUNDARY_BEFORE.test(text[index - 1]!);
}

function isBoundaryAfter(text: string, index: number): boolean {
  if (index >= text.length) return true;
  return BOUNDARY_AFTER.test(text[index]!);
}

const URL_RE =
  /(https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]|(?:^|(?<=\s))www\.[^\s<>()[\]]+[^\s<>()[\].,;:!?'"])/gi;

/** Splits a plain run of text into text + autolinked URL nodes. */
function linkify(value: string): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(value)) !== null) {
    if (match.index > last) out.push({ type: "text", value: value.slice(last, match.index) });
    const raw = match[0];
    out.push({ type: "link", href: raw.startsWith("www.") ? `https://${raw}` : raw, value: raw });
    last = match.index + raw.length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

/** Appends a plain run, merging it into a trailing text node when possible. */
function pushText(nodes: InlineNode[], value: string) {
  if (!value) return;
  const last = nodes[nodes.length - 1];
  if (last && last.type === "text") last.value += value;
  else nodes.push({ type: "text", value });
}

/**
 * Finds the closing marker that matches the opener at `start`, honouring the
 * boundary rules. Returns -1 when the opener is just a literal character.
 */
function findClosing(text: string, marker: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] !== marker) continue;
    // Empty content (`**`) is not formatting.
    if (i === start + 1) return -1;
    if (isBoundaryAfter(text, i + 1)) return i;
  }
  return -1;
}

/** Parses one line (no newlines) into inline nodes. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (!buffer) return;
    for (const node of linkify(buffer)) nodes.push(node);
    buffer = "";
  };

  while (i < text.length) {
    const ch = text[i]!;
    const kind = MARKERS[ch as FormatMarker];
    if (kind && isBoundaryBefore(text, i)) {
      const close = findClosing(text, ch, i);
      if (close > i) {
        const inner = text.slice(i + 1, close);
        flush();
        if (kind === "mono") nodes.push({ type: "mono", value: inner });
        else nodes.push({ type: kind, children: parseInline(inner) });
        i = close + 1;
        continue;
      }
    }
    buffer += ch;
    i++;
  }
  flush();
  if (nodes.length === 0) pushText(nodes, "");
  return nodes;
}

const BULLET_RE = /^\s{0,3}[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;

/**
 * Parses a whole message body into block nodes. Fenced ``` blocks are taken
 * verbatim; every other line becomes a paragraph, quote or list item.
 */
export function parseRichText(text: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trimStart().startsWith("```")) {
      const first = line.trimStart().slice(3);
      const body: string[] = [];
      // A single-line ```code``` fence closes on the same line.
      const inlineClose = first.indexOf("```");
      if (inlineClose >= 0) {
        blocks.push({ type: "code", value: first.slice(0, inlineClose) });
        i++;
        continue;
      }
      if (first) body.push(first);
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
        body.push(lines[i]!);
        i++;
      }
      i++; // consume the closing fence
      blocks.push({ type: "code", value: body.join("\n") });
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      blocks.push({ type: "quote", children: parseInline(quote[1] ?? "") });
      i++;
      continue;
    }

    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      blocks.push({
        type: "ordered",
        marker: `${ordered[1]}.`,
        children: parseInline(ordered[2] ?? ""),
      });
      i++;
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    // `*bold*` on its own line must not be mistaken for a bullet.
    if (bullet && !(line.trimStart().startsWith("*") && /\*\s*$/.test(line.trimEnd()))) {
      blocks.push({ type: "bullet", children: parseInline(bullet[1] ?? "") });
      i++;
      continue;
    }

    blocks.push({ type: "paragraph", children: parseInline(line) });
    i++;
  }

  return blocks;
}

/** True when the body contains anything worth parsing beyond plain text. */
export function hasFormatting(text: string): boolean {
  URL_RE.lastIndex = 0;
  return /[*_~`]|^\s{0,3}(>|[-*•]\s|\d{1,3}[.)]\s)/m.test(text) || URL_RE.test(text);
}

/** First safe HTTP(S) link in a draft or message, without fetching the page. */
export function extractFirstUrl(text: string): string | null {
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const candidate = match[0].startsWith("www.") ? `https://${match[0]}` : match[0];
    try {
      const url = new URL(candidate);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".")) {
        return url.href;
      }
    } catch { /* Keep searching for another valid URL. */ }
  }
  return null;
}

/**
 * Strips the markers so list previews and search snippets read as plain text.
 */
export function stripFormatting(text: string): string {
  const renderInline = (nodes: InlineNode[]): string =>
    nodes
      .map((n) => {
        switch (n.type) {
          case "text":
            return n.value;
          case "link":
            return n.value;
          case "mono":
            return n.value;
          default:
            return renderInline(n.children);
        }
      })
      .join("");

  return parseRichText(text)
    .map((block) => {
      switch (block.type) {
        case "code":
          return block.value;
        case "bullet":
          return `• ${renderInline(block.children)}`;
        case "ordered":
          return `${block.marker} ${renderInline(block.children)}`;
        default:
          return renderInline(block.children);
      }
    })
    .join("\n");
}

/**
 * Wraps (or unwraps) the current selection in `marker`, the way a bold button
 * in any editor behaves. With an empty selection it drops in an empty pair and
 * parks the caret between them so you can just keep typing.
 */
export function toggleWrap(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: FormatMarker,
): { text: string; selectionStart: number; selectionEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));

  // Trim whitespace that got caught by a double-click selection — markers have
  // to hug their content or WhatsApp renders them literally.
  let from = start;
  let to = end;
  while (from < to && /\s/.test(text[from]!)) from++;
  while (to > from && /\s/.test(text[to - 1]!)) to--;

  const selected = text.slice(from, to);

  // Already wrapped → unwrap, both when the markers are inside the selection
  // and when the selection sits between them.
  if (selected.length >= 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(1, -1);
    const next = `${text.slice(0, from)}${inner}${text.slice(to)}`;
    return { text: next, selectionStart: from, selectionEnd: from + inner.length };
  }
  if (text[from - 1] === marker && text[to] === marker) {
    const next = `${text.slice(0, from - 1)}${selected}${text.slice(to + 1)}`;
    return { text: next, selectionStart: from - 1, selectionEnd: from - 1 + selected.length };
  }

  if (!selected) {
    const next = `${text.slice(0, start)}${marker}${marker}${text.slice(end)}`;
    return { text: next, selectionStart: start + 1, selectionEnd: start + 1 };
  }

  const next = `${text.slice(0, from)}${marker}${selected}${marker}${text.slice(to)}`;
  return { text: next, selectionStart: from + 1, selectionEnd: from + 1 + selected.length };
}

/**
 * Prefixes every selected line with `prefix` (quotes and lists), or strips it
 * again when all of them already carry it.
 */
export function togglePrefix(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
): { text: string; selectionStart: number; selectionEnd: number } {
  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIdx = text.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allPrefixed = lines.every((l) => l.startsWith(prefix));
  const next = lines
    .map((l) => (allPrefixed ? l.slice(prefix.length) : `${prefix}${l}`))
    .join("\n");

  const updated = `${text.slice(0, lineStart)}${next}${text.slice(lineEnd)}`;
  return { text: updated, selectionStart: lineStart, selectionEnd: lineStart + next.length };
}

/** Wraps the selection in a fenced code block on its own lines. */
export function wrapCodeBlock(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = text.slice(selectionStart, selectionEnd);
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const lead = before && !before.endsWith("\n") ? "\n" : "";
  const tail = after && !after.startsWith("\n") ? "\n" : "";
  const inserted = `${lead}\`\`\`\n${selected}\n\`\`\`${tail}`;
  const caret = before.length + lead.length + 4;
  return {
    text: `${before}${inserted}${after}`,
    selectionStart: caret,
    selectionEnd: caret + selected.length,
  };
}
