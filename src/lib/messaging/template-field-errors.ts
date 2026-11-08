/**
 * Field-level template validation for the editor UI.
 *
 * Meta validates the *whole* payload and answers with one opaque parameter
 * path at a time (`components[2]['buttons'][1]['url']`). This module runs the
 * same rules locally — payload schema, variable placeholders, URL/phone
 * buttons and quick replies — and maps every Meta path back to the concrete
 * editor field so the form can render an inline error next to the input and
 * block submit until it is fixed.
 *
 * Client-safe: no server-only imports.
 */

import { findTemplateBodyIssues } from "./template-body-validation";
import { findTemplateButtonIssues } from "./template-url-validation";
import { findFormatIssues } from "./template-parameter-validation";
import {
  validateTemplateComponents,
  validateTemplatePayload,
  type TemplatePayloadIssue,
} from "./template-payload-schema";

export type TemplateFieldError = {
  /** UI field key, e.g. "body" or "buttons.1.url" */
  field: string;
  /** Meta-style parameter path, e.g. components[2]['buttons'][1]['url'] */
  path: string;
  message: string;
};

export type TemplateDraftForValidation = {
  name: string;
  language: string;
  category: string;
  components: unknown;
  /** Editing an existing template only revalidates components. */
  isEdit?: boolean;
  headerFormat?: string;
  headerHandle?: string | null;
};

/** buttons field key for button index + property. */
export function buttonFieldKey(index: number, prop: string): string {
  return `buttons.${index}.${prop}`;
}

type ComponentKind = "HEADER" | "BODY" | "FOOTER" | "BUTTONS" | "CAROUSEL" | "UNKNOWN";

const KNOWN_KINDS = ["HEADER", "BODY", "FOOTER", "BUTTONS", "CAROUSEL"] as const;

function componentKinds(components: unknown): ComponentKind[] {
  if (!Array.isArray(components)) return [];
  return components.map((c) => {
    const type = String((c as { type?: unknown })?.type ?? "").toUpperCase();
    return (KNOWN_KINDS as readonly string[]).includes(type) ? (type as ComponentKind) : "UNKNOWN";
  });
}


const COMPONENT_RE = /^components\[(\d+)\]/;
const BUTTON_RE = /\['buttons'\]\[(\d+)\](?:\['([a-z_]+)'\])?/;
const TRAILING_FIELD_RE = /\['([a-z_]+)'\]$/;

/**
 * Translate a Meta parameter path into the editor field it belongs to.
 * Falls back to a coarse key ("components" / "payload") when the path is not
 * something the form renders directly.
 */
export function fieldForMetaPath(path: string, kinds: ComponentKind[]): string {
  if (path === "name" || path === "language" || path === "category") return path;

  const componentMatch = COMPONENT_RE.exec(path);
  if (!componentMatch) return path || "payload";
  const index = Number(componentMatch[1]);
  const kind = kinds[index] ?? "UNKNOWN";

  const buttonMatch = BUTTON_RE.exec(path);
  if (buttonMatch) {
    const buttonIndex = Number(buttonMatch[1]);
    const prop = buttonMatch[2] ?? "text";
    return buttonFieldKey(buttonIndex, prop);
  }
  if (path.includes("['buttons']")) return "buttons";

  switch (kind) {
    case "HEADER":
      return "header";
    case "BODY":
      return "body";
    case "FOOTER":
      return "footer";
    case "BUTTONS":
      return "buttons";
    default: {
      const trailing = TRAILING_FIELD_RE.exec(path);
      return trailing ? `components.${index}.${trailing[1]}` : "components";
    }
  }
}

function pushUnique(
  out: TemplateFieldError[],
  seen: Set<string>,
  error: TemplateFieldError,
): void {
  const key = `${error.field}|${error.message}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(error);
}

/**
 * Every problem Meta could report for this draft, keyed by editor field.
 * Returns an empty list when the template is safe to submit.
 */
export function collectTemplateFieldErrors(
  draft: TemplateDraftForValidation,
): TemplateFieldError[] {
  const kinds = componentKinds(draft.components);
  const errors: TemplateFieldError[] = [];
  const seen = new Set<string>();

  // 1. Full payload schema — names, limits, component shape, quick replies.
  const payloadIssues: TemplatePayloadIssue[] = draft.isEdit
    ? validateTemplateComponents(draft.components)
    : validateTemplatePayload({
        name: draft.name.trim(),
        language: draft.language,
        category: draft.category,
        components: draft.components,
      });
  for (const issue of payloadIssues) {
    pushUnique(errors, seen, {
      field: fieldForMetaPath(issue.path, kinds),
      path: issue.path,
      message: issue.message,
    });
  }

  // 2. Call-to-action buttons — same rules that produce (#100) and (#192).
  for (const issue of findTemplateButtonIssues(draft.components)) {
    pushUnique(errors, seen, {
      field: buttonFieldKey(issue.buttonIndex, issue.field),
      path: issue.path,
      message: issue.reason,
    });
  }

  // 3. Placeholder style in header/body/footer text.
  for (const issue of findTemplateBodyIssues(draft.components)) {
    const field =
      issue.component === "BODY" ? "body" : issue.component === "HEADER" ? "header" : "footer";
    const index = kinds.indexOf(issue.component as ComponentKind);
    pushUnique(errors, seen, {
      field,
      path: index >= 0 ? `components[${index}]['text']` : field,
      message: issue.message,
    });
  }

  // 3b. Malformed placeholder syntax the {{}} scanner cannot see:
  // single braces ({name}) and unbalanced openers ("{{name").
  for (const kind of ["HEADER", "BODY", "FOOTER"] as const) {
    const index = kinds.indexOf(kind as ComponentKind);
    if (index < 0) continue;
    const list = Array.isArray(draft.components) ? (draft.components as Array<{ text?: string }>) : [];
    const text = list[index]?.text;
    if (!text) continue;
    for (const issue of findFormatIssues([text])) {
      pushUnique(errors, seen, {
        field: kind === "BODY" ? "body" : kind === "HEADER" ? "header" : "footer",
        path: `components[${index}]['text']`,
        message: issue.reason,
      });
    }
  }


  // 4. Media headers need an uploaded Meta handle before submit.
  const format = (draft.headerFormat ?? "NONE").toUpperCase();
  if (
    format !== "NONE" &&
    format !== "TEXT" &&
    format !== "LOCATION" &&
    !(draft.headerHandle ?? "").trim()
  ) {
    pushUnique(errors, seen, {
      field: "header",
      path: `components[${Math.max(kinds.indexOf("HEADER"), 0)}]['example']['header_handle']`,
      message: `Upload a ${format.toLowerCase()} sample before submitting — Meta requires a header handle.`,
    });
  }

  return errors;
}

/** First error per field, ready for inline rendering. */
export function templateErrorsByField(errors: TemplateFieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    if (!map[error.field]) map[error.field] = error.message;
  }
  return map;
}
