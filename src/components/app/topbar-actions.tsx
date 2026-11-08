import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLayout } from "@/shared/contexts/layout-context";

/**
 * Portals `children` into the current page's AppTopbar actions slot.
 *
 * Use this from a component rendered deep in the page body (e.g. a panel
 * reused across several routes, each with its own AppTopbar) instead of
 * rendering a disconnected toolbar row — the buttons then appear right
 * where every other page's header actions do, not floating below it.
 *
 * Renders nothing until the host page's AppTopbar has mounted and published
 * its slot node.
 */
export function TopbarActions({ children }: { children: ReactNode }) {
  const { topbarActionsNode } = useLayout();
  if (!topbarActionsNode) return null;
  return createPortal(children, topbarActionsNode);
}
