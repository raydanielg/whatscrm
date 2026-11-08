/**
 * <Brand /> — renders the active brand name (workspace white-label, then
 * platform settings, then the shipped default). Use this instead of writing
 * the product name into JSX so white-label deployments never leak it.
 */
import { useBrandName } from "@/hooks/use-brand-name";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { useTheme } from "@/shared/providers/theme-provider";
import type { ReactNode } from "react";
import defaultLogo from "@/assets/wacrm-logo.png";

export function Brand({ children }: { children?: ReactNode }) {
  return (
    <>
      {useBrandName()}
      {children}
    </>
  );
}

/** Consistent typographic treatment for the brand name beside the logo mark. */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return <span className={`brand-wordmark ${className}`}>{useBrandName()}</span>;
}

/** Resolved workspace/platform logo with the shipped mark as the final fallback. */
export function PlatformLogo({ className = "", alt = "" }: { className?: string; alt?: string }) {
  const brand = usePlatformBranding();
  const { resolvedTheme } = useTheme();
  const src =
    resolvedTheme === "dark"
      ? (brand.logoDarkUrl ?? brand.logoUrl ?? defaultLogo)
      : (brand.logoUrl ?? brand.logoDarkUrl ?? defaultLogo);
  return <img src={src} alt={alt} className={className} />;
}
