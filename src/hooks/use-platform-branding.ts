/**
 * usePlatformBranding — platform-wide identity from Super Admin → Platform
 * Settings (General + Branding). Available on every page, signed in or not,
 * and used as the fallback beneath per-workspace white-label values.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  getPlatformBranding,
  PLATFORM_BRANDING_FALLBACK,
  type PlatformBranding,
} from "@/lib/admin/platform-branding.functions";

export const PLATFORM_BRANDING_QUERY_KEY = ["platform-branding"] as const;

export function platformBrandingQueryOptions() {
  return queryOptions({
    queryKey: PLATFORM_BRANDING_QUERY_KEY,
    queryFn: () => getPlatformBranding(),
    staleTime: 60_000,
    retry: false,
  });
}

export function usePlatformBranding(): PlatformBranding {
  const { data } = useQuery(platformBrandingQueryOptions());
  return data ?? PLATFORM_BRANDING_FALLBACK;
}
