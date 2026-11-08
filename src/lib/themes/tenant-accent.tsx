/**
 * Per-tenant accent color.
 *
 * Reads the active workspace's white-label `accent_color` (existing table,
 * existing server functions) and applies it to the live design tokens at
 * runtime. A preview accent can be pushed from settings so admins see the
 * change instantly before saving; clearing the preview restores the saved
 * value. Consumers that render brand-colored surfaces (commerce, Social
 * Studio, Digital Cards) read `useTenantAccent()` for the current value.
 *
 * The colour maths lives in `./accent-color` (pure, test-importable); it is
 * re-exported here so existing import sites keep working.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWhiteLabel } from '@/lib/white-label/white-label.functions';
import { applyThemeTokens } from '@/lib/themes/apply';
import { supabase } from '@/integrations/supabase/client';
import { useThemeRealtime } from '@/lib/themes/use-theme-realtime';
import { DEFAULT_ACCENT, accentTokens, accentForeground, isValidAccent } from '@/lib/themes/accent-color';
import { usePlatformBranding } from '@/hooks/use-platform-branding';
import { readActiveWorkspaceId, subscribeActiveTenant } from '@/lib/tenant/active-tenant';

export * from '@/lib/themes/accent-color';



type AccentContextValue = {
  /** Accent currently in effect (preview when previewing, otherwise saved). */
  accent: string;
  /** Accent persisted for the tenant, ignoring any live preview. */
  savedAccent: string;
  /** Readable foreground for `accent`. */
  foreground: string;
  isPreviewing: boolean;
  isCustom: boolean;
  isLoading: boolean;
  setPreviewAccent: (hex: string | null) => void;
};

const AccentContext = createContext<AccentContextValue | null>(null);

function useHasSession() {
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setHasSession(!!session));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return hasSession;
}

export function TenantAccentProvider({ children }: { children: ReactNode }) {
  const enabled = useHasSession();
  const [preview, setPreview] = useState<string | null>(null);

  // Scope the query on the active workspace, same as useTenantBrand. Without
  // this the key stayed a static ['white-label'] and the fetch always fell
  // back to the caller's *first* workspace membership server-side, so
  // switching workspaces could keep showing (and, worse, caching for up to
  // staleTime) the previous workspace's accent/primary colours instead of
  // the one actually being viewed.
  const workspaceId = useSyncExternalStore(
    subscribeActiveTenant,
    () => readActiveWorkspaceId(),
    () => null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['white-label', workspaceId],
    queryFn: () => getWhiteLabel({ data: { workspaceId } } as any),
    // Cache the resolved theme rather than dropping it on every remount.
    // With staleTime/gcTime at 0 the config was evicted whenever this
    // provider remounted (e.g. navigating into /admin and back), so the
    // accent/primary tokens reset to the shipped default and then flashed
    // to the real workspace colour once the refetch landed. Cross-tab /
    // cross-session freshness is still covered by `useThemeRealtime` below,
    // which invalidates this same query key the instant a branding row
    // changes, plus `refetchOnMount`/`refetchOnWindowFocus` refreshing it
    // in the background (placeholderData keeps the last-known value on
    // screen while that refetch is in flight, so there's nothing to flash).
    // Keying on workspaceId also means switching workspaces is a genuinely
    // different cache entry, not a stale one served past its staleTime.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    enabled,
    retry: false,
  });


  // Keep every open tab in sync when branding/theme rows change.
  useThemeRealtime((data as { workspaceId?: string | null } | undefined)?.workspaceId ?? null);

  const config = data?.config as Record<string, unknown> | undefined;
  const active = Boolean(config?.is_active);
  const stored = typeof config?.accent_color === 'string' ? config.accent_color : null;
  // Platform Settings → Branding accent is the platform-wide default; a
  // workspace white-label accent still overrides it.
  const branding = usePlatformBranding();
  const platformAccent = branding.accentColor;
  const platformDefault = isValidAccent(platformAccent) ? platformAccent.trim() : DEFAULT_ACCENT;
  const savedAccent = active && isValidAccent(stored) ? stored.trim() : platformDefault;

  // `--primary` precedence: workspace white-label primary → Platform Settings →
  // Branding primary → the live accent. Without this the accent tokens would
  // always clobber the platform primary colour.
  const wlPrimary = typeof config?.primary_color === 'string' ? config.primary_color : null;
  const primaryOverride =
    (active && isValidAccent(wlPrimary) ? wlPrimary.trim() : null) ??
    (isValidAccent(branding.primaryColor) ? branding.primaryColor.trim() : null);

  const accent = isValidAccent(preview) ? preview : savedAccent;
  const foreground = accentForeground(accent);

  // Tracks the active colour scheme so the AA-safe derivatives are computed
  // against the surface they actually render on.
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDark(el.classList.contains('dark'));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // Apply the accent to the live design tokens. `--accent-muted` and `--ring`
  // are derived from `--accent` in styles.css, so they follow automatically.
  // `--accent-strong` / `--accent-readable` / `--hero-accent` are recomputed
  // per accent so buttons, accent text and hero icons keep WCAG AA contrast.
  //
  // The token map is memoized on the resolved inputs and `applyThemeTokens`
  // skips properties whose value is unchanged, so re-renders that do not move
  // the accent/primary never touch `:root`.
  const tokens = useMemo(() => {
    const next = accentTokens(accent, isDark);
    if (primaryOverride) {
      next['--primary'] = primaryOverride;
      next['--primary-foreground'] = accentForeground(primaryOverride);
    }
    return next;
  }, [accent, isDark, primaryOverride]);

  useEffect(() => {
    applyThemeTokens(tokens);
  }, [tokens]);



  const setPreviewAccent = useCallback((hex: string | null) => {
    setPreview(hex && isValidAccent(hex) ? hex.trim() : null);
  }, []);

  const value = useMemo<AccentContextValue>(
    () => ({
      accent,
      savedAccent,
      foreground,
      isPreviewing: isValidAccent(preview) && preview !== savedAccent,
      isCustom: savedAccent !== DEFAULT_ACCENT,
      isLoading,
      setPreviewAccent,
    }),
    [accent, savedAccent, foreground, preview, isLoading, setPreviewAccent],
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useTenantAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (ctx) return ctx;
  // Safe fallback for trees rendered outside the provider (public pages).
  return {
    accent: DEFAULT_ACCENT,
    savedAccent: DEFAULT_ACCENT,
    foreground: accentForeground(DEFAULT_ACCENT),
    isPreviewing: false,
    isCustom: false,
    isLoading: false,
    setPreviewAccent: () => {},
  };
}
