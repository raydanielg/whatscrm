/** Follow the provider's pagination without leaking store credentials to a
 * different origin through a malicious or misconfigured Link header. */
export function nextStorePage(currentUrl: string, headers: Headers, count: number, platform: string): string | null {
  const current = new URL(currentUrl);
  const nextLink = headers.get("link")?.split(/,(?=\s*<)/).find((part) => /rel=["']?next\b/i.test(part));
  if (nextLink) {
    const href = nextLink.match(/<([^>]+)>/)?.[1];
    if (!href) throw new Error("Store returned an invalid pagination link");
    const next = new URL(href, current);
    if (next.origin !== current.origin || next.pathname !== current.pathname) {
      throw new Error("Store returned a pagination link outside its product API");
    }
    return next.href;
  }
  if (platform !== "woocommerce" && platform !== "wordpress") return null;
  const page = Number(current.searchParams.get("page") || 1);
  const size = Number(current.searchParams.get("per_page") || 100);
  const total = Number(headers.get("x-wp-totalpages"));
  if (headers.has("x-wp-totalpages") ? page >= total : count < size) return null;
  current.searchParams.set("page", String(page + 1));
  return current.href;
}

/** Hard ceiling on pages walked per sync run. Matches the guard the product
 * sync loop already uses: a malformed Link header or X-WP-TotalPages can
 * never turn into an infinite (or effectively unbounded) fetch loop. */
const MAX_PAGES = 500;

/**
 * Walk every page of a store listing endpoint (products, orders, ) using
 * `nextStorePage` for the stop/advance decision. Generic over the item type
 * so callers keep their own per-item parsing; this only owns "how many
 * requests do we make before we're done".
 *
 * Stops when a page comes back empty (regardless of what the total-pages
 * header claims), when `nextStorePage` says there's no next page, or when
 * the safety cap is hit.
 */
export async function paginateStore<T>(opts: {
  startUrl: string;
  platform: string;
  fetchPage: (url: string) => Promise<{ items: T[]; headers: Headers }>;
  maxPages?: number;
}): Promise<{ items: T[]; pages: number }> {
  const cap = opts.maxPages ?? MAX_PAGES;
  const items: T[] = [];
  const seen = new Set<string>();
  let pages = 0;
  let url: string | null = opts.startUrl;
  while (url) {
    if (seen.has(url) || seen.size >= cap) {
      throw new Error('Store pagination did not finish; try again later.');
    }
    seen.add(url);
    const page = await opts.fetchPage(url);
    pages += 1;
    items.push(...page.items);
    if (page.items.length === 0) break;
    url = nextStorePage(url, page.headers, page.items.length, opts.platform);
  }
  return { items, pages };
}

export function storeCurrency(platform: string, payload: unknown, fallback: string): string {
  const info = payload as { shop?: { currency?: unknown }; settings?: { currency?: unknown } } | null;
  const currency = platform === "shopify" ? info?.shop?.currency : info?.settings?.currency;
  return typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : fallback;
}
