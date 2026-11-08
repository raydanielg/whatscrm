/**
 * useTenantBrand — reads the active workspace's white-label brand identity
 * (display name + logo) with a stable WACRM default. Internal keys, table
 * names, and workspace IDs are untouched; this is presentation only.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWhiteLabel } from "@/lib/white-label/white-label.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { readActiveWorkspaceId, subscribeActiveTenant } from "@/lib/tenant/active-tenant";
import { BRAND_NAME } from "@/lib/branding/brand";

const DEFAULT_BRAND_NAME = BRAND_NAME;
const DEFAULT_BRAND_INITIAL = BRAND_NAME.charAt(0).toUpperCase() || "W";

export type TenantSocials = {
  x: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  threads: string | null;
  youtube: string | null;
  linkedin: string | null;
  website: string | null;
};

export type TenantBrand = {
  name: string;
  initial: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  metaTitle: string | null;
  hasWorkspaceOverride: boolean;
  isCustom: boolean;
  socials: TenantSocials;
};

/** Turn a stored handle ("acme", "@acme" or a full URL) into a profile URL. */
export function socialUrl(platform: keyof TenantSocials, value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().replace(/^@/, "");
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const base: Record<keyof TenantSocials, string> = {
    x: "https://x.com/",
    instagram: "https://instagram.com/",
    facebook: "https://facebook.com/",
    tiktok: "https://tiktok.com/@",
    threads: "https://threads.net/@",
    youtube: "https://youtube.com/@",
    linkedin: "https://linkedin.com/",
    website: "https://",
  };
  return base[platform] + v;
}

function useHasSession() {
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return hasSession;
}

export function useTenantBrand(): TenantBrand {
  const enabled = useHasSession();
  const workspaceId = useSyncExternalStore(
    subscribeActiveTenant,
    () => readActiveWorkspaceId(),
    () => null,
  );
  const { data } = useQuery({
    queryKey: ["white-label", workspaceId],
    queryFn: () => getWhiteLabel({ data: { workspaceId } } as any),
    // Cache the resolved brand: with staleTime/gcTime at 0 the config was
    // dropped on every remount (e.g. entering /admin), so the UI fell back to
    // the shipped default name and leaked the vendor brand on white-label
    // deployments until the refetch landed.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    enabled,
    retry: false,
  });

  // Platform Settings → General/Branding supplies the platform-wide identity;
  // an active workspace white-label still overrides it.
  const platform = usePlatformBranding();

  const c: any = data?.config;
  const active = Boolean(c?.is_active);
  const name =
    (active && c?.brand_name?.trim()) || platform.platformName?.trim() || DEFAULT_BRAND_NAME;
  const initial = name.charAt(0).toUpperCase() || DEFAULT_BRAND_INITIAL;

  return {
    name,
    initial,
    logoUrl: (active ? c?.logo_url : null) ?? platform.logoUrl ?? null,
    logoDarkUrl:
      (active ? c?.logo_dark_url : null) ?? platform.logoDarkUrl ?? platform.logoUrl ?? null,
    faviconUrl: (active ? c?.favicon_url : null) ?? platform.faviconUrl ?? null,
    metaTitle: (active && c?.meta_title?.trim()) || null,
    hasWorkspaceOverride: active,
    socials: {
      x: c?.social_x ?? null,
      instagram: c?.social_instagram ?? null,
      facebook: c?.social_facebook ?? null,
      tiktok: c?.social_tiktok ?? null,
      threads: c?.social_threads ?? null,
      youtube: c?.social_youtube ?? null,
      linkedin: c?.social_linkedin ?? null,
      website: c?.social_website ?? null,
    },
    isCustom:
      (active && Boolean(c?.brand_name || c?.logo_url)) ||
      Boolean(platform.logoUrl) ||
      platform.platformName !== DEFAULT_BRAND_NAME,
  };
}
