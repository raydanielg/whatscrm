/**
 * Design tokens — mirrors the web app's semantic tokens.
 * Primary #075E54, Inter font, 9px control height on web → 36pt on mobile.
 */
export const palette = {
  primary: '#075E54',
  primaryFg: '#FFFFFF',
  background: '#FFFFFF',
  foreground: '#0A0A0A',
  muted: '#F5F5F5',
  mutedFg: '#6B6B6B',
  border: '#E5E5E5',
  card: '#FFFFFF',
  destructive: '#DC2626',
  success: '#16A34A',
  warning: '#EAB308',
} as const;

export const paletteDark = {
  primary: '#075E54',
  primaryFg: '#FFFFFF',
  background: '#0A0A0A',
  foreground: '#FAFAFA',
  muted: '#1A1A1A',
  mutedFg: '#A1A1AA',
  border: '#262626',
  card: '#141414',
  destructive: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, full: 999 } as const;
export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
};
export const controlHeight = 44; // native tap target
