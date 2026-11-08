/**
 * Theme + brand utilities for public booking pages.
 */
import { useEffect, useState } from "react";

const THEME_KEY = "wacrm-booking-theme";

export function useBookingTheme(defaultTheme: "light" | "dark" = "light") {
  const [theme, setThemeState] = useState<"light" | "dark">(defaultTheme);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    const initial = stored ?? defaultTheme;
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, [defaultTheme]);

  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, t);
      document.documentElement.classList.toggle("dark", t === "dark");
    }
  };

  return { theme, setTheme, toggle: () => setTheme(theme === "light" ? "dark" : "light") };
}

/**
 * Apply a brand color as CSS variables so shadcn primary tokens follow it.
 * Uses a data attribute scope so the override does not leak globally.
 */
export function brandStyle(color?: string | null): React.CSSProperties {
  if (!color) return {};
  return {
    // Fallback custom tokens the booking pages read directly
    ["--brand" as string]: color,
    ["--brand-foreground" as string]: "#ffffff",
  } as React.CSSProperties;
}
