import { NAV_ITEMS } from "./nav-config";

/**
 * Path -> required permission lookup derived from `NAV_ITEMS`.
 *
 * Hiding a sidebar link is not access control: only 11 of the ~265 routes under
 * `src/routes/_authenticated/` carry their own `beforeLoad` gate, so a
 * restricted user could simply type `/billing` or `/roles` and get the full
 * page. This map lets ONE gate at the authenticated layout enforce every
 * nav-reachable path instead of touching every route file.
 *
 * Rules:
 * - External entries (`external: true`, e.g. the docs link) are not app paths.
 * - Several entries share the same `to` (Social Studio alone has six). We take
 *   the LEAST restrictive reading: if ANY entry for a path has no `permission`,
 *   the path is ungated; when they all have permissions but disagree, holding
 *   any ONE of them is enough.
 */
const PATH_PERMISSIONS: ReadonlyMap<string, ReadonlySet<string> | null> = (() => {
  const map = new Map<string, Set<string> | null>();

  for (const item of NAV_ITEMS) {
    if (item.external) continue;
    const path = normalizePath(item.to);
    // "/" would prefix-match the entire app; it is never a gate.
    if (path === "/" || !path.startsWith("/")) continue;

    if (!item.permission) {
      // An ungated entry wins outright — least restrictive.
      map.set(path, null);
      continue;
    }
    if (!map.has(path)) {
      map.set(path, new Set([item.permission]));
      continue;
    }
    const existing = map.get(path);
    if (!existing) continue; // already ungated (null)
    existing.add(item.permission);
  }

  return map;
})();

/** Strip the query/hash and any trailing slash, keeping a leading "/". */
function normalizePath(input: string): string {
  const path = input.split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.replace(/\/+$/, "") || "/";
  return path;
}

/**
 * Permissions that satisfy `pathname`, by longest-prefix match so nested
 * routes inherit their parent's gate (`/deals/123` -> `/deals`). Returns an
 * empty array when the path is ungated or unknown to the nav config.
 *
 * Holding ANY returned permission grants access (see the least-restrictive
 * rule above).
 */
export function requiredPermissionsForPath(pathname: string): string[] {
  const path = normalizePath(pathname);
  let bestLength = -1;
  let best: ReadonlySet<string> | null = null;

  for (const [navPath, permissions] of PATH_PERMISSIONS) {
    const isMatch = path === navPath || path.startsWith(`${navPath}/`);
    if (!isMatch) continue;
    if (navPath.length <= bestLength) continue;
    bestLength = navPath.length;
    best = permissions;
  }

  return best ? [...best] : [];
}
