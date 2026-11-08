/**
 * Pre-submit validation for WhatsApp template call-to-action buttons.
 *
 * Meta rejects templates with terse, path-only errors that give no clue about
 * which button is broken:
 *   `(#100) Param components[i]['buttons'][j]['url'] is not a valid URI.`
 *   `(#192) Param components[i]['buttons'][j]['phone_number'] is not a valid
 *    phone number.`
 * These helpers catch the same problems locally, with Meta's exact parameter
 * path in the message, before the template is ever submitted.
 *
 * Meta's rules for URL buttons:
 *  - the URL is required and must be absolute (http:// or https://)
 *  - at most one `{{n}}` variable, and only as the URL suffix
 *  - max 2000 characters
 *
 * Meta's rules for phone-number buttons:
 *  - E.164 only: a leading `+`, country code, digits — no spaces, dashes,
 *    parentheses, dots, extensions or variables
 *  - 7–15 digits after the `+`
 *
 * Client-safe: no server-only imports.
 */

export type TemplateButtonLike = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

export type TemplateComponentLike = {
  type?: string;
  buttons?: TemplateButtonLike[] | null;
};

/** Which button field Meta would name in its error. */
export type TemplateButtonField = "url" | "phone_number";

export type TemplateUrlIssue = {
  /** Meta-style parameter path, e.g. components[3]['buttons'][1]['url'] */
  path: string;
  /** The button property Meta rejects. */
  field: TemplateButtonField;
  /** Index of the component inside the components array. */
  componentIndex: number;
  /** Index of the button inside that component. */
  buttonIndex: number;
  /** Human-readable reason the value is invalid. */
  reason: string;
  /** The offending value, if any. */
  value: string;
};

/** Alias: issues now cover phone buttons too, not just URLs. */
export type TemplateButtonIssue = TemplateUrlIssue;

const MAX_URL_LENGTH = 2000;
const VARIABLE_RE = /\{\{\s*(\d+|[a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
/** E.164: `+`, a non-zero country digit, then 6–14 more digits. */
const E164_RE = /^\+[1-9]\d{6,14}$/;

export function templateUrlPath(componentIndex: number, buttonIndex: number): string {
  return templateButtonPath(componentIndex, buttonIndex, "url");
}

export function templateButtonPath(
  componentIndex: number,
  buttonIndex: number,
  field: TemplateButtonField,
): string {
  return `components[${componentIndex}]['buttons'][${buttonIndex}]['${field}']`;
}

/**
 * Validate a single phone-number button value the way Meta does. Returns a
 * reason string when invalid, or `null` when the number is acceptable.
 */
export function validateTemplateButtonPhone(rawPhone: string | undefined | null): string | null {
  const raw = (rawPhone ?? "").trim();
  if (!raw) return "A call button needs a phone number in international format, e.g. +14155551234.";
  if (VARIABLE_RE.test(raw)) {
    VARIABLE_RE.lastIndex = 0;
    return "Phone-number buttons cannot contain {{variables}} — Meta requires one fixed number.";
  }
  VARIABLE_RE.lastIndex = 0;
  if (/(ext|x|#|,|;)\s*\d+$/i.test(raw)) {
    return "Extensions are not supported. Use just the main number in international format.";
  }
  if (!raw.startsWith("+")) {
    return `Missing the country code. Write the number in international format with a leading + (e.g. +${raw.replace(/\D/g, "") || "14155551234"}).`;
  }
  if (/[^\d+]/.test(raw)) {
    const cleaned = `+${raw.replace(/\D/g, "")}`;
    return `Remove spaces, dashes, dots and parentheses — Meta only accepts digits after the +. Try "${cleaned}".`;
  }
  const digits = raw.slice(1);
  if (digits.startsWith("0")) {
    return "A country code cannot start with 0. Drop the national trunk prefix (e.g. +44 20 , not +044 ).";
  }
  if (digits.length < 7) return `Too short — ${digits.length} digits. A full international number has 8–15 digits.`;
  if (digits.length > 15) return `Too long — ${digits.length} digits. E.164 numbers are at most 15 digits.`;
  if (!E164_RE.test(raw)) return "This is not a valid international phone number. Use E.164 format, e.g. +14155551234.";
  return null;
}

/**
 * Normalizes a typed number to E.164 when the intent is unambiguous.
 * Handles the common human formats Meta rejects with (#192):
 *   "(415) 555-1234" → "+4155551234" (digits only, caller must add country)
 *   "0044 20 7946 0000" → "+442079460000" (00 international prefix)
 *   "+1 415-555-1234"  → "+14155551234"
 * Values containing {{variables}} are returned untouched — they cannot be
 * normalized and are rejected by the validator instead.
 */
export function normalizeTemplateButtonPhone(rawPhone: string | undefined | null): string {
  const raw = (rawPhone ?? "").trim();
  if (!raw) return "";
  VARIABLE_RE.lastIndex = 0;
  if (VARIABLE_RE.test(raw)) {
    VARIABLE_RE.lastIndex = 0;
    return raw;
  }
  VARIABLE_RE.lastIndex = 0;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  // "00" is the international dialling prefix in most of the world.
  if (!raw.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);
  // Meta rejects a country code starting with 0 (national trunk prefix).
  digits = digits.replace(/^0+/, "");
  if (!digits) return raw;
  return `+${digits}`;
}

/** One phone value rewritten during normalization. */
export type TemplatePhoneNormalization = {
  path: string;
  componentIndex: number;
  buttonIndex: number;
  from: string;
  to: string;
};

/**
 * Walks template components and rewrites every PHONE_NUMBER button into E.164
 * form. Only applies a rewrite when the normalized value actually passes
 * validation, so ambiguous input still surfaces a clear error instead of being
 * silently mangled. Returns a new components array — the input is not mutated.
 */
export function normalizeTemplateComponentPhones(components: unknown): {
  components: unknown[];
  changes: TemplatePhoneNormalization[];
} {
  const list = Array.isArray(components) ? (components as TemplateComponentLike[]) : [];
  const changes: TemplatePhoneNormalization[] = [];

  const next = list.map((component, componentIndex) => {
    const buttons = Array.isArray(component?.buttons) ? component.buttons : null;
    if (!buttons) return component;
    let touched = false;
    const nextButtons = buttons.map((button, buttonIndex) => {
      if ((button?.type ?? "").toUpperCase() !== "PHONE_NUMBER") return button;
      const from = (button?.phone_number ?? "").trim();
      if (!from) return button;
      const to = normalizeTemplateButtonPhone(from);
      if (to === from || validateTemplateButtonPhone(to)) return button;
      touched = true;
      changes.push({
        path: templateButtonPath(componentIndex, buttonIndex, "phone_number"),
        componentIndex,
        buttonIndex,
        from,
        to,
      });
      return { ...button, phone_number: to };
    });
    return touched ? { ...component, buttons: nextButtons } : component;
  });

  return { components: changes.length > 0 ? next : list, changes };
}



/* ------------------------------------------------------------------ *
 * URL buttons: query-string and fragment placeholders
 * ------------------------------------------------------------------ */

/** Percent-encoded `{{` / `}}` — pasted links often arrive escaped. */
const ENCODED_OPEN_RE = /%7B\s*%7B/gi;
const ENCODED_CLOSE_RE = /%7D\s*%7D/gi;

/**
 * Rewrites percent-encoded braces back into `{{n}}` so a link copied out of a
 * browser address bar (`?id=%7B%7B1%7D%7D`) is treated as a placeholder rather
 * than as literal text.
 */
export function normalizeTemplateUrlVariables(rawUrl: string | undefined | null): string {
  const url = (rawUrl ?? "").trim();
  if (!url) return "";
  return url.replace(ENCODED_OPEN_RE, "{{").replace(ENCODED_CLOSE_RE, "}}");
}

export type TemplateUrlParamLocation = "path" | "query" | "fragment";

/** One addressable piece of a URL button link and what it maps to. */
export type TemplateUrlParam = {
  location: TemplateUrlParamLocation;
  /** Query/fragment parameter name, or a readable label for path segments. */
  key: string;
  /** Raw value as written in the link (may be `{{1}}`). */
  value: string;
  /** Variable token this param resolves to, e.g. `1`, or null when static. */
  variable: string | null;
  /** True when the value was written percent-encoded (`%7B%7B1%7D%7D`). */
  encoded: boolean;
};

export type TemplateUrlAnalysis = {
  /** Link with encoded braces normalized. */
  url: string;
  /** Everything before the placeholder-bearing param, for display. */
  base: string;
  params: TemplateUrlParam[];
  /** The single variable Meta will fill, when present. */
  variable: string | null;
  /** Which param key receives that variable ("order_id", "#section", ). */
  variableKey: string | null;
  variableLocation: TemplateUrlParamLocation | null;
};

const splitOnce = (value: string, sep: string): [string, string | null] => {
  const at = value.indexOf(sep);
  return at === -1 ? [value, null] : [value.slice(0, at), value.slice(at + 1)];
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const variableOf = (value: string): string | null => {
  VARIABLE_RE.lastIndex = 0;
  const match = VARIABLE_RE.exec(value);
  VARIABLE_RE.lastIndex = 0;
  return match ? match[1] : null;
};

/**
 * Breaks a URL-button link into path / query / fragment params and reports the
 * exact mapping for each key, so the editor can show
 * `order_id → {{1}}` instead of a wall of URL text.
 */
export function analyzeTemplateButtonUrl(rawUrl: string | undefined | null): TemplateUrlAnalysis {
  const original = (rawUrl ?? "").trim();
  const url = normalizeTemplateUrlVariables(original);
  const params: TemplateUrlParam[] = [];
  if (!url) {
    return { url, base: "", params, variable: null, variableKey: null, variableLocation: null };
  }

  const [beforeHash, fragment] = splitOnce(url, "#");
  const [pathPart, query] = splitOnce(beforeHash, "?");

  // Path: only surface the trailing segment when it carries the placeholder.
  const segments = pathPart.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? "";
  const pathVariable = variableOf(lastSegment);
  if (pathVariable) {
    params.push({
      location: "path",
      key: "path suffix",
      value: lastSegment,
      variable: pathVariable,
      encoded: /%7B/i.test(original.split("?")[0] ?? ""),
    });
  }

  if (query) {
    for (const pair of query.split("&")) {
      if (!pair) continue;
      const [rawKey, rawValue] = splitOnce(pair, "=");
      const value = rawValue ?? "";
      params.push({
        location: "query",
        key: safeDecode(rawKey),
        value,
        variable: variableOf(value),
        encoded: /%7B/i.test(rawValue ?? ""),
      });
    }
  }

  if (fragment) {
    if (fragment.includes("=")) {
      for (const pair of fragment.split("&")) {
        if (!pair) continue;
        const [rawKey, rawValue] = splitOnce(pair, "=");
        const value = rawValue ?? "";
        params.push({
          location: "fragment",
          key: safeDecode(rawKey),
          value,
          variable: variableOf(value),
          encoded: /%7B/i.test(rawValue ?? ""),
        });
      }
    } else {
      params.push({
        location: "fragment",
        key: "#fragment",
        value: fragment,
        variable: variableOf(fragment),
        encoded: /%7B/i.test(fragment),
      });
    }
  }

  const carrier = params.find((p) => p.variable !== null) ?? null;
  const base = carrier
    ? url.slice(0, Math.max(0, url.lastIndexOf(carrier.value)))
    : url;

  return {
    url,
    base,
    params,
    variable: carrier?.variable ?? null,
    variableKey: carrier?.key ?? null,
    variableLocation: carrier?.location ?? null,
  };
}

/** Human sentence describing where a param's value comes from. */
export function describeTemplateUrlParam(param: TemplateUrlParam): string {
  const where =
    param.location === "query"
      ? `query parameter "${param.key}"`
      : param.location === "fragment"
        ? param.key === "#fragment"
          ? "the URL fragment"
          : `fragment parameter "${param.key}"`
        : "the end of the URL path";
  return param.variable
    ? `${where} is filled from {{${param.variable}}} at send time`
    : `${where} is always "${param.value}"`;
}

/** Validate a single URL-button value. Returns a reason string when invalid. */
export function validateTemplateButtonUrl(rawUrl: string | undefined | null): string | null {
  const url = normalizeTemplateUrlVariables(rawUrl);
  if (!url) return "A URL button needs a link. Add a full URL starting with https://";
  if (url.length > MAX_URL_LENGTH) return `The link is too long (${url.length} characters, max ${MAX_URL_LENGTH}).`;
  if (/\s/.test(url)) return "The link contains spaces. Remove them or percent-encode them as %20.";

  const variables = url.match(VARIABLE_RE) ?? [];
  if (variables.length > 1) {
    return "Only one {{variable}} is allowed in a URL button, at the very end of the link.";
  }
  if (variables.length === 1 && !url.endsWith(variables[0])) {
    // Name the param that holds the placeholder so the fix is obvious.
    const analysis = analyzeTemplateButtonUrl(url);
    const carrier = analysis.params.find((p) => p.variable !== null);
    if (carrier?.location === "query") {
      return `The {{${carrier.variable}}} placeholder sits in query parameter "${carrier.key}", but Meta only fills the very end of the link. Move "${carrier.key}=${carrier.value}" to the last position (?other=1&${carrier.key}={{${carrier.variable}}}).`;
    }
    if (carrier?.location === "fragment") {
      return `The {{${carrier.variable}}} placeholder must be the last characters of the link. Put the fragment value at the end (e.g. https://example.com/page#{{${carrier.variable}}}).`;
    }
    return "A {{variable}} in a URL button must be the last part of the link (e.g. https://example.com/order/{{1}} or https://example.com/o?id={{1}}).";
  }

  // Swap the trailing variable for a literal so the URL parses as Meta sees it.
  const probe = url.replace(VARIABLE_RE, "placeholder");
  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    return "This is not a complete URL. Use an absolute link starting with https:// (relative paths are rejected by Meta).";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Links must use http:// or https:// — "${parsed.protocol.replace(":", "")}" is not accepted.`;
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return "The link is missing a valid domain name.";
  }
  // An empty placeholder param ("?id={{1}}" is fine, "?={{1}}" is not).
  const analysis = analyzeTemplateButtonUrl(url);
  const carrier = analysis.params.find((p) => p.variable !== null);
  if (carrier && carrier.location !== "path" && carrier.key.trim() === "") {
    return "The placeholder needs a parameter name, e.g. ?order_id={{1}}.";
  }
  return null;
}


/**
 * Walk template components and return every invalid call-to-action button —
 * URL *and* phone — each tagged with the exact Meta parameter path so the
 * message matches Meta's own error.
 */
export function findTemplateButtonIssues(components: unknown): TemplateButtonIssue[] {
  const list = Array.isArray(components) ? (components as TemplateComponentLike[]) : [];
  const issues: TemplateButtonIssue[] = [];
  list.forEach((component, componentIndex) => {
    const buttons = Array.isArray(component?.buttons) ? component.buttons : [];
    buttons.forEach((button, buttonIndex) => {
      const type = (button?.type ?? "").toUpperCase();
      const field: TemplateButtonField | null =
        type === "URL" ? "url" : type === "PHONE_NUMBER" ? "phone_number" : null;
      if (!field) return;
      const value = ((field === "url" ? button?.url : button?.phone_number) ?? "").trim();
      const reason =
        field === "url" ? validateTemplateButtonUrl(value) : validateTemplateButtonPhone(value);
      if (!reason) return;
      issues.push({
        path: templateButtonPath(componentIndex, buttonIndex, field),
        field,
        componentIndex,
        buttonIndex,
        reason,
        value,
      });
    });
  });
  return issues;
}

/** Back-compat alias — the walk now covers phone buttons as well. */
export const findTemplateUrlIssues = findTemplateButtonIssues;

/** First issue formatted the way Meta would have reported it, plus a fix hint. */
export function formatTemplateButtonIssue(issue: TemplateButtonIssue): { title: string; description: string } {
  const title =
    issue.field === "phone_number"
      ? `Param ${issue.path} is not a valid phone number`
      : `Param ${issue.path} is not a valid URI`;
  return {
    title,
    description: issue.value ? `"${issue.value}" — ${issue.reason}` : issue.reason,
  };
}

export const formatTemplateUrlIssue = formatTemplateButtonIssue;

/**
 * Throwable guard for server-side use: raises a friendly two-line error that
 * `splitFriendlyMessage` renders as title + description.
 */
export function assertValidTemplateButtons(components: unknown): void {
  const [issue] = findTemplateButtonIssues(components);
  if (!issue) return;
  const { title, description } = formatTemplateButtonIssue(issue);
  throw new Error(`${title}\n${description}`);
}

export const assertValidTemplateUrls = assertValidTemplateButtons;

