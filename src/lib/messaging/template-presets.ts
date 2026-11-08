/**
 * Reusable parameter presets per WhatsApp template.
 *
 * A preset is a named set of {{variable}} values the user saved while filling
 * the parameter editor, so the next send can be a single click instead of
 * retyping everything. Stored locally per template id.
 */

export type TemplatePreset = {
  id: string;
  name: string;
  values: Record<string, string>;
  updatedAt: number;
};

const PRESET_PREFIX = "wacrm:tpl-presets:";
const MAX_PRESETS = 20;

const key = (templateId: string) => PRESET_PREFIX + templateId;

function clean(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function isPreset(v: unknown): v is TemplatePreset {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    !!p.values &&
    typeof p.values === "object"
  );
}

export function loadPresets(templateId: string | undefined): TemplatePreset[] {
  if (!templateId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(templateId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isPreset)
      .map((p) => ({
        id: p.id,
        name: p.name,
        values: clean(p.values as Record<string, string>),
        updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function persist(templateId: string, presets: TemplatePreset[]): TemplatePreset[] {
  const trimmed = presets.slice(0, MAX_PRESETS);
  try {
    window.localStorage.setItem(key(templateId), JSON.stringify(trimmed));
  } catch {
    /* storage disabled — presets are best-effort */
  }
  return trimmed;
}

/** Create or overwrite a preset by (case-insensitive) name. Returns the new list. */
export function savePreset(
  templateId: string | undefined,
  name: string,
  values: Record<string, string>,
): TemplatePreset[] {
  if (!templateId || typeof window === "undefined") return [];
  const label = name.trim();
  const kept = clean(values);
  if (!label || Object.keys(kept).length === 0) return loadPresets(templateId);

  const existing = loadPresets(templateId);
  const match = existing.find((p) => p.name.toLowerCase() === label.toLowerCase());
  const entry: TemplatePreset = {
    id: match?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: label,
    values: kept,
    updatedAt: Date.now(),
  };
  const next = [entry, ...existing.filter((p) => p.id !== entry.id)];
  return persist(templateId, next);
}

export function deletePreset(
  templateId: string | undefined,
  presetId: string,
): TemplatePreset[] {
  if (!templateId || typeof window === "undefined") return [];
  return persist(
    templateId,
    loadPresets(templateId).filter((p) => p.id !== presetId),
  );
}

/** Merge a preset over the current values (preset wins for the tokens it covers). */
export function applyPreset(
  tokens: string[],
  current: Record<string, string>,
  preset: TemplatePreset | undefined,
): Record<string, string> {
  const next = { ...current };
  if (!preset) return next;
  for (const t of tokens) {
    const v = preset.values[t];
    if (typeof v === "string" && v.trim()) next[t] = v;
  }
  return next;
}
