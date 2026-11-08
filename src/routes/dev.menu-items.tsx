import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { menuItemClass, type MenuItemVariant } from "@/lib/menu-item-class";

/**
 * Hidden visual-regression fixture for the shared `menu-item-state`
 * utility (via `menuItemClass()`), used by every menu-like primitive:
 * DropdownMenu, ContextMenu, Menubar, Select, Command, Popover.
 *
 * Radix portals + open/close animations make it flaky to screenshot a
 * live dropdown state matrix. Instead we render bare items with the
 * same shared classes and force each interactive state via the exact
 * DOM attributes Radix/cmdk emit (`data-highlighted`, `data-state`,
 * `data-selected`, `data-disabled`). This isolates the state contract
 * defined in `src/styles.css` and `src/lib/menu-item-class.ts`.
 *
 * Not linked from anywhere; safe to delete when the menu item API
 * changes meaningfully — regenerate baselines afterwards.
 */

export const Route = createFileRoute("/dev/menu-items")({
  component: MenuItemsVisualFixture,
});

const VARIANTS: MenuItemVariant[] = [
  "default",
  "inset",
  "indicator",
  "subtrigger",
];

const STATES = [
  { id: "default", label: "Default", attrs: {} as Record<string, string> },
  { id: "hover", label: "Hover", attrs: { "data-force-hover": "true" } },
  { id: "focus-visible", label: "Focus", attrs: { "data-force-focus": "true" } },
  {
    id: "highlighted",
    label: "Highlighted",
    attrs: { "data-highlighted": "" },
  },
  { id: "open", label: "Open", attrs: { "data-state": "open" } },
  {
    id: "selected",
    label: "Selected",
    attrs: { "data-selected": "true" },
  },
  { id: "disabled", label: "Disabled", attrs: { "data-disabled": "" } },
] as const;

function Cell({
  variant,
  attrs,
  testId,
}: {
  variant: MenuItemVariant;
  attrs: Record<string, string>;
  testId: string;
}) {
  return (
    <div className="rounded-control border border-border bg-popover p-1 w-56">
      <div
        role="menuitem"
        tabIndex={-1}
        data-testid={testId}
        className={menuItemClass(variant, "w-full")}
        {...attrs}
      >
        {variant === "indicator" || variant === "inset" ? (
          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <span>Menu item</span>
        {variant === "subtrigger" ? (
          <span className="ml-auto opacity-60">›</span>
        ) : null}
      </div>
    </div>
  );
}

function MenuItemsVisualFixture() {
  return (
    <main
      data-testid="menu-items-visual-fixture"
      className="min-h-screen bg-background text-foreground p-10"
    >
      <h1 className="sr-only">Menu item state visual regression fixture</h1>
      <style>{`
        /* Force :hover / :focus-visible pixels deterministically via a data-attr
           equivalent — Playwright's page.hover() / focus() only reliably fires
           the CSS pseudo-classes on real interactive elements. */
        [data-force-hover="true"] { background-color: var(--muted); }
        [data-force-focus="true"] {
          background-color: var(--muted);
          box-shadow: 0 0 0 2px var(--ring);
          outline: none;
        }
      `}</style>
      <div className="space-y-10">
        {VARIANTS.map((variant) => (
          <section key={variant} className="space-y-3">
            <h2 className="text-sm font-medium tracking-tight text-muted-foreground">
              {variant}
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {STATES.map((state) => (
                <div key={state.id} className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {state.label}
                  </div>
                  <Cell
                    variant={variant}
                    attrs={state.attrs}
                    testId={`mi-${variant}-${state.id}`}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
