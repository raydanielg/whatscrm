/**
 * ============================================================================
 * Environment Mode System — single source of truth for Demo vs Production.
 * ============================================================================
 *
 * Controlled by env vars (client bundle reads VITE_* at build time):
 *   VITE_APP_MODE = "demo" | "production"     (preferred)
 *   VITE_DEMO_MODE = "true" | "false"         (legacy alias, still honored)
 *
 * Server-side code should import from "./mode.server" instead, which reads
 * APP_MODE / DEMO_MODE from process.env at request time.
 *
 * Usage (client):
 *   import { isDemoMode, canDelete, useDemoGuard } from "@/lib/demo/mode";
 *
 *   if (!canDelete()) { toast.warning("Disabled in Demo Mode"); return; }
 *
 *   const { guard } = useDemoGuard();
 *   async function handleDelete() {
 *     if (!guard("Delete customer")) return;
 *     await api.delete(...);
 *   }
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_ACCOUNTS } from "./accounts";

// ---------------------------------------------------------------------------
// Env resolution
// ---------------------------------------------------------------------------

type EnvBag = Record<string, string | undefined>;

function readEnv(): EnvBag {
  const viteEnv =
    (import.meta as unknown as { env?: EnvBag }).env ?? ({} as EnvBag);
  const nodeEnv =
    typeof process !== "undefined" ? (process.env as EnvBag) : ({} as EnvBag);
  return { ...nodeEnv, ...viteEnv };
}

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function resolveMode(): "demo" | "production" {
  const env = readEnv();
  const appMode = (env.VITE_APP_MODE ?? env.APP_MODE ?? "").toLowerCase();
  if (appMode === "demo") return "demo";
  if (appMode === "production") return "production";
  if (truthy(env.VITE_DEMO_MODE) || truthy(env.DEMO_MODE)) return "demo";
  return "production";
}

// Resolved once at module load — env is static for the client bundle.
export const APP_MODE: "demo" | "production" = resolveMode();
export const DEMO_MODE_ENABLED = APP_MODE === "demo";

export function isDemoMode(): boolean {
  return APP_MODE === "demo";
}
export function isProductionMode(): boolean {
  return APP_MODE === "production";
}

// ---------------------------------------------------------------------------
// Capability helpers — cheap, synchronous, safe anywhere in the client.
// In production they always return true. In demo they return false so any
// destructive UI path can early-return + toast without extra boilerplate.
// ---------------------------------------------------------------------------

const ALLOWED_IN_DEMO = false; // writes blocked in demo
const READS_ALLOWED = true;    // reads always allowed

export const canRead      = () => READS_ALLOWED;
export const canCreate    = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canUpdate    = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canDelete    = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canRestore   = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canDuplicate = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canImport    = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canExport    = () => true; // exports are read-only side effects
export const canBulk      = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canExecute   = () => isProductionMode() || ALLOWED_IN_DEMO;
export const canChangeSettings = () => isProductionMode() || ALLOWED_IN_DEMO;

/** Imperative guard — returns true when the action is permitted. */
export function demoGuard(actionLabel = "This action"): boolean {
  if (isProductionMode()) return true;
  emitBlockedToast(actionLabel);
  logBlocked({ action: actionLabel, source: "client" });
  return false;
}

/** Symmetric helper for read-only gates in production-only flows. */
export function productionGuard(actionLabel = "This action"): boolean {
  if (isProductionMode()) return true;
  emitBlockedToast(actionLabel);
  return false;
}

function emitBlockedToast(actionLabel: string) {
  import("sonner").then(({ toast }) =>
    toast.warning("Demo Mode is enabled", {
      description: `${actionLabel} is disabled in the live demonstration.`,
    }),
  );
}

// ---------------------------------------------------------------------------
// Lightweight client-side blocked-action log. In production this is a no-op.
// The server middleware writes richer records with IP/user/org.
// ---------------------------------------------------------------------------

type BlockedRecord = {
  action: string;
  source: "client" | "server";
  at: string;
  path?: string;
};
const clientLog: BlockedRecord[] = [];

export function logBlocked(entry: Omit<BlockedRecord, "at" | "path"> & { path?: string }) {
  if (!isDemoMode()) return;
  const rec: BlockedRecord = {
    ...entry,
    at: new Date().toISOString(),
    path: entry.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
  };
  clientLog.push(rec);
  if (clientLog.length > 100) clientLog.shift();
  // Non-fatal debug line; stripped in production builds by bundler when APP_MODE !== 'demo'.
  if (typeof console !== "undefined") console.info("[demo] blocked", rec);
}

export function getBlockedLog(): ReadonlyArray<BlockedRecord> {
  return clientLog;
}

// ---------------------------------------------------------------------------
// React hook — session-aware guard. In production it's inert.
// ---------------------------------------------------------------------------

export function isDemoEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return DEMO_ACCOUNTS.some((a) => a.email.toLowerCase() === e);
}

export function useDemoGuard() {
  const [isDemoSession, setIsDemoSession] = useState(false);

  useEffect(() => {
    if (!isDemoMode()) return;
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setIsDemoSession(isDemoEmail(data.session?.user?.email));
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") check();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  function guard(actionLabel = "This action"): boolean {
    // Demo mode blocks ALL sessions when the app is in demo — not only demo
    // accounts. This keeps behavior deterministic for QA and CodeCanyon review.
    return demoGuard(actionLabel);
  }

  return {
    enabled: isDemoMode(),
    isDemoSession,
    guard,
    canCreate: canCreate(),
    canUpdate: canUpdate(),
    canDelete: canDelete(),
  };
}
