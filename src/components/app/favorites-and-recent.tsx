import { Link, useLocation } from "@tanstack/react-router";
import { Star, StarOff, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/shared/hooks/use-favorites";
import { useRecentPages } from "@/shared/hooks/use-recent-pages";
import { NAV_ITEMS } from "./nav-config";

/**
 * FavoritesList — pinned pages rail. Renders inside the sidebar.
 * Empty state guides the user to right-click a nav item to pin it.
 */
export function FavoritesList({ collapsed = false }: { collapsed?: boolean }) {
  const { items, remove } = useFavorites();
  const location = useLocation();

  if (collapsed) return null;
  if (items.length === 0) {
    return (
      <div className="px-3 pt-1 pb-3 text-[11px] text-sidebar-foreground/50">
        Pin pages you visit often — right-click a nav item to add.
      </div>
    );
  }

  return (
    <ul className="space-y-0.5 px-2 pb-2">
      {items.map((path) => {
        const meta = NAV_ITEMS.find((n) => n.to === path);
        const label = meta?.label ?? path.replace(/^\//, "");
        const Icon = meta?.icon ?? Star;
        const active = location.pathname === path;
        return (
          <li key={path} className="group animate-fade-in">
            <Link
              to={path}
              className={cn(
                "flex items-center gap-2 h-9 rounded-control px-2 text-sidebar-item text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate">{label}</span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(path); }}
                className="opacity-0 group-hover:opacity-100 grid h-5 w-5 place-items-center rounded text-sidebar-foreground/60 hover:bg-sidebar-accent-foreground/10 hover:text-sidebar-accent-foreground transition-opacity"
                aria-label={`Unpin ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * RecentList — most-recently-visited pages rail. Auto-tracked by
 * `useRecentPages`. Hidden when collapsed.
 */
export function RecentList({ collapsed = false }: { collapsed?: boolean }) {
  const { items } = useRecentPages();
  const location = useLocation();

  if (collapsed || items.length === 0) return null;

  return (
    <ul className="space-y-0.5 px-2 pb-2">
      {items.slice(0, 5).map((path) => {
        const meta = NAV_ITEMS.find((n) => n.to === path);
        const label = meta?.label ?? path.replace(/^\//, "");
        const Icon = meta?.icon ?? Clock;
        const active = location.pathname === path;
        return (
          <li key={path} className="animate-fade-in">
            <Link
              to={path}
              className={cn(
                "flex items-center gap-2 h-9 rounded-control px-2 text-sidebar-item text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * FavoriteToggleButton — inline pin/unpin action.
 */
export function FavoriteToggleButton({ path, label }: { path: string; label?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const pinned = isFavorite(path);
  return (
    <button
      type="button"
      onClick={() => toggle(path)}
      className="grid h-8 w-8 place-items-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground transition-all hover-scale focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={pinned ? `Unpin ${label ?? "page"}` : `Pin ${label ?? "page"}`}
      aria-pressed={pinned}
    >
      {pinned ? (
        <Star className="h-4 w-4 fill-accent text-accent animate-scale-in" />
      ) : (
        <StarOff className="h-4 w-4" />
      )}
    </button>
  );
}
