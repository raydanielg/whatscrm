import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Auto-scrolls the horizontally-scrollable `containerRef` so the child element
 * matching `activeSelector` (default: `button[data-active="true"]`) is
 * horizontally centered in the viewport. Runs on initial mount and whenever
 * any value in `deps` changes.
 *
 * The first run uses `behavior: "auto"` so the chip is already centered on
 * initial paint (no jarring left-to-center animation on mount). Subsequent
 * runs use the provided `behavior` (default `"smooth"`).
 */
export function useCenterActiveChip(
  containerRef: RefObject<HTMLElement | null>,
  deps: ReadonlyArray<unknown>,
  activeSelector: string = 'button[data-active="true"]',
  behavior: ScrollBehavior = "smooth",
) {
  const didMountRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(activeSelector);
    if (!active) return;
    const cRect = container.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const delta = aRect.left + aRect.width / 2 - (cRect.left + cRect.width / 2);
    if (delta === 0) {
      didMountRef.current = true;
      return;
    }
    const runBehavior: ScrollBehavior = didMountRef.current ? behavior : "auto";
    container.scrollTo({ left: container.scrollLeft + delta, behavior: runBehavior });
    didMountRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
