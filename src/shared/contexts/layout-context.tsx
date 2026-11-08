import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";

export type NavMode = "mobile" | "mini" | "full";

type LayoutContextValue = {
  /** Raw user preference for the desktop sidebar (only respected in `full` nav mode). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean, opts?: { persist?: boolean }) => void;

  /**
   * Responsive nav mode driven by viewport width:
   *  - `mobile`: < 768px  → drawer / offcanvas
   *  - `mini`:  768–1200px → forced 60px icon rail
   *  - `full`:  > 1200px  → user-toggleable full sidebar
   */
  navMode: NavMode;
  /** Effective collapsed state (true in `mini`, or when user collapsed in `full`). */
  effectiveCollapsed: boolean;

  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;

  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  toggleCommand: () => void;

  /**
   * DOM node for AppTopbar's actions slot, set by AppTopbar itself. Deeply
   * nested page content (e.g. a shared panel reused across several routes)
   * can portal its own action buttons here via `<TopbarActions>` instead of
   * rendering a disconnected toolbar row in the page body.
   */
  topbarActionsNode: HTMLDivElement | null;
  setTopbarActionsNode: (node: HTMLDivElement | null) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);
const SIDEBAR_KEY = "wacrm.sidebar.collapsed";

function computeNavMode(width: number): NavMode {
  if (width < 768) return "mobile";
  if (width <= 1200) return "mini";
  return "full";
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isInbox = location.pathname === "/inbox" || location.pathname.startsWith("/inbox/");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [topbarActionsNode, setTopbarActionsNode] = useState<HTMLDivElement | null>(null);
  const [navMode, setNavMode] = useState<NavMode>(() =>
    typeof window === "undefined" ? "full" : computeNavMode(window.innerWidth),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_KEY);
      if (raw === "1") setSidebarCollapsedState(true);
    } catch {
      /* noop */
    }
  }, []);

  // Track viewport-driven nav mode.
  useEffect(() => {
    const compute = () => setNavMode(computeNavMode(window.innerWidth));
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  // Auto-close mobile drawer when leaving mobile mode.
  useEffect(() => {
    if (navMode !== "mobile" && mobileNavOpen) setMobileNavOpen(false);
  }, [navMode, mobileNavOpen]);

  /**
   * Update the sidebar collapse state. Pass `{ persist: false }` for temporary
   * route-driven collapses so the user's saved preference is not overwritten.
   */
  const setSidebarCollapsed = (v: boolean, opts?: { persist?: boolean }) => {
    setSidebarCollapsedState(v);
    if (opts?.persist === false) return;
    try {
      window.localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
  };

  // Global ⌘K / Ctrl+K to toggle command palette.
  // `defaultPrevented` is checked first so this backs off when a more specific
  // ⌘K owner already claimed the same keydown (the inbox's advanced search in
  // conversation-list.tsx, or the composer's template picker) — otherwise this
  // app-wide listener opened its own dialog on top of theirs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const effectiveCollapsed =
    isInbox || navMode === "mini" || (navMode === "full" && sidebarCollapsed);

  const value = useMemo<LayoutContextValue>(
    () => ({
      sidebarCollapsed,
      toggleSidebar: () => {
        // In mini mode the width is fixed; toggling only makes sense in full mode.
        if (navMode !== "full" || isInbox) return;
        setSidebarCollapsed(!sidebarCollapsed);
      },
      setSidebarCollapsed,
      navMode,
      effectiveCollapsed,
      mobileNavOpen,
      setMobileNavOpen,
      commandOpen,
      setCommandOpen,
      toggleCommand: () => setCommandOpen((v) => !v),
      topbarActionsNode,
      setTopbarActionsNode,
    }),
    [
      sidebarCollapsed,
      mobileNavOpen,
      commandOpen,
      navMode,
      effectiveCollapsed,
      isInbox,
      topbarActionsNode,
    ],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used inside LayoutProvider");
  return ctx;
}
