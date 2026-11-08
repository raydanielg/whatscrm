/**
 * Server-side mode resolution + reusable middleware for TanStack server
 * functions and server routes. Import this from ".functions.ts" handlers
 * (never from client bundles).
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getRequestIP } from "@tanstack/react-start/server";

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export function serverAppMode(): "demo" | "production" {
  const m = (process.env.APP_MODE ?? process.env.VITE_APP_MODE ?? "").toLowerCase();
  if (m === "demo") return "demo";
  if (m === "production") return "production";
  if (truthy(process.env.DEMO_MODE) || truthy(process.env.VITE_DEMO_MODE)) return "demo";
  return "production";
}

export const isServerDemoMode = () => serverAppMode() === "demo";
export const isServerProductionMode = () => serverAppMode() === "production";

/**
 * Structured error thrown when the server refuses a write in demo mode.
 * Callers should surface `error.message` unchanged — it is user-safe.
 */
export class DemoModeBlockedError extends Error {
  readonly code = "DEMO_MODE_BLOCKED";
  readonly status = 423; // "Locked" — semantically closer than 403
  constructor(action = "This action") {
    super(`Demo Mode is enabled. ${action} is disabled in the live demonstration.`);
    this.name = "DemoModeBlockedError";
  }
}

type LogEntry = {
  action: string;
  endpoint?: string;
  method?: string;
  userId?: string | null;
  ip?: string | null;
  ua?: string | null;
  at: string;
};

function logServerBlocked(entry: LogEntry) {
  // Structured log line — pick this up in your log aggregator by "demo.blocked".
  console.warn("[demo.blocked]", JSON.stringify(entry));
}

/**
 * Attach to any write-oriented `createServerFn` to reject calls when
 * APP_MODE === "demo". No-op in production.
 *
 *   export const deleteThing = createServerFn({ method: "POST" })
 *     .middleware([requireSupabaseAuth, demoWriteGuard("Delete thing")])
 *     .handler(async () => { ... });
 */
export function demoWriteGuard(actionLabel = "This action") {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    if (!isServerDemoMode()) return next();
    const req = safeGetRequest();
    logServerBlocked({
      action: actionLabel,
      endpoint: req?.url,
      method: req?.method,
      userId: (context as { userId?: string } | undefined)?.userId ?? null,
      ip: safeGetIp(),
      ua: req?.headers.get("user-agent") ?? null,
      at: new Date().toISOString(),
    });
    throw new DemoModeBlockedError(actionLabel);
  });
}

/** Same guard, for use inside server route handlers (no middleware chain). */
export function assertNotDemo(actionLabel = "This action"): void {
  if (!isServerDemoMode()) return;
  const req = safeGetRequest();
  logServerBlocked({
    action: actionLabel,
    endpoint: req?.url,
    method: req?.method,
    ip: safeGetIp(),
    ua: req?.headers.get("user-agent") ?? null,
    at: new Date().toISOString(),
  });
  throw new DemoModeBlockedError(actionLabel);
}

function safeGetRequest() {
  try {
    return getRequest();
  } catch {
    return null;
  }
}
function safeGetIp() {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    return null;
  }
}
