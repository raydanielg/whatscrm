import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavOpenStoreContext, NavPathContext, useNavOpenStore } from "./nav-open-state";

export type NestedNavNode = {
  to?: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  children?: NestedNavNode[];
  /** When true, `to` is an external URL and opens in a new tab. */
  external?: boolean;
  /** When true, active state requires an exact pathname match (no prefix). */
  exact?: boolean;
  /** Optional URL hash appended to `to` (e.g. "ai" for /settings#ai). */
  hash?: string;
  /** RBAC gate — when set, the item is hidden unless the current user has it. */
  permission?: string;
};

export function NestedNavGroup({ children, pathPrefix }: { children: React.ReactNode; pathPrefix?: string }) {
  const parentStore = React.useContext(NavOpenStoreContext);
  const parentPath = React.useContext(NavPathContext);
  // The outermost group owns the persisted store; nested groups reuse it.
  const ownStore = useNavOpenStore();
  const store = parentStore ?? ownStore;
  const path = pathPrefix ? (parentPath ? `${parentPath}.${pathPrefix}` : pathPrefix) : parentPath;

  return (
    <NavOpenStoreContext.Provider value={store}>
      <NavPathContext.Provider value={path}>{children}</NavPathContext.Provider>
    </NavOpenStoreContext.Provider>
  );
}

/**
 * NestedNavItem — sidebar row supporting arbitrary depth via
 * Collapsible. Auto-opens whenever a descendant matches the URL.
 * When nested inside a <NestedNavGroup>, only one sibling stays open.
 */
export function NestedNavItem({
  node,
  depth = 0,
  collapsed = false,
  itemKey,
  touch = false,
}: {
  node: NestedNavNode;
  depth?: number;
  collapsed?: boolean;
  itemKey?: string;
  /** Larger, finger-friendly row heights for drawer/bottom-sheet usage. */
  touch?: boolean;
}) {
  const location = useLocation();
  const paths = collectPaths(node);
  const hasChildren = !!node.children?.length;
  const activeDescendant = paths.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));
  const currentHash = typeof location.hash === "string" ? location.hash.replace(/^#/, "") : "";
  const pathMatches = node.to
    ? node.exact
      ? location.pathname === node.to
      : location.pathname === node.to || location.pathname.startsWith(node.to + "/")
    : false;
  const activeSelf = node.to
    ? node.hash !== undefined
      ? location.pathname === node.to && currentHash === node.hash
      : pathMatches
    : false;

  const key = itemKey ?? node.to ?? node.label;
  const parentPath = React.useContext(NavPathContext);
  const fullKey = parentPath ? `${parentPath}.${key}` : key;
  const store = React.useContext(NavOpenStoreContext);
  const [localOpen, setLocalOpen] = React.useState(activeDescendant);

  const open = store ? store.isOpen(fullKey) : localOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (store) store.setOpen(fullKey, next);
      else setLocalOpen(next);
    },
    [store, fullKey],
  );

  // Each level remembers its own open/closed state. We only auto-open the
  // section that owns the active route (when nothing was persisted for it) —
  // navigation never force-closes a section the user left open.
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (store && !store.hydrated) return;
    if (!didInit.current) {
      didInit.current = true;
      if (store?.hasStored) return;
      if (activeDescendant) setOpen(true);
      return;
    }
    if (activeDescendant && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDescendant, location.pathname, store?.hydrated]);




  const Icon = node.icon;
  const showIcon = depth === 0 && !!Icon;
  const isChild = depth > 0;
  // A child row that itself has children is a section label (e.g. "WhatsApp").
  const isCategory = isChild && hasChildren;
  const isLeaf = !hasChildren;

  const row = (
    <div
      className={cn(
        "group relative flex items-center rounded-control transition-colors duration-150",
        depth === 0 &&
          "gap-2.5 px-2 text-sidebar-item font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        depth === 0 && (touch ? "h-11 text-[15px]" : "h-9"),
        isCategory &&
          "gap-2 pl-2 pr-1.5 font-semibold  text-sidebar-foreground/55 hover:text-sidebar-accent-foreground",
        isCategory && (touch ? "h-8 text-[11px]" : "h-7 text-[11px]"),
        isChild &&
          isLeaf &&
          "gap-2 pl-2 pr-1.5 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isChild && isLeaf && (touch ? "h-10 text-[14px]" : "h-8 text-[13px]"),
        (activeSelf || (hasChildren && activeDescendant && !open)) &&
          "bg-sidebar-accent text-sidebar-accent-foreground",
        isCategory && activeDescendant && !open && "bg-transparent text-sidebar-accent-foreground",
        activeSelf && isChild && "font-medium !text-sidebar-accent-foreground",
      )}
    >
      {activeSelf && isChild && isLeaf && (
        <span
          aria-hidden="true"
          className="absolute -left-[12px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent"
        />
      )}
      {isChild && isLeaf && (
        <span
          aria-hidden="true"
          className={cn(
            "h-1 w-1 shrink-0 rounded-full transition-colors",
            activeSelf ? "bg-accent" : "bg-sidebar-foreground/25 group-hover:bg-sidebar-foreground/60",
          )}
        />
      )}
      {showIcon && Icon ? (
        <Icon className={cn("shrink-0 opacity-80", touch ? "h-[18px] w-[18px]" : "h-4 w-4")} aria-hidden="true" />
      ) : null}
      {!collapsed && (
        <>
          <span className="flex-1 min-w-0 truncate">{node.label}</span>
          {typeof node.badge === "number" && node.badge > 0 && (
            <span className="min-w-[18px] h-4 px-1 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent text-[11px] font-semibold ">
              {node.badge > 99 ? "99+" : node.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronRight
              className={cn(
                "shrink-0 transition-transform duration-200 opacity-50 group-hover:opacity-90",
                isCategory ? "h-3 w-3" : "h-3.5 w-3.5",
                open && "rotate-90 opacity-100",
              )}
              aria-hidden="true"
            />
          )}
        </>
      )}
    </div>
  );

  const linkWrap = (child: React.ReactNode) => {
    if (!node.to) return child;
    if (node.external) {
      return (
        <a href={node.to} target="_blank" rel="noopener noreferrer">
          {child}
        </a>
      );
    }
    return (
      <Link to={node.to} hash={node.hash}>
        {child}
      </Link>
    );
  };

  if (!hasChildren) {
    return node.to ? linkWrap(row) : row;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        {node.to ? (
          linkWrap(row)
        ) : (
          <button type="button" className="w-full text-left">
            {row}
          </button>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="collapsible-panel">
        <NestedNavGroup pathPrefix={key}>
          <div
            className={cn(
              "relative mt-0.5 mb-1 space-y-px",
              depth === 0
                ? "ml-[15px] pl-3 border-l border-sidebar-border/70"
                : "ml-2 pl-2.5 border-l border-sidebar-border/40",
            )}
          >
            {node.children!.map((child, i) => {
              const childKey = (child.to ?? child.label) + i;
              return (
                <NestedNavItem
                  key={childKey}
                  node={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  itemKey={childKey}
                  touch={touch}
                />
              );
            })}
          </div>
        </NestedNavGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}

function collectPaths(n: NestedNavNode): string[] {
  const out: string[] = [];
  const walk = (node: NestedNavNode) => {
    if (node.to) out.push(node.to);
    node.children?.forEach(walk);
  };
  walk(n);
  return out;
}
