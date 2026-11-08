import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type BottomNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

/**
 * MobileBottomNav — persistent iOS/Android-style bottom navigation bar.
 * Visible below `md`. Provide 3–5 primary destinations; more should live
 * behind a "More" sheet. Safe-area aware for notched devices.
 */
export function MobileBottomNav({
  items,
  className,
}: {
  items: BottomNavItem[];
  className?: string;
}) {
  const location = useLocation();
  const clamped = items.slice(0, 5);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-[var(--z-header)]",
        "border-t border-border bg-surface/85 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-surface/70",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      style={{ height: "calc(var(--commandbar-height) + env(safe-area-inset-bottom))" }}
    >
      <ul
        className="grid h-[var(--commandbar-height)] items-stretch"
        style={{ gridTemplateColumns: `repeat(${clamped.length}, minmax(0, 1fr))` }}
      >
        {clamped.map((item) => {
          const active =
            location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            // `to` alone is not guaranteed unique across nav entries, so key on
            // the label too rather than risk React dropping a tab.
            <li key={`${item.to}|${item.label}`} className="min-w-0">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 h-full w-full",
                  "text-[11px] font-medium transition-colors duration-150",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-transform duration-200",
                      active && "scale-110",
                    )}
                    aria-hidden="true"
                  />
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-[16px] h-4 grid place-items-center rounded-control bg-danger px-1 text-[11px] font-semibold text-danger-foreground animate-scale-in"
                      aria-label={`${item.badge} unread`}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full">{item.label}</span>
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-accent animate-fade-in"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
