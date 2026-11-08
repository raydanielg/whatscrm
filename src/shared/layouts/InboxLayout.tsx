import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ThreePane } from "./primitives";

/**
 * InboxLayout — three-pane messaging shell (folders / thread list / reader).
 *  · Mobile: single column, `list` visible.
 *  · Tablet: folders + list.
 *  · Desktop ≥xl: all three panes.
 * Route the selected thread to render `reader`; on mobile push a route.
 */
export function InboxLayout({
  nav,
  list,
  reader,
  className,
}: {
  nav: ReactNode;
  list: ReactNode;
  reader: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-content", className)}>
      <ThreePane nav={nav} list={list} reader={reader} />
    </div>
  );
}
