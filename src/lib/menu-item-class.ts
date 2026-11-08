import { cn } from "@/lib/utils";

/**
 * Shared class helper for menu-like items (DropdownMenu, ContextMenu,
 * Menubar, Select, Command).
 *
 * Applies the documented state contract via the `menu-item-state`
 * Tailwind v4 utility defined in `src/styles.css`:
 *   - color: --foreground
 *   - hover / active / focus / focus-visible / data-highlighted /
 *     data-state=open / data-selected → bg-muted
 *   - focus-visible → ring using --ring
 *   - data-disabled → pointer-events: none; opacity: 0.5
 *
 * See docs/menu-item-states.md for the full contract.
 */

export type MenuItemVariant =
  /** Standard item (e.g. DropdownMenu.Item, ContextMenu.Item). */
  | "default"
  /** Item shifted right to align with a leading icon column. */
  | "inset"
  /** Checkbox/radio items with a leading indicator slot (pl-8). */
  | "indicator"
  /** SubTrigger — same states, keeps a right-side chevron slot. */
  | "subtrigger";

const BASE =
  "relative flex cursor-default select-none items-center rounded-control text-sm outline-none transition-colors menu-item-state";

const VARIANT: Record<MenuItemVariant, string> = {
  default: "gap-2 px-2 py-1.5 [&>svg]:size-4 [&>svg]:shrink-0",
  inset: "gap-2 py-1.5 pl-8 pr-2 [&>svg]:size-4 [&>svg]:shrink-0",
  indicator: "py-1.5 pl-8 pr-2",
  subtrigger:
    "gap-2 px-2 py-1.5 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 data-[state=open]:bg-muted",
};

export function menuItemClass(
  variant: MenuItemVariant = "default",
  ...extra: Array<string | undefined | null | false>
): string {
  return cn(BASE, VARIANT[variant], ...extra);
}
