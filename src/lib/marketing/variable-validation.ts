/**
 * Strict template variable validation shared between the Send Campaign
 * wizard and Test Send. Extracts every `{{token}}` referenced by a template
 * (HEADER text, BODY, and dynamic BUTTONS) and validates the user-provided
 * values before we hit Meta — a missing or malformed variable is the #1
 * cause of broadcast failures, and Meta rejects the entire template
 * message when a positional placeholder is empty.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TemplateVarLocation = "header" | "body" | "button";

export type TemplateVarSpec = {
  token: string;
  location: TemplateVarLocation;
  /** Inferred format hint from the token name (url, phone, email, otp, ). */
  format: TemplateVarFormat;
  /** Optional label/hint shown in the UI. */
  hint?: string;
};

export type TemplateVarFormat =
  | "text"
  | "url"
  | "phone"
  | "email"
  | "otp"
  | "amount"
  | "date"
  | "name";

export type VariableIssue = {
  token: string;
  location: TemplateVarLocation;
  message: string;
};

const TOKEN_RE = /\{\{\s*([\w-]+)\s*\}\}/g;

/** Guess a stricter format from the token name. */
function inferFormat(token: string): TemplateVarFormat {
  const t = token.toLowerCase();
  if (/^(url|link|website|site|cta_url|button_url)$/.test(t)) return "url";
  if (/(phone|mobile|whatsapp|contact_no|number)/.test(t)) return "phone";
  if (/email|e_?mail/.test(t)) return "email";
  if (/^(otp|code|pin|verification|token)$/.test(t)) return "otp";
  if (/(amount|price|total|cost|balance|payable|invoice_total)/.test(t))
    return "amount";
  if (/(date|time|expiry|expires|scheduled_at|deadline)/.test(t)) return "date";
  if (/^(name|first_name|last_name|full_name|customer|user)$/.test(t))
    return "name";
  return "text";
}

/**
 * Extract every unique variable referenced by a template's `components`.
 * Preserves insertion order and location so the UI can group inputs.
 */
export function extractTemplateVariables(
  components: unknown,
): TemplateVarSpec[] {
  if (!Array.isArray(components)) return [];
  const seen = new Set<string>();
  const out: TemplateVarSpec[] = [];

  const pushMatches = (text: string, location: TemplateVarLocation) => {
    for (const m of text.matchAll(TOKEN_RE)) {
      const token = m[1];
      if (seen.has(token)) continue;
      seen.add(token);
      out.push({ token, location, format: inferFormat(token) });
    }
  };

  for (const raw of components as Array<Record<string, unknown>>) {
    const type = String(raw?.type ?? "").toUpperCase();
    if (type === "HEADER") {
      pushMatches(String(raw?.text ?? ""), "header");
    } else if (type === "BODY") {
      pushMatches(String(raw?.text ?? ""), "body");
    } else if (type === "BUTTONS" && Array.isArray(raw?.buttons)) {
      for (const b of raw.buttons as Array<Record<string, unknown>>) {
        pushMatches(String(b?.url ?? ""), "button");
        pushMatches(String(b?.text ?? ""), "button");
      }
    }
  }
  return out;
}

// Meta constraints — https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
const LIMITS: Record<TemplateVarFormat, { max: number; min?: number }> = {
  text: { max: 1024 },
  url: { max: 2000 },
  phone: { max: 20 },
  email: { max: 254 },
  otp: { max: 15 },
  amount: { max: 32 },
  date: { max: 64 },
  name: { max: 80 },
};

// Meta rejects newlines, tabs, and 4+ consecutive spaces inside a parameter
// value for template messages ("Parameter format does not match format in
// the created template").
const FORBIDDEN_CTRL = /[\r\n\t]/;
const FORBIDDEN_4_SPACES = /\s{5,}/;

const URL_RE = /^https:\/\/[^\s{}]+$/i;
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^[A-Za-z0-9-]{3,15}$/;
const AMOUNT_RE = /^-?\d+(\.\d{1,4})?$/;

function validateOne(spec: TemplateVarSpec, value: string): string | null {
  const v = value ?? "";
  if (!v.trim()) return `Missing value for {{${spec.token}}}`;
  const limit = LIMITS[spec.format];
  if (v.length > limit.max)
    return `{{${spec.token}}} exceeds max ${limit.max} chars`;
  if (FORBIDDEN_CTRL.test(v))
    return `{{${spec.token}}} cannot contain line breaks or tabs`;
  if (FORBIDDEN_4_SPACES.test(v))
    return `{{${spec.token}}} cannot contain 5+ consecutive spaces`;

  switch (spec.format) {
    case "url":
      if (!URL_RE.test(v.trim()))
        return `{{${spec.token}}} must be a valid https:// URL`;
      break;
    case "phone":
      if (!PHONE_RE.test(v.trim()))
        return `{{${spec.token}}} must be a valid phone (E.164, e.g. +15551234567)`;
      break;
    case "email":
      if (!EMAIL_RE.test(v.trim()))
        return `{{${spec.token}}} must be a valid email address`;
      break;
    case "otp":
      if (!OTP_RE.test(v.trim()))
        return `{{${spec.token}}} must be 3–15 alphanumeric characters`;
      break;
    case "amount":
      if (!AMOUNT_RE.test(v.trim()))
        return `{{${spec.token}}} must be a number (e.g. 199.00)`;
      break;
    case "date":
      if (Number.isNaN(Date.parse(v.trim())))
        return `{{${spec.token}}} must be a valid date/time`;
      break;
    case "name":
      if (v.trim().length < 1)
        return `{{${spec.token}}} must be at least 1 character`;
      break;
  }
  return null;
}

/**
 * Validate every required template variable. Returns an issue list — empty
 * means it's safe to send. Callers should also enforce
 * `issues.length === 0` before hitting the Meta API.
 */
export function validateTemplateVariables(
  components: unknown,
  values: Record<string, string>,
): { specs: TemplateVarSpec[]; issues: VariableIssue[] } {
  const specs = extractTemplateVariables(components);
  const issues: VariableIssue[] = [];
  for (const spec of specs) {
    const err = validateOne(spec, values[spec.token] ?? "");
    if (err) {
      issues.push({ token: spec.token, location: spec.location, message: err });
    }
  }
  return { specs, issues };
}

/** Short human label for a format (used in placeholders/hints). */
export function formatLabel(f: TemplateVarFormat): string {
  switch (f) {
    case "url":
      return "https:// URL";
    case "phone":
      return "Phone (E.164)";
    case "email":
      return "Email";
    case "otp":
      return "OTP code";
    case "amount":
      return "Amount";
    case "date":
      return "Date / time";
    case "name":
      return "Name";
    default:
      return "Text";
  }
}
