import type { ReactNode } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Side = "left" | "right" | "top" | "bottom";
type Width = "sm" | "md" | "lg" | "xl";

const WIDTH: Record<Width, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
};

/**
 * Side drawer per UI_STANDARDS §15. Provides a sticky header and optional
 * sticky footer that survive long scroll content. Focus + Esc handling is
 * Radix-owned.
 */
export function SideDrawer({
  open,
  onOpenChange,
  side = "right",
  width = "md",
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: Side;
  width?: Width;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          (side === "left" || side === "right") && WIDTH[width],
          className,
        )}
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <SheetFooter className="sticky bottom-0 border-t border-border bg-surface px-5 py-3">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
