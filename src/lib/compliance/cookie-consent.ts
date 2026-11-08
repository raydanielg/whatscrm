/**
 * Cookie consent storage helpers.
 *
 * The visitor's decision is kept in localStorage (so the banner never
 * re-appears and analytics code can read it synchronously) and mirrored to the
 * backend `cookie_consents` table as an auditable consent log.
 *
 * Consent is category-based. "necessary" is always on and cannot be toggled.
 */
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export const COOKIE_CONSENT_VERSION = "v1";
export const COOKIE_CONSENT_STORAGE_KEY = "wacrm.cookie-consent";
export const COOKIE_CONSENT_CHANGED_EVENT = "wacrm:cookie-consent-changed";

export type CookieDecision = "accepted" | "declined" | "custom";

export type CookieCategory = "necessary" | "preferences" | "analytics" | "marketing";

export type CookieCategories = Record<CookieCategory, boolean>;

export type StoredCookieConsent = {
  decision: CookieDecision;
  categories: CookieCategories;
  version: string;
  visitorId: string;
  decidedAt: string;
};

export const COOKIE_CATEGORY_META: {
  id: CookieCategory;
  label: string;
  description: string;
  required?: boolean;
}[] = [
  {
    id: "necessary",
    label: "Strictly necessary",
    description:
      "Required for sign-in, security and core functionality. These cannot be switched off.",
    required: true,
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Remember your theme, language and workspace choices between visits.",
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Help us understand how this app is used so we can improve it.",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Used to measure campaigns and show relevant content off-site.",
  },
];

export const ALL_OFF: CookieCategories = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export const ALL_ON: CookieCategories = {
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: true,
};

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function normalizeCategories(input: unknown): CookieCategories {
  const source = (input ?? {}) as Partial<Record<CookieCategory, unknown>>;
  return {
    necessary: true,
    preferences: source.preferences === true,
    analytics: source.analytics === true,
    marketing: source.marketing === true,
  };
}

/** Derive the coarse decision label from the selected categories. */
export function decisionFor(categories: CookieCategories): CookieDecision {
  const optional: CookieCategory[] = ["preferences", "analytics", "marketing"];
  if (optional.every((c) => categories[c])) return "accepted";
  if (optional.every((c) => !categories[c])) return "declined";
  return "custom";
}

export function readCookieConsent(): StoredCookieConsent | null {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCookieConsent>;
    if (parsed?.decision !== "accepted" && parsed?.decision !== "declined" && parsed?.decision !== "custom") {
      return null;
    }
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    return {
      decision: parsed.decision,
      // Consent stored before categories existed: accepted => all on.
      categories: parsed.categories
        ? normalizeCategories(parsed.categories)
        : parsed.decision === "accepted"
          ? { ...ALL_ON }
          : { ...ALL_OFF },
      version: parsed.version,
      visitorId: parsed.visitorId ?? getOrCreateVisitorId(),
      decidedAt: parsed.decidedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** True when the given category is allowed. Necessary is always allowed. */
export function hasCookieConsentFor(category: CookieCategory): boolean {
  if (category === "necessary") return true;
  return readCookieConsent()?.categories[category] === true;
}

function getOrCreateVisitorId(): string {
  const store = safeLocalStorage();
  const key = "wacrm.visitor-id";
  const existing = store?.getItem(key);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  store?.setItem(key, id);
  return id;
}

/**
 * Persist the visitor's category choices locally, then append them to the
 * backend consent log. A backend failure never blocks the UI — the local
 * choice still stands.
 */
export async function recordCookieConsent(
  input: CookieDecision | Partial<CookieCategories>,
): Promise<StoredCookieConsent> {
  const categories: CookieCategories =
    input === "accepted"
      ? { ...ALL_ON }
      : input === "declined"
        ? { ...ALL_OFF }
        : input === "custom"
          ? { ...ALL_OFF }
          : normalizeCategories(input);

  const visitorId = getOrCreateVisitorId();
  const stored: StoredCookieConsent = {
    decision: decisionFor(categories),
    categories,
    version: COOKIE_CONSENT_VERSION,
    visitorId,
    decidedAt: new Date().toISOString(),
  };
  safeLocalStorage()?.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(stored));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: stored }));
  }

  try {
    const { data } = await supabase.auth.getSession();
    const { error } = await sbAny(supabase).from("cookie_consents").insert({
      visitor_id: visitorId,
      decision: stored.decision,
      categories,
      policy_version: COOKIE_CONSENT_VERSION,
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      user_id: data.session?.user?.id ?? null,
    });
    if (error) console.warn("[cookie-consent] could not log consent", error.message);
  } catch (err) {
    console.warn("[cookie-consent] consent logging failed", err);
  }

  return stored;
}

/** Clear the stored decision so the banner shows again. */
export function resetCookieConsent() {
  safeLocalStorage()?.removeItem(COOKIE_CONSENT_STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: null }));
  }
}

/** Open the preferences dialog from anywhere (footer link, policy page). */
export const COOKIE_PREFERENCES_OPEN_EVENT = "wacrm:cookie-preferences-open";

export function openCookiePreferences() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COOKIE_PREFERENCES_OPEN_EVENT));
  }
}
