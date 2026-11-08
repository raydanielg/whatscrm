/**
 * Demo-mode write guard for the SERVICE-ROLE Supabase client.
 *
 * `supabaseAdmin` (service_role) never carries an end-user JWT, so it is
 * invisible to both of the app's other demo-mode layers:
 *
 *   - The DB trigger `tg_block_demo_writes` (migration 20260922160000) only
 *     fires when the connection's JWT carries `app_metadata.demo`. A
 *     service-role connection has no such claim, regardless of which user
 *     triggered the server function that opened it.
 *   - `guardQueryBuilder` in `write-guard.ts` only wraps the browser-bundle
 *     `supabase` client — it never runs for code executing inside a
 *     `createServerFn` handler.
 *
 * Any server function that writes via `supabaseAdmin` therefore bypassed
 * demo mode entirely: 342 `.from().insert/update/upsert/delete()` call sites
 * across 57 files, none of them guarded by the `demoWriteGuard` /
 * `assertNotDemo` middleware in `mode.server.ts` (which exists but, as of
 * this fix, was wired into zero server functions) — PLUS a second, more
 * dangerous surface found on re-audit: several Super Admin actions
 * (ban/delete/reset-password/force-logout a real user) mutate through
 * `supabaseAdmin.auth.admin.*`, and one (`prepare_platform_user_deletion`)
 * through `.rpc()`, neither of which a table-keyed `.from()` guard touches.
 *
 * This module re-exports a drop-in replacement for `supabaseAdmin` — same
 * shape, so callers only need to change their import path — that refuses,
 * while the deployment is in demo mode (`APP_MODE=demo`):
 *   - `insert` / `update` / `upsert` / `delete` on any table
 *   - `auth.admin.*` calls that create, alter or remove a real user
 *   - any `.rpc()` call not on the explicit allowlist (fail-closed, same
 *     philosophy as `ALLOWED_RPCS` in write-guard.ts: enumerating just the
 *     dangerous ones risks missing one as the app grows)
 *
 * This mirrors the browser guard's documented behavior: it blocks every
 * session while demo mode is on, not only the three published demo
 * accounts, so a public demo deployment can't be mutated through any code
 * path. `demo.functions.ts` (which provisions the three demo accounts
 * themselves) deliberately imports the RAW client instead of this one —
 * see the comment there.
 */
import { isServerDemoMode } from "./mode.server";
import { supabaseAdmin as rawSupabaseAdmin } from "@/integrations/supabase/client.server";

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

/** Kept in sync with the exemption list in write-guard.ts and migration 20260922160000. */
const INFRASTRUCTURE_TABLES = new Set(["sessions", "login_history", "account_lockouts"]);

/**
 * `auth.admin` methods that create, alter, or remove a real auth user or
 * session. Fail-closed would be safer still, but the admin API surface is
 * small and stable enough to enumerate directly; read-only lookups
 * (`getUserById`, `listUsers`) and MFA/factor reads are left untouched.
 */
const BLOCKED_AUTH_ADMIN_METHODS = new Set([
  "createUser",
  "updateUserById",
  "deleteUser",
  "generateLink",
  "signOut",
  "inviteUserByEmail",
  "deleteFactor",
]);

/**
 * `.rpc()` procedures a server function may still call through
 * `supabaseAdmin` in demo mode. Everything not listed is blocked.
 *
 * All are either read-only, scoped to background/cron workers that keep the
 * live demo actually working (message outbox, webhook/export queues, media
 * cleanup — none of these mutate anything a user can see as "their data"
 * changing), or bootstrap a brand-new signup's own personal workspace.
 * `prepare_platform_user_deletion` is the one confirmed dangerous
 * omission — a Super Admin action that preps an arbitrary real user for
 * deletion — and stays blocked by not being on this list.
 */
const ALLOWED_RPCS = new Set([
  "match_kb_chunks",
  "upsert_ai_usage_daily",
  "enforce_rate_limit",
  "ensure_personal_organization",
  "export_jobs_claim_batch",
  "increment_install_count",
  "outbox_claim_batch",
  "claim_expired_media",
  "webhook_events_claim_batch",
  // Read-only platform health aggregate for Super Admin monitoring/overview.
  "platform_monitoring_stats",
  "platform_monitoring_center",
  "platform_monitoring_events",
  "platform_readiness_facts",
  // Read-only lookup of a tenant BYOK key for the server-side AI runtime.
  "get_ai_provider_vault_key",
]);

type AnyFn = (...args: unknown[]) => unknown;

function blockedError(target: string, operation: string) {
  return {
    name: "DemoWriteBlockedError",
    message: `Demo mode: ${operation} on "${target}" is disabled. Sign in with a real account to make changes.`,
    details: "",
    hint: "This deployment is running in demo mode; demo accounts are read-only.",
    code: "42501",
  };
}

/** A stand-in for a PostgREST builder: chainable, awaits to `{ data, error }`. */
function blockedBuilder(target: string, operation: string): unknown {
  const payload = {
    data: null,
    error: blockedError(target, operation),
    count: null,
    status: 403,
    statusText: "Forbidden",
  };
  const stub: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(payload).then(res, rej);
        }
        if (prop === "catch") {
          return (fn?: (e: unknown) => unknown) => Promise.resolve(payload).catch(fn);
        }
        if (prop === "finally") {
          return (fn?: () => void) => Promise.resolve(payload).finally(fn);
        }
        return () => stub;
      },
    },
  );
  return stub;
}

function logBlocked(client: string, target: string, operation: string) {
  console.warn(
    "[demo.blocked]",
    JSON.stringify({ client, target, operation, at: new Date().toISOString() }),
  );
}

function guardBuilder<T extends object>(builder: T, table: string): T {
  if (!isServerDemoMode() || INFRASTRUCTURE_TABLES.has(table)) return builder;
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && WRITE_METHODS.has(prop) && typeof value === "function") {
        return () => {
          logBlocked("supabaseAdmin", table, prop);
          return blockedBuilder(table, prop);
        };
      }
      return typeof value === "function" ? (value as AnyFn).bind(target) : value;
    },
  }) as T;
}

function guardAuthAdmin<T extends object>(authAdmin: T): T {
  if (!isServerDemoMode()) return authAdmin;
  return new Proxy(authAdmin, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (
        typeof prop === "string" &&
        BLOCKED_AUTH_ADMIN_METHODS.has(prop) &&
        typeof value === "function"
      ) {
        return (...args: unknown[]) => {
          const subject =
            typeof args[0] === "string" ? args[0] : typeof args[0] === "object" ? "new user" : "";
          logBlocked("supabaseAdmin.auth.admin", `${prop}(${subject})`, prop);
          return Promise.resolve({ data: null, error: blockedError(`auth.admin.${prop}`, prop) });
        };
      }
      return typeof value === "function" ? (value as AnyFn).bind(target) : value;
    },
  }) as T;
}

function guardRpc(rpc: AnyFn): AnyFn {
  return (...args: unknown[]) => {
    const name = typeof args[0] === "string" ? args[0] : "";
    if (!isServerDemoMode() || ALLOWED_RPCS.has(name)) return rpc(...args);
    logBlocked("supabaseAdmin", `rpc/${name}`, "call");
    return blockedBuilder(`rpc/${name}`, "call");
  };
}

/**
 * Drop-in replacement for the raw `supabaseAdmin` export. `.from(table)`,
 * `.rpc()` and `.auth.admin.*` are gated as described above; `.storage` and
 * everything else pass straight through to the real service-role client.
 */
export const supabaseAdmin: typeof rawSupabaseAdmin = new Proxy(rawSupabaseAdmin, {
  get(target, prop, receiver) {
    if (prop === "from") {
      return (table: string) => guardBuilder((target.from as AnyFn)(table) as object, table);
    }
    if (prop === "rpc") {
      return guardRpc((target.rpc as AnyFn).bind(target));
    }
    if (prop === "auth") {
      const auth = Reflect.get(target, "auth", receiver) as { admin: object };
      return new Proxy(auth, {
        get(authTarget, authProp, authReceiver) {
          if (authProp === "admin") {
            return guardAuthAdmin(Reflect.get(authTarget, "admin", authReceiver) as object);
          }
          return Reflect.get(authTarget, authProp, authReceiver);
        },
      });
    }
    return Reflect.get(target, prop, receiver);
  },
}) as typeof rawSupabaseAdmin;
