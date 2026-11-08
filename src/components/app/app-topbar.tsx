import { Search, PanelLeftClose, PanelLeftOpen, BookOpen } from "lucide-react";
import { Breadcrumbs } from "@/shared/components/breadcrumbs";
import { useLayout } from "@/shared/contexts/layout-context";
import { MobileNav } from "./mobile-nav";
import { NotificationCenter } from "./notification-center";
import { UserMenu } from "./user-menu";
import { ThemeSwitcher } from "./theme-switcher";
import { QuickActions } from "./quick-actions";
import { docsUrl } from "@/lib/docs/links";
import { SHOW_RESOURCE_LINKS } from "@/lib/docs/visibility";
import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  showBreadcrumbs?: boolean;
  showPageHeader?: boolean;
  showSidebarToggle?: boolean;
};

/**
 * Sticky application header. Composes: mobile nav trigger, breadcrumbs +
 * title, global search (⌘K), quick actions, notifications, theme switcher,
 * and user menu. Backwards-compatible with { title, subtitle, actions }.
 */
export function AppTopbar({
  title,
  subtitle,
  actions,
  showBreadcrumbs = true,
  showPageHeader = true,
  showSidebarToggle = true,
}: Props) {
  const { setCommandOpen, sidebarCollapsed, toggleSidebar, navMode, setTopbarActionsNode } =
    useLayout();
  const headerRef = useRef<HTMLElement>(null);

  // Publish the actual sticky topbar height (h-header row + title/actions row)
  // as `--topbar-height` on <html>. Sticky sub-headers below the topbar use
  // `top-[var(--topbar-height,var(--header-height))]` so they always align flush under the
  // topbar regardless of breakpoint or wrap.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const write = () => {
      document.documentElement.style.setProperty(
        "--topbar-height",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    window.addEventListener("resize", write);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", write);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70"
    >
      {/* Row 1 — controls */}
      <div className="flex h-header items-center gap-2 px-3 lg:px-6">
        <MobileNav />

        {navMode === "full" && showSidebarToggle && (
          <button
            onClick={toggleSidebar}
            className="grid h-9 w-9 place-items-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}

        <button
          onClick={() => setCommandOpen(true)}
          className="hidden md:flex flex-1 max-w-xl items-center gap-2 rounded-control border border-border bg-muted/40 px-3 h-9 text-sm text-muted-foreground transition-all hover:bg-muted hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left truncate">Search contacts, messages, actions</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        {/* Mobile-only search icon */}
        <button
          onClick={() => setCommandOpen(true)}
          className="md:hidden grid h-9 w-9 place-items-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          {SHOW_RESOURCE_LINKS && <a
            href={docsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-control px-2.5 h-9 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open documentation"
            title="Documentation"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden lg:inline">Docs</span>
          </a>}
          <QuickActions />
          <ThemeSwitcher />
          <NotificationCenter />
          <div className="mx-1 h-6 w-px bg-border" aria-hidden />
          <UserMenu />
        </div>
      </div>

      {/* Row 2 — page title + breadcrumbs + actions, 8/4 grid on large screens */}
      {showPageHeader && (
        <div className="grid grid-cols-1 gap-2 border-t border-border/50 px-4 py-3 lg:grid-cols-12 lg:items-center lg:px-6">
          <div className="min-w-0 lg:col-span-8">
            {showBreadcrumbs && <Breadcrumbs />}
            <div className="mt-1 flex min-w-0 items-baseline gap-3">
              <h1 className="shrink-0 font-display text-lg font-semibold lg:text-xl">{title}</h1>
              {subtitle && (
                <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
              )}
            </div>
            {subtitle && (
              <p className="sm:hidden truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div
            ref={setTopbarActionsNode}
            className="flex flex-wrap items-center gap-2 lg:col-span-4 lg:justify-end empty:hidden"
          >
            {actions}
          </div>
        </div>
      )}
    </header>
  );
}
