import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { sbAny } from "@/lib/supabase/untyped";


const BASE_URL = "https://wrapcoders.bid";

type SitemapEntry = {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  lastmod?: string;
};

function toW3CDate(date: string | null | undefined): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().split("T")[0];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.8" },
          { path: "/features", changefreq: "monthly", priority: "0.8" },
          { path: "/pricing", changefreq: "monthly", priority: "0.8" },
          { path: "/contact", changefreq: "monthly", priority: "0.6" },
          { path: "/docs/index.html", changefreq: "weekly", priority: "0.7" },
          { path: "/docs/changelog.html", changefreq: "weekly", priority: "0.6" },
          { path: "/legal/privacy-policy", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/privacy", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/terms-of-service", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/terms", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/cookie-policy", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/dpa", changefreq: "yearly", priority: "0.5" },
        ];



        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

          const [{ data: eventTypes }, { data: bookingPages }, { data: publicCards }] =
            await Promise.all([
              supabaseAdmin
                .from("booking_event_types")
                .select("slug, updated_at")
                .eq("is_active", true),
              sbAny(supabaseAdmin).from("booking_pages").select("slug, updated_at").eq("is_active", true),
              supabaseAdmin
                .from("vcards")
                .select("slug, updated_at")
                .eq("is_public", true)
                .is("revoked_at", null),
            ]);

          for (const eventType of eventTypes ?? []) {
            if (eventType.slug) {
              entries.push({
                path: `/book/${eventType.slug}`,
                changefreq: "weekly",
                priority: "0.7",
                lastmod: toW3CDate(eventType.updated_at),
              });
            }
          }

          for (const page of bookingPages ?? []) {
            if (page.slug) {
              entries.push({
                path: `/book/p/${page.slug}`,
                changefreq: "weekly",
                priority: "0.7",
                lastmod: toW3CDate(page.updated_at),
              });
            }
          }

          for (const card of publicCards ?? []) {
            if (card.slug) {
              entries.push({
                path: `/v/${card.slug}`,
                changefreq: "weekly",
                priority: "0.6",
                lastmod: toW3CDate(card.updated_at),
              });
            }
          }
        } catch (err) {
          // Static entries are still valid; log the failure so it doesn't silently break.
          console.error("Failed to load dynamic sitemap entries:", err);
        }

        const urls = entries.map((e) => {
          const lines = [`  <url>`, `    <loc>${BASE_URL}${e.path}</loc>`];
          if (e.lastmod) lines.push(`    <lastmod>${e.lastmod}</lastmod>`);
          if (e.changefreq) lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
          if (e.priority) lines.push(`    <priority>${e.priority}</priority>`);
          lines.push(`  </url>`);
          return lines.join("\n");
        });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
