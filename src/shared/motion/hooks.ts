"use client";
import { useReducedMotion, type MotionProps, type Variants } from "framer-motion";
import { useMemo } from "react";
import { variants as V } from "./tokens";

/**
 * Returns `true` when the OS requests reduced motion. Prefer this over the
 * raw hook so we default to `false` during SSR (motion allowed) instead of
 * flashing static content on hydration.
 */
export function useReducedMotionSafe(): boolean {
  const rm = useReducedMotion();
  return !!rm;
}

/**
 * Returns a variants object stripped of transforms/scales when the user
 * prefers reduced motion. Opacity still transitions — that's not vestibular.
 */
export function useSafeVariants(v: Variants): Variants {
  const reduce = useReducedMotionSafe();
  return useMemo(() => {
    if (!reduce) return v;
    const flatten = (state: unknown) => {
      if (!state || typeof state !== "object") return state;
      const s = state as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(s)) {
        if (["x", "y", "scale", "rotate", "rotateX", "rotateY", "skew"].includes(k)) continue;
        out[k] = val;
      }
      return out;
    };
    const next: Variants = {};
    for (const [name, state] of Object.entries(v)) next[name] = flatten(state) as never;
    return next;
  }, [v, reduce]);
}

/**
 * Standard enter/exit motion props for a preset variant. Handles reduced-motion
 * automatically. Use on `motion.div` / `motion.li` etc.
 *
 *   <motion.div {...motionProps("fadeUp")}></motion.div>
 */
export function motionProps(preset: keyof typeof V, extra: Partial<MotionProps> = {}): MotionProps {
  return {
    variants: V[preset],
    initial: "hidden",
    animate: "visible",
    exit: "exit",
    ...extra,
  };
}
