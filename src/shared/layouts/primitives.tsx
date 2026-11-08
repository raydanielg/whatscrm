import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout primitives — small, composable, token-only building blocks.
 * Every reusable layout in this folder is assembled from these.
 * Never hardcode widths, gutters, or heights outside of design tokens.
 */

type Div = HTMLAttributes<HTMLDivElement>;

/** Full-bleed viewport surface — sets background + min height respecting dvh. */
export function AppFrame({ className, children, ...rest }: Div & { children: ReactNode }) {
  return (
    <div className={cn("min-h-app bg-background text-foreground", className)} {...rest}>
      {children}
    </div>
  );
}

/** Centered container. Choose a max-width variant via `size`. */
export function Container({
  size = "app",
  className,
  children,
  ...rest
}: Div & { size?: "narrow" | "prose" | "page" | "app" | "dashboard" | "wide" | "fluid"; children: ReactNode }) {
  const map = {
    narrow: "container-narrow",
    prose: "container-prose",
    page: "container-page",
    app: "container-app",
    dashboard: "container-dashboard",
    wide: "container-wide",
    fluid: "container-fluid",
  } as const;
  return (
    <div className={cn(map[size], className)} {...rest}>
      {children}
    </div>
  );
}

/** Vertical section rhythm. */
export function Section({
  y = "md",
  as: As = "section",
  className,
  children,
  ...rest
}: Div & { y?: "sm" | "md" | "lg" | "xl" | "2xl"; as?: "section" | "div" | "article"; children: ReactNode }) {
  const map = { sm: "section-sm", md: "section-md", lg: "section-lg", xl: "section-xl", "2xl": "section-2xl" } as const;
  return (
    <As className={cn(map[y], className)} {...(rest as object)}>
      {children}
    </As>
  );
}

/** Two-pane list-detail. Mobile stacks to detail; use `panel="list"` prop when routing. */
export function ListDetail({ list, detail, className }: { list: ReactNode; detail: ReactNode; className?: string }) {
  return (
    <div className={cn("pane-list-detail min-h-content", className)}>
      <aside className="border-b border-border lg:border-b-0 lg:border-r overflow-y-auto">{list}</aside>
      <section className="overflow-y-auto min-w-0">{detail}</section>
    </div>
  );
}

/** Three-pane inbox — folders, list, reader. */
export function ThreePane({
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
    <div className={cn("pane-inbox min-h-content", className)}>
      <aside className="hidden md:flex flex-col border-r border-border overflow-y-auto">{nav}</aside>
      <aside className="flex flex-col border-r border-border overflow-y-auto min-w-0">{list}</aside>
      <section className="hidden xl:flex flex-col overflow-y-auto min-w-0">{reader}</section>
    </div>
  );
}

/** Canvas + inspector — for builders / automation. */
export function CanvasInspector({
  canvas,
  inspector,
  className,
}: {
  canvas: ReactNode;
  inspector: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pane-canvas-inspector min-h-content", className)}>
      <section className="overflow-hidden min-w-0 bg-surface-sunken">{canvas}</section>
      <aside className="border-t border-border lg:border-t-0 lg:border-l overflow-y-auto bg-surface">{inspector}</aside>
    </div>
  );
}

/** Sub-nav (left rail) + content — for Settings, Reports, Admin sub-modules. */
export function SubnavContent({
  subnav,
  children,
  className,
}: {
  subnav: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pane-subnav-content", className)}>
      <aside className="lg:sticky lg:top-[var(--header-height)] lg:self-start lg:max-h-[calc(100dvh-var(--header-height))] lg:overflow-y-auto py-6">
        {subnav}
      </aside>
      <div className="min-w-0 py-6">{children}</div>
    </div>
  );
}

/** Sticky bottom action bar — mobile-safe. */
export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("sticky-actionbar px-4 py-3 flex items-center justify-end gap-2", className)}>{children}</div>
  );
}

/** Filters / tab row beneath the app header. */
export function SubHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("sticky-subheader flex items-center gap-3 px-4 lg:px-6", className)}>{children}</div>
  );
}

/** Responsive metrics grid. */
export function MetricsGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid-metrics", className)}>{children}</div>;
}

/** 12-col bento grid — pair with `col-span-*`. */
export function Bento({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid-bento", className)}>{children}</div>;
}

/** Card grid — auto-fit at sm/md/lg minimums. */
export function CardGrid({
  size = "md",
  children,
  className,
}: {
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}) {
  const map = { sm: "grid-cards-sm", md: "grid-cards-md", lg: "grid-cards-lg" } as const;
  return <div className={cn(map[size], className)}>{children}</div>;
}

/** Split-screen — hero / detail with an image or media. */
export function SplitScreen({
  left,
  right,
  ratio = "1/1",
  className,
}: {
  left: ReactNode;
  right: ReactNode;
  ratio?: "1/1" | "3/2" | "2/3";
  className?: string;
}) {
  const cols =
    ratio === "1/1"
      ? "lg:grid-cols-2"
      : ratio === "3/2"
        ? "lg:grid-cols-[3fr_2fr]"
        : "lg:grid-cols-[2fr_3fr]";
  return (
    <div className={cn("grid grid-cols-1 min-h-app", cols, className)}>
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}
