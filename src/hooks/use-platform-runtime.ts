/**
 * usePlatformRuntime — operational platform settings (maintenance mode,
 * feature toggles, auth methods, security policy, localization defaults)
 * from Super Admin → Platform Settings. Public: works signed-out too.
 */
import { useQuery } from "@tanstack/react-query";
import {
  getPlatformRuntimeConfig,
  PLATFORM_RUNTIME_FALLBACK,
  type PlatformRuntimeConfig,
} from "@/lib/admin/platform-runtime.functions";
import { isFeatureEnabled, isRouteEnabled } from "@/lib/admin/platform-features";

export const PLATFORM_RUNTIME_QUERY_KEY = ["platform-runtime"] as const;

export function usePlatformRuntime(): { config: PlatformRuntimeConfig; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: PLATFORM_RUNTIME_QUERY_KEY,
    queryFn: () => getPlatformRuntimeConfig(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  return { config: data ?? PLATFORM_RUNTIME_FALLBACK, loading: isLoading };
}

/** Is a platform module (feature toggle) enabled? */
export function usePlatformFeature(key: string): boolean {
  const { config } = usePlatformRuntime();
  return isFeatureEnabled(config.features, key);
}

/** Is a route allowed by the current feature toggles? */
export function usePlatformRouteEnabled(path: string): boolean {
  const { config } = usePlatformRuntime();
  return isRouteEnabled(config.features, path);
}
