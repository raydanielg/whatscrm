import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CanvasInspector, SubHeader } from "./primitives";

/**
 * AutomationLayout — visual builder: infinite canvas + right inspector.
 *  · Toolbar row (sticky) for run/save/version.
 *  · Canvas fills remaining space (bg-surface-sunken).
 *  · Inspector pane is 288–352px wide on desktop; drawer on mobile.
 */
export function AutomationLayout({
  toolbar,
  canvas,
  inspector,
  className,
}: {
  toolbar?: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-content", className)}>
      {toolbar && <SubHeader>{toolbar}</SubHeader>}
      <div className="flex-1 min-h-0">
        <CanvasInspector canvas={canvas} inspector={inspector} />
      </div>
    </div>
  );
}
