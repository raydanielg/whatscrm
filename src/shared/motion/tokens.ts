/**
 * Motion tokens for the entire app. These mirror the CSS variables in
 * `src/styles.css` so both Framer Motion and Tailwind stay in sync. Never
 * hardcode durations or easings in components — always import from here.
 *
 * Guiding principles (per design system):
 *   1. Motion is a signal, not decoration. Animate state changes, not idle UI.
 *   2. Prefer 150–320 ms. Above 500 ms only for hero-level moments.
 *   3. Respect `prefers-reduced-motion`. Use `useReducedMotionSafe()` + presets.
 *   4. One motion per interaction. No stacked effects on a single element.
 */
import type { Transition, Variants } from "framer-motion";

/* ------------------------------- Durations ------------------------------- */
export const DURATION = {
  instant: 0.075,
  fast: 0.15,
  normal: 0.22,
  slow: 0.32,
  slower: 0.5,
  lazy: 0.8,
} as const;

/* -------------------------------- Easings -------------------------------- */
/** Framer Motion cubic-bezier tuples. Values mirror --ease-* CSS tokens. */
type Bezier = [number, number, number, number];
export const EASE = {
  linear: [0, 0, 1, 1] as Bezier,
  in: [0.4, 0, 1, 1] as Bezier,
  out: [0, 0, 0.2, 1] as Bezier,
  inOut: [0.4, 0, 0.2, 1] as Bezier,
  emphasized: [0.2, 0.9, 0.1, 1] as Bezier,
  snappy: [0.32, 0.72, 0, 1] as Bezier,
  spring: [0.5, 1.6, 0.4, 1] as Bezier,
} satisfies Record<string, Bezier>;

/* ------------------------------ Distances -------------------------------- */
/** Consistent enter offsets (px) — subtle by default. */
export const DISTANCE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;

/* ---------------------------- Named transitions --------------------------- */
export const TRANSITION = {
  /** Default fade / scale for menus, popovers, dropdowns. */
  ui: { duration: DURATION.normal, ease: EASE.emphasized } satisfies Transition,
  /** Snappy toggle for buttons, switches, checkbox marks. */
  snap: { duration: DURATION.fast, ease: EASE.snappy } satisfies Transition,
  /** Hero / dialog / drawer sheet. */
  sheet: { duration: DURATION.slow, ease: EASE.emphasized } satisfies Transition,
  /** Route / page transitions. */
  page: { duration: DURATION.normal, ease: EASE.out } satisfies Transition,
  /** Physics for reorderable / draggy items and toast entries. */
  spring: { type: "spring", stiffness: 380, damping: 32, mass: 0.7 } satisfies Transition,
  /** Softer spring for oversized elements (drawers, sheets). */
  softSpring: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } satisfies Transition,
} as const;

/* --------------------------- Stagger utilities --------------------------- */
export const stagger = (children = 0.04, delay = 0) =>
  ({
    staggerChildren: children,
    delayChildren: delay,
  }) satisfies Transition;

/* ---------------------------- Variant presets ---------------------------- */
export const variants = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: TRANSITION.ui },
    exit: { opacity: 0, transition: TRANSITION.snap },
  } satisfies Variants,

  fadeUp: {
    hidden: { opacity: 0, y: DISTANCE.sm },
    visible: { opacity: 1, y: 0, transition: TRANSITION.ui },
    exit: { opacity: 0, y: DISTANCE.xs, transition: TRANSITION.snap },
  } satisfies Variants,

  scale: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1, transition: TRANSITION.ui },
    exit: { opacity: 0, scale: 0.98, transition: TRANSITION.snap },
  } satisfies Variants,

  /** Popover / dropdown / menu — origin-aware scale + subtle lift. */
  overlay: {
    hidden: { opacity: 0, scale: 0.97, y: -DISTANCE.xs },
    visible: { opacity: 1, scale: 1, y: 0, transition: TRANSITION.ui },
    exit: { opacity: 0, scale: 0.98, y: -DISTANCE.xs, transition: TRANSITION.snap },
  } satisfies Variants,

  /** Modal dialog. */
  dialog: {
    hidden: { opacity: 0, scale: 0.94, y: DISTANCE.sm },
    visible: { opacity: 1, scale: 1, y: 0, transition: TRANSITION.sheet },
    exit: { opacity: 0, scale: 0.96, y: DISTANCE.xs, transition: TRANSITION.snap },
  } satisfies Variants,

  backdrop: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: DURATION.normal, ease: EASE.out } },
    exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.in } },
  } satisfies Variants,

  /** Right drawer. Swap `x` sign for left-side drawers. */
  drawerRight: {
    hidden: { x: "100%" },
    visible: { x: 0, transition: TRANSITION.softSpring },
    exit: { x: "100%", transition: { duration: DURATION.slow, ease: EASE.in } },
  } satisfies Variants,

  drawerLeft: {
    hidden: { x: "-100%" },
    visible: { x: 0, transition: TRANSITION.softSpring },
    exit: { x: "-100%", transition: { duration: DURATION.slow, ease: EASE.in } },
  } satisfies Variants,

  /** Sidebar collapse. Width is driven by CSS var; this fades the labels. */
  sidebarLabel: {
    hidden: { opacity: 0, x: -DISTANCE.xs },
    visible: { opacity: 1, x: 0, transition: TRANSITION.ui },
  } satisfies Variants,

  /** Card mount. Combine with `staggerContainer` for grids. */
  card: {
    hidden: { opacity: 0, y: DISTANCE.sm },
    visible: { opacity: 1, y: 0, transition: TRANSITION.ui },
  } satisfies Variants,

  staggerContainer: {
    hidden: {},
    visible: { transition: stagger(0.05, 0.02) },
  } satisfies Variants,

  /** Table rows — very subtle to avoid perceptual noise on data-dense views. */
  row: {
    hidden: { opacity: 0, y: DISTANCE.xs },
    visible: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE.out } },
  } satisfies Variants,

  /** Toast / notification arrival. */
  toast: {
    hidden: { opacity: 0, y: DISTANCE.md, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: TRANSITION.spring },
    exit: { opacity: 0, y: DISTANCE.xs, scale: 0.98, transition: TRANSITION.snap },
  } satisfies Variants,

  /** Message bubble arrival (inbox / chat). */
  message: {
    hidden: { opacity: 0, y: DISTANCE.sm, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: TRANSITION.spring },
  } satisfies Variants,

  /** Route transition — one-way fade + tiny lift. Symmetric on exit. */
  page: {
    hidden: { opacity: 0, y: DISTANCE.xs },
    visible: { opacity: 1, y: 0, transition: TRANSITION.page },
    exit: { opacity: 0, y: -DISTANCE.xs, transition: { duration: DURATION.fast, ease: EASE.in } },
  } satisfies Variants,
} as const;

/* -------------------------- Hover / tap gestures ------------------------- */
export const gestures = {
  /** Standard button press. */
  buttonTap: { scale: 0.97 },
  buttonHover: { y: -1 },
  /** Card lift on hover. */
  cardHover: { y: -2 },
  cardTap: { y: 0, scale: 0.995 },
  /** Icon-button jiggle. */
  iconTap: { scale: 0.9 },
} as const;
