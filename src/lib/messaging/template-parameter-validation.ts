/**
 * Pre-send validation for WhatsApp template parameters.
 *
 * Two classes of problems are caught here, both before anything reaches Meta:
 *
 *  1. Unsupported variable formats in the template text itself — Meta only
 *     accepts `{{1}}` (positional) or `{{snake_case}}` (named). Anything else
 *     (`{{first name}}`, `{{user.name}}`, `{{}}`, single braces, unbalanced
 *     braces) is rejected with `(#132000) Number of parameters does not match`
 *     or a generic param error that names no variable.
 *  2. Missing or malformed values for the parameters — empty, newline/tab
 *     characters, 4+ consecutive spaces, or over the per-component length
 *     limit. Meta rejects all of these at send time.
 *
 * Client-safe: no server-only imports. Used by the UI to block sending and to
 * render an inline message under each individual {{variable}}.
 */

export type TemplateParamComponent = "HEADER" | "BODY" | "FOOTER" | "BUTTON" | "UNKNOWN";

export type TemplateFormatIssue = {
  /** The raw text found in the template, e.g. "{{first name}}". */
  raw: string;
  reason: string;
};

/** Meta's own limits per component. */
export const PARAM_MAX_LENGTH: Record<TemplateParamComponent, number> = {
  HEADER: 60,
  BODY: 1024,
  FOOTER: 60,
  BUTTON: 2000,
  UNKNOWN: 1024,
};

/** Supported token shape: {{1}}, {{2}}, ... (positional only). */
const SUPPORTED_TOKEN = /^[1-9]\d*$/;

/** Anything that looks like a placeholder, however malformed. */
const LOOSE_PLACEHOLDER = /\{\{([^{}]*)\}\}/g;
/** Single-brace placeholders such as {name} — a common copy/paste mistake. */
const SINGLE_BRACE = /(^|[^{])\{([^{}\n]+)\}(?!\})/g;

export function isSupportedToken(token: string): boolean {
  return SUPPORTED_TOKEN.test(token.trim());
}

function formatReason(inner: string): string | null {
  const raw = inner;
  const token = inner.trim();
  const shown = `{{${raw}}}`;

  if (!token) return "Empty placeholder “{{}}” — put a number inside, e.g. {{1}}.";
  if (isSupportedToken(token)) {
    if (raw !== token) return null; // padding is harmless, auto-trimmed on send
    return null;
  }
  if (/\s/.test(token)) {
    return `${shown} is rejected: spaces are not allowed in a variable. Use a numbered placeholder like {{1}}.`;
  }
  if (token.includes(".")) {
    return `${shown} is rejected: dots are not allowed. Use a numbered placeholder like {{1}}.`;
  }
  if (token.includes("-")) {
    return `${shown} is rejected: hyphens are not allowed. Use a numbered placeholder like {{1}}.`;
  }
  if (/^0\d*$/.test(token)) {
    return `${shown} is rejected: positional variables start at {{1}}.`;
  }
  if (/^\d/.test(token)) {
    return `${shown} is rejected: variables must be sequential numbers starting at {{1}}.`;
  }
  if (/^[A-Za-z_][\w]*$/.test(token)) {
    return `Named variable ${shown} is rejected by WhatsApp. Replace it with a numbered placeholder like {{1}}.`;
  }
  return `${shown} is rejected: unsupported variable format. Use numbered placeholders like {{1}}, {{2}}.`;
}


/**
 * Scan raw template text for placeholders WhatsApp will not accept.
 * Returns one issue per distinct malformed placeholder.
 */
export function findFormatIssues(texts: Array<string | undefined | null>): TemplateFormatIssue[] {
  const issues: TemplateFormatIssue[] = [];
  const seen = new Set<string>();

  const push = (raw: string, reason: string) => {
    if (seen.has(raw)) return;
    seen.add(raw);
    issues.push({ raw, reason });
  };

  for (const text of texts) {
    if (!text) continue;

    for (const m of text.matchAll(LOOSE_PLACEHOLDER)) {
      const reason = formatReason(m[1] ?? "");
      if (reason) push(m[0], reason);
    }

    for (const m of text.matchAll(SINGLE_BRACE)) {
      const inner = (m[2] ?? "").trim();
      if (!inner) continue;
      push(
        `{${m[2]}}`,
        `{${inner}} is not a WhatsApp variable — single braces are ignored. Use a numbered placeholder like {{1}}.`,
      );

    }

    // Unbalanced opener such as "{{name" — the placeholder never closes.
    const openers = (text.match(/\{\{/g) ?? []).length;
    const closers = (text.match(/\}\}/g) ?? []).length;
    if (openers !== closers) {
      push(
        "{{}}",
        "Unbalanced braces — every variable must open with {{ and close with }}.",
      );
    }
  }

  return issues;
}

/* ------------------------------ value checks ------------------------------ */

export type ValidateParamsInput = {
  tokens: string[];
  values: Record<string, string>;
  /** Which component each token belongs to, for the right length limit. */
  componentOf?: Record<string, TemplateParamComponent>;
  /** Tokens used inside a URL button — stricter rules apply. */
  urlTokens?: string[];
};

export type ParamValidationResult = {
  /** Inline error per token — only tokens with a problem appear. */
  errors: Record<string, string>;
  /** Template-level format problems (independent of the values). */
  formatIssues: TemplateFormatIssue[];
  valid: boolean;
};

export function validateParameterValue(
  token: string,
  rawValue: string | undefined,
  component: TemplateParamComponent = "BODY",
  isUrlParam = false,
): string | null {
  const value = rawValue ?? "";

  if (!value.trim()) {
    return `Required — enter a value for {{${token}}}. WhatsApp rejects messages with empty parameters.`;
  }
  if (/[\n\r]/.test(value)) {
    return "Line breaks are not allowed in a parameter value. Keep it on one line.";
  }
  if (/\t/.test(value)) {
    return "Tab characters are not allowed in a parameter value.";
  }
  if (/ {4,}/.test(value)) {
    return "Four or more consecutive spaces are rejected by WhatsApp. Use single spaces.";
  }

  const max = PARAM_MAX_LENGTH[component] ?? PARAM_MAX_LENGTH.BODY;
  if (value.length > max) {
    return `Too long: ${value.length} characters (max ${max} for the ${component.toLowerCase()}).`;
  }

  if (isUrlParam) {
    if (/\s/.test(value)) {
      return "A URL button parameter cannot contain spaces. Percent-encode them as %20.";
    }
    if (/[<>"'`]/.test(value)) {
      return "A URL button parameter cannot contain < > \" ' or ` characters.";
    }
  }

  return null;
}

/** Full validation: per-token inline errors plus template format issues. */
export function validateTemplateParameters({
  tokens,
  values,
  componentOf,
  urlTokens,
}: ValidateParamsInput & { texts?: Array<string | undefined | null> }): ParamValidationResult {
  const errors: Record<string, string> = {};
  const urls = new Set(urlTokens ?? []);

  for (const token of tokens) {
    if (!isSupportedToken(token)) {
      errors[token] =
        formatReason(token) ??
        "Unsupported variable format. Use numbered placeholders like {{1}}, {{2}}.";
      continue;
    }
    const err = validateParameterValue(
      token,
      values[token],
      componentOf?.[token] ?? "BODY",
      urls.has(token),
    );
    if (err) errors[token] = err;
  }

  return { errors, formatIssues: [], valid: Object.keys(errors).length === 0 };
}
