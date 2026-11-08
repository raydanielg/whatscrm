/**
 * Tracks the currently authenticated user id in a form that synchronous
 * readers (`getActiveOrgId`, org-switcher hydration) can consult without
 * an async round-trip to Supabase.
 *
 * We persist the id in a dedicated localStorage slot so that a page
 * reload — which runs before `supabase.auth.getUser()` resolves — can
 * still pick the right per-user org key. The value is only a user id, not
 * a credential; RLS on the server remains the source of truth.
 */

const CURRENT_USER_KEY = "wacrm.auth.uid.v1";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let inMemory: string | null = null;

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function safeRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getCurrentUserId(): string | null {
  if (inMemory && UUID_RE.test(inMemory)) return inMemory;
  const raw = safeGet(CURRENT_USER_KEY);
  if (raw && UUID_RE.test(raw)) {
    inMemory = raw;
    return raw;
  }
  return null;
}

export function setCurrentUserId(userId: string | null) {
  if (userId && UUID_RE.test(userId)) {
    inMemory = userId;
    safeSet(CURRENT_USER_KEY, userId);
  } else {
    inMemory = null;
    safeRemove(CURRENT_USER_KEY);
  }
}
