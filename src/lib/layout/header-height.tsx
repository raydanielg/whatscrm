/**
 * Shared header-height utilities.
 *
 * Every piece of chrome that has to line up with the app topbar/footer (60px,
 * exposed as `--height-header`) should use one of these helpers instead of
 * re-typing `h-header flex items-center border-b border-border ...` in every
 * component. Change the tokens here and every consumer stays in sync.
 *
 * Tailwind utilities used:
 *   - `h-header`  → height: var(--height-header) (same as `h-15`)
 *   - `min-h-15`  → min-height guard so flex parents can't shrink below 60px
 *
 * Do NOT hardcode `h-14`, `h-15`, `h-16`, or `60px` at call sites — the
 * layout-height regression test in tests/e2e/ will fail the build.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Raw class fragment: apply on any element that must be exactly one header tall. */
export const HEADER_HEIGHT_CLASS = "h-header min-h-15" as const;

/** CSS custom property that publishes the resolved height (px). */
export const HEADER_HEIGHT_VAR = "var(--height-header)" as const;

/**
 * cva variants for the standard "one row of chrome" pattern: a flex row
 * sized to `--height-header`, aligned, with an optional border on the
 * top/bottom edge and surface background.
 */
export const headerSlotVariants = cva(
  "flex items-center shrink-0 h-header min-h-15",
  {
    variants: {
      border: {
        none: "",
        top: "border-t",
        bottom: "border-b",
      },
      tone: {
        /** Matches the sidebar surface (organization switcher, admin sidebar). */
        sidebar: "border-sidebar-border",
        /** Matches the main app surface (topbar, footer, inbox panels). */
        surface: "border-border bg-surface/60",
        /** Border only, transparent background (nested sub-headers). */
        plain: "border-border",
      },
      padding: {
        none: "",
        sm: "px-3",
        md: "px-4",
        lg: "px-4 lg:px-6",
        xl: "px-6",
      },
    },
    defaultVariants: {
      border: "bottom",
      tone: "surface",
      padding: "lg",
    },
  }
);

export type HeaderSlotVariants = VariantProps<typeof headerSlotVariants>;

/**
 * Compose the header-slot class string.
 *
 * @example
 *   <div className={headerSlotClass({ border: "top", tone: "surface" })}></div>
 */
export function headerSlotClass(
  opts: HeaderSlotVariants & { className?: string } = {}
) {
  const { className, ...variants } = opts;
  return cn(headerSlotVariants(variants), className);
}

type HeaderSlotProps = React.HTMLAttributes<HTMLElement> &
  HeaderSlotVariants & {
    /** Render as a semantic element (default: `div`). */
    as?: "div" | "header" | "footer" | "nav" | "section";
  };

/**
 * Drop-in header/footer row primitive.
 *
 * @example
 *   <HeaderSlot as="header" border="bottom"></HeaderSlot>
 *   <HeaderSlot as="footer" border="top" role="contentinfo"></HeaderSlot>
 */
export const HeaderSlot = React.forwardRef<HTMLElement, HeaderSlotProps>(
  function HeaderSlot(
    { as = "div", border, tone, padding, className, ...rest },
    ref
  ) {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={headerSlotClass({ border, tone, padding, className })}
        {...rest}
      />
    );
  }
);
