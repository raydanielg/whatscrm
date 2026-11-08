import { z } from "zod";

/**
 * Enterprise-grade zod primitives. Compose these for consistent trims, length
 * limits, and error copy across every form.
 */

export const nonEmptyString = (label = "This field") =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required` });

export const boundedString = (label: string, max = 255, min = 1) =>
  z
    .string()
    .trim()
    .min(min, { message: `${label} must be at least ${min} characters` })
    .max(max, { message: `${label} must be under ${max} characters` });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "Enter a valid email address" })
  .max(255);

export const urlSchema = z.string().trim().url({ message: "Enter a valid URL" }).max(2048);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()\-.]{7,20}$/, { message: "Enter a valid phone number" });

/** RFC 4180-ish slug: lowercase letters, digits, dashes. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Use lowercase letters, numbers, and dashes" })
  .min(2)
  .max(64);

/** Strong password: 8+ chars, at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(8, { message: "Use at least 8 characters" })
  .max(128, { message: "Use fewer than 128 characters" })
  .regex(/[A-Za-z]/, { message: "Include at least one letter" })
  .regex(/[0-9]/, { message: "Include at least one number" });

export const positiveNumber = (label = "Value") =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .positive({ message: `${label} must be positive` });

export const nonNegativeInt = (label = "Value") =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int({ message: `${label} must be a whole number` })
    .nonnegative({ message: `${label} cannot be negative` });

export const currencyAmount = z.coerce
  .number({ invalid_type_error: "Enter an amount" })
  .nonnegative({ message: "Amount cannot be negative" })
  .max(1_000_000_000, { message: "Amount is too large" });

/** File size + optional mime-prefix guard. Use in a superRefine chain. */
export function fileSchema({
  maxSize = 10 * 1024 * 1024,
  accept,
}: { maxSize?: number; accept?: string[] } = {}) {
  return z
    .instanceof(File, { message: "Choose a file" })
    .refine((f) => f.size <= maxSize, { message: `File exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB` })
    .refine(
      (f) =>
        !accept ||
        accept.some((a) => (a.endsWith("/*") ? f.type.startsWith(a.slice(0, -1)) : f.type === a)),
      { message: "File type not allowed" },
    );
}

export const commonMessages = {
  required: "This field is required",
  invalid: "Please check this field",
  tooLong: "This field is too long",
  networkError: "Something went wrong. Try again.",
  saved: "Changes saved.",
  submitted: "Submitted successfully.",
};
