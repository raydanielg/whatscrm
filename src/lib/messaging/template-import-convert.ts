/**
 * Optional converter for imported templates.
 *
 * Templates copied in from another tool (or duplicated from an older draft)
 * often use named placeholders such as {{name}} or {{order_id}}. Meta only
 * accepts positional placeholders, so this converter rewrites them to
 * {{1}}, {{2}},  in the order they first appear — per component, because Meta
 * scopes positional parameters per component (HEADER/BODY/FOOTER/each URL
 * button).
 *
 * The conversion is opt-in: it returns a plan the UI can preview before the
 * draft is saved. Input is never mutated.
 *
 * Client-safe: no server-only imports.
 */

import { renumberTemplateTokens, templateTokenRenameMap } from "./template-body-validation";

export type ConvertScope = "HEADER" | "BODY" | "FOOTER" | "BUTTON_URL";

export type ConvertedPlaceholder = {
  scope: ConvertScope;
  /** Button index when scope is BUTTON_URL. */
  buttonIndex?: number;
  /** Raw token as written, e.g. "order_id". */
  from: string;
  /** Numbered replacement, e.g. "1". */
  to: string;
};

export type TemplateConversionPlan = {
  changed: boolean;
  /** Every placeholder that would be renamed, in order of appearance. */
  renames: ConvertedPlaceholder[];
  /** Rewritten texts, only present when that field changes. */
  header?: string;
  body?: string;
  footer?: string;
  /** Rewritten URLs keyed by button index. */
  buttonUrls: Record<number, string>;
};

const NAMED_TOKEN = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/** True when the text contains at least one non-numbered placeholder. */
export function hasNamedPlaceholders(text: string | null | undefined): boolean {
  if (!text) return false;
  NAMED_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAMED_TOKEN.exec(text)) !== null) {
    if (!/^[1-9]\d*$/.test(m[1].trim())) return true;
  }
  return false;
}

function planFor(
  scope: ConvertScope,
  text: string | null | undefined,
  buttonIndex?: number,
): { next?: string; renames: ConvertedPlaceholder[] } {
  if (!text) return { renames: [] };
  const next = renumberTemplateTokens(text);
  if (next === text) return { renames: [] };
  const renames: ConvertedPlaceholder[] = [];
  for (const [from, to] of templateTokenRenameMap(text)) {
    if (from === String(to)) continue;
    renames.push({ scope, from, to: String(to), ...(buttonIndex === undefined ? {} : { buttonIndex }) });
  }
  return { next, renames };
}

export type ConvertibleDraft = {
  header?: string | null;
  body?: string | null;
  footer?: string | null;
  buttons?: Array<{ type?: string; url?: string | null }>;
};

/**
 * Builds the conversion plan for an imported draft. Call before saving and
 * apply only when the operator opts in.
 */
export function planTemplateVariableConversion(draft: ConvertibleDraft): TemplateConversionPlan {
  const renames: ConvertedPlaceholder[] = [];
  const plan: TemplateConversionPlan = { changed: false, renames, buttonUrls: {} };

  const header = planFor("HEADER", draft.header);
  if (header.next !== undefined) plan.header = header.next;
  renames.push(...header.renames);

  const body = planFor("BODY", draft.body);
  if (body.next !== undefined) plan.body = body.next;
  renames.push(...body.renames);

  const footer = planFor("FOOTER", draft.footer);
  if (footer.next !== undefined) plan.footer = footer.next;
  renames.push(...footer.renames);

  (draft.buttons ?? []).forEach((button, index) => {
    if (String(button?.type ?? "").toUpperCase() !== "URL") return;
    const url = planFor("BUTTON_URL", button?.url, index);
    if (url.next !== undefined) plan.buttonUrls[index] = url.next;
    renames.push(...url.renames);
  });

  plan.changed =
    plan.header !== undefined ||
    plan.body !== undefined ||
    plan.footer !== undefined ||
    Object.keys(plan.buttonUrls).length > 0;

  return plan;
}

/** Human-readable summary, e.g. "{{name}} → {{1}}, {{order_id}} → {{2}}". */
export function describeConversion(plan: TemplateConversionPlan): string {
  return plan.renames.map((r) => `{{${r.from}}} → {{${r.to}}}`).join(", ");
}

/**
 * Applies a plan to a Meta component array (HEADER/BODY/FOOTER text and URL
 * buttons). Returns the input untouched when the plan changes nothing.
 */
export function applyConversionToComponents<T>(components: T[], plan: TemplateConversionPlan): T[] {
  if (!plan.changed) return components;
  return components.map((component) => {
    const c = component as unknown as { type?: string; text?: string; buttons?: Array<{ type?: string; url?: string }> };
    const type = String(c?.type ?? "").toUpperCase();
    if (type === "HEADER" && plan.header !== undefined) return { ...c, text: plan.header } as unknown as T;
    if (type === "BODY" && plan.body !== undefined) return { ...c, text: plan.body } as unknown as T;
    if (type === "FOOTER" && plan.footer !== undefined) return { ...c, text: plan.footer } as unknown as T;
    if (type === "BUTTONS" && Array.isArray(c.buttons)) {
      const buttons = c.buttons.map((b, i) =>
        plan.buttonUrls[i] !== undefined ? { ...b, url: plan.buttonUrls[i] } : b,
      );
      return { ...c, buttons } as unknown as T;
    }
    return component;
  });
}

export type ConversionFieldPreview = {
  scope: ConvertScope;
  buttonIndex?: number;
  /** Display label, e.g. "Body" or "Button 2 URL". */
  label: string;
  before: string;
  after: string;
  renames: ConvertedPlaceholder[];
};

function scopeLabel(scope: ConvertScope, buttonIndex?: number): string {
  if (scope === "BUTTON_URL") return `Button ${(buttonIndex ?? 0) + 1} URL`;
  return scope.charAt(0) + scope.slice(1).toLowerCase();
}

/**
 * Per-field before/after view of a conversion plan, so an operator can confirm
 * the full mapping and the final ordered result before saving.
 */
export function buildConversionPreview(
  draft: ConvertibleDraft,
  plan: TemplateConversionPlan,
): ConversionFieldPreview[] {
  const fields: ConversionFieldPreview[] = [];
  const push = (scope: ConvertScope, before: string | null | undefined, after: string | undefined, buttonIndex?: number) => {
    if (after === undefined) return;
    fields.push({
      scope,
      ...(buttonIndex === undefined ? {} : { buttonIndex }),
      label: scopeLabel(scope, buttonIndex),
      before: before ?? "",
      after,
      renames: plan.renames.filter((r) => r.scope === scope && r.buttonIndex === buttonIndex),
    });
  };
  push("HEADER", draft.header, plan.header);
  push("BODY", draft.body, plan.body);
  push("FOOTER", draft.footer, plan.footer);
  for (const key of Object.keys(plan.buttonUrls)) {
    const index = Number(key);
    push("BUTTON_URL", draft.buttons?.[index]?.url, plan.buttonUrls[index], index);
  }
  return fields;
}

/** Final ordered placeholder list per component after conversion. */
export function conversionOrderedResult(plan: TemplateConversionPlan): Array<{
  label: string;
  tokens: Array<{ from: string; to: string }>;
}> {
  const groups = new Map<string, Array<{ from: string; to: string }>>();
  for (const r of plan.renames) {
    const label = scopeLabel(r.scope, r.buttonIndex);
    const list = groups.get(label) ?? [];
    list.push({ from: r.from, to: r.to });
    groups.set(label, list);
  }
  return [...groups.entries()].map(([label, tokens]) => ({
    label,
    tokens: tokens.sort((a, b) => Number(a.to) - Number(b.to)),
  }));
}

export type ConversionSection = {
  scope: ConvertScope;
  buttonIndex?: number;
  label: string;
  /** Text as it stands today. */
  current: string;
  /** Text after renumbering (equal to current when nothing changes). */
  next: string;
  /** Every distinct placeholder in this section, in final numbered order. */
  tokens: Array<{ from: string; to: string; unchanged: boolean }>;
  changed: boolean;
};

function sectionFor(
  scope: ConvertScope,
  text: string | null | undefined,
  buttonIndex?: number,
): ConversionSection | null {
  const current = text ?? "";
  if (!current) return null;
  const map = templateTokenRenameMap(current);
  if (map.size === 0) return null;
  const next = renumberTemplateTokens(current);
  const tokens = [...map.entries()]
    .map(([from, to]) => ({ from, to: String(to), unchanged: from === String(to) }))
    .sort((a, b) => Number(a.to) - Number(b.to));
  return {
    scope,
    ...(buttonIndex === undefined ? {} : { buttonIndex }),
    label: scopeLabel(scope, buttonIndex),
    current,
    next,
    tokens,
    changed: next !== current,
  };
}

/**
 * Every WhatsApp variable location in the draft — Header, Body, Footer and each
 * URL button — with its placeholders and the number each one ends up with.
 * Sections that are already correctly numbered are included so the operator can
 * confirm the whole template, not only what changes. Numbering is scoped per
 * section because Meta scopes positional parameters per component.
 */
export function buildConversionSections(draft: ConvertibleDraft): ConversionSection[] {
  const sections: ConversionSection[] = [];
  const add = (section: ConversionSection | null) => {
    if (section) sections.push(section);
  };
  add(sectionFor("HEADER", draft.header));
  add(sectionFor("BODY", draft.body));
  add(sectionFor("FOOTER", draft.footer));
  (draft.buttons ?? []).forEach((button, index) => {
    if (String(button?.type ?? "").toUpperCase() !== "URL") return;
    add(sectionFor("BUTTON_URL", button?.url, index));
  });
  return sections;
}
