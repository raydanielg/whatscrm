/**
 * Dynamic Web App Manifest — reads PWA settings from public.settings and
 * renders the manifest JSON. Admin uploads (icon, splash, name, colors)
 * immediately flow into the installable manifest.
 */
import { createFileRoute } from "@tanstack/react-router";

import { getPlatformBranding } from "@/lib/admin/platform-branding.functions";
import { BRAND_NAME } from "@/lib/branding/brand";

type Icon = { src: string; sizes: string; type?: string; purpose?: string };
type PwaSettings = {
  name?: string;
  short_name?: string;
  description?: string;
  theme_color?: string;
  background_color?: string;
  start_url?: string;
  scope?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  orientation?: "any" | "portrait" | "landscape";
  icon_url?: string | null;
  icon_512_url?: string | null;
  splash_icon_url?: string | null;
  shortcut_icon_url?: string | null;
};

const DEFAULTS: Required<
  Omit<PwaSettings, "icon_url" | "icon_512_url" | "splash_icon_url" | "shortcut_icon_url">
> = {
  name: BRAND_NAME,
  short_name: BRAND_NAME,
  description: "The AI-Powered WhatsApp CRM Platform",
  theme_color: "#075E54",
  background_color: "#ffffff",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
};

function absoluteUrl(origin: string, url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const Route = createFileRoute("/api/public/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const branding = await getPlatformBranding();
        let cfg: PwaSettings = {};
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const { data } = await supabaseAdmin
            .from("settings")
            .select("value")
            .eq("scope", "platform")
            .eq("key", "pwa")
            .maybeSingle();
          if (data?.value && typeof data.value === "object") {
            cfg = data.value as PwaSettings;
          }
        } catch {
          /* fall back to defaults */
        }

        const merged = {
          ...DEFAULTS,
          name: branding.platformName,
          short_name: branding.platformName,
          ...cfg,
        };
        const iconAny = cfg.icon_url || branding.faviconUrl || "/icon-192.png";
        const icon512 = cfg.icon_512_url || cfg.icon_url || "/icon-512.png";
        const splash = cfg.splash_icon_url || icon512;
        const shortcut = cfg.shortcut_icon_url || iconAny;

        const icons: Icon[] = [
          {
            src: absoluteUrl(origin, iconAny),
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: absoluteUrl(origin, icon512),
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: absoluteUrl(origin, splash),
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ];

        const manifest = {
          name: merged.name,
          short_name: merged.short_name,
          description: merged.description,
          start_url: merged.start_url,
          scope: merged.scope,
          display: merged.display,
          orientation: merged.orientation,
          theme_color: merged.theme_color,
          background_color: merged.background_color,
          icons,
          shortcuts: [
            {
              name: "Inbox",
              short_name: "Inbox",
              url: "/inbox",
              icons: [{ src: absoluteUrl(origin, shortcut), sizes: "192x192", type: "image/png" }],
            },
            {
              name: "Contacts",
              short_name: "Contacts",
              url: "/contacts",
              icons: [{ src: absoluteUrl(origin, shortcut), sizes: "192x192", type: "image/png" }],
            },
          ],
          categories: ["business", "productivity", "communication"],
        };

        return new Response(JSON.stringify(manifest, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300, must-revalidate",
          },
        });
      },
    },
  },
});
