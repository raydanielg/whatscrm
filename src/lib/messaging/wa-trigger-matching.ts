/**
 * Shared trigger-matching helpers for WA Chatbot auto-reply rules.
 *
 * Used by both the live runtime (`wa-auto-reply.server.ts`) and the
 * simulator (`components/app/wa-chatbot/test-console.tsx`) so the two
 * stay in lockstep.
 */

export type WaTriggerType =
  | "exact"
  | "contains"
  | "starts_with"
  | "regex"
  | "any"
  | "welcome"
  | "offline"
  | "handoff"
  | "language";

export const WA_TRIGGER_LABEL: Record<WaTriggerType, string> = {
  exact: "Exact match",
  contains: "Contains",
  starts_with: "Starts with",
  regex: "Regex",
  any: "Any message",
  welcome: "Welcome (first message)",
  offline: "Outside business hours",
  handoff: "Operator handoff requested",
  language: "Language detected",
};

/** Triggers that ignore the keyword list entirely. */
export const WA_TRIGGERS_WITHOUT_KEYWORDS: WaTriggerType[] = [
  "any",
  "welcome",
  "offline",
];

/** Placeholder shown in the keywords input, per trigger type. */
export function keywordsPlaceholder(trigger: WaTriggerType): string {
  if (trigger === "language") return "es, fr, ar  (leave empty to match any non-English)";
  if (trigger === "handoff") return "extra phrases (optional) — defaults are built in";
  if (trigger === "regex") return "^order\\s+\\d+$";
  return "hi, hello, hola";
}

/* ------------------------------------------------------------------ */
/* Operator handoff intent                                             */
/* ------------------------------------------------------------------ */

/** Built-in phrases that signal the contact wants a human agent. */
export const HANDOFF_PHRASES: string[] = [
  "human", "human agent", "real person", "real human",
  "agent", "operator", "representative", "customer service",
  "talk to someone", "speak to someone", "talk to a person",
  "speak to a person", "live chat", "live agent", "support team",
  "escalate", "supervisor", "manager",
  // common non-English equivalents
  "agente", "persona real", "hablar con alguien",
  "humano", "atendente", "conseiller", "parler à un humain",
  "mitarbeiter", "mensch", "оператор", "живой человек",
  "موظف", "خدمة العملاء",
];

/**
 * True when the message reads as a request to be transferred to a human.
 * `extra` lets a rule add its own phrases via the keywords field.
 * Returns every phrase that hit, plus whether it came from the built-in
 * dictionary or the rule's own list, so callers can explain the decision.
 */
export function isHandoffRequest(
  message: string,
  extra: string[] = [],
): { ok: boolean; phrase?: string; source?: "built-in" | "custom"; phrases: string[] } {
  const msg = (message ?? "").toLowerCase().trim();
  if (!msg) return { ok: false, phrases: [] };
  const custom = extra.map((k) => k.toLowerCase().trim()).filter(Boolean);
  const phrases = [...HANDOFF_PHRASES, ...custom];
  const hits = phrases.filter((p) => msg.includes(p));
  if (hits.length === 0) return { ok: false, phrases: [] };
  const phrase = hits[0];
  return {
    ok: true,
    phrase,
    source: custom.includes(phrase) && !HANDOFF_PHRASES.includes(phrase) ? "custom" : "built-in",
    phrases: hits,
  };
}


/* ------------------------------------------------------------------ */
/* Lightweight language detection                                      */
/* ------------------------------------------------------------------ */

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "no", label: "Norwegian" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "he", label: "Hebrew" },
  { code: "th", label: "Thai" },
];

const SCRIPT_RANGES: { code: string; re: RegExp }[] = [
  { code: "ar", re: /[\u0600-\u06ff]/ },
  { code: "he", re: /[\u0590-\u05ff]/ },
  { code: "ru", re: /[\u0400-\u04ff]/ },
  { code: "hi", re: /[\u0900-\u097f]/ },
  { code: "th", re: /[\u0e00-\u0e7f]/ },
  { code: "ko", re: /[\uac00-\ud7af\u1100-\u11ff]/ },
  { code: "ja", re: /[\u3040-\u30ff]/ },
  { code: "zh", re: /[\u4e00-\u9fff]/ },
];

/** High-signal stop words per Latin-script language. */
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "is", "are", "you", "please", "hello", "hi", "thanks", "help", "and", "what", "how", "my", "can"],
  es: ["hola", "gracias", "por favor", "buenos", "cómo", "qué", "necesito", "quiero", "el", "la", "los", "una", "está", "puedo"],
  pt: ["olá", "obrigado", "obrigada", "por favor", "você", "não", "preciso", "quero", "está", "bom dia", "como"],
  fr: ["bonjour", "merci", "s'il vous plaît", "je", "vous", "est", "les", "une", "pourquoi", "comment", "besoin"],
  de: ["hallo", "danke", "bitte", "ich", "nicht", "und", "wie", "brauche", "guten", "kann", "eine"],
  it: ["ciao", "grazie", "per favore", "sono", "non", "come", "vorrei", "buongiorno", "una", "posso"],
  nl: ["hallo", "bedankt", "alstublieft", "ik", "niet", "hoe", "een", "graag", "kan"],
  no: ["hei", "takk", "vær så snill", "jeg", "ikke", "hvordan", "kan", "trenger", "god dag"],
};

export type LanguageDetection = {
  /** ISO-ish language code, or `"unknown"`. */
  code: string;
  /** 0–1 score describing how sure the detector is. */
  confidence: number;
  /** How the code was decided. */
  method: "script" | "stopwords" | "none";
  /** Concrete signals behind the decision (characters or stop words seen). */
  signals: string[];
  /** Runner-up language code, when stop-word scoring found one. */
  runnerUp?: string;
};

/** Default minimum confidence for language triggers (60%). */
export const DEFAULT_LANGUAGE_MIN_CONFIDENCE = 0.6;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Best-effort language detection with a confidence score.
 *
 * Non-Latin scripts are scored by how much of the message uses that script.
 * Latin-script languages are scored with stop-word hits, weighted by how much
 * of the message they cover and how far ahead the winner is from runner-up.
 */
export function detectLanguageWithConfidence(message: string): LanguageDetection {
  const raw = (message ?? "").trim();
  if (!raw) return { code: "unknown", confidence: 0, method: "none", signals: [] };

  const letters = raw.match(/\p{L}/gu)?.length ?? 0;

  for (const { code, re } of SCRIPT_RANGES) {
    if (!re.test(raw)) continue;
    const global = new RegExp(re.source, "gu");
    const hits = raw.match(global)?.length ?? 0;
    const ratio = letters > 0 ? hits / letters : 1;
    // A distinctive script is a strong signal even from a few characters.
    const confidence = clamp01(0.6 + 0.4 * ratio);
    const sample = Array.from(new Set((raw.match(global) ?? []).slice(0, 6)));
    return {
      code,
      confidence: round2(confidence),
      method: "script",
      signals: [
        `${hits}/${letters || hits} letters in ${languageLabel(code)} script`,
        ...(sample.length ? [sample.join("")] : []),
      ],
    };
  }

  const normalized = ` ${raw.toLowerCase().replace(/[^\p{L}\s']/gu, " ").replace(/\s+/g, " ")} `;
  const wordCount = normalized.trim().split(" ").filter(Boolean).length;

  let best = "unknown";
  let bestScore = 0;
  let secondScore = 0;
  let runnerUp: string | undefined;
  const hitsByCode: Record<string, string[]> = {};
  for (const [code, words] of Object.entries(STOPWORDS)) {
    let score = 0;
    const hits: string[] = [];
    for (const w of words) {
      if (normalized.includes(` ${w} `)) {
        score += w.includes(" ") ? 2 : 1;
        hits.push(w);
      }
    }
    hitsByCode[code] = hits;
    if (score > bestScore) {
      secondScore = bestScore;
      runnerUp = best !== "unknown" ? best : runnerUp;
      bestScore = score;
      best = code;
    } else if (score > secondScore) {
      secondScore = score;
      runnerUp = code;
    }
  }

  if (bestScore === 0) return { code: "unknown", confidence: 0, method: "none", signals: [] };

  const expectedHits = Math.max(2, Math.ceil(wordCount * 0.4));
  const coverage = clamp01(bestScore / expectedHits);
  const margin = bestScore > 0 ? clamp01((bestScore - secondScore) / bestScore) : 0;
  const confidence = clamp01(0.4 + 0.35 * coverage + 0.25 * margin);

  return {
    code: best,
    confidence: round2(confidence),
    method: "stopwords",
    signals: hitsByCode[best] ?? [],
    runnerUp: secondScore > 0 ? runnerUp : undefined,
  };
}

/**
 * Best-effort language detection. Returns `"unknown"` when nothing scores.
 * Prefer {@link detectLanguageWithConfidence} when the score matters.
 */
export function detectLanguage(message: string): string {
  return detectLanguageWithConfidence(message).code;
}

/** Language label for a code, falling back to the raw code. */
export function languageLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Normalizes a stored/entered min-confidence value into the 0–1 range. */
export function normalizeMinConfidence(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_LANGUAGE_MIN_CONFIDENCE;
  return clamp01(n);
}

/**
 * Language trigger: matches when the detected language is in the rule's
 * keyword list (codes or names) AND the detector is at least as confident as
 * the rule's minimum. Empty list = match any non-English message.
 */
export function matchesLanguage(
  message: string,
  keywords: string[],
  minConfidence: number = DEFAULT_LANGUAGE_MIN_CONFIDENCE,
): {
  ok: boolean;
  detected: string;
  confidence: number;
  minConfidence: number;
  belowConfidence: boolean;
  method: LanguageDetection["method"];
  signals: string[];
  runnerUp?: string;
  targeted: string[];
} {
  const detection = detectLanguageWithConfidence(message);
  const { code: detected, confidence } = detection;
  const min = normalizeMinConfidence(minConfidence);
  const wanted = (keywords ?? [])
    .map((k) => k.toLowerCase().trim())
    .map((k) => SUPPORTED_LANGUAGES.find((l) => l.label.toLowerCase() === k)?.code ?? k)
    .filter(Boolean);

  const languageMatch = wanted.length === 0
    ? detected !== "en" && detected !== "unknown"
    : wanted.includes(detected);

  const confident = confidence >= min;
  return {
    ok: languageMatch && confident,
    detected,
    confidence,
    minConfidence: min,
    belowConfidence: languageMatch && !confident,
    method: detection.method,
    signals: detection.signals,
    runnerUp: detection.runnerUp,
    targeted: wanted,
  };
}

