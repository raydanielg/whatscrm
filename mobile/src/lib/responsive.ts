/**
 * Responsive hook — phone / tablet breakpoints.
 * Tablet = shortest side >= 600dp (matches Android + iPad heuristics).
 */
import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height);
  const bp: Breakpoint = shortest >= 600 ? 'tablet' : 'phone';
  const isTablet = bp === 'tablet';
  const isLandscape = width > height;
  const columns = isTablet ? (isLandscape ? 3 : 2) : 1;
  return { width, height, bp, isTablet, isLandscape, columns };
}

/** Pick a value per breakpoint. */
export function pick<T>(bp: Breakpoint, values: { phone: T; tablet: T }): T {
  return values[bp];
}
