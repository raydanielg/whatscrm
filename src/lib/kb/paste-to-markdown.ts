/**
 * Converts rich-text clipboard HTML into Markdown for the knowledge-base
 * editor. Plain text is returned unchanged, since it already reads as Markdown.
 */
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

// Drop elements that carry no article text.
turndown.remove(["script", "style", "noscript"]);

// True when plain text contains real HTML tags, such as <h3>, </p> or <a href>.
// Plain text with a stray "<" (for example "a < b") is left alone.
export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(text);
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}
