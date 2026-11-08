import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { docsUrl } from "@/lib/docs/links";

/**
 * Legacy in-app Documentation Center lived at /docs. The docs now live in the
 * static site (docs/*.html), so keep old links working with a permanent redirect.
 */
export const Route = createFileRoute("/docs/")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 301,
          headers: { Location: docsUrl(), "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
