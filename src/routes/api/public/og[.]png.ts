import { createFileRoute } from "@tanstack/react-router";

/**
 * Dynamic Open Graph / Twitter Card image.
 *
 * Social crawlers require a real raster image at a stable URL, so this route
 * always answers with a PNG:
 *
 *  1. the platform's uploaded social image (Super Admin → Platform Settings →
 *     Branding, `social_image_url`) when one is configured, so white-labelled
 *     deployments share their own card without touching code;
 *  2. otherwise the bundled `/og-image.png` fallback.
 *
 * Keeping the preview behind one endpoint means the tags baked into every
 * route never change when branding does — crawlers just re-fetch this URL.
 */

const FALLBACK = "/og-image.png";

function isPng(type: string | null) {
  return !!type && /^image\/(png|jpeg|webp)$/i.test(type);
}

async function resolveConfiguredImage(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("scope", "platform")
      .eq("key", "branding")
      .maybeSingle();
    const raw = (data?.value ?? {}) as Record<string, unknown>;
    const url = typeof raw["social_image_url"] === "string" ? raw["social_image_url"].trim() : "";
    if (!url) return null;
    if (url.startsWith("/") && !url.startsWith("//")) return url;
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/og.png")({
  server: {
    handlers: {
      GET: async () => {
        const configured = await resolveConfiguredImage();

        // A same-zone URL (the bundled fallback, or a locally-uploaded branding
        // image) is served by the platform's static asset handler, not this
        // route — redirect to it directly instead of self-fetching over HTTP,
        // which is unreliable from inside a Cloudflare Worker.
        const local = configured?.startsWith("/") ? configured : null;
        if (local) {
          return new Response(null, {
            status: 302,
            headers: { location: local, "cache-control": "public, max-age=600, s-maxage=600" },
          });
        }

        // Remote branding image: proxy it so the og:image URL stays stable.
        if (configured) {
          try {
            const res = await fetch(configured);
            const type = res.headers.get("content-type");
            if (res.ok && isPng(type)) {
              return new Response(await res.arrayBuffer(), {
                status: 200,
                headers: {
                  "content-type": type!,
                  "cache-control": "public, max-age=600, s-maxage=600",
                  "x-content-type-options": "nosniff",
                },
              });
            }
          } catch {
            // fall through to the bundled fallback
          }
        }

        return new Response(null, {
          status: 302,
          headers: { location: FALLBACK, "cache-control": "public, max-age=600, s-maxage=600" },
        });
      },
    },
  },
});
