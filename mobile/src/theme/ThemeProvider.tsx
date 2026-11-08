import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palette, paletteDark, radius, spacing, typography, controlHeight } from './tokens';
import { useAppStore } from '@/stores/appStore';

export type Theme = {
  colors: typeof palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  controlHeight: number;
  isDark: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const mode = useAppStore((s) => s.themeMode);
  const isDark = mode === 'dark' || (mode === 'system' && scheme === 'dark');
  const theme = useMemo<Theme>(
    () => ({
      colors: (isDark ? paletteDark : palette) as typeof palette,
      spacing,
      radius,
      typography,
      controlHeight,
      isDark,
    }),
    [isDark],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
