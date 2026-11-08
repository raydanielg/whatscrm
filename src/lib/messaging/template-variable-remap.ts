/**
 * One-click recovery for templates Meta rejected because of variable-index
 * problems ("Invalid parameter", "param body_text ", non-sequential {{n}}).
 *
 * The remap renumbers placeholders to sequential {{1}}, {{2}},  per component
 * and carries every dependent artefact along so nothing else changes:
 *  - the component `example` arrays keep pointing at the same sample values
 *  - stored variable example values are re-keyed to the new indices
 *  - name, language, category and buttons are never touched
 *
 * Client-safe: no server-only imports.
 */

import {
  remapTemplateComponentTokens,
  type TemplateTokenFix,
} from "./template-body-validation";
import { templateVariableExamples } from "./template-variables";

const TOKEN_RE = /\{\{([^{}]*)\}\}/g;

/** old token (as written inside {{ }}) -> new positional index, per component. */
export function buildTokenIndexMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const key = String(m[1]).trim();
    if (!key || map.has(key)) continue;
    map.set(key, String(map.size + 1));
  }
  return map;
}

export type TemplateVariableRemap = {
  /** Components with renumbered placeholders and reordered examples. */
  components: Array<Record<string, unknown>>;
  /** Per-component text rewrites, for display. */
  fixes: TemplateTokenFix[];
  /** old token -> new token, merged across components (display/preview only). */
  tokenMap: Record<string, string>;
  /** Stored variable examples re-keyed to the new indices. */
  variableExamples: Record<string, string>;
};

type TextComponent = {
  type?: string;
  text?: string;
  example?: Record<string, unknown>;
};

const EXAMPLE_KEYS = ["body_text", "header_text", "footer_text"] as const;

/**
 * Reorders an example row so that sample values follow their placeholder to the
 * new index. Positional tokens only — named tokens have no positional example.
 */
function reorderExampleRow(row: unknown, map: Map<string, string>): unknown {
  if (!Array.isArray(row)) return row;
  const next: unknown[] = [];
  for (const [oldToken, newToken] of map) {
    const oldIndex = Number(oldToken);
    const target = Number(newToken) - 1;
    const value = Number.isFinite(oldIndex) ? row[oldIndex - 1] : undefined;
    next[target] = value ?? row[target] ?? "";
  }
  return next.length > 0 ? next.map((v) => v ?? "") : row;
}

function reorderExample(
  example: Record<string, unknown> | undefined,
  map: Map<string, string>,
): Record<string, unknown> | undefined {
  if (!example) return example;
  const out: Record<string, unknown> = { ...example };
  for (const key of EXAMPLE_KEYS) {
    const value = example[key];
    if (!Array.isArray(value)) continue;
    // body_text is an array of rows; header/footer text is a flat array.
    out[key] =
      key === "body_text" && Array.isArray(value[0])
        ? value.map((row) => reorderExampleRow(row, map))
        : reorderExampleRow(value, map);
  }
  return out;
}

/**
 * Builds the fixed component set. Returns null when there is nothing to remap,
 * so callers can hide the action instead of resubmitting an identical payload.
 */
export function buildTemplateVariableRemap(
  components: unknown,
  variables?: unknown,
): TemplateVariableRemap | null {
  const { components: renumbered, fixes } = remapTemplateComponentTokens(components);
  if (fixes.length === 0) return null;

  const source = Array.isArray(components) ? (components as TextComponent[]) : [];
  const tokenMap: Record<string, string> = {};

  const withExamples = (renumbered as TextComponent[]).map((component, index) => {
    const original = source[index];
    const text = typeof original?.text === "string" ? original.text : "";
    if (!text) return component;
    const map = buildTokenIndexMap(text);
    if (map.size === 0) return component;
    for (const [from, to] of map) if (from !== to) tokenMap[from] = to;
    const example = reorderExample(component?.example, map);
    return example ? { ...component, example } : component;
  });

  const storedExamples = templateVariableExamples(variables);
  const variableExamples: Record<string, string> = {};
  for (const [key, value] of Object.entries(storedExamples)) {
    variableExamples[tokenMap[key] ?? key] = value;
  }

  return {
    components: withExamples as Array<Record<string, unknown>>,
    fixes,
    tokenMap,
    variableExamples,
  };
}

const VARIABLE_REJECTION_RE =
  /(param(eter)?\s+.*(body_text|header_text|localizable_param)|variable|placeholder|\{\{|number of parameters|param.*missing|130472|132000|132001|132012|132068)/i;

/** True when a Meta rejection reason points at a variable/placeholder problem. */
export function isVariableIndexRejection(reason: string | null | undefined): boolean {
  const text = (reason ?? "").trim();
  if (!text) return false;
  return VARIABLE_REJECTION_RE.test(text);
}
