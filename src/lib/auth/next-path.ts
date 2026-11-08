/**
 * Helpers for the post-sign-in `?next=` redirect target.
 *
 * These live outside the route file on purpose: TanStack's route code
 * splitting moves `beforeLoad` and the component into separate chunks, and a
 * plain module-scope helper referenced by both can fail to resolve at runtime
 * ("does not provide an export named ..."). A shared module is always safe.
 */

/** Only same-origin absolute paths are accepted; anything else falls back. */
export function safeNextFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export function safeNext(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeNextFromSearch(window.location.search);
}
