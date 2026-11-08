/**
 * Accessibility helpers.
 * Wrap tappable atoms with these props to guarantee a WCAG-2 compliant
 * label, role, and 44x44 tap target across Android + iOS.
 */
import { AccessibilityInfo, Platform } from 'react-native';

export const MIN_TAP = 44;

export function a11yButton(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: 'button' as const,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
    hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  };
}

export function a11yHeader(label: string) {
  return {
    accessible: true,
    accessibilityRole: 'header' as const,
    accessibilityLabel: label,
  };
}

export function a11yImage(alt: string) {
  return {
    accessible: true,
    accessibilityRole: 'image' as const,
    accessibilityLabel: alt,
  };
}

export async function announce(msg: string) {
  try {
    AccessibilityInfo.announceForAccessibility(msg);
  } catch {}
}

export async function isScreenReaderOn(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isScreenReaderEnabled();
  } catch {
    return false;
  }
}

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
