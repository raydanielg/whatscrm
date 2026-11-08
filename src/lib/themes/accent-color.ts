/**
 * Pure accent colour maths — no React, no Supabase, no browser globals.
 *
 * Extracted from `tenant-accent.tsx` so both the runtime provider and the
 * Playwright gradient/contrast suites derive tenant tokens from the exact
 * same source of truth.
 */

export const DEFAULT_ACCENT = '#25D366';

export type AccentPreset = { label: string; value: string };

/** Curated accents offered in pickers across the app. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { label: 'Brand', value: DEFAULT_ACCENT },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Emerald', value: '#22c55e' },
  { label: 'Amber', value: '#f97316' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Slate', value: '#303030' },
];


/**
 * Accents verified against `evaluateAccentContrast()` — each one clears
 * AA text contrast on the filled surface (>= 4.5:1) and the 3:1 non-text
 * threshold on both the light and dark app surfaces, so they can always
 * be saved without tripping the accessibility guard.
 */
export const ACCESSIBLE_ACCENT_PRESETS: AccentPreset[] = [
  { label: 'Royal', value: '#2563eb' },
  { label: 'Ocean', value: '#0369a1' },
  { label: 'Aqua', value: '#0e7490' },
  { label: 'Teal', value: '#0f766e' },
  { label: 'Jade', value: '#047857' },
  { label: 'Forest', value: '#15803d' },
  { label: 'Moss', value: '#4d7c0f' },
  { label: 'Bronze', value: '#a16207' },
  { label: 'Copper', value: '#b45309' },
  { label: 'Rust', value: '#c2410c' },
  { label: 'Crimson', value: '#be123c' },
  { label: 'Coral', value: '#e11d48' },
  { label: 'Magenta', value: '#a21caf' },
  { label: 'Fuchsia', value: '#c026d3' },
];



const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidAccent(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEX.test(value.trim());
}

function expand(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = expand(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two hex colours (1 – 21). */
export function contrastRatio(a: string, b: string): number {
  if (!isValidAccent(a) || !isValidAccent(b)) return 1;
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Foreground colour that sits on an accent fill. **Always white.**
 *
 * This used to pick whichever of white / near-black (`#0b1220`) measured higher
 * against the accent, so a mid-tone brand colour flipped the text to near-black
 * (e.g. `#f97316`: white 2.80:1 vs near-black 7.49:1). That made the runtime
 * disagree with `styles.css`, where `--accent-foreground` and
 * `--primary-foreground` are both `oklch(1 0 0)` in the light and dark blocks —
 * the static theme promised white and the tenant theming could override it.
 *
 * Contrast is now kept by moving the *fill* instead of the text: `accentStrong()`
 * calls `readableAgainst(hex, accentForeground(hex))`, which darkens the accent
 * until white clears its target. That is what `--accent-strong`'s own comment in
 * `styles.css` already described — "solid fills that carry white text (>= 4.5:1)".
 *
 * The trade-off, stated plainly: a very light brand accent (yellow, lime, cyan)
 * now renders its filled controls noticeably darker than the raw brand swatch,
 * because darkening the fill is the only way white text stays readable on it.
 * `evaluateAccentContrast()` measures this same white, so the Super Admin
 * contrast report keeps describing what actually paints.
 *
 * `hex` is still accepted so the call sites — and `accentStrong()`, which asks
 * "what will sit on this fill?" — read unchanged, and so this decision stays in
 * exactly one place.
 */
export function accentForeground(hex?: string): string {
  void hex;
  return '#ffffff';
}


export type AccentContrastIssue = {
  id: 'on-accent' | 'on-light' | 'on-dark';
  label: string;
  ratio: number;
  required: number;
  severity: 'fail' | 'warn';
};

export type AccentContrastReport = {
  valid: boolean;
  /** Text/icon contrast of the auto-picked foreground on the accent fill. */
  onAccent: number;
  /** Accent used as text/icon colour on the light app surface. */
  onLight: number;
  /** Same, on the dark app surface. */
  onDark: number;
  issues: AccentContrastIssue[];
  /** True when nothing falls below the hard minimums — safe to save. */
  safe: boolean;
};

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#0a0a0a';

/**
 * Accessibility check for a candidate accent. Filled surfaces must clear
 * WCAG AA for body text (4.5:1); accent-as-text on the app surfaces must
 * clear the 3:1 non-text/large-text threshold. Anything below is a hard
 * fail and blocks saving; borderline values surface as warnings.
 *
 * The two surface checks measure the derived `--accent-readable` variants —
 * the colours the app actually paints text and icons with — not the raw
 * brand accent, which is only ever used as a fill.
 */
export function evaluateAccentContrast(hex: string): AccentContrastReport {
  if (!isValidAccent(hex)) {
    return { valid: false, onAccent: 1, onLight: 1, onDark: 1, issues: [], safe: false };
  }
  const value = hex.trim();
  // Filled controls render the derived strong surface, not the uncorrected
  // brand swatch. Measure that exact surface/foreground pair so a bright but
  // valid brand colour is not rejected even though the UI auto-corrects it.
  const strong = accentStrong(value);
  const onAccent = contrastRatio(strong, accentForeground(strong));
  const onLight = contrastRatio(accentReadable(value, false), LIGHT_SURFACE);
  const onDark = contrastRatio(accentReadable(value, true), DARK_SURFACE);


  const issues: AccentContrastIssue[] = [];
  const check = (
    id: AccentContrastIssue['id'],
    label: string,
    ratio: number,
    required: number,
    warnBelow: number,
  ) => {
    if (ratio < required) issues.push({ id, label, ratio, required, severity: 'fail' });
    else if (ratio < warnBelow) issues.push({ id, label, ratio, required: warnBelow, severity: 'warn' });
  };

  // Warnings only fire just above the hard minimum (15% headroom) — the app
  // paints AA-corrected variants, so demanding AAA (7:1) flagged practically
  // every usable brand colour as "tight".
  check('on-accent', 'Text on accent buttons and badges', onAccent, 4.5, 4.5 * 1.1);
  check('on-light', 'Accent text and icons on light backgrounds', onLight, 3, 3 * 1.1);
  check('on-dark', 'Accent text and icons on dark backgrounds', onDark, 3, 3 * 1.1);

  return {
    valid: true,
    onAccent,
    onLight,
    onDark,
    issues,
    safe: !issues.some((i) => i.severity === 'fail'),
  };
}

/**
 * Human-readable explanation of every failing pairing, including the measured
 * ratio, the required minimum and the shortfall. Used for the save error so
 * admins know exactly which surface is unreadable and by how much.
 */
export function describeAccentFailures(report: AccentContrastReport): string[] {
  if (!report.valid) return [`Enter a valid hex colour, e.g. ${DEFAULT_ACCENT}.`];
  return report.issues
    .filter((i) => i.severity === 'fail')
    .map(
      (i) =>
        `${i.label}: ${i.ratio.toFixed(2)}:1 — needs ${i.required.toFixed(1)}:1 (short by ${(i.required - i.ratio).toFixed(2)})`,
    );
}

/* ------------------------------------------------------------------ *
 * Automatic accessible pairings
 * ------------------------------------------------------------------ */

function toHsl(hex: string): { h: number; s: number; l: number } {
  const [r255, g255, b255] = expand(hex);
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function toHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = (
    [
      [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ] as const
  )[seg];
  const px = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${px(r)}${px(g)}${px(b)}`;
}

export type AccentSuggestion = {
  /** The suggested accent hex. */
  value: string;
  /** Foreground (text/icon) colour that pairs with it on filled surfaces. */
  foreground: string;
  /** Plain-language relation to the colour the admin picked. */
  relation: 'darker' | 'lighter' | 'richer' | 'softer';
  label: string;
  report: AccentContrastReport;
};

/**
 * Suggests the closest accessible accents to a failing colour, keeping the
 * admin's hue so the brand still reads as theirs. Walks lightness away from
 * the chosen value in both directions, then tries saturation nudges, and
 * returns the nearest passing candidates (no warnings, not just no failures).
 */
export function suggestAccentPairings(hex: string, limit = 4): AccentSuggestion[] {
  if (!isValidAccent(hex)) return [];
  const base = toHsl(hex.trim());
  const seen = new Set([hex.trim().toLowerCase()]);
  type Scored = AccentSuggestion & { distance: number; clean: boolean };
  const found: Scored[] = [];

  const consider = (
    candidate: string,
    relation: AccentSuggestion['relation'],
    label: string,
    distance: number,
  ) => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    const report = evaluateAccentContrast(candidate);
    // Never suggest something that would itself be blocked from saving.
    if (!report.safe) return;
    seen.add(key);
    found.push({
      value: candidate,
      foreground: accentForeground(candidate),
      relation,
      label,
      report,
      distance,
      clean: report.issues.length === 0,
    });
  };

  for (let step = 2; step <= 60; step += 2) {
    const d = step / 100;
    consider(toHex(base.h, base.s, Math.max(0.04, base.l - d)), 'darker', 'Darker shade, same hue', step);
    consider(toHex(base.h, base.s, Math.min(0.96, base.l + d)), 'lighter', 'Lighter shade, same hue', step);
  }
  for (let step = 5; step <= 40; step += 5) {
    const d = step / 100;
    consider(toHex(base.h, Math.min(1, base.s + d), Math.max(0.04, base.l - d / 2)), 'richer', 'More saturated, same hue', 60 + step);
    consider(toHex(base.h, Math.max(0, base.s - d), Math.max(0.04, base.l - d / 2)), 'softer', 'Muted, same hue', 60 + step);
  }

  // Prefer candidates with zero warnings, then the closest to the original.
  const strip = (list: Scored[]) => list.map(({ distance: _d, clean: _c, ...s }) => s);
  const sorted = found.sort((a, b) => Number(b.clean) - Number(a.clean) || a.distance - b.distance);
  if (sorted.length) return strip(sorted.slice(0, limit));

  // Nothing in this hue works (e.g. pure yellow); fall back to verified presets.
  return ACCESSIBLE_ACCENT_PRESETS.map((p) => ({ preset: p, report: evaluateAccentContrast(p.value) }))
    .filter(({ report }) => report.safe)
    .slice(0, limit)
    .map(({ preset, report }) => ({
      value: preset.value,
      foreground: accentForeground(preset.value),
      relation: 'softer' as const,
      label: `${preset.label} — verified alternative`,
      report,
    }));
}

/* ------------------------------------------------------------------ *
 * AA-safe accent derivatives
 *
 * The raw tenant accent is a brand colour, not a guaranteed-readable one.
 * These helpers walk lightness (hue + saturation preserved) until the pair
 * clears the requested ratio, so filled buttons, accent text and accent
 * icons on the dark hero gradient stay readable for ANY tenant accent.
 * ------------------------------------------------------------------ */

/** Nudges `hex` lighter/darker (same hue) until it clears `target` against `against`. */
export function readableAgainst(hex: string, against: string, target = 4.5): string {
  if (!isValidAccent(hex)) return hex;
  const base = toHsl(hex.trim());
  if (contrastRatio(hex.trim(), against) >= target) return hex.trim();
  // Move away from the surface: darken on light surfaces, lighten on dark ones.
  const towardsDark = luminance(against) > 0.5;
  for (let step = 2; step <= 96; step += 2) {
    const l = towardsDark
      ? Math.max(0.02, base.l - step / 100)
      : Math.min(0.98, base.l + step / 100);
    const candidate = toHex(base.h, base.s, l);
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return towardsDark ? '#000000' : '#ffffff';
}

/** Accent variant used as a solid fill behind `accentForeground()` text. */
export function accentStrong(hex: string, target = 4.6): string {
  if (!isValidAccent(hex)) return hex;
  return readableAgainst(hex, accentForeground(hex), target);
}

/** Accent variant used AS text/icon colour on an app surface. */
export function accentReadable(hex: string, dark: boolean, target = 4.5): string {
  return readableAgainst(hex, dark ? DARK_SURFACE : LIGHT_SURFACE, target);
}

/** Dark base the hero gradient is mixed into (mirrors `--hero-base`). */
const HERO_BASE = '#12211c';

function mixHex(a: string, b: string, weight: number): string {
  const [r1, g1, b1] = expand(a);
  const [r2, g2, b2] = expand(b);
  const px = (x: number, y: number) =>
    Math.round(x * weight + y * (1 - weight)).toString(16).padStart(2, '0');
  return `#${px(r1, r2)}${px(g1, g2)}${px(b1, b2)}`;
}

/**
 * Accent variant that stays legible on the hero gradient. The lightest stop
 * of that gradient is the accent mixed into `--hero-base`, so the check is
 * run against that computed stop rather than a fixed colour.
 */
export function heroAccent(hex: string, target = 5.5): string {
  if (!isValidAccent(hex)) return hex;
  const lightestStop = mixHex(hex.trim(), HERO_BASE, 0.36);
  return readableAgainst(hex, lightestStop, target);
}


/** A translucent tint of the accent, safe for badges and soft backgrounds. */
export function accentTint(hex: string, alpha = 0.12): string {
  if (!isValidAccent(hex)) return `rgba(14, 165, 233, ${alpha})`;
  const [r, g, b] = expand(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The full set of design tokens the app applies for a tenant accent.
 * `TenantAccentProvider` writes exactly these; the Playwright accent matrix
 * replays them in the browser so tests exercise real tenant theming.
 */
export function accentTokens(accent: string, isDark: boolean): Record<string, string> {
  const value = isValidAccent(accent) ? accent.trim() : DEFAULT_ACCENT;
  const strong = accentStrong(value);
  const foreground = accentForeground(strong);
  return {
    '--accent': value,
    '--accent-foreground': foreground,
    '--primary': strong,
    '--primary-foreground': foreground,
    '--accent-strong': strong,
    '--accent-readable': accentReadable(value, isDark),
    '--hero-accent': heroAccent(value),
  };
}

