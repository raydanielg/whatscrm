/**
 * Public platform runtime configuration.
 *
 * Super Admin → Platform Settings stores every key in `public.settings`
 * (scope='platform'), which only platform staff can read. This server
 * function exposes the *operational, non-sensitive* subset that the app has
 * to honour at runtime for every visitor:
 *
 *  - maintenance   → maintenance / read-only mode for the whole platform
 *  - feature_flags → which modules are visible platform-wide
 *  - authentication→ which sign-in methods the /auth page may offer
 *  - security      → session timeout + password policy shown to users
 *  - localization  → default language / currency / timezone / formats
 *
 * Nothing secret (SMTP credentials, API secrets, storage keys, billing
 * company data) is ever returned here.
 */
import { BRAND_NAME } from "@/lib/branding/brand";
import { createServerFn } from "@tanstack/react-start";
import {
  ANALYTICS_FALLBACK,
  isAnalyticsProvider,
  type AnalyticsConfig,
} from "@/lib/analytics/config";

export type MaintenanceConfig = {
  enabled: boolean;
  readOnly: boolean;
  message: string | null;
  scheduledAt: string | null;
  endsAt: string | null;
};

export type PlatformAuthConfig = {
  allowSignups: boolean;
  inviteOnly: boolean;
  requireEmailVerification: boolean;
  requireMfa: boolean;
  google: boolean;
  apple: boolean;
  magicLink: boolean;
  samlSso: boolean;
};

export type PlatformSecurityConfig = {
  passwordMinLength: number;
  passwordRequireSymbols: boolean;
  passwordRequireNumbers: boolean;
  sessionTimeoutMinutes: number;
};

export type PlatformLocalization = {
  defaultLanguage: string;
  defaultCurrency: string;
  defaultTimezone: string;
  enabledLanguages: string[];
  enabledCurrencies: string[];
  enabledTimezones: string[];
  dateFormat: string;
  timeFormat: "12h" | "24h";
  /** Flip layout direction automatically for RTL languages. */
  rtlAuto: boolean;
  /** Members may pick any enabled language for themselves. */
  allowUserLanguage: boolean;
  /** Language used when a translation is missing. */
  fallbackLanguage: string;
};

export type PlatformWhatsAppCta = {
  enabled: boolean;
  token: string | null;
  message: string | null;
  label: string | null;
  fallbackUrl: string | null;
  /** Platform name, used to render {site} in the prefilled message. */
  siteName: string;
};

export type PlatformRuntimeConfig = {
  maintenance: MaintenanceConfig;
  features: Record<string, boolean>;
  auth: PlatformAuthConfig;
  security: PlatformSecurityConfig;
  localization: PlatformLocalization;
  whatsappCta: PlatformWhatsAppCta;
  /** Configurable marketing/product analytics vendor (public identifiers only). */
  analytics: AnalyticsConfig;
};

/** Feature keys shown in Super Admin → Platform Settings → Feature toggles. */
export const PLATFORM_FEATURE_DEFAULTS: Record<string, boolean> = {
  ai_assistant: true,
  sales_crm: true,
  marketing: true,
  automations: true,
  bi: true,
  kb_rag: true,
  voice_notes: true,
  project_management: true,
  commerce: true,
  booking: true,
  helpdesk: true,
  live_chat: true,
  chatbots: true,
  beta_features: false,
};

export const PLATFORM_RUNTIME_FALLBACK: PlatformRuntimeConfig = {
  maintenance: { enabled: false, readOnly: false, message: null, scheduledAt: null, endsAt: null },
  features: { ...PLATFORM_FEATURE_DEFAULTS },
  auth: {
    allowSignups: true,
    inviteOnly: false,
    requireEmailVerification: true,
    requireMfa: false,
    google: true,
    apple: false,
    magicLink: false,
    samlSso: false,
  },
  security: {
    passwordMinLength: 12,
    passwordRequireSymbols: true,
    passwordRequireNumbers: true,
    sessionTimeoutMinutes: 60,
  },
  localization: {
    defaultLanguage: "en",
    defaultCurrency: "USD",
    defaultTimezone: "UTC",
    enabledLanguages: ["en"],
    enabledCurrencies: ["USD"],
    enabledTimezones: ["UTC"],
    dateFormat: "YYYY-MM-DD",
    timeFormat: "24h",
    rtlAuto: true,
    allowUserLanguage: true,
    fallbackLanguage: "en",
  },
  whatsappCta: {
    enabled: true,
    token: null,
    message: "Hi! I'd like to know more about {site}.",
    label: "Chat on WhatsApp",
    fallbackUrl: "/contact",
    siteName: BRAND_NAME,
  },
  analytics: { ...ANALYTICS_FALLBACK },
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function text(v: unknown, fallback: string, max = 120): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
}
function optText(v: unknown, max = 500): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function list(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 600);
  return out.length ? out : fallback;
}

/** A scheduled window only counts as "in maintenance" while it is current. */
function windowActive(scheduledAt: string | null, endsAt: string | null): boolean {
  const now = Date.now();
  if (scheduledAt) {
    const start = Date.parse(scheduledAt);
    if (Number.isFinite(start) && now < start) return false;
  }
  if (endsAt) {
    const end = Date.parse(endsAt);
    if (Number.isFinite(end) && now > end) return false;
  }
  return true;
}

export const getPlatformRuntimeConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformRuntimeConfig> => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("key, value")
      .eq("scope", "platform")
      .in("key", [
        "maintenance",
        "feature_flags",
        "authentication",
        "security",
        "localization",
        "general",
        "analytics",
      ]);

    if (error || !data) return PLATFORM_RUNTIME_FALLBACK;

    const byKey: Record<string, Record<string, unknown>> = {};
    // Merge rather than overwrite: legacy installs can hold more than one row
    // per key, and dropping the earlier one loses settings.
    for (const row of data) {
      byKey[row.key] = {
        ...(byKey[row.key] ?? {}),
        ...((row.value ?? {}) as Record<string, unknown>),
      };
    }

    const m = byKey["maintenance"] ?? {};
    const f = byKey["feature_flags"] ?? {};
    const a = byKey["authentication"] ?? {};
    const s = byKey["security"] ?? {};
    const l = byKey["localization"] ?? {};
    const g = byKey["general"] ?? {};
    const an = byKey["analytics"] ?? {};
    const fb = PLATFORM_RUNTIME_FALLBACK;

    const scheduledAt = optText(m["scheduled_at"], 40);
    const endsAt = optText(m["ends_at"], 40);
    const inWindow = windowActive(scheduledAt, endsAt);

    const features: Record<string, boolean> = { ...PLATFORM_FEATURE_DEFAULTS };
    for (const [k, v] of Object.entries(f)) {
      if (typeof v === "boolean") features[k] = v;
    }

    return {
      maintenance: {
        enabled: bool(m["enabled"], false) && inWindow,
        readOnly: bool(m["read_only"], false) && inWindow,
        message: optText(m["message"], 500),
        scheduledAt,
        endsAt,
      },
      features,
      auth: {
        allowSignups: bool(a["allow_signups"], fb.auth.allowSignups),
        inviteOnly: bool(a["invite_only"], fb.auth.inviteOnly),
        requireEmailVerification: bool(
          a["require_email_verification"],
          fb.auth.requireEmailVerification,
        ),
        requireMfa: bool(a["require_mfa"], fb.auth.requireMfa),
        google: bool(a["enable_google"], fb.auth.google),
        apple: bool(a["enable_apple"], fb.auth.apple),
        magicLink: bool(a["enable_magic_link"], fb.auth.magicLink),
        samlSso: bool(a["enable_saml_sso"], fb.auth.samlSso),
      },
      security: {
        passwordMinLength: num(s["password_min_length"], fb.security.passwordMinLength, 6, 128),
        passwordRequireSymbols: bool(
          s["password_require_symbols"],
          fb.security.passwordRequireSymbols,
        ),
        passwordRequireNumbers: bool(
          s["password_require_numbers"],
          fb.security.passwordRequireNumbers,
        ),
        sessionTimeoutMinutes: num(
          s["session_timeout_minutes"],
          fb.security.sessionTimeoutMinutes,
          5,
          43_200,
        ),
      },
      localization: {
        defaultLanguage: text(l["default_language"], fb.localization.defaultLanguage, 10),
        defaultCurrency: text(l["default_currency"], fb.localization.defaultCurrency, 10),
        defaultTimezone: text(l["default_timezone"], fb.localization.defaultTimezone, 64),
        enabledLanguages: list(l["enabled_languages"], [text(l["default_language"], "en", 10)]),
        enabledCurrencies: list(l["enabled_currencies"], [text(l["default_currency"], "USD", 10)]),
        enabledTimezones: list(l["enabled_timezones"], [text(l["default_timezone"], "UTC", 64)]),
        dateFormat: text(l["date_format"], fb.localization.dateFormat, 32),
        timeFormat: l["time_format"] === "12h" ? "12h" : "24h",
        rtlAuto: bool(l["rtl_auto"], fb.localization.rtlAuto),
        allowUserLanguage: bool(l["allow_user_language"], fb.localization.allowUserLanguage),
        fallbackLanguage: text(l["fallback_language"], fb.localization.fallbackLanguage, 10),
      },
      whatsappCta: {
        enabled: bool(g["whatsapp_cta_enabled"], fb.whatsappCta.enabled),
        token: optText(g["whatsapp_token"], 200),
        message: optText(g["whatsapp_message"], 600) ?? fb.whatsappCta.message,
        label: optText(g["whatsapp_cta_label"], 40) ?? fb.whatsappCta.label,
        fallbackUrl: optText(g["whatsapp_fallback_url"], 2048) ?? fb.whatsappCta.fallbackUrl,
        siteName: text(g["platform_name"], fb.whatsappCta.siteName, 60),
      },
      analytics: {
        provider: isAnalyticsProvider(an["provider"]) ? an["provider"] : fb.analytics.provider,
        key: optText(an["key"], 120),
        host: optText(an["host"], 200),
        trackPageViews: bool(an["track_page_views"], fb.analytics.trackPageViews),
        requireConsent: bool(an["require_consent"], fb.analytics.requireConsent),
        debug: bool(an["debug"], fb.analytics.debug),
      },
    };
  },
);
