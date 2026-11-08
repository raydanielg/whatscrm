/**
 * Template variable normalisation.
 *
 * `wa_templates.variables` has been written in two shapes over time:
 *  - a plain string array: ["1", "2", "name"]
 *  - an object array from provider sync: [{ index: 1, example: "..." }, ...]
 *
 * Rendering the object shape directly produces "{{[object Object]}}", so every
 * UI surface must go through this helper.
 */
export function normalizeTemplateVariables(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === "string" || typeof v === "number") {
      const s = String(v).trim();
      if (s) out.push(s);
      continue;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const key = o["name"] ?? o["index"] ?? o["key"] ?? o["placeholder"] ?? o["param"];
      if (typeof key === "string" || typeof key === "number") {
        const s = String(key).trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
        if (s) out.push(s);
      }
    }
  }
  return Array.from(new Set(out));
}

/** Example values keyed by variable token, when the stored shape carries them. */
export function templateVariableExamples(raw: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(raw)) return map;
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const key = o["name"] ?? o["index"] ?? o["key"];
    const example = o["example"];
    if ((typeof key === "string" || typeof key === "number") && typeof example === "string") {
      map[String(key)] = example;
    }
  }
  return map;
}
