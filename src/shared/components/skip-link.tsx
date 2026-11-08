/**
 * Skip-to-content link. Rendered at the top of the authenticated shell so
 * keyboard users can bypass the sidebar + topbar. Anchors to `#main` — every
 * layout must render `<main id="main"></main>` exactly once.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:h-9 focus:items-center focus:rounded-control focus:bg-primary focus:px-3 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:ring-offset-2 focus:ring-offset-background"
    >
      Skip to content
    </a>
  );
}
