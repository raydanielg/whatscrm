/**
 * Validation rules shared by the Platform Settings UI and the server
 * function that persists them, so the admin panel and the API agree.
 */
import { z } from "zod";
import { ANALYTICS_PROVIDERS } from "@/lib/analytics/config";

/**
 * Shape guards for the keys that are rendered across the whole app.
 * Everything else stays free-form (panel-owned) as before.
 */
const optUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https?:\/\//i.test(v) || (v.startsWith("/") && !v.startsWith("//")), "Must be an https URL or a /path")
  .optional()
  .nullable();
const optHex = z
  .string()
  .trim()
  .refine((v) => v === "" || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v), "Must be a hex color like #1a2b3c")
  .optional()
  .nullable();

const GeneralSchema = z.object({
  platform_name: z.string().trim().min(1, "Platform name is required").max(60),
  tagline: z.string().trim().max(160).optional().nullable(),
  primary_url: optUrl,
  support_email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Enter a valid email address")
    .optional()
    .nullable(),
  default_org_size: z.coerce.number().int().min(1).max(10000).optional(),
  // WhatsApp click-to-chat CTA (marketing site + app footer).
  whatsapp_cta_enabled: z.boolean().optional(),
  whatsapp_token: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || /^[+\d][\d\s().-]{6,}$/.test(v) || /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(v),
      "Enter a phone number with country code, or a wa.me link",
    )
    .optional()
    .nullable(),
  whatsapp_message: z.string().trim().max(600).optional().nullable(),
  whatsapp_cta_label: z.string().trim().max(40).optional().nullable(),
  whatsapp_fallback_url: optUrl,
});

const BrandingSchema = z.object({
  logo_url: optUrl,
  dark_logo_url: optUrl,
  favicon_url: optUrl,
  social_image_url: optUrl,
  primary_color: optHex,
  accent_color: optHex,
  footer_html: z.string().max(4000).optional().nullable(),
});

const AnalyticsSchema = z
  .object({
    provider: z.enum(ANALYTICS_PROVIDERS).optional(),
    key: z.string().trim().max(120).optional().nullable(),
    host: optUrl,
    track_page_views: z.boolean().optional(),
    require_consent: z.boolean().optional(),
    debug: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const provider = v.provider ?? "none";
    const key = (v.key ?? "").trim();
    if (provider === "none" || provider === "custom") return;
    if (!key) {
      ctx.addIssue({ code: "custom", path: ["key"], message: "This provider needs an identifier" });
      return;
    }
    const patterns: Partial<Record<string, { re: RegExp; msg: string }>> = {
      ga4: { re: /^G-[A-Z0-9]{6,}$/i, msg: "Measurement ID looks like G-XXXXXXXXXX" },
      gtm: { re: /^GTM-[A-Z0-9]{5,}$/i, msg: "Container ID looks like GTM-XXXXXXX" },
      posthog: { re: /^phc_[A-Za-z0-9]{10,}$/, msg: "Project token looks like phc_..." },
      plausible: { re: /^[a-z0-9.-]+\.[a-z]{2,}$/i, msg: "Enter the site domain, e.g. wacrm.app" },
    };
    const rule = patterns[provider];
    if (rule && !rule.re.test(key)) {
      ctx.addIssue({ code: "custom", path: ["key"], message: rule.msg });
    }
  });

const KEY_SCHEMAS: Partial<Record<string, z.ZodTypeAny>> = {
  general: GeneralSchema,
  branding: BrandingSchema,
  analytics: AnalyticsSchema,
};

export function validatePlatformSettingValue(key: string, value: Record<string, unknown>) {
  const schema = KEY_SCHEMAS[key];
  if (!schema) return value;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`${first?.path.join(".") || key}: ${first?.message ?? "Invalid value"}`);
  }
  return { ...value, ...(parsed.data as Record<string, unknown>) };
}


/** Per-field errors for inline display in the admin panels. */
export function platformFieldErrors(
  key: string,
  value: Record<string, unknown>,
): Record<string, string> {
  const schema = KEY_SCHEMAS[key];
  if (!schema) return {};
  const parsed = schema.safeParse(value);
  if (parsed.success) return {};
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.join(".") || key;
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}
