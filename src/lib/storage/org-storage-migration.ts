/**
 * localStorage schema migration for org-scoped state.
 *
 * The stored active org key is versioned (`wacrm.org.active.v1`). When we
 * bump the schema — key rename, value shape change, new derived caches that
 * must be purged — increment `CURRENT_ORG_STORAGE_VERSION` and add a step in
 * `runOrgStorageMigrations()` that walks a stored version forward.
 *
 * Migration rules:
 * - Run once at app boot, before any hook reads the active org.
 * - Never leak org-scoped cached data across schema changes: when the shape
 *   is unknown, drop derived caches and keep only a validated UUID id.
 * - Idempotent and SSR-safe (no-op when `window` is undefined).
 */
const VERSION_KEY = "wacrm.org.storage.version";
export const CURRENT_ORG_STORAGE_VERSION = 4;

/**
 * Pre-rebrand namespaces, oldest first. The product shipped as "Wadiff",
 * then "Swiffer", before settling on "WACRM"; a browser that skipped an
 * intermediate release can still hold keys under either old prefix.
 */
const LEGACY_BRAND_NAMES = ["wadiff", "swiffer"] as const;

const ACTIVE_ORG_KEY = "wacrm.org.active.v1";
const ACTIVE_WS_KEY = "wacrm.workspace.active.v1";
const LEGACY_ACTIVE_ORG_KEYS = [
  "wacrm.org.active", // pre-v1: unversioned
  "wacrm.active.org", // very old alias
  "activeOrgId", // pre-namespaced dev key
];
const LEGACY_ACTIVE_WS_KEYS = ["wacrm.workspace.active", "activeWorkspaceId"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Purge every org-scoped derived cache we're aware of. Called whenever the
 * schema version is unknown or advances past a shape change: it prevents
 * an old-shape cache from being re-hydrated against new-shape readers.
 *
 * The active org id and workspace id are intentionally NOT wiped here —
 * callers pass them through explicitly.
 */
function purgeOrgScopedDerivedCaches() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      // Anything under wacrm.org.* other than the active id/version is
      // treated as an org-scoped derived cache and dropped on migration.
      if (
        k.startsWith("wacrm.org.") &&
        k !== ACTIVE_ORG_KEY &&
        k !== VERSION_KEY
      ) {
        keys.push(k);
      }
      // TanStack Query persisted cache, if ever mounted, is org-scoped.
      if (k.startsWith("wacrm.query.")) keys.push(k);
    }
    keys.forEach(safeRemove);
  } catch {
    /* ignore */
  }
}

function readAnyLegacyOrgId(): string | null {
  for (const legacy of LEGACY_ACTIVE_ORG_KEYS) {
    const raw = safeGet(legacy);
    if (raw && UUID_RE.test(raw)) return raw;
  }
  return null;
}
function readAnyLegacyWorkspaceId(): string | null {
  for (const legacy of LEGACY_ACTIVE_WS_KEYS) {
    const raw = safeGet(legacy);
    if (raw && UUID_RE.test(raw)) return raw;
  }
  return null;
}

/**
 * Advance the org-storage schema. Safe to call multiple times; only the
 * first call per version bump performs work. Returns the version reached.
 */
/**
 * Rebrand fold-forward: copy any entry under a legacy brand namespace
 * (`wadiff.*`, `wadiff:*`, `swiffer.*`, `swiffer:*`) to the matching
 * `wacrm.*` key (without clobbering an existing value) and drop the old
 * one. Runs before the version read so the stored schema version itself
 * survives the rename.
 */
function migrateLegacyBrandNamespace() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const brand = LEGACY_BRAND_NAMES.find(
        (b) => k.startsWith(`${b}.`) || k.startsWith(`${b}:`),
      );
      if (!brand) continue;
      const next = `wacrm${k.slice(brand.length)}`;
      const value = safeGet(k);
      if (value != null && safeGet(next) == null) safeSet(next, value);
      stale.push(k);
    }
    stale.forEach(safeRemove);
  } catch {
    /* ignore */
  }
}

export function runOrgStorageMigrations(): number {
  if (typeof window === "undefined") return CURRENT_ORG_STORAGE_VERSION;

  migrateLegacyBrandNamespace();

  const storedRaw = safeGet(VERSION_KEY);
  const stored = storedRaw != null ? Number.parseInt(storedRaw, 10) : NaN;
  let version = Number.isFinite(stored) && stored > 0 ? stored : 0;

  if (version === CURRENT_ORG_STORAGE_VERSION) return version;

  // v0 -> v1: adopt the versioned `wacrm.org.active.v1` key. Fold any
  // pre-versioned legacy keys forward, then drop them. Purge unknown
  // shaped derived caches so nothing rehydrates against new readers.
  if (version < 1) {
    const currentActive = safeGet(ACTIVE_ORG_KEY);
    if (!currentActive || !UUID_RE.test(currentActive)) {
      const legacyOrg = readAnyLegacyOrgId();
      if (legacyOrg) safeSet(ACTIVE_ORG_KEY, legacyOrg);
      else if (currentActive) safeRemove(ACTIVE_ORG_KEY); // corrupt value
    }
    const currentWs = safeGet(ACTIVE_WS_KEY);
    if (!currentWs || !UUID_RE.test(currentWs)) {
      const legacyWs = readAnyLegacyWorkspaceId();
      if (legacyWs) safeSet(ACTIVE_WS_KEY, legacyWs);
      else if (currentWs) safeRemove(ACTIVE_WS_KEY);
    }
    LEGACY_ACTIVE_ORG_KEYS.forEach(safeRemove);
    LEGACY_ACTIVE_WS_KEYS.forEach(safeRemove);
    purgeOrgScopedDerivedCaches();
    version = 1;
  }

  // v1 -> v2: query-key hashing became org-scoped (see
  // `src/lib/query/org-scope.ts`). Any previously persisted query cache is
  // now unaddressable, so drop derived caches to prevent stale reads.
  if (version < 2) {
    purgeOrgScopedDerivedCaches();
    version = 2;
  }

  // v2 -> v3: product rebrand Wadiff -> Swiffer. Storage keys moved out of
  // the `wadiff.*` namespace (handled above); derived caches are dropped so
  // nothing rehydrates under a half-renamed namespace.
  if (version < 3) {
    purgeOrgScopedDerivedCaches();
    version = 3;
  }

  // v3 -> v4: product rebrand Swiffer -> WACRM. Storage keys moved from the
  // `swiffer.*` namespace to `wacrm.*` (handled by the fold-forward above);
  // derived caches are dropped for the same reason as v3.
  if (version < 4) {
    purgeOrgScopedDerivedCaches();
    version = 4;
  }

  safeSet(VERSION_KEY, String(CURRENT_ORG_STORAGE_VERSION));
  return CURRENT_ORG_STORAGE_VERSION;
}

// Auto-run at module load so any subsequent `getActiveOrgId()` reader sees
// the migrated shape. Guarded for SSR / worker contexts.
if (typeof window !== "undefined") {
  try {
    runOrgStorageMigrations();
  } catch {
    /* never let a migration failure break app boot */
  }
}
