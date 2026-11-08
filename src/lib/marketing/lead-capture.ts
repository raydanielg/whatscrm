import { z } from "zod";

/** Company-size buckets offered on the public lead capture form. */
export const COMPANY_SIZES = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-1000", label: "201–1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
] as const;

const COMPANY_SIZE_VALUES = COMPANY_SIZES.map((s) => s.value) as [string, ...string[]];

/** Free-mail domains are rejected — the form asks for a work email. */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "aol.com", "icloud.com", "me.com", "proton.me", "protonmail.com",
  "mail.com", "gmx.com", "yandex.com", "zoho.com",
]);

export const leadCaptureSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { message: "Please enter your full name" })
      .max(100, { message: "Name must be under 100 characters" }),
    workEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: "Enter a valid email address" })
      .max(255, { message: "Email must be under 255 characters" })
      .refine((v) => !FREE_EMAIL_DOMAINS.has(v.split("@")[1] ?? ""), {
        message: "Please use your work email address",
      }),
    companySize: z.enum(COMPANY_SIZE_VALUES, {
      errorMap: () => ({ message: "Select your company size" }),
    }),
    contactMethod: z.enum(["email", "whatsapp"]).default("email"),
    whatsappNumber: z
      .string()
      .trim()
      .max(20, { message: "Number must be under 20 characters" })
      .optional()
      .or(z.literal("")),
    message: z
      .string()
      .trim()
      .max(1000, { message: "Message must be under 1,000 characters" })
      .optional()
      .or(z.literal("")),
    sourcePage: z.string().trim().max(255).optional().or(z.literal("")),
    referrer: z.string().trim().max(500).optional().or(z.literal("")),
    utm: z.record(z.string().max(200)).default({}),
    /** Honeypot — must stay empty. Bots fill it in. */
    website: z.string().max(0).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.contactMethod !== "whatsapp") return;
    const digits = (data.whatsappNumber ?? "").replace(/[^\d]/g, "");
    if (digits.length < 8 || digits.length > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whatsappNumber"],
        message: "Enter a WhatsApp number in international format, e.g. +971 50 123 4567",
      });
    }
  });

export type LeadCaptureInput = z.input<typeof leadCaptureSchema>;
export type LeadCaptureValues = z.output<typeof leadCaptureSchema>;

/** Normalises a typed number to E.164-ish digits with a leading +. */
export function normalizeWhatsappNumber(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
}

/** Reads utm_* params off a query string into a flat record. */
export function readUtmParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const utm: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.toLowerCase().startsWith("utm_") && value) utm[key.toLowerCase()] = value.slice(0, 200);
  });
  return utm;
}
