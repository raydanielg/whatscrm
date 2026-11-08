import { createServerFn } from "@tanstack/react-start";
import {
  leadCaptureSchema,
  normalizeWhatsappNumber,
  type LeadCaptureInput,
} from "@/lib/marketing/lead-capture";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Public endpoint used by the marketing site's lead capture form.
 * Unauthenticated by design — every field is validated server-side, a honeypot
 * blocks trivial bots, and repeat submissions from the same email are throttled.
 */
export const submitMarketingLead = createServerFn({ method: "POST" })
  .inputValidator((input: LeadCaptureInput) => leadCaptureSchema.parse(input))
  .handler(async ({ data }) => {
    // Honeypot filled → pretend success, store nothing.
    if (data.website) return { ok: true as const, duplicate: false };

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    // Throttle: one stored submission per email per 10 minutes.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("marketing_leads")
      .select("id", { count: "exact", head: true })
      .eq("work_email", data.workEmail)
      .gte("created_at", since);

    if ((count ?? 0) > 0) return { ok: true as const, duplicate: true };

    const { error } = await sbAny(supabaseAdmin).from("marketing_leads").insert({
      full_name: data.fullName,
      work_email: data.workEmail,
      company_size: data.companySize,
      contact_method: data.contactMethod,
      whatsapp_number:
        data.contactMethod === "whatsapp" ? normalizeWhatsappNumber(data.whatsappNumber) : null,
      message: data.message || null,
      source_page: data.sourcePage || null,
      referrer: data.referrer || null,
      utm: data.utm ?? {},
    });

    if (error) throw new Error("We could not save your request. Please try again.");

    return { ok: true as const, duplicate: false };
  });
