/**
 * Language registry used by translatable content (announcements, system
 * templates, release notes, notifications).
 *
 * The full ISO 639-1 catalogue lives in `locale-data.generated.ts`; this module
 * keeps the small helpers the translation editors rely on. Which languages are
 * actually offered is a platform setting (Platform Settings → Localization).
 */
import { WORLD_LANGUAGES, isRtlLanguage } from "./locale-data";

/** Flags for the most commonly used languages; others fall back to a globe. */
const FLAGS: Record<string, string> = {
  en: "🇬🇧", no: "🇳🇴", nb: "🇳🇴", nn: "🇳🇴", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", pt: "🇵🇹",
  it: "🇮🇹", nl: "🇳🇱", ar: "🇸🇦", hi: "🇮🇳", bn: "🇧🇩", zh: "🇨🇳", ja: "🇯🇵", ko: "🇰🇷",
  ru: "🇷🇺", tr: "🇹🇷", pl: "🇵🇱", sv: "🇸🇪", da: "🇩🇰", fi: "🇫🇮", cs: "🇨🇿", el: "🇬🇷",
  he: "🇮🇱", fa: "🇮🇷", ur: "🇵🇰", id: "🇮🇩", ms: "🇲🇾", th: "🇹🇭", vi: "🇻🇳", uk: "🇺🇦",
  ro: "🇷🇴", hu: "🇭🇺", bg: "🇧🇬", sr: "🇷🇸", hr: "🇭🇷", sk: "🇸🇰", sl: "🇸🇮", et: "🇪🇪",
  lv: "🇱🇻", lt: "🇱🇹", sw: "🇰🇪", am: "🇪🇹", ta: "🇱🇰", te: "🇮🇳", mr: "🇮🇳", gu: "🇮🇳",
  pa: "🇮🇳", ml: "🇮🇳", kn: "🇮🇳", si: "🇱🇰", ne: "🇳🇵", my: "🇲🇲", km: "🇰🇭", lo: "🇱🇦",
  fil: "🇵🇭", tl: "🇵🇭", af: "🇿🇦", zu: "🇿🇦", xh: "🇿🇦", ha: "🇳🇬", yo: "🇳🇬", ig: "🇳🇬",
};

export type SupportedLanguage = {
  code: string;
  label: string;
  native: string;
  flag: string;
  rtl: boolean;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = WORLD_LANGUAGES.map((l) => ({
  code: l.code,
  label: l.label,
  native: l.native,
  flag: FLAGS[l.code] ?? "🌐",
  rtl: l.rtl,
}));

export type LanguageCode = string;
export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function getSupportedLanguage(code: string): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}

/** Resolve the option list for a platform's enabled language codes. */
export function languagesFor(codes: readonly string[] | undefined): SupportedLanguage[] {
  if (!codes?.length) return SUPPORTED_LANGUAGES;
  const set = new Set(codes);
  const known = SUPPORTED_LANGUAGES.filter((l) => set.has(l.code));
  return known.length ? known : SUPPORTED_LANGUAGES;
}

export { isRtlLanguage };

export type Translations = Partial<Record<string, { title?: string; body?: string; subject?: string }>>;

export function pickTranslation<T extends { title?: string; body?: string; subject?: string }>(
  translations: Translations | null | undefined,
  fallback: T,
  lang: LanguageCode = DEFAULT_LANGUAGE,
): T {
  if (!translations) return fallback;
  const t = translations[lang];
  if (!t) return fallback;
  return { ...fallback, ...t };
}

/** How complete a translation set is for the given target languages. */
export function translationCoverage(
  translations: Translations | null | undefined,
  targets: readonly string[],
): { filled: number; total: number; missing: string[] } {
  const wanted = targets.filter((c) => c !== DEFAULT_LANGUAGE);
  const missing = wanted.filter((c) => {
    const t = translations?.[c];
    return !t || (!t.title && !t.body && !t.subject);
  });
  return { filled: wanted.length - missing.length, total: wanted.length, missing };
}
