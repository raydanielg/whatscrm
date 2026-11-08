/**
 * Single source of truth for reading and writing the active tenant
 * (organization + workspace) from the browser.
 *
 * Historically each consumer (RBAC guards, Query cache scope, the
 * workspace hook, the org switcher, cross-tab sync) rolled its own
 * localStorage reader. The keys drifted — some read the shared legacy
 * slot, some read the per-user slot, some read only the workspace slot —
 * so on the same page the RBAC guard, the cache scope, and the switcher
 * could resolve to *different* tenants. That produced the "Settings
 * redirects to Dashboard" / "Inbox is empty after switching org" class
 * of bugs.
 *
 * Every module that needs the active org or workspace id must import
 * from here. Do NOT re-derive these keys anywhere else.
 */

import { getCurrentUserId } from "@/lib/storage/active-user";

// -------- Canonical storage keys --------

export const ACTIVE_ORG_KEY = "wacrm.org.active.v1";
export const ACTIVE_WS_KEY = "wacrm.workspace.active.v1";

// -------- Events --------

export const ORG_CHANGED_EVENT = "wacrm:org-changed";
export const WORKSPACE_CHANGED_EVENT = "wacrm:workspace-changed";

let hostedTenant: { workspaceId: string; organizationId: string | null } | null = null;

/** A verified custom hostname pins tenant selection for this browser page. */
export function setHostedTenant(binding: typeof hostedTenant) {
  hostedTenant = binding;
  dispatch(ORG_CHANGED_EVENT);
  dispatch(WORKSPACE_CHANGED_EVENT);
}

export function readHostedTenant() {
  return hostedTenant;
}

// -------- Validation --------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// -------- Storage primitives --------

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
    /* private mode / quota */
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

// -------- Active org --------

/**
 * Compute the per-user localStorage key for the active org id. Falls back
 * to the shared legacy key when the user id isn't known yet (very first
 * paint of a cold reload, before the Supabase auth listener has fired).
 */
export function orgKeyForCurrentUser(): string {
  const uid = getCurrentUserId();
  return uid ? `${ACTIVE_ORG_KEY}:${uid}` : ACTIVE_ORG_KEY;
}

/**
 * Read the active organization id. Checks the per-user slot first, then
 * folds forward from the legacy shared slot when necessary. Returns
 * `null` (and clears the slot) when the stored value fails shape
 * validation.
 */
export function readActiveOrgId(): string | null {
  if (hostedTenant) return hostedTenant.organizationId;
  if (typeof window === "undefined") return null;
  const perUserKey = orgKeyForCurrentUser();
  let raw = safeGet(perUserKey);

  // One-time fold-forward from the shared legacy slot when the per-user
  // slot is empty (post-login / new browser).
  if (raw == null && perUserKey !== ACTIVE_ORG_KEY) {
    const legacy = safeGet(ACTIVE_ORG_KEY);
    if (legacy && isUuid(legacy)) {
      safeSet(perUserKey, legacy);
      safeRemove(ACTIVE_ORG_KEY);
      raw = legacy;
    }
  }

  if (!raw) return null;
  if (!isUuid(raw)) {
    safeRemove(perUserKey);
    return null;
  }
  return raw;
}

// -------- Active workspace --------

/**
 * Read the active workspace id. Falls back to the active org id, since
 * organizations and workspaces are aliased throughout this app and every
 * route guard just wants "the current tenant".
 */
export function readActiveWorkspaceId(): string | null {
  if (hostedTenant) return hostedTenant.workspaceId;
  const ws = safeGet(ACTIVE_WS_KEY);
  if (ws && isUuid(ws)) return ws;
  return readActiveOrgId();
}

// -------- Writers --------

export function writeActiveOrgId(id: string) {
  if (!isUuid(id)) return;
  const perUserKey = orgKeyForCurrentUser();
  safeSet(perUserKey, id);
  if (perUserKey !== ACTIVE_ORG_KEY) safeRemove(ACTIVE_ORG_KEY);
  mirrorActiveOrgInUrl(id);
  dispatch(ORG_CHANGED_EVENT);
}

/** Keep the active organization URL atomic with the storage update. */
function mirrorActiveOrgInUrl(id: string) {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (
    path === "/" ||
    path.startsWith("/auth") ||
    path.startsWith("/install") ||
    path.startsWith("/setup") ||
    path.startsWith("/oauth")
  ) {
    return;
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("org") === id) return;
    url.searchParams.set("org", id);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    /* Non-browser/test environment. */
  }
}

export function clearActiveOrgId(userId?: string) {
  safeRemove(orgKeyForCurrentUser());
  if (userId) safeRemove(`${ACTIVE_ORG_KEY}:${userId}`);
  safeRemove(ACTIVE_ORG_KEY);
  dispatch(ORG_CHANGED_EVENT);
}

export function writeActiveWorkspaceId(id: string) {
  if (!isUuid(id)) return;
  safeSet(ACTIVE_WS_KEY, id);
  dispatch(WORKSPACE_CHANGED_EVENT);
}

/** Publish an org/workspace switch only after both browser slots agree. */
export function writeActiveTenantSelection(orgId: string, workspaceId: string | null) {
  if (!isUuid(orgId) || (workspaceId !== null && !isUuid(workspaceId))) return;
  const perUserKey = orgKeyForCurrentUser();
  safeSet(perUserKey, orgId);
  if (perUserKey !== ACTIVE_ORG_KEY) safeRemove(ACTIVE_ORG_KEY);
  if (workspaceId) safeSet(ACTIVE_WS_KEY, workspaceId);
  else safeRemove(ACTIVE_WS_KEY);
  mirrorActiveOrgInUrl(orgId);
  dispatch(ORG_CHANGED_EVENT);
  dispatch(WORKSPACE_CHANGED_EVENT);
}

export function clearActiveWorkspaceId() {
  safeRemove(ACTIVE_WS_KEY);
  dispatch(WORKSPACE_CHANGED_EVENT);
}

function dispatch(event: string) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(event));
  } catch {
    /* jsdom / old runtimes */
  }
}

// -------- Reactive subscription helper --------

/**
 * Subscribe to any local or cross-tab change of the active tenant. The
 * callback runs on: local org/workspace `CustomEvent`s, cross-tab
 * `storage` events on either key, and any per-user org slot mutation.
 */
export function subscribeActiveTenant(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (!e.key) return;
    if (
      e.key === ACTIVE_WS_KEY ||
      e.key === ACTIVE_ORG_KEY ||
      e.key.startsWith(`${ACTIVE_ORG_KEY}:`)
    ) {
      cb();
    }
  };
  window.addEventListener(ORG_CHANGED_EVENT, onLocal);
  window.addEventListener(WORKSPACE_CHANGED_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ORG_CHANGED_EVENT, onLocal);
    window.removeEventListener(WORKSPACE_CHANGED_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}
