/**
 * Human-readable error mapping for API key operations.
 *
 * Server functions surface raw Postgres / PostgREST / Zod errors, which are
 * useless in a toast ("new row violates row-level security policy..."). This
 * translates them into a short title plus an actionable detail line, and — when
 * the cause is a specific form field — the field it belongs to.
 */

export type ApiKeyErrorField = "name" | "scopes" | "expiresInDays" | null;

export interface ApiKeyErrorInfo {
  /** Short toast title. */
  title: string;
  /** Longer, actionable explanation. Also used as the inline message. */
  detail: string;
  /** Form field to highlight inline, when the failure is field-specific. */
  field: ApiKeyErrorField;
  /** Original message, kept for support/debugging. */
  raw: string;
}

function rawMessage(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  const anyErr = e as any;
  return (
    anyErr?.message ??
    anyErr?.error_description ??
    anyErr?.error ??
    (() => {
      try {
        return JSON.stringify(anyErr);
      } catch {
        return String(anyErr);
      }
    })()
  );
}

function pgCode(e: unknown): string | undefined {
  const c = (e as any)?.code ?? (e as any)?.cause?.code;
  return typeof c === "string" ? c : undefined;
}

function httpStatus(e: unknown): number | undefined {
  const s = (e as any)?.status ?? (e as any)?.statusCode ?? (e as any)?.response?.status;
  return typeof s === "number" ? s : undefined;
}

function classify(e: unknown, action: "create" | "revoke"): ApiKeyErrorInfo {
  const raw = rawMessage(e);
  const msg = raw.toLowerCase();
  const code = pgCode(e);
  const status = httpStatus(e);
  const verb = action === "create" ? "create" : "revoke";

  const of = (title: string, detail: string, field: ApiKeyErrorField = null): ApiKeyErrorInfo => ({
    title,
    detail,
    field,
    raw,
  });

  // --- Network / offline -------------------------------------------------
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return of(
      "No connection to the server",
      `We couldn't reach the server to ${verb} the key. Check your internet connection and try again.`,
    );
  }

  // --- Auth --------------------------------------------------------------
  if (status === 401 || msg.includes("unauthorized") || msg.includes("jwt expired") || msg.includes("invalid token")) {
    return of(
      "Your session expired",
      "Sign in again, then retry — your login token is no longer valid.",
    );
  }

  // --- Membership / permission ------------------------------------------
  if (
    status === 403 ||
    msg.includes("forbiddenorgerror") ||
    msg.includes("is not a member of organization") ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    code === "42501"
  ) {
    return of(
      "You don't have access to this workspace",
      `Your account isn't allowed to ${verb} API keys in the selected workspace. Ask an owner or admin to grant you access, or switch workspaces.`,
    );
  }

  // --- Missing table grants ---------------------------------------------
  if (msg.includes("permission denied for table") || msg.includes("permission denied for relation")) {
    return of(
      "API keys aren't available yet",
      "The API keys storage isn't configured for this workspace. Contact support with this message: " + raw,
    );
  }

  // --- Demo mode ---------------------------------------------------------
  if (msg.includes("demo mode") || msg.includes("read-only")) {
    return of(
      "Demo mode is read-only",
      "Switch to production mode to create or revoke real API keys.",
    );
  }

  // --- Validation --------------------------------------------------------
  if (msg.includes("string must contain at least 1") || msg.includes("too_small") && msg.includes("name")) {
    return of("Name is required", "Give the key a name so you can recognise it later.", "name");
  }
  if (msg.includes("at most 80")) {
    return of("Name is too long", "Key names are limited to 80 characters.", "name");
  }
  if (msg.includes("expiresindays")) {
    return of(
      "Expiry isn't valid",
      "Enter a whole number of days between 1 and 3650, or leave it empty for a key that never expires.",
      "expiresInDays",
    );
  }
  if (msg.includes("scopes")) {
    return of("Too many scopes", "Select at most 20 scopes for a single key.", "scopes");
  }
  if (msg.includes("invalid uuid") || msg.includes("invalid input syntax for type uuid")) {
    return of(
      "Workspace not selected properly",
      "Reload the page and pick a workspace from the switcher, then try again.",
    );
  }

  // --- Postgres specifics ------------------------------------------------
  if (code === "23505" || msg.includes("duplicate key value")) {
    return of(
      "A key with that name already exists",
      "Pick a different name for this key.",
      "name",
    );
  }
  if (code === "23503" || msg.includes("foreign key")) {
    return of(
      "Workspace no longer exists",
      "The selected workspace was removed or you were removed from it. Reload and pick another workspace.",
    );
  }
  if (msg.includes("api key not found")) {
    return of("Key not found", "It may already have been revoked. Refreshing the list.");
  }
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
    return of("Too many attempts", "Wait a moment before trying again.");
  }
  if ((status && status >= 500) || msg.includes("internal server error")) {
    return of(
      "The server had a problem",
      `We couldn't ${verb} the key because of a server error. Try again in a moment.`,
    );
  }

  return of(
    action === "create" ? "Couldn't create the key" : "Couldn't revoke the key",
    raw || "An unexpected error occurred. Please try again.",
  );
}

export function describeApiKeyError(e: unknown, action: "create" | "revoke"): ApiKeyErrorInfo {
  return classify(e, action);
}
