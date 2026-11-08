"use client";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { variants, gestures, EASE } from "./tokens";
import { useSafeVariants } from "./hooks";
import { cn } from "@/lib/utils";

/* ------------------------------- Page/Route ------------------------------ */

/**
 * Wrap route content to fade the current page in / out on navigation. Place
 * inside the route component, keyed by pathname.
 *
 *   <PageTransition><YourPage /></PageTransition>
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const v = useSafeVariants(variants.page);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={v}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn("min-h-full", className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* --------------------------- Stagger container --------------------------- */

/**
 * Reveal child `<MotionItem>`s in sequence. Great for KPI rows, card grids,
 * activity feeds. Use sparingly — never on data-dense tables.
 */
export function MotionStagger({
  children,
  className,
  as = "div",
  gap = 0.05,
  delay = 0.02,
  ...rest
}: HTMLMotionProps<"div"> & {
  children: ReactNode;
  as?: "div" | "ul" | "ol" | "section";
  gap?: number;
  delay?: number;
}) {
  const Component = motion[as as "div"];
  const v = useSafeVariants({
    hidden: {},
    visible: { transition: { staggerChildren: gap, delayChildren: delay } },
  });
  return (
    <Component
      variants={v}
      initial="hidden"
      animate="visible"
      className={className}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function MotionItem({
  children,
  className,
  as = "div",
  preset = "card",
  ...rest
}: HTMLMotionProps<"div"> & {
  children: ReactNode;
  as?: "div" | "li" | "tr" | "section";
  preset?: "card" | "row" | "fadeUp";
}) {
  const Component = motion[as as "div"];
  const v = useSafeVariants(variants[preset]);
  return (
    <Component variants={v} className={className} {...rest}>
      {children}
    </Component>
  );
}

/* --------------------------------- Card ---------------------------------- */

/**
 * Lift-on-hover card wrapper. Add on top of `WidgetCard` for interactive tiles
 * — do NOT stack this with `hover-scale`.
 */
export function HoverLift({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div"> & { children: ReactNode }) {
  return (
    <motion.div
      whileHover={gestures.cardHover}
      whileTap={gestures.cardTap}
      transition={{ duration: 0.18, ease: EASE.emphasized }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------- Success / Error ---------------------------- */

/**
 * Animated check mark. Drop into success dialogs after a mutation.
 */
export function SuccessCheck({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 52 52"
      width={size}
      height={size}
      className={cn("text-success", className)}
      initial="hidden"
      animate="visible"
      aria-hidden
    >
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: { pathLength: 1, opacity: 1, transition: { duration: 0.4, ease: EASE.emphasized } },
        }}
      />
      <motion.path
        d="M14 27l8 8 16-18"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          hidden: { pathLength: 0 },
          visible: { pathLength: 1, transition: { duration: 0.35, ease: EASE.emphasized, delay: 0.2 } },
        }}
      />
    </motion.svg>
  );
}

/**
 * Animated X + micro shake. Drop into destructive-error feedback.
 */
export function ErrorCross({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{
        scale: [0.9, 1.05, 1],
        opacity: 1,
        x: [0, -3, 3, -2, 0],
        transition: { duration: 0.45, ease: EASE.emphasized },
      }}
      className={cn("text-danger", className)}
    >
      <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden>
        <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M18 18l16 16M34 18L18 34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

/* ---------------------------- Typing indicator --------------------------- */

/**
 * Three-dot typing indicator for chat / assistant surfaces.
 */
export function TypingIndicator({ label = "Typing", className }: { label?: string; className?: string }) {
  const dot = (delay: number) => ({
    animate: { y: [0, -3, 0], opacity: [0.4, 1, 0.4] },
    transition: { duration: 1, repeat: Infinity, ease: EASE.inOut, delay },
  });
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-control bg-muted px-2.5 py-1.5 text-muted-foreground",
        className,
      )}
    >
      {[0, 0.15, 0.3].map((d) => (
        <motion.span
          key={d}
          {...dot(d)}
          className="block h-1.5 w-1.5 rounded-full bg-current"
        />
      ))}
    </span>
  );
}

/* ------------------------------ Live pulse ------------------------------- */

/**
 * A ring that pulses to signal live/realtime state. Pair with a solid dot
 * inside via composition.
 */
export function LivePulse({
  active = true,
  className,
  tone = "success",
}: {
  active?: boolean;
  className?: string;
  tone?: "success" | "accent" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-accent";
  return (
    <span className={cn("relative inline-flex h-3 w-3", className)} aria-hidden>
      {active && (
        <motion.span
          className={cn("absolute inset-0 rounded-full opacity-60", toneCls)}
          animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className={cn("relative inline-block h-3 w-3 rounded-full", active ? toneCls : "bg-muted-foreground")} />
    </span>
  );
}

/* -------------------------- Shimmer / skeleton --------------------------- */

/**
 * Diagonal shimmer used inside skeletons. Slower than a spinner; caps opacity
 * so it never distracts.
 */
export function Shimmer({ className }: { className?: string }) {
  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -translate-x-full",
        "bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent",
        className,
      )}
      animate={{ x: ["-100%", "100%"] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* -------------------------- Count / number tween ------------------------- */

/**
 * Realtime counter that eases from previous to next value. Use for KPI cards
 * updated by live subscriptions.
 */
export function CountUp({
  value,
  format = (v) => Math.round(v).toLocaleString(),
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE.emphasized }}
      className={cn("", className)}
    >
      {format(value)}
    </motion.span>
  );
}

/* --------------------------- Modal / Drawer / Popup ---------------------- */

/**
 * Backdrop overlay for custom modal / drawer roots. Prefer shadcn's Dialog /
 * Sheet primitives when possible — they already animate via CSS keyframes.
 * Use these for bespoke overlays only.
 */
export function AnimatedBackdrop({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      role="presentation"
      onClick={onClick}
      variants={variants.backdrop}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn("fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm", className)}
    />
  );
}

export { AnimatePresence, motion };
