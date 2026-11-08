/** Apply the selected workspace theme and white-label overrides in the authenticated app. */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { getActiveTheme } from '@/lib/themes/themes.functions';
import { getWhiteLabel } from '@/lib/white-label/white-label.functions';
import { setThemeTokenLayer } from '@/lib/themes/apply';
import { accentForeground, accentTokens, isValidAccent } from '@/lib/themes/accent-color';
import { useTenantAccent } from '@/lib/themes/tenant-accent';
import { useTheme } from '@/shared/providers/theme-provider';
import { readActiveWorkspaceId, subscribeActiveTenant } from '@/lib/tenant/active-tenant';

const CSS_ID = 'wacrm-white-label-css';
const JS_ID = 'wacrm-white-label-js';
type ThemeInstallation = {
  themes?: { tokens?: Record<string, string> } | null;
  overrides?: Record<string, string> | null;
};
// The white-label table contains optional strings, booleans, and numbers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThemeConfig = Record<string, any>;

function cssColor(value: string): string {
  const trimmed = value.trim();
  return /^\d{1,3}(?:\.\d+)?\s+\d{1,3}%\s+\d{1,3}%$/.test(trimmed)
    ? `hsl(${trimmed})`
    : trimmed;
}

function readableTextOn(color: string): string | null {
  const hex = color.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const luminance = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  return luminance > 0.179 ? '#111827' : '#ffffff';
}

export function ThemeApplier() {
  const workspaceId = useSyncExternalStore(subscribeActiveTenant, readActiveWorkspaceId, () => null);
  const { accent, isPreviewing } = useTenantAccent();
  const { resolvedTheme, setDefaultTheme } = useTheme();
  const { data: theme } = useQuery({
    queryKey: ['active-theme', workspaceId],
    queryFn: () => getActiveTheme({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
    refetchOnMount: 'always',
  });
  const { data: wl } = useQuery({
    queryKey: ['white-label', workspaceId],
    queryFn: () => getWhiteLabel({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
    refetchOnMount: 'always',
  });

  useEffect(() => {
    const installation = (theme?.workspaceId === workspaceId ? theme.installation : null) as ThemeInstallation | null;
    const c = (wl?.workspaceId === workspaceId ? wl.config : null) as ThemeConfig | null;
    const active = Boolean(c?.is_active);
    const colorMode = active && (c?.default_color_mode === 'light' || c?.default_color_mode === 'dark')
      ? c.default_color_mode
      : 'system';
    setDefaultTheme(colorMode);
    const tokens: Record<string, string> = {
      ...(installation?.themes?.tokens ?? {}),
      ...(installation?.overrides ?? {}),
    };

    // Accent preview and the saved workspace accent take precedence over a
    // marketplace palette. The base layer retains the platform fallback.
    if (isPreviewing || (active && isValidAccent(c?.accent_color))) {
      Object.assign(tokens, accentTokens(accent, resolvedTheme === 'dark'));
    }

    if (active && c) {
      if (c.primary_color) {
        tokens['--primary'] = cssColor(c.primary_color);
        if (isValidAccent(c.primary_color)) tokens['--primary-foreground'] = accentForeground(c.primary_color);
      }
      if (c.secondary_color) tokens['--secondary'] = cssColor(c.secondary_color);
      if (c.accent_color && !isPreviewing) tokens['--accent'] = cssColor(c.accent_color);
      if (c.background_color) tokens['--background'] = cssColor(c.background_color);
      if (c.foreground_color) tokens['--foreground'] = cssColor(c.foreground_color);
      else if (c.background_color) {
        const foreground = readableTextOn(c.background_color);
        if (foreground) tokens['--foreground'] = foreground;
      }
      if (c.border_color) tokens['--border'] = cssColor(c.border_color);
      if (c.sidebar_background) tokens['--sidebar'] = cssColor(c.sidebar_background);
      if (c.sidebar_foreground) tokens['--sidebar-foreground'] = cssColor(c.sidebar_foreground);
      else if (c.sidebar_background) {
        const foreground = readableTextOn(c.sidebar_background);
        if (foreground) tokens['--sidebar-foreground'] = foreground;
      }
      if (c.sidebar_accent) tokens['--sidebar-accent'] = cssColor(c.sidebar_accent);
      if (c.sidebar_border) tokens['--sidebar-border'] = cssColor(c.sidebar_border);
      else if (c.sidebar_background && c.sidebar_foreground) {
        tokens['--sidebar-border'] = `color-mix(in srgb, ${cssColor(c.sidebar_foreground)} 15%, ${cssColor(c.sidebar_background)})`;
      }
      if (c.sidebar_accent) tokens['--sidebar-accent-foreground'] = readableTextOn(c.sidebar_accent)
        ?? (c.sidebar_foreground ? cssColor(c.sidebar_foreground) : readableTextOn(c.sidebar_background || '') ?? '#ffffff');
      else if (c.sidebar_foreground || c.sidebar_background) tokens['--sidebar-accent-foreground'] = c.sidebar_foreground
        ? cssColor(c.sidebar_foreground) : readableTextOn(c.sidebar_background) ?? '#ffffff';
      if (c.dashboard_background) tokens['--dashboard-background'] = cssColor(c.dashboard_background);
      if (c.dashboard_accent) tokens['--dashboard-accent'] = cssColor(c.dashboard_accent);
      if (c.font_family_sans) tokens['--font-sans'] = c.font_family_sans;
      if (c.font_family_heading) {
        tokens['--font-heading'] = c.font_family_heading;
        tokens['--font-display'] = c.font_family_heading;
      }
      if (c.font_family_mono) tokens['--font-mono'] = c.font_family_mono;
      if (c.font_size_base) tokens['--font-size-base'] = c.font_size_base;
      if (c.border_radius) tokens['--radius'] = c.border_radius;
      if (c.icon_stroke_width != null) tokens['--icon-stroke'] = String(c.icon_stroke_width);
      if (resolvedTheme === 'dark') {
        if (c.dark_primary_color) {
          tokens['--primary'] = cssColor(c.dark_primary_color);
          if (isValidAccent(c.dark_primary_color)) tokens['--primary-foreground'] = accentForeground(c.dark_primary_color);
        }
        if (c.dark_background_color) tokens['--background'] = cssColor(c.dark_background_color);
        if (c.dark_accent_color && !isPreviewing) tokens['--accent'] = cssColor(c.dark_accent_color);
      }
    }

    setThemeTokenLayer('workspace', tokens);
    document.getElementById(CSS_ID)?.remove();
    document.getElementById(JS_ID)?.remove();
    if (active && typeof c?.icon_style === 'string') document.documentElement.setAttribute('data-icon-style', c.icon_style);
    else document.documentElement.removeAttribute('data-icon-style');
  }, [theme, wl, workspaceId, accent, isPreviewing, resolvedTheme, setDefaultTheme]);

  useEffect(() => () => {
    setThemeTokenLayer('workspace', null);
    document.getElementById(CSS_ID)?.remove();
    document.getElementById(JS_ID)?.remove();
    document.documentElement.removeAttribute('data-icon-style');
    setDefaultTheme('system');
  }, [setDefaultTheme]);

  return null;
}
