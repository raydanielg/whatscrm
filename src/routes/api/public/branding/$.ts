import { createFileRoute } from "@tanstack/react-router";

/**
 * Public delivery endpoint for branding assets (logos, favicon, PWA icons).
 *
 * The `branding` bucket is private (public buckets are disabled on this
 * platform), but favicons, manifest icons, and login-screen logos must load
 * for signed-out visitors and for the OS when installing the PWA. This route
 * streams the object with the service client and long cache headers. Uploads
 * always use a fresh UUID filename, so the bytes at a given path never change.
 */
export const Route = createFileRoute("/api/public/branding/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as { _splat?: string })._splat ?? "";
        const path = decodeURIComponent(raw).replace(/^\/+/, "");

        // Only serve the two namespaces the uploader writes to, and never
        // allow traversal out of them.
        if (!path || path.includes("..") || !/^(platform|org|workspace)\//.test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data, error } = await supabaseAdmin.storage.from("branding").download(path);
        if (error || !data) {
          return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
        }

        return new Response(await data.arrayBuffer(), {
          status: 200,
          headers: {
            "content-type": data.type || "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
