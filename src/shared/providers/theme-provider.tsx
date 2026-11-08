import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "light" | "dark" | "system";

export const DEFAULT_THEME: Theme = "system";
const THEME_STORAGE_KEY = "wacrm:theme";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  /** True until the stored preference has been loaded from the backend. */
  isLoading: boolean;
  setTheme: (t: Theme) => void;
  /** Restore the default appearance (system) and persist it. */
  resetTheme: () => void;
  /** Workspace fallback used only when the user has no saved preference. */
  setDefaultTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readCachedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readStoredTheme(): Theme {
  return readCachedTheme() ?? DEFAULT_THEME;
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

/**
 * Theme preference is stored per user in the backend (`user_theme_preferences`)
 * and cached locally so the correct palette can be applied before first paint.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [isLoading, setIsLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const hasUserPreferenceRef = useRef(false);
  const workspaceDefaultRef = useRef<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setSystemDark(systemPrefersDark());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Load the persisted preference for the signed-in user, and follow auth changes.
  useEffect(() => {
    let cancelled = false;

    const load = async (userId: string | null) => {
      userIdRef.current = userId;
      if (!userId) {
        if (!cancelled) {
          setThemeState(readStoredTheme());
          setIsLoading(false);
        }
        return;
      }
      const { data } = await (supabase as any)
        .from("user_theme_preferences")
        .select("theme_mode")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      // The local value is applied by the inline bootstrap before first paint
      // and records the most recent choice made on this device. Prefer it over
      // a backend value that may still be stale when the page is reloaded
      // immediately after changing theme. The backend remains the initializer
      // for browsers that do not have a local preference yet.
      const cachedTheme = readCachedTheme();
      // Older builds cached the implicit "system" default. Treat that cache
      // entry as a default when there is no saved user preference.
      hasUserPreferenceRef.current = isTheme(data?.theme_mode) || (cachedTheme !== null && cachedTheme !== DEFAULT_THEME);
      const persistedTheme =
        hasUserPreferenceRef.current
          ? cachedTheme ?? data?.theme_mode
          : workspaceDefaultRef.current;
      setThemeState(persistedTheme);
      if (hasUserPreferenceRef.current) storeTheme(persistedTheme);
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => load(data.session?.user?.id ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void load(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("light", resolvedTheme === "light");
    root.dataset.theme = resolvedTheme;
    root.dataset.colorMode = theme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, theme]);

  const persist = useCallback((t: Theme) => {
    hasUserPreferenceRef.current = true;
    setThemeState(t);
    storeTheme(t);
    const userId = userIdRef.current;
    if (!userId) return;
    void (supabase as any)
      .from("user_theme_preferences")
      .upsert({ user_id: userId, theme_mode: t }, { onConflict: "user_id" });
  }, []);

  const setDefaultTheme = useCallback((t: Theme) => {
    workspaceDefaultRef.current = t;
    if (!hasUserPreferenceRef.current) setThemeState(t);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      isLoading,
      setTheme: persist,
      resetTheme: () => persist(DEFAULT_THEME),
      setDefaultTheme,
    }),
    [theme, resolvedTheme, isLoading, persist, setDefaultTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Safe fallback for trees rendered outside ThemeProvider (e.g. SSR of
  // marketing routes before the provider hydrates). Prevents a crash and
  // lets the client re-render pick up the real context.
  return {
    theme: DEFAULT_THEME,
    resolvedTheme: "light",
    isLoading: false,
    setTheme: () => {},
    resetTheme: () => {},
    setDefaultTheme: () => {},
  };
}
