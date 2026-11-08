/**
 * Lightweight language detection + LLM-backed translation.
 * Server-only. Falls back gracefully when providers are unavailable.
 */
import { createDirectGeminiProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import { GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

/**
 * Very fast heuristic detector for the most common ISO-639-1 codes.
 * Not a replacement for franc/cld3, but avoids an extra model call per turn.
 */
export function detectLanguageHeuristic(text: string): string | null {
  if (!text || text.trim().length < 3) return null;
  const t = text.toLowerCase();

  // Character-set / diacritic signals
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0590-\u05ff]/.test(text)) return "he";
  if (/[\u0900-\u097f]/.test(text)) return "hi";

  // Latin-script keyword sniffing
  const table: Array<[string, RegExp]> = [
    ["no", /\b(og|ikke|jeg|hva|hvordan|takk|vær så snill)\b/],
    ["sv", /\b(och|inte|jag|vad|hur|tack)\b/],
    ["da", /\b(og|ikke|jeg|hvad|hvordan|tak)\b/],
    ["de", /\b(und|nicht|ich|was|wie|danke|bitte)\b/],
    ["fr", /\b(et|pas|je|quoi|comment|merci|s'il)\b/],
    ["es", /\b(y|no|yo|qué|cómo|gracias|por favor)\b/],
    ["pt", /\b(e|não|eu|o que|como|obrigad[oa])\b/],
    ["it", /\b(e|non|io|cosa|come|grazie|prego)\b/],
    ["nl", /\b(en|niet|ik|wat|hoe|dank|alstublieft)\b/],
    ["tr", /\b(ve|değil|ben|ne|nasıl|teşekkür)\b/],
    ["pl", /\b(i|nie|ja|co|jak|dziękuję|proszę)\b/],
  ];
  for (const [code, re] of table) if (re.test(t)) return code;

  // Default to English when it looks like ASCII prose
  if (/^[\x00-\x7f]+$/.test(text)) return "en";
  return null;
}

/**
 * LLM-backed translation. Returns the input unchanged when target is falsy
 * or matches the detected language.
 */
export async function translate(opts: {
  apiKey: string;
  text: string;
  targetLanguage: string;
  sourceLanguage?: string | null;
  model?: string;
}): Promise<string> {
  const target = opts.targetLanguage?.trim();
  if (!target || !opts.text.trim()) return opts.text;
  if (opts.sourceLanguage && opts.sourceLanguage === target) return opts.text;

  try {
    const gateway = createDirectGeminiProvider(opts.apiKey);
    const model = gateway(opts.model ?? GEMINI_DEFAULT_CHAT_MODEL);
    const { text } = await generateText({
      model,
      system:
        `Translate the user's text to ${target}. ` +
        `Preserve meaning, tone, markdown, and code blocks verbatim. ` +
        `Return only the translation.`,
      prompt: opts.text,
    });
    return text.trim() || opts.text;
  } catch {
    return opts.text;
  }
}
