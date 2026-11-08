/**
 * Server-only helper that fetches a public web page and converts the main
 * body to plain-text markdown for the KB pipeline. Strips scripts, styles,
 * and boilerplate; keeps headings and paragraphs.
 */

const MAX_BYTES = 4_000_000; // 4 MB cap on fetched HTML

export interface UrlExtractResult {
  title: string;
  text: string;
  finalUrl: string;
}

function stripTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(re, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export async function extractFromUrl(url: string): Promise<UrlExtractResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Only http(s) URLs are supported");
  }

  const res = await fetch(parsed.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "WACRMKBBot/1.0 (+https://wacrm.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

  const ct = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(ct)) {
    throw new Error(`Unsupported content-type: ${ct || "unknown"}`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Page too large (over 4 MB)");
  }
  let html = new TextDecoder("utf-8").decode(buf);

  // Grab <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities((titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim())
    || parsed.hostname;

  // Prefer <main> or <article> if present, otherwise fall back to <body>.
  const scope =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html;
  html = scope;

  // Strip noisy elements before flattening tags.
  for (const t of ["script", "style", "noscript", "svg", "iframe", "form", "nav", "header", "footer", "aside"]) {
    html = stripTag(html, t);
  }

  // Preserve heading/paragraph breaks with newlines before flattening.
  html = html
    .replace(/<\/(p|div|section|li|tr|h[1-6]|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<h([1-6])\b[^>]*>/gi, (_, n) => "\n" + "#".repeat(Number(n)) + " ");

  // Drop remaining tags.
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

  return { title, text, finalUrl: res.url || parsed.toString() };
}
