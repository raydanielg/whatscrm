/**
 * Canonical documentation links.
 *
 * The static docs site (docs/*.html) is published alongside the app on the
 * public site, not bundled into the SPA — so in-app links must use the
 * absolute docs base URL, otherwise /docs/*.html 404s.
 *
 * Every docs link in the app MUST be built with `docsUrl()` (or the
 * `DOCS_LINKS` shortcuts derived from it) so there is exactly one place that
 * knows the docs host, filenames, and hash format.
 */
export const DOCS_BASE_URL = "https://wrapcoders.bid/docs";

/** Pages that exist in the static docs site. */
export type DocsPage = "index" | "changelog" | "status" | "support";

/**
 * Single builder for every documentation URL in the app.
 *
 * @param page  Static docs page (defaults to the documentation home).
 * @param hash  Optional topic anchor within that page (with or without "#").
 */
export function docsUrl(page: DocsPage = "index", hash?: string): string {
  const base = `${DOCS_BASE_URL}/${page}.html`;
  const anchor = hash?.replace(/^#/, "").trim();
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}

/** Shortcuts for the top-level docs pages. */
export const DOCS_LINKS = {
  index: docsUrl("index"),
  changelog: docsUrl("changelog"),
  status: docsUrl("status"),
  support: docsUrl("support"),
} as const;

/** Downloadable release notes for the current version. */
export const CHANGELOG_PDF_URL = "/api/public/changelog.pdf";
