/**
 * Platform-wide locale reference data.
 *
 * Static ISO 4217 currencies, IANA timezones and ISO 639-1 languages live in
 * `locale-data.generated.ts`. This module adds lookups, labels and formatting
 * helpers used by Platform Settings → Localization and by anything that needs
 * to render a currency/timezone/language nicely.
 */
import {
  WORLD_LANGUAGES,
  WORLD_CURRENCIES,
  WORLD_TIMEZONES,
  type WorldLanguage,
  type WorldCurrency,
} from "./locale-data.generated";

export { WORLD_LANGUAGES, WORLD_CURRENCIES, WORLD_TIMEZONES };
export type { WorldLanguage, WorldCurrency };

const LANG_BY_CODE = new Map(WORLD_LANGUAGES.map((l) => [l.code, l]));
const CURRENCY_BY_CODE = new Map(WORLD_CURRENCIES.map((c) => [c.code, c]));

export function getLanguage(code: string): WorldLanguage | undefined {
  return LANG_BY_CODE.get(code) ?? LANG_BY_CODE.get(code.split("-")[0] ?? "");
}

export function languageLabel(code: string): string {
  const l = getLanguage(code);
  return l ? `${l.label} (${code})` : code;
}

export function isRtlLanguage(code: string): boolean {
  return getLanguage(code)?.rtl ?? false;
}

export function getCurrency(code: string): WorldCurrency | undefined {
  return CURRENCY_BY_CODE.get(code.toUpperCase());
}

export function currencyLabel(code: string): string {
  const c = getCurrency(code);
  return c ? `${c.code} — ${c.label}` : code;
}

/** Current UTC offset for an IANA zone, e.g. "UTC+05:30". Falls back to "UTC". */
export function timezoneOffsetLabel(zone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name && name !== "GMT" ? name.replace("GMT", "UTC") : "UTC+00:00";
  } catch {
    return "UTC+00:00";
  }
}

export function timezoneLabel(zone: string): string {
  return `${zone.replace(/_/g, " ")} · ${timezoneOffsetLabel(zone)}`;
}

/** Timezones grouped by region prefix (America, Europe, Asia, ). */
export function timezonesByRegion(): Array<{ region: string; zones: string[] }> {
  const map = new Map<string, string[]>();
  for (const z of WORLD_TIMEZONES) {
    const region = z.includes("/") ? (z.split("/")[0] as string) : "Other";
    const list = map.get(region) ?? [];
    list.push(z);
    map.set(region, list);
  }
  return Array.from(map.entries())
    .map(([region, zones]) => ({ region, zones }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

export const DATE_FORMAT_OPTIONS = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
  "D MMM YYYY",
  "MMM D, YYYY",
  "dddd, D MMMM YYYY",
] as const;

/** Sensible starting set so a fresh platform is not empty. */
export const COMMON_LANGUAGES = ["en", "es", "fr", "de", "pt", "it", "nl", "ar", "hi", "bn", "zh", "ja"];
export const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "INR", "BDT", "BRL", "CAD", "AUD", "JPY", "CNY"];
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
