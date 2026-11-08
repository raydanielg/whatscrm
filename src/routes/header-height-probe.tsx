import { createFileRoute } from "@tanstack/react-router";

/**
 * Non-indexed probe used by `tests/e2e/header-height.spec.ts`.
 *
 * Renders elements that share the app-chrome height contract
 * (`h-header` == 60px, backed by `--height-header`) so the visual
 * regression test can assert consistency across breakpoints without
 * needing an authenticated session.
 */
export const Route = createFileRoute("/header-height-probe")({
  head: () => ({
    meta: [
      { title: "Header Height Probe" },
      { name: "description", content: "Internal probe for h-header invariant." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HeaderHeightProbe,
});

function HeaderHeightProbe() {
  return (
    <div className="min-h-screen bg-background">
      <header
        data-testid="probe-topbar"
        className="sticky top-0 z-30 flex h-header items-center gap-2 border-b border-border bg-surface px-3 lg:px-6"
      >
        <span className="text-sm font-medium">Topbar</span>
      </header>
      <div className="flex">
        <aside className="w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar">
          <div
            data-testid="probe-sidebar-header"
            className="flex h-header items-center border-b border-sidebar-border px-3"
          >
            <span className="text-sm font-medium">Sidebar header</span>
          </div>
          <div className="p-3 text-xs text-muted-foreground">Nav</div>
          <div
            data-testid="probe-sidebar-footer"
            className="flex h-header items-center border-t border-sidebar-border px-3"
          >
            <span className="text-xs">Sidebar footer</span>
          </div>
        </aside>
        <main className="flex-1 p-6 space-y-3">
          <div
            data-testid="probe-app-footer"
            className="flex h-header items-center border-t border-border px-3"
          >
            <span className="text-sm">App footer</span>
          </div>
          {/*
            Paired h-15 / h-header / min-h-15 / max-h-15 probes.
            The `header-height.spec.ts` regression asserts these render
            at identical pixel heights so both utilities stay locked to
            `--height-header` across mobile, tablet, and desktop.
          */}
          <div
            data-testid="probe-h15"
            className="flex h-15 items-center border border-border px-3"
          >
            <span className="text-sm">h-15 probe</span>
          </div>
          <div
            data-testid="probe-h-header"
            className="flex h-header items-center border border-border px-3"
          >
            <span className="text-sm">h-header probe</span>
          </div>
          <div
            data-testid="probe-min-h15"
            className="flex min-h-15 items-center border border-border px-3"
          >
            <span className="text-sm">min-h-15 probe</span>
          </div>
          <div
            data-testid="probe-max-h15"
            className="flex max-h-15 h-24 items-center border border-border px-3 overflow-hidden"
          >
            <span className="text-sm">max-h-15 probe</span>
          </div>
        </main>
      </div>
    </div>
  );
}
