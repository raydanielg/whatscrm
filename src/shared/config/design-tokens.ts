/**
 * WACRM Design Tokens — TypeScript mirror
 * ----------------------------------------------------------------------------
 * Consumed by charts, canvas/SVG, and JS-driven visuals. Values are the
 * CSS custom property names in `src/styles.css`; read them with
 * `getCssVar(name)` to get the runtime resolved value that flips with theme.
 *
 * NEVER hardcode hex/oklch values in components — reference these tokens.
 */

/* ── Colors ───────────────────────────────────────────────────────────────── */
export const colorTokens = {
  background: "--background",
  foreground: "--foreground",
  surface: "--surface",
  surfaceElevated: "--surface-elevated",
  surfaceSunken: "--surface-sunken",
  primary: "--primary",
  primaryGlow: "--primary-glow",
  primaryMuted: "--primary-muted",
  secondary: "--secondary",
  secondaryMuted: "--secondary-muted",
  accent: "--accent",
  accentMuted: "--accent-muted",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  border: "--border",
  borderStrong: "--border-strong",
  ring: "--ring",
} as const;

/**
 * Gradient + glow tokens. Every stop is derived in `src/styles.css` from the
 * live `--primary` / `--accent` / `--secondary` / `--surface*` values, so
 * tenant accent and white-label overrides propagate without extra JS.
 */
export const gradientTokens = {
  hero: "--gradient-hero",
  accent: "--gradient-accent",
  primary: "--gradient-primary",
  secondary: "--gradient-secondary",
  subtle: "--gradient-subtle",
  surface: "--gradient-surface",
  mesh: "--gradient-mesh",
  glow: "--gradient-glow",
} as const;

export const glowTokens = {
  primary: "--glow-primary",
  accent: "--glow-accent",
  secondary: "--glow-secondary",
} as const;



export const statusTokens = {
  success: "--success",
  successMuted: "--success-muted",
  warning: "--warning",
  warningMuted: "--warning-muted",
  danger: "--danger",
  dangerMuted: "--danger-muted",
  info: "--info",
  infoMuted: "--info-muted",
} as const;

export const presenceTokens = {
  online: "--status-online",
  away: "--status-away",
  busy: "--status-busy",
  offline: "--status-offline",
} as const;

export const neutralScale = [
  "--neutral-50", "--neutral-100", "--neutral-200", "--neutral-300",
  "--neutral-400", "--neutral-500", "--neutral-600", "--neutral-700",
  "--neutral-800", "--neutral-900", "--neutral-950",
] as const;

/**
 * Ordered chart color tokens. Use for series 1..8 in Recharts / ECharts /
 * D3, referencing via `var(chartColors[i])`.
 */
export const chartColors = [
  "--chart-1", "--chart-2", "--chart-3", "--chart-4",
  "--chart-5", "--chart-6", "--chart-7", "--chart-8",
] as const;

/* ── Typography ───────────────────────────────────────────────────────────── */
export const fontFamilies = {
  sans: "var(--font-sans)",
  display: "var(--font-display)",
  mono: "var(--font-mono)",
} as const;

export const textScale = {
  "2xs": "0.6875rem",
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
  "6xl": "3.75rem",
  "7xl": "4.5rem",
} as const;
export type TextSize = keyof typeof textScale;

/* ── Spacing (4 px base) ──────────────────────────────────────────────────── */
export const spacingScale = {
  0: "0",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
  32: "8rem",
} as const;

/* ── Radius ───────────────────────────────────────────────────────────────── */
export const radiusScale = {
  none: "0",
  xs: "calc(var(--radius) - 8px)",
  sm: "calc(var(--radius) - 6px)",
  md: "calc(var(--radius) - 4px)",
  lg: "var(--radius)",
  xl: "calc(var(--radius) + 4px)",
  "2xl": "calc(var(--radius) + 8px)",
  "3xl": "calc(var(--radius) + 16px)",
  full: "9999px",
} as const;

/* ── Shadows (elevation) ──────────────────────────────────────────────────── */
export const shadowScale = {
  xs: "var(--elevation-xs)",
  sm: "var(--elevation-sm)",
  md: "var(--elevation-md)",
  lg: "var(--elevation-lg)",
  xl: "var(--elevation-xl)",
  "2xl": "var(--elevation-2xl)",
  inner: "var(--elevation-inner)",
  glow: "var(--elevation-glow)",
  brand: "var(--elevation-brand)",
} as const;

/* ── Opacity ──────────────────────────────────────────────────────────────── */
export const opacityScale = {
  0: 0, 5: 0.05, 10: 0.1, 15: 0.15, 20: 0.2, 25: 0.25,
  30: 0.3, 40: 0.4, 50: 0.5, 60: 0.6, 70: 0.7,
  75: 0.75, 80: 0.8, 90: 0.9, 95: 0.95, 100: 1,
} as const;

/* ── Motion ───────────────────────────────────────────────────────────────── */
export const durations = {
  instant: 75,
  fast: 150,
  normal: 220,
  slow: 320,
  slower: 500,
  lazy: 800,
} as const;

export const easings = {
  linear: "linear",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  emphasized: "cubic-bezier(0.2, 0.9, 0.1, 1)",
  snappy: "cubic-bezier(0.32, 0.72, 0, 1)",
  spring: "cubic-bezier(0.5, 1.6, 0.4, 1)",
} as const;

/* ── Breakpoints ──────────────────────────────────────────────────────────── */
export const breakpoints = {
  xs: 384,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
  "3xl": 1920,
} as const;
export type Breakpoint = keyof typeof breakpoints;

/* ── Containers ───────────────────────────────────────────────────────────── */
export const containerSizes = {
  "3xs": "16rem",  "2xs": "18rem",  xs: "20rem",
  sm: "24rem",     md: "28rem",     lg: "32rem",
  xl: "36rem",     "2xl": "42rem",  "3xl": "48rem",
  "4xl": "56rem",  "5xl": "64rem",  "6xl": "72rem",
  "7xl": "80rem",  app: "90rem",    prose: "65ch",
} as const;

/* ── Component sizing ─────────────────────────────────────────────────────── */
export const iconSizes = {
  xs: 12, sm: 16, md: 20, lg: 24, xl: 32, "2xl": 40,
} as const;
export type IconSize = keyof typeof iconSizes;

export const buttonSizes = {
  xs: { height: 28, padX: 8,  text: "xs" as const, icon: "xs" as const },
  sm: { height: 32, padX: 12, text: "sm" as const, icon: "sm" as const },
  md: { height: 36, padX: 14, text: "sm" as const, icon: "sm" as const },
  lg: { height: 44, padX: 18, text: "base" as const, icon: "md" as const },
  xl: { height: 52, padX: 22, text: "lg" as const, icon: "md" as const },
} as const;
export type ButtonSize = keyof typeof buttonSizes;

export const inputSizes = {
  sm: { height: 32, padX: 10, text: "sm" as const },
  md: { height: 36, padX: 12, text: "sm" as const },
  lg: { height: 44, padX: 14, text: "base" as const },
  xl: { height: 52, padX: 16, text: "base" as const },
} as const;
export type InputSize = keyof typeof inputSizes;

/* ── Runtime helpers ──────────────────────────────────────────────────────── */

/** Reference a token as a CSS `var(...)` expression. */
export function tokenVar(name: string): string {
  return `var(${name})`;
}

/** Resolve a token to its current computed value (theme-aware). */
export function getCssVar(name: string, el: Element | null = typeof document !== "undefined" ? document.documentElement : null): string {
  if (!el) return "";
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Ordered chart palette as `var(--chart-N)` strings for direct chart usage. */
export const chartPalette: readonly string[] = chartColors.map(tokenVar);

/** Convenience map of status → var() for badges / dots. */
export const statusColor = {
  success: tokenVar(statusTokens.success),
  warning: tokenVar(statusTokens.warning),
  danger: tokenVar(statusTokens.danger),
  info: tokenVar(statusTokens.info),
} as const;
