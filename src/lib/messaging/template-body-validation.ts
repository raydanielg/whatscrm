/**
 * Template body/header/footer variable validation.
 *
 * Meta only accepts positional placeholders ({{1}}, {{2}},  starting at 1 and
 * strictly sequential). Named placeholders are not submitted to Meta and are
 * therefore rejected locally before any provider call.
 */

export type TemplateBodyIssue = {
  component: "HEADER" | "BODY" | "FOOTER";
  kind: "invalid-token" | "non-sequential" | "empty";
  token?: string;
  /** Every rejected placeholder found in this component, in order of appearance. */
  tokens?: string[];
  /** Exact rename plan: `{{order_id}}` → `{{1}}`. */
  rename?: Array<{ from: string; to: string }>;
  message: string;
  /** Suggested replacement text for the whole component, when auto-fixable. */
  suggestion?: string;
};


const TOKEN_RE = /\{\{([^{}]*)\}\}/g;

const isPositionalToken = (t: string) => /^\d+$/.test(t);

const isEmptyToken = (t: string) => t.trim() === "";


type TextComponent = { type?: string; text?: string };

export function extractTemplateTokens(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * Rewrites every placeholder to sequential {{1}}, {{2}},  preserving order.
 * Repeated placeholders keep pointing at the same index, so "{{5}}  {{5}}"
 * becomes "{{1}}  {{1}}" instead of inventing a second variable.
 */
export function renumberTemplateTokens(text: string): string {
  const seen = new Map<string, number>();
  return text.replace(TOKEN_RE, (_m, raw: string) => {
    const key = String(raw).trim();
    const existing = key ? seen.get(key) : undefined;
    if (existing !== undefined) return `{{${existing}}}`;
    const next = seen.size + 1;
    if (key) seen.set(key, next);
    return `{{${next}}}`;
  });
}

/** One text component rewritten by the variable auto-fix. */
export type TemplateTokenFix = {
  component: TemplateBodyIssue["component"];
  from: string;
  to: string;
};

/**
 * Auto-fix for out-of-range / invalid placeholders across HEADER, BODY and
 * FOOTER. Each component is renumbered independently because Meta scopes
 * positional parameters per component. Input is never mutated.
 */
export function remapTemplateComponentTokens(components: unknown): {
  components: unknown[];
  fixes: TemplateTokenFix[];
} {
  const list = Array.isArray(components) ? (components as TextComponent[]) : [];
  const fixes: TemplateTokenFix[] = [];

  const next = list.map((component) => {
    const type = String(component?.type ?? "").toUpperCase();
    if (type !== "HEADER" && type !== "BODY" && type !== "FOOTER") return component;
    const text = typeof component?.text === "string" ? component.text : "";
    if (!text) return component;
    const to = renumberTemplateTokens(text);
    if (to === text) return component;
    fixes.push({ component: type as TemplateBodyIssue["component"], from: text, to });
    return { ...component, text: to };
  });

  return { components: fixes.length > 0 ? next : list, fixes };
}


/**
 * The exact index every distinct placeholder would receive after renumbering,
 * so error messages can spell out "{{order_id}} → {{1}}".
 */
export function templateTokenRenameMap(text: string): Map<string, number> {
  const seen = new Map<string, number>();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const key = String(m[1]).trim();
    if (!key || seen.has(key)) continue;
    seen.set(key, seen.size + 1);
  }
  return seen;
}

const list = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function checkText(
  component: TemplateBodyIssue["component"],
  text: string,
): TemplateBodyIssue[] {
  const tokens = extractTemplateTokens(text);
  if (tokens.length === 0) return [];

  const issues: TemplateBodyIssue[] = [];
  const suggestion = renumberTemplateTokens(text);
  const renameMap = templateTokenRenameMap(text);

  const emptyCount = tokens.filter(isEmptyToken).length;
  const badTokens = Array.from(
    new Set(tokens.filter((t) => !isEmptyToken(t) && !isPositionalToken(t))),
  );

  if (badTokens.length > 0) {
    const rename = badTokens.map((t) => ({
      from: `{{${t}}}`,
      to: `{{${renameMap.get(t) ?? 1}}}`,
    }));
    const named = badTokens.filter((t) => /[A-Za-z_]/.test(t));
    const lead =
      named.length === badTokens.length
        ? `${component} uses named ${badTokens.length === 1 ? "variable" : "variables"} ${list(badTokens.map((t) => `"{{${t}}}"`))}, which WhatsApp rejects.`
        : `${component} uses ${badTokens.length === 1 ? "an unsupported placeholder" : "unsupported placeholders"} ${list(badTokens.map((t) => `"{{${t}}}"`))}, which WhatsApp rejects.`;
    issues.push({
      component,
      kind: "invalid-token",
      token: badTokens[0],
      tokens: badTokens,
      rename,
      message: `${lead} Only numbered placeholders are allowed — replace ${list(rename.map((r) => `${r.from} with ${r.to}`))}.`,
      suggestion,
    });
  }

  if (emptyCount > 0) {
    issues.push({
      component,
      kind: "empty",
      tokens: ["{{}}"],
      message: `${component} contains ${emptyCount === 1 ? "an empty placeholder" : `${emptyCount} empty placeholders`} "{{}}". Put a number inside, e.g. {{1}}, {{2}}.`,
      suggestion,
    });
  }

  if (issues.length > 0) return issues;


  const unique = Array.from(new Set(tokens.map(Number))).sort((a, b) => a - b);
  const sequential = unique.every((n, i) => n === i + 1);
  if (!sequential) {
    const rename = Array.from(renameMap.entries())
      .filter(([from, to]) => Number(from) !== to)
      .map(([from, to]) => ({ from: `{{${from}}}`, to: `{{${to}}}` }));
    return [{
      component,
      kind: "non-sequential",
      tokens: rename.map((r) => r.from),
      rename,
      message: `${component} placeholders must start at {{1}} and run in order without gaps — found ${list(unique.map((n) => `{{${n}}}`))}${rename.length > 0 ? `. Replace ${list(rename.map((r) => `${r.from} with ${r.to}`))}` : ""}.`,
      suggestion,
    }];
  }


  return [];
}

export function findTemplateBodyIssues(components: unknown): TemplateBodyIssue[] {
  if (!Array.isArray(components)) return [];
  const issues: TemplateBodyIssue[] = [];
  for (const raw of components as TextComponent[]) {
    const type = String(raw?.type ?? "").toUpperCase();
    if (type !== "HEADER" && type !== "BODY" && type !== "FOOTER") continue;
    const text = typeof raw?.text === "string" ? raw.text : "";
    if (!text) continue;
    issues.push(...checkText(type as TemplateBodyIssue["component"], text));
  }
  return issues;
}

export function formatTemplateBodyIssue(issue: TemplateBodyIssue): {
  title: string;
  description: string;
} {
  return {
    title: "Invalid template variable",
    description: issue.message,
  };
}
