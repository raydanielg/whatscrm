import * as React from "react";
import { Plus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type FabAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  shortcut?: string;
};

/**
 * FloatingActionButton — speed-dial FAB. Bottom-right on desktop,
 * bottom-right above the mobile bottom nav on mobile. Opens a stack of
 * secondary actions with staggered animation.
 */
export function FloatingActionButton({
  actions,
  primaryLabel = "Create",
  className,
}: {
  actions: FabAction[];
  primaryLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click / Esc
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={cn(
        "fixed z-[var(--z-drawer)]",
        "right-4 md:right-6",
        "bottom-[calc(var(--commandbar-height)+env(safe-area-inset-bottom)+1rem)] md:bottom-6",
        className,
      )}
    >
      {/* Stack of actions */}
      <ul
        className={cn(
          "flex flex-col items-end gap-2 mb-3 transition-all",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none translate-y-2",
        )}
        aria-hidden={!open}
      >
        {actions.map((action, i) => {
          const Icon = action.icon;
          const inner = (
            <>
              <span className="rounded-control bg-popover px-2.5 py-1 text-label-sm text-popover-foreground shadow-md border border-border">
                {action.label}
              </span>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-surface shadow-lg border border-border text-foreground group-hover:bg-muted group-hover:text-accent-foreground group-hover:border-border-strong transition-colors">
                <Icon className="h-4 w-4" />
              </span>
            </>
          );
          const style: React.CSSProperties = {
            animation: open ? `fade-in 0.25s var(--ease-emphasized) ${i * 40}ms both` : undefined,
          };
          return (
            <li key={action.id} className="group flex items-center" style={style}>
              {action.to ? (
                <Link to={action.to} className="flex items-center" onClick={() => setOpen(false)}>
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { action.onClick?.(); setOpen(false); }}
                  className="flex items-center"
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close quick actions" : primaryLabel}
        className={cn(
          "grid h-14 w-14 place-items-center rounded-full shadow-brand",
          "bg-gradient-accent text-accent-foreground",
          "transition-all duration-200 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open ? "rotate-45 scale-95" : "",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
}
