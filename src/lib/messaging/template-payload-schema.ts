/**
 * Zod schema for the full Meta WhatsApp template payload.
 *
 * Meta's Cloud API rejects invalid templates with terse errors such as
 * `(#100) Param components[3]['buttons'][1]['url'] is not a valid URI.` — no
 * hint about which field is broken. This module validates the *entire* payload
 * locally, with the same Meta-style parameter paths, and delegates URL-button
 * checks to the shared validator in `template-url-validation.ts` so client and
 * server report identical messages.
 *
 * Client-safe: no server-only imports.
 */

import { z } from "zod";
import { validateTemplateButtonPhone, validateTemplateButtonUrl } from "./template-url-validation";

// --- Meta limits -----------------------------------------------------------

export const TEMPLATE_LIMITS = {
  nameMax: 512,
  headerTextMax: 60,
  bodyTextMax: 1024,
  footerTextMax: 60,
  buttonTextMax: 25,
  copyCodeMax: 15,
  maxButtons: 10,
  maxUrlButtons: 2,
  maxPhoneButtons: 1,
  maxCopyCodeButtons: 1,
  maxQuickReplyButtons: 10,

  maxComponents: 10,
} as const;

const NAME_RE = /^[a-z0-9_]+$/;
/** WhatsApp Cloud API only accepts positional variables in the form {{1}}, {{2}}, ... */
const VARIABLE_RE = /\{\{\s*(\d+)\s*\}\}/g;

function numericVars(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) out.push(Number(m[1]));
  return out;
}

// --- buttons ---------------------------------------------------------------

const ButtonSchema = z
  .object({
    type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "FLOW", "OTP"]),
    text: z
      .string()
      .trim()
      .max(TEMPLATE_LIMITS.buttonTextMax, `Button label must be at most ${TEMPLATE_LIMITS.buttonTextMax} characters`)
      .optional(),
    url: z.string().optional(),
    phone_number: z.string().optional(),
    example: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough()
  .superRefine((button, ctx) => {
    const label = (button.text ?? "").trim();
    if (button.type !== "COPY_CODE" && button.type !== "OTP" && !label) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Button label is required" });
    }
    if (label) {
      if (/[\r\n\t]/.test(button.text ?? "")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: "Button labels cannot contain line breaks or tabs",
        });
      }
      VARIABLE_RE.lastIndex = 0;
      if (VARIABLE_RE.test(label)) {
        VARIABLE_RE.lastIndex = 0;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: "Button labels cannot contain {{variables}} — Meta requires fixed text",
        });
      }
      VARIABLE_RE.lastIndex = 0;
    }
    if (button.type === "QUICK_REPLY") {
      if (button.url?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Quick-reply buttons cannot carry a URL" });
      }
      if (button.phone_number?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone_number"],
          message: "Quick-reply buttons cannot carry a phone number",
        });
      }
    }

    if (button.type === "URL") {
      const reason = validateTemplateButtonUrl(button.url);
      if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: reason });
    }
    if (button.type === "PHONE_NUMBER") {
      const reason = validateTemplateButtonPhone(button.phone_number);
      if (reason) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone_number"], message: reason });
      }
    }
    if (button.type === "COPY_CODE") {
      const example = Array.isArray(button.example) ? button.example[0] : button.example;
      const code = (example ?? "").trim();
      if (!code) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["example"], message: "Copy-code example is required" });
      } else if (code.length > TEMPLATE_LIMITS.copyCodeMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["example"],
          message: `Copy code must be at most ${TEMPLATE_LIMITS.copyCodeMax} characters`,
        });
      }
    }
  });

// --- components ------------------------------------------------------------

export const TemplateComponentSchema = z
  .object({
    type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS", "CAROUSEL"]),
    format: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]).optional(),
    text: z.string().optional(),
    example: z.record(z.string(), z.unknown()).optional(),
    buttons: z.array(ButtonSchema).optional(),
  })
  .passthrough()
  .superRefine((component, ctx) => {
    const text = component.text ?? "";

    if (component.type === "HEADER") {
      const format = component.format ?? "TEXT";
      if (format === "TEXT") {
        if (!text.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Header text is required" });
        }
        if (text.length > TEMPLATE_LIMITS.headerTextMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["text"],
            message: `Header text must be at most ${TEMPLATE_LIMITS.headerTextMax} characters`,
          });
        }
        if (/\n/.test(text)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Header text cannot contain line breaks" });
        }
        const vars = numericVars(text);
        if (vars.length > 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Header may contain at most one variable" });
        } else if (vars.length === 1 && vars[0] !== 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Header variable must be {{1}}" });
        }
      }
    }

    if (component.type === "BODY") {
      if (!text.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Body text is required" });
      }
      if (text.length > TEMPLATE_LIMITS.bodyTextMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: `Body must be at most ${TEMPLATE_LIMITS.bodyTextMax} characters`,
        });
      }
      if (/\n{4,}/.test(text)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Body cannot contain 4+ consecutive line breaks" });
      }
      if (text.trim()) {
        if (/^\s*\{\{\s*\d+\s*\}\}/.test(text) || /\{\{\s*\d+\s*\}\}\s*$/.test(text)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["text"],
            message: "Body cannot begin or end with a variable — surround {{n}} with static text",
          });
        }
        const unique = [...new Set(numericVars(text))].sort((a, b) => a - b);
        if (unique.some((n) => n <= 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Variables must be numbered starting at {{1}}" });
        }
        for (let i = 0; i < unique.length; i++) {
          if (unique[i] !== i + 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["text"],
              message: "Variables must be sequential — use {{1}}, {{2}}, {{3}} without gaps",
            });
            break;
          }
        }
      }
    }

    if (component.type === "FOOTER") {
      if (text.length > TEMPLATE_LIMITS.footerTextMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: `Footer must be at most ${TEMPLATE_LIMITS.footerTextMax} characters`,
        });
      }
      if (VARIABLE_RE.test(text)) {
        VARIABLE_RE.lastIndex = 0;
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Footer cannot contain variables" });
      }
      VARIABLE_RE.lastIndex = 0;
    }

    if (component.type === "BUTTONS") {
      const buttons = component.buttons ?? [];
      if (buttons.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["buttons"], message: "A BUTTONS component needs at least one button" });
      }
      if (buttons.length > TEMPLATE_LIMITS.maxButtons) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["buttons"],
          message: `A template may have at most ${TEMPLATE_LIMITS.maxButtons} buttons`,
        });
      }
      const counts = { URL: 0, PHONE_NUMBER: 0, COPY_CODE: 0 } as Record<string, number>;
      const seen = new Set<string>();
      buttons.forEach((button, index) => {
        if (button.type in counts) counts[button.type] += 1;
        const key = `${button.type}:${(button.text ?? "").trim().toLowerCase()}`;
        if (button.text?.trim()) {
          if (seen.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["buttons", index, "text"],
              message: `Duplicate button label "${button.text.trim()}"`,
            });
          }
          seen.add(key);
        }
      });
      if (counts.URL > TEMPLATE_LIMITS.maxUrlButtons) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["buttons"], message: `At most ${TEMPLATE_LIMITS.maxUrlButtons} URL buttons allowed` });
      }
      if (counts.PHONE_NUMBER > TEMPLATE_LIMITS.maxPhoneButtons) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["buttons"], message: `At most ${TEMPLATE_LIMITS.maxPhoneButtons} phone button allowed` });
      }
      if (counts.COPY_CODE > TEMPLATE_LIMITS.maxCopyCodeButtons) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["buttons"], message: `At most ${TEMPLATE_LIMITS.maxCopyCodeButtons} copy-code button allowed` });
      }
      // Quick replies: Meta allows up to 10, but they must all sit together —
      // a quick reply after a call-to-action button is rejected.
      const quickReplies = buttons.filter((b) => b.type === "QUICK_REPLY").length;
      if (quickReplies > TEMPLATE_LIMITS.maxQuickReplyButtons) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["buttons"],
          message: `At most ${TEMPLATE_LIMITS.maxQuickReplyButtons} quick-reply buttons allowed`,
        });
      }
      if (quickReplies > 0 && quickReplies < buttons.length) {
        const first = buttons.findIndex((b) => b.type === "QUICK_REPLY");
        const last = buttons.map((b) => b.type).lastIndexOf("QUICK_REPLY");
        const grouped = last - first + 1 === quickReplies;
        if (!grouped) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["buttons", first, "type"],
            message: "Quick-reply buttons must be grouped together — do not interleave them with URL or call buttons",
          });
        }
      }

    }
  });

export const TemplateComponentsSchema = z
  .array(TemplateComponentSchema)
  .min(1, "A template needs at least one component")
  .max(TEMPLATE_LIMITS.maxComponents)
  .superRefine((components, ctx) => {
    const count = (type: string) => components.filter((c) => c.type === type).length;
    if (count("BODY") !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A template must contain exactly one BODY component" });
    }
    for (const type of ["HEADER", "FOOTER", "BUTTONS"]) {
      if (count(type) > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A template may contain at most one ${type} component` });
      }
    }
  });

export const TemplatePayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Template name is required")
      .max(TEMPLATE_LIMITS.nameMax, `Name must be at most ${TEMPLATE_LIMITS.nameMax} characters`)
      .regex(NAME_RE, "Name may only contain lowercase letters, numbers and underscores"),
    language: z.string().min(2).max(10),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
    components: TemplateComponentsSchema,
  })
  .superRefine((payload, ctx) => {
    if (payload.category === "AUTHENTICATION") {
      const body = payload.components.find((c) => c.type === "BODY");
      if (body && numericVars(body.text ?? "").length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: "Authentication templates must include a variable (e.g. the OTP code)",
        });
      }
    }
  });

export type TemplatePayload = z.infer<typeof TemplatePayloadSchema>;

// --- issue formatting ------------------------------------------------------

export type TemplatePayloadIssue = { path: string; message: string };

/** Render a Zod path the way Meta reports it: components[3]['buttons'][1]['url'] */
export function metaPath(path: ReadonlyArray<string | number | symbol>): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    if (!acc) return String(segment);
    return `${acc}['${String(segment)}']`;
  }, "");
}

function toIssues(error: z.ZodError): TemplatePayloadIssue[] {
  return error.issues.map((issue) => ({
    path: metaPath(issue.path) || "payload",
    message: issue.message,
  }));
}

/** Validate a full template payload. Returns every problem found. */
export function validateTemplatePayload(input: unknown): TemplatePayloadIssue[] {
  const result = TemplatePayloadSchema.safeParse(input);
  return result.success ? [] : toIssues(result.error);
}

/** Validate just the components array (used when editing an existing template). */
export function validateTemplateComponents(input: unknown): TemplatePayloadIssue[] {
  const result = TemplateComponentsSchema.safeParse(input);
  return result.success ? [] : toIssues(result.error);
}

/** Format an issue as Meta would report it: title + description. */
export function formatTemplatePayloadIssue(issue: TemplatePayloadIssue): { title: string; description: string } {
  return { title: `Param ${issue.path} is invalid`, description: issue.message };
}

/**
 * Throwable guard for server-side use. Raises a friendly two-line error that
 * `splitFriendlyMessage` renders as title + description.
 */
export function assertValidTemplatePayload(input: unknown): void {
  const [issue] = validateTemplatePayload(input);
  if (!issue) return;
  throw new Error(`Param ${issue.path} is invalid\n${issue.message}`);
}

/** Same as above, but for a components-only edit. */
export function assertValidTemplateComponents(input: unknown): void {
  const [issue] = validateTemplateComponents(input);
  if (!issue) return;
  throw new Error(`Param ${issue.path} is invalid\n${issue.message}`);
}
