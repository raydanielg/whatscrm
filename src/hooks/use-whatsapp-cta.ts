/**
 * useWhatsAppCta — resolves the platform's click-to-chat link (channel token,
 * prefilled message, fallback) for the current page. Works signed-out.
 */
import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { resolveWhatsAppCta, type ResolvedWhatsAppCta } from "@/lib/marketing/whatsapp-cta";

export function useWhatsAppCta(overrides?: { message?: string; label?: string }): ResolvedWhatsAppCta & {
  enabled: boolean;
} {
  const { config } = usePlatformRuntime();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cta = config.whatsappCta;

  return useMemo(() => {
    const resolved = resolveWhatsAppCta(
      {
        ...cta,
        ...(overrides?.message ? { message: overrides.message } : {}),
        ...(overrides?.label ? { label: overrides.label } : {}),
      },
      { site: cta.siteName, page: pathname },
    );
    return { ...resolved, enabled: cta.enabled };
  }, [cta, pathname, overrides?.message, overrides?.label]);
}
