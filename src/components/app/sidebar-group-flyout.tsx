import { useEffect, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type SidebarFlyoutItem = {
  to: string;
  label: string;
  icon: IconType;
  active: boolean;
  badge?: number | string;
  external?: boolean;
  hash?: string;
};

export type SidebarFlyoutSection = {
  label?: string;
  items: SidebarFlyoutItem[];
};

export function SidebarGroupFlyout({
  label,
  icon: GroupIcon,
  active,
  sections,
  onNavigate,
  testId,
}: {
  label: string;
  icon: IconType;
  active: boolean;
  sections: SidebarFlyoutSection[];
  onNavigate?: () => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const supportsHover = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const openFromHover = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !supportsHover()) return;
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !supportsHover()) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 320);
  };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label} menu`}
          className={cn(
            "relative mx-auto grid h-10 w-10 place-items-center rounded-control text-sidebar-foreground/70 transition-colors",
            "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
          )}
          data-testid={testId}
          onPointerEnter={openFromHover}
          onPointerLeave={scheduleClose}
        >
          {active ? (
            <span
              className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent"
              aria-hidden
            />
          ) : null}
          <GroupIcon className={cn("size-5", active && "text-accent")} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={6}
        className="w-56 max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height))]"
        onPointerEnter={openFromHover}
        onPointerLeave={scheduleClose}
        onCloseAutoFocus={cancelClose}
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[13px] font-semibold text-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sections.map((section, sectionIndex) => (
          <div key={`${section.label ?? "items"}-${sectionIndex}`}>
            {sectionIndex > 0 ? <DropdownMenuSeparator /> : null}
            {section.label ? (
              <DropdownMenuLabel className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </DropdownMenuLabel>
            ) : null}
            {section.items.map((item) => {
              const ItemIcon = item.icon;
              const content = (
                <>
                  <ItemIcon
                    className={cn("size-4 shrink-0", item.active && "text-accent")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              );
              return (
                <DropdownMenuItem
                  key={`${item.to}:${item.hash ?? ""}`}
                  asChild
                  className={cn(
                    "min-h-8 gap-2 py-1.5 text-sm",
                    item.active && "bg-muted font-medium",
                  )}
                  onSelect={onNavigate}
                >
                  {item.external ? (
                    <a href={item.to} target="_blank" rel="noopener noreferrer">
                      {content}
                    </a>
                  ) : (
                    <Link
                      to={item.to}
                      hash={item.hash}
                      aria-current={item.active ? "page" : undefined}
                    >
                      {content}
                    </Link>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
