/**
 * Multi-tenant TanStack Query cache scoping.
 *
 * Every query key is transparently namespaced by the active organization id
 * via a custom `queryKeyHashFn`. Two orgs asking for the same logical key
 * (e.g. `["messages", conversationId]`) resolve to different cache entries,
 * so an org switch can never surface stale cross-tenant data — even if a
 * cache purge is delayed or partial.
 *
 * A small allow-list of prefixes is treated as global (unscoped) — data
 * that is intentionally shared across orgs (e.g. the list of orgs the user
 * belongs to, invitation tokens, workspace-level lookups).
 */
import { hashKey, type QueryKey } from "@tanstack/react-query";
import { readActiveOrgId } from "@/lib/tenant/active-tenant";

/** Prefixes that are intentionally NOT scoped by org. */
const UNSCOPED_PREFIXES: ReadonlySet<string> = new Set([
  "organizations",
  "organization",
  "workspaces",
  "workspace",
  "workspace.role",
  "workspace-invitation",
  "my-subscription",
  "auth",
  "session",
  "profile",
  "me",
]);

export function getActiveOrgScope(): string {
  if (typeof window === "undefined") return "__ssr__";
  return readActiveOrgId() ?? "__none__";
}

function isUnscoped(key: QueryKey): boolean {
  const head = key[0];
  return typeof head === "string" && UNSCOPED_PREFIXES.has(head);
}

/**
 * Custom queryKeyHashFn: prefixes every hash with the active org id unless
 * the key is on the unscoped allow-list. Assigned to `QueryClient` defaults
 * so every hook — existing or new — is scoped automatically.
 */
export const orgScopedQueryKeyHashFn = (queryKey: QueryKey): string => {
  if (isUnscoped(queryKey)) return hashKey(queryKey);
  return `org:${getActiveOrgScope()}|${hashKey(queryKey)}`;
};

/**
 * Explicit helper for call sites that want the org id visible in the key
 * (e.g. for targeted invalidations). Prefer this in new hooks.
 */
export function orgKey<T extends readonly unknown[]>(key: T) {
  return ["__org__", getActiveOrgScope(), ...key] as const;
}
