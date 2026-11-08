/**
 * beforeinstallprompt capture + install-status helpers.
 * The BeforeInstallPromptEvent is stashed on window so any component can
 * request the browser install prompt.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __wacrmInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export const INSTALL_PROMPT_EVENT = "wacrm:install-prompt-available";
export const INSTALLED_EVENT = "wacrm:app-installed";

export function initInstallPromptCapture(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onPrompt = (e: Event) => {
    e.preventDefault();
    window.__wacrmInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  };
  const onInstalled = () => {
    window.__wacrmInstallPrompt = null;
    window.dispatchEvent(new Event(INSTALLED_EVENT));
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  );
}

export type DevicePlatform = "ios" | "android" | "desktop" | "unknown";

export function detectPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}
