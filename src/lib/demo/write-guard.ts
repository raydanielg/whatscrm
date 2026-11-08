/**
 * Demo-mode write guard for the browser Supabase client.
 *
 * This is UI feedback, not the security boundary. The boundary is in the
 * database: migration 20260922160000 puts a statement-level trigger on every
 * public table that refuses writes when the request JWT carries
 * `app_metadata.demo`. That is what stops someone taking the credentials
 * printed on the /auth page and POSTing straight to /rest/v1/<table>.
 *
 * This layer exists so the app fails fast and explains itself, instead of
 * round-tripping to Postgres for an error the UI then has to interpret.
 *
 * Contract: blocked calls resolve to `{ data: null, error }` exactly like a
 * real PostgREST failure. They deliberately do NOT throw — the codebase is
 * written against `const { error } = await supabase.from(...)...`, and throwing
 * turned handled errors into unhandled promise rejections at call sites that
 * (correctly) only check `error`.
 */
import { isDemoMode } from "./mode";

const MESSAGE_PREFIX = "Demo mode";

export type DemoBlockedError = {
  name: "DemoWriteBlockedError";
  message: string;
  details: string;
  hint: string;
  code: string;
};

function blockedError(target: string, operation: string): DemoBlockedError {
  return {
    name: "DemoWriteBlockedError",
    message: `${MESSAGE_PREFIX}: ${operation} on "${target}" is disabled. Sign in with a real account to make changes.`,
    details: "",
    hint: "This deployment is running in demo mode; demo accounts are read-only.",
    code: "42501",
  };
}

/**
 * Tables that must stay writable for a demo session to function at all. These
 * record the session itself rather than tenant data — blocking them breaks
 * login, session listing and idle logout.
 *
 * `user_2fa` is deliberately NOT here. It was, and that would have let a
 * visitor enable two-factor auth on a shared demo account with a secret only
 * they held, permanently locking out everyone else using the published
 * credentials. Login does not need to write it.
 *
 * Kept in sync with the `exempt` array in migration 20260922160000.
 */
const INFRASTRUCTURE_TABLES = new Set(["sessions", "login_history", "account_lockouts"]);

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

/**
 * RPCs a demo session may still call. Fail-closed: anything not listed is
 * blocked, because several RPCs mutate (`assign_conversation`,
 * `transfer_organization_ownership`, `bulk_update_conversations`, ) and
 * enumerating the mutating ones risks missing one as the app grows.
 *
 * The entries here are reads, or session-scoped writes that login and
 * rate-limiting depend on.
 */
const ALLOWED_RPCS = new Set([
  "heartbeat",
  "record_login_attempt",
  "enforce_rate_limit",
  "log_security_event",
  "get_conversation_counts",
  "analytics_daily_summary",
  "my_permissions",
  "has_permission",
  "is_super_admin",
  "is_workspace_member",
  "is_workspace_admin",
  "is_active_workspace_member",
  "has_workspace_role",
  "is_org_member",
  "has_org_role",
  "is_inbox_member",
  "is_demo_session",
  "search_inbox",
  "get_audit_trail",
  "workspace_media_stats",
  "list_payment_gateway_basics",
  "channel_account_secrets",
  "get_public_white_label",
  "get_public_payment_link",
  "realtime_topic_allowed",
  "widget_topic_allowed",
]);

type AnyFn = (...args: unknown[]) => unknown;

// Coalesce toasts: a bulk action can block dozens of writes in a tick, and one
// warning per attempt buries the screen.
const recentlyWarned = new Set<string>();

function notify(target: string, operation: string) {
  const key = `${target}:${operation}`;
  if (recentlyWarned.has(key)) return;
  recentlyWarned.add(key);
  setTimeout(() => recentlyWarned.delete(key), 3000);

  void import("sonner")
    .then(({ toast }) => {
      toast.warning("Disabled in demo mode", {
        description: `${operation} on ${target} is read-only here.`,
      });
    })
    .catch(() => {
      /* toast unavailable (SSR/tests) — the returned error is still the contract */
    });
}

/**
 * A stand-in for a PostgREST builder that is chainable (`.eq()`, `.select()`,
 * `.single()` ) and awaits to a normal `{ data, error }` result.
 */
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
        // Any other builder method keeps the chain going.
        return () => stub;
      },
    },
  );
  return stub;
}

/** Wrap a PostgrestQueryBuilder so the mutating methods refuse to run. */
export function guardQueryBuilder<T extends object>(builder: T, table: string): T {
  if (!isDemoMode() || INFRASTRUCTURE_TABLES.has(table)) return builder;

  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && WRITE_METHODS.has(prop) && typeof value === "function") {
        return () => {
          notify(table, prop);
          return blockedBuilder(table, prop);
        };
      }
      return typeof value === "function" ? (value as AnyFn).bind(target) : value;
    },
  }) as T;
}

/** Wrap `rpc` so mutating procedures refuse to run. */
export function guardRpc(rpc: AnyFn, client: unknown): AnyFn {
  if (!isDemoMode()) return rpc;
  return (...args: unknown[]) => {
    const name = typeof args[0] === "string" ? args[0] : "";
    if (ALLOWED_RPCS.has(name)) return rpc.apply(client, args);
    notify(`rpc/${name}`, "call");
    return blockedBuilder(`rpc/${name}`, "call");
  };
}

/** Wrap a storage bucket so uploads/removals are refused in demo mode. */
export function guardStorageBucket<T extends object>(bucket: T, name: string): T {
  if (!isDemoMode()) return bucket;
  const blocked = new Set(["upload", "uploadToSignedUrl", "remove", "move", "copy", "update"]);
  return new Proxy(bucket, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && blocked.has(prop) && typeof value === "function") {
        return () => {
          notify(`storage/${name}`, prop);
          return Promise.resolve({ data: null, error: blockedError(`storage/${name}`, prop) });
        };
      }
      return typeof value === "function" ? (value as AnyFn).bind(target) : value;
    },
  }) as T;
}
