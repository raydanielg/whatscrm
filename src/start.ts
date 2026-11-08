import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
// Replaces the generated `attachSupabaseAuth`: same bearer attachment, plus
// token refresh and a redirect to /auth instead of a blank error-boundary page.
import { attachSupabaseAuthFresh } from "@/lib/auth/serverfn-auth";
import { throttledFetch } from "@/lib/net/client-throttle";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Server-function calls expect a structured payload. Swallowing their
    // failures into an HTML page makes the client receive `undefined` and
    // crash on destructuring instead of surfacing the real cause.
    const isServerFn =
      typeof request?.url === "string" && new URL(request.url).pathname.startsWith("/_serverFn");
    if (isServerFn) throw error;
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});


/**
 * Security audit trail for every server function call. Any failure that looks
 * like an access denial (RLS policy, missing GRANT, 401/403, unauthorized
 * throw) is written to `security_events` as `rls.denied` so incident review
 * has a server-side record even when the client never surfaced the error.
 */
const auditMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    const { isAccessDenial } = await import("@/lib/security/audit-telemetry");
    const unauthorized =
      error instanceof Response && (error.status === 401 || error.status === 403);
    if (unauthorized || isAccessDenial(error)) {
      const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
      await recordServerAuditEvent({
        eventType: "rls.denied",
        severity: "critical",
        resourceType: "server_function",
        data: {
          operation: "server_function",
          http_status: error instanceof Response ? error.status : null,
          message: error instanceof Error ? error.message.slice(0, 500) : null,
        },
      });
    }
    throw error;
  }
});

/**
 * Caps concurrent server-function requests and retries transient transport
 * failures (HTTP/2 refused stream, connection closed) so a burst of parallel
 * RPCs on page load does not surface as `TypeError: Failed to fetch`.
 */
const throttleMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) =>
  next({ fetch: throttledFetch }),
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthFresh, throttleMiddleware, auditMiddleware],
  requestMiddleware: [errorMiddleware],
}));
import { useEffect } from "react";
