import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ListDetail, SubHeader } from "./primitives";

/**
 * CRMLayout — list + detail. Optional sticky filter/tab row above.
 * Mobile: routing swaps between list and detail views (each side is a route).
 * Desktop: side-by-side.
 */
export function CRMLayout({
  toolbar,
  list,
  detail,
  className,
}: {
  toolbar?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-content", className)}>
      {toolbar && <SubHeader>{toolbar}</SubHeader>}
      <div className="flex-1 min-h-0">
        <ListDetail list={list} detail={detail} />
      </div>
    </div>
  );
}
