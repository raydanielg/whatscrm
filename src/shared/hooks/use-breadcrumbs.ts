import { useRouterState } from "@tanstack/react-router";
import { NAV_ITEMS, NAV_GROUPS } from "@/components/app/nav-config";

export type Crumb = { label: string; to?: string };

const NAV_BY_PATH = new Map(NAV_ITEMS.map((i) => [i.to, i]));
const GROUP_LABEL = new Map(NAV_GROUPS.map((g) => [g.id, g.label]));

/**
 * Derives breadcrumbs from the current route match chain.
 *
 * Precedence for each match:
 *  1. `staticData.breadcrumb` on the route
 *  2. Matching `NAV_ITEMS` entry (uses the nav label — keeps breadcrumbs and
 *     the sidebar in lockstep, so routes moved between groups such as
 *     "API Configurations" always render under the right parent section)
 *  3. Titleised path segment fallback
 *
 * When a NAV_ITEMS entry is found, the parent group label (e.g.
 * "API Configurations", "Extensions") is prepended as a non-linked crumb
 * so users can see which section of the sidebar the page belongs to.
 */
export function useBreadcrumbs(): Crumb[] {
  const matches = useRouterState({ select: (s) => s.matches });

  const crumbs: Crumb[] = [];
  for (const m of matches) {
    if (m.pathname === "/" || m.routeId === "__root__") continue;
    const staticLabel = (m.staticData as { breadcrumb?: string } | undefined)?.breadcrumb;
    const nav = NAV_BY_PATH.get(m.pathname);

    if (staticLabel) {
      crumbs.push({ label: staticLabel, to: m.pathname });
      continue;
    }

    if (nav) {
      const groupLabel = GROUP_LABEL.get(nav.group);
      if (groupLabel && groupLabel !== nav.label) {
        const lastGroup = crumbs.at(-1);
        if (!lastGroup || lastGroup.label !== groupLabel) {
          crumbs.push({ label: groupLabel });
        }
      }
      crumbs.push({ label: nav.label, to: m.pathname });
      continue;
    }

    // Fall back to the last path segment; skip pathless layout ids.
    if (m.routeId.split("/").at(-1)?.startsWith("_")) continue;
    const seg = m.pathname.split("/").filter(Boolean).at(-1);
    if (!seg) continue;
    const label = seg.startsWith(":") || seg.match(/^[0-9a-f-]{8,}$/i)
      ? `#${seg.slice(0, 6)}`
      : seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
    crumbs.push({ label, to: m.pathname });
  }
  return crumbs;
}
