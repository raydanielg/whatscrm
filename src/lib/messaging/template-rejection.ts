/**
 * Turns Meta's terse template rejection strings into an actionable hint that
 * points at the exact button in the stored template.
 *
 * Example input:
 *   (#192) Param components[1]['buttons'][0]['phone_number'] is not a valid phone number.
 *
 * Client-safe: no server-only imports.
 */

import {
  normalizeTemplateButtonPhone,
  validateTemplateButtonPhone,
  validateTemplateButtonUrl,
  type TemplateButtonField,
  type TemplateComponentLike,
} from "./template-url-validation";

export type TemplateRejectionHint = {
  /** Meta-style parameter path. */
  path: string;
  field: TemplateButtonField;
  componentIndex: number;
  buttonIndex: number;
  /** Value currently stored on that button, when it can be resolved. */
  value: string;
  /** Plain-language explanation of what to change. */
  message: string;
  /** A ready-to-use corrected value, when the intent is unambiguous. */
  suggestion?: string;
};

const PARAM_RE =
  /components\[(\d+)\]\['buttons'\]\[(\d+)\]\['(url|phone_number)'\]/i;

export function parseTemplateRejection(
  rejectionReason: string | null | undefined,
  components: unknown,
): TemplateRejectionHint | null {
  const reason = (rejectionReason ?? "").trim();
  if (!reason) return null;
  const match = PARAM_RE.exec(reason);
  if (!match) return null;

  const componentIndex = Number(match[1]);
  const buttonIndex = Number(match[2]);
  const field = match[3].toLowerCase() as TemplateButtonField;
  const path = `components[${componentIndex}]['buttons'][${buttonIndex}]['${field}']`;

  const list = Array.isArray(components) ? (components as TemplateComponentLike[]) : [];
  const button = list[componentIndex]?.buttons?.[buttonIndex];
  const value = ((field === "url" ? button?.url : button?.phone_number) ?? "").trim();

  const detail =
    field === "phone_number"
      ? validateTemplateButtonPhone(value) ??
        "Meta could not dial this number. Re-enter it in international E.164 format, e.g. +14155551234."
      : validateTemplateButtonUrl(value) ??
        "Meta could not parse this link. Use a complete absolute URL starting with https://";

  let suggestion: string | undefined;
  if (field === "phone_number") {
    const normalized = normalizeTemplateButtonPhone(value);
    if (normalized && normalized !== value && !validateTemplateButtonPhone(normalized)) {
      suggestion = normalized;
    }
  }

  const which =
    field === "phone_number"
      ? `Call button #${buttonIndex + 1}`
      : `URL button #${buttonIndex + 1}`;

  return {
    path,
    field,
    componentIndex,
    buttonIndex,
    value,
    message: `${which} was rejected${value ? ` ("${value}")` : ""}. ${detail}`,
    suggestion,
  };
}
