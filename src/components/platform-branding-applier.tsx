/**
 * PlatformBrandingApplier — applies Super Admin → Platform Settings to the
 * running app: favicon, the base `--primary` design token, and the document
 * language from Platform Settings → Localization.
 *
 * Per-workspace white-label still wins: `TenantAccentProvider` and the
 * white-label config are applied after this and override the same tokens.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { isRtlLanguage } from "@/lib/i18n/locale-data";
import { BRAND_NAME } from "@/lib/branding/brand";

export function PlatformBrandingApplier() {
  const brand = useTenantBrand();
  const platform = usePlatformBranding();
  const priorBrandName = useRef(BRAND_NAME);
  const location = useLocation();
  const { config } = usePlatformRuntime();
  const lang = config.localization.defaultLanguage;
  const rtlAuto = config.localization.rtlAuto;

  useEffect(() => {
    if (typeof document === "undefined" || !lang) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = rtlAuto && isRtlLanguage(lang) ? "rtl" : "ltr";
  }, [lang, rtlAuto]);

  // `--primary` / `--accent` are owned by TenantAccentProvider, which already
  // falls back to Platform Settings → Branding colours when the workspace has
  // no white-label override. Writing them here too would race with it.

  // theme-color follows the platform primary colour. The root route no longer
  // ships a fixed green, so an unbranded install gets the browser default
  // rather than a colour that contradicts the configured brand.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!platform.primaryColor) {
      meta?.remove();
      return;
    }
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    if (meta.content !== platform.primaryColor) meta.content = platform.primaryColor;
  }, [platform.primaryColor]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const href = brand.faviconUrl ?? "/favicon.png";
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = href;
      document.head.appendChild(link);
    } else {
      // TanStack's root head contains ICO and PNG fallbacks. Keep both entries
      // in sync so browser link-selection order cannot resurrect a stale icon.
      for (const link of links) {
        link.href = href;
        link.removeAttribute("type");
        link.removeAttribute("sizes");
      }
    }

    const applyDocumentBranding = () => {
      const escapedPrior = priorBrandName.current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedDefault = BRAND_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`${escapedDefault}|${escapedPrior}`, "g");
      if (brand.metaTitle) {
        if (document.title !== brand.metaTitle) document.title = brand.metaTitle;
      } else {
        // Route head metadata can be committed after parent effects during SPA
        // navigation. Replace both the shipped token and the prior resolved
        // brand whenever the router updates <title>.
        const next = document.title.replace(pattern, brand.name);
        if (next !== document.title) document.title = next;
      }

      // Keep route descriptions and social metadata aligned too, including
      // when a workspace supplies a custom meta title.
      for (const meta of document.head.querySelectorAll<HTMLMetaElement>("meta[content]")) {
        const content = meta.content.replace(pattern, brand.name);
        if (content !== meta.content) meta.content = content;
      }
      priorBrandName.current = brand.name;
    };

    applyDocumentBranding();
    const observer = new MutationObserver(applyDocumentBranding);
    observer.observe(document.head, {
      attributes: true,
      attributeFilter: ["content"],
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [brand.faviconUrl, brand.metaTitle, brand.name, location.pathname]);

  return null;
}
