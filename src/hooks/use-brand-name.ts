/**
 * useBrandName — the single source of truth for the brand name rendered in the
 * UI. Resolves the active workspace white-label name, then the platform-wide
 * name from Platform Settings, and only then the shipped default.
 *
 * Never hardcode "WACRM" in rendered copy — call this instead so white-label
 * deployments never leak the vendor brand.
 */
import { useTenantBrand } from "@/hooks/use-tenant-brand";

export function useBrandName(): string {
  return useTenantBrand().name;
}
