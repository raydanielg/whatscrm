import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { normalizeCurrencyCode } from "@/lib/currency/format";
import { resolveOrganizationCurrency } from "@/lib/currency/resolve.server";

const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit_amount_cents: z.number(),
  tax_rate_id: z.string().uuid().optional().nullable(),
  meter_code: z.string().optional().nullable(),
});

const DocumentTypeSchema = z.enum(["invoice", "credit_note", "receipt", "refund_receipt"]);

async function assertOrgMember(supabase: any, userId: string, organizationId: string) {
  const { data } = await sbAny(supabase).from("organization_members").select("id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Not a member of this organization");
}

async function logHistory(supabase: any, documentId: string, organizationId: string, actorId: string, action: string, details: Record<string, unknown> = {}) {
  await sbAny(supabase).from("billing_document_history").insert({ document_id: documentId, organization_id: organizationId, actor_id: actorId, action, details });
}

// ---------- Templates ----------

export const listDocumentTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { organization_id: string }) => z.object({ organization_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.organization_id);
    const { data: rows, error } = await context.supabase
      .from("billing_document_templates")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    id: z.string().uuid().optional(),
    organization_id: z.string().uuid(),
    name: z.string().min(1),
    is_default: z.boolean().optional(),
    document_type: DocumentTypeSchema.optional(),
    company_name: z.string().optional().nullable(),
    company_logo_url: z.string().optional().nullable(),
    company_address: z.any().optional(),
    company_tax_id: z.string().optional().nullable(),
    company_email: z.string().optional().nullable(),
    company_phone: z.string().optional().nullable(),
    company_website: z.string().optional().nullable(),
    primary_color: z.string().optional(),
    accent_color: z.string().optional(),
    font_family: z.string().optional(),
    footer_note: z.string().optional().nullable(),
    terms: z.string().optional().nullable(),
    number_prefix: z.string().optional(),
    number_padding: z.number().optional(),
    locale: z.string().optional(),
    currency: z.string().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.organization_id);
    if (data.is_default) {
      await sbAny(context.supabase).from("billing_document_templates").update({ is_default: false }).eq("organization_id", data.organization_id);
    }
    const { data: row, error } = await context.supabase
      .from("billing_document_templates")
      .upsert({ ...data })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({ id: z.string().uuid(), organization_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.organization_id);
    const { error } = await sbAny(context.supabase).from("billing_document_templates").delete().eq("id", data.id).eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Documents ----------

export const listBillingDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    organization_id: z.string().uuid(),
    type: DocumentTypeSchema.optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.organization_id);
    let q = sbAny(context.supabase).from("billing_documents").select("*").eq("organization_id", data.organization_id).order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.type) q = q.eq("type", data.type);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.search) q = q.or(`number.ilike.%${sanitizeSearchTerm(data.search)}%,customer_name.ilike.%${sanitizeSearchTerm(data.search)}%,customer_email.ilike.%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getBillingDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await sbAny(context.supabase).from("billing_documents").select("*").eq("id", data.id).single();
    if (error) throw error;
    await assertOrgMember(context.supabase, context.userId, doc.organization_id);
    const [{ data: history }, { data: template }] = await Promise.all([
      sbAny(context.supabase).from("billing_document_history").select("*").eq("document_id", data.id).order("created_at", { ascending: false }),
      doc.template_id
        ? sbAny(context.supabase).from("billing_document_templates").select("*").eq("id", doc.template_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return { document: doc, history: history ?? [], template: template ?? null };
  });

function computeTotals(items: Array<z.infer<typeof LineItemSchema>>, taxRates: Map<string, { rate_percent: number; inclusive: boolean; name: string; code: string }>, discountCents: number, taxExempt: boolean) {
  let subtotal = 0;
  const taxBreakdown = new Map<string, { code: string; name: string; rate_percent: number; taxable_cents: number; tax_cents: number }>();
  for (const it of items) {
    const line = Math.round(it.quantity * it.unit_amount_cents);
    subtotal += line;
    if (!taxExempt && it.tax_rate_id) {
      const rate = taxRates.get(it.tax_rate_id);
      if (rate) {
        const taxable = line;
        const tax = Math.round((taxable * Number(rate.rate_percent)) / 100);
        const prev = taxBreakdown.get(it.tax_rate_id);
        taxBreakdown.set(it.tax_rate_id, {
          code: rate.code,
          name: rate.name,
          rate_percent: Number(rate.rate_percent),
          taxable_cents: (prev?.taxable_cents ?? 0) + taxable,
          tax_cents: (prev?.tax_cents ?? 0) + tax,
        });
      }
    }
  }
  const tax_cents = Array.from(taxBreakdown.values()).reduce((a, b) => a + b.tax_cents, 0);
  const total_cents = subtotal - discountCents + tax_cents;
  return { subtotal_cents: subtotal, tax_cents, total_cents, tax_breakdown: Array.from(taxBreakdown.values()) };
}

export const createBillingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    organization_id: z.string().uuid(),
    type: DocumentTypeSchema,
    template_id: z.string().uuid().optional().nullable(),
    invoice_id: z.string().uuid().optional().nullable(),
    parent_document_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().optional().nullable(),
    customer_email: z.string().optional().nullable(),
    customer_address: z.any().optional(),
    customer_tax_id: z.string().optional().nullable(),
    customer_id: z.string().uuid().optional().nullable(),
    // No USD default here: an absent currency resolves from the organization
    // (workspace → platform → USD) further down, so a ZAR org never gets USD.
    currency: z.string().optional(),
    locale: z.string().default("en-US"),
    discount_cents: z.number().default(0),
    line_items: z.array(LineItemSchema).min(1),
    notes: z.string().optional().nullable(),
    due_at: z.string().optional().nullable(),
    tax_exempt: z.boolean().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.organization_id);
    const currency = normalizeCurrencyCode(data.currency) ?? (await resolveOrganizationCurrency(data.organization_id));

    // Fetch tax rates referenced
    const rateIds = Array.from(new Set(data.line_items.map((i) => i.tax_rate_id).filter(Boolean))) as string[];
    const taxRates = new Map<string, any>();
    if (rateIds.length > 0) {
      const { data: rates } = await sbAny(context.supabase).from("tax_rates").select("*").in("id", rateIds);
      for (const r of rates ?? []) taxRates.set(r.id, r);
    }

    // Check exemption
    let taxExempt = !!data.tax_exempt;
    if (!taxExempt && data.customer_id) {
      const { data: ex } = await sbAny(context.supabase).from("billing_tax_exemptions").select("id, valid_until").eq("customer_id", data.customer_id).limit(1).maybeSingle();
      if (ex && (!ex.valid_until || new Date(ex.valid_until) > new Date())) taxExempt = true;
    }

    const totals = computeTotals(data.line_items, taxRates, data.discount_cents, taxExempt);

    // Number
    let number: string;
    let template_id = data.template_id ?? null;
    if (!template_id) {
      const { data: def } = await sbAny(context.supabase).from("billing_document_templates").select("id").eq("organization_id", data.organization_id).eq("is_default", true).maybeSingle();
      template_id = def?.id ?? null;
    }
    if (template_id) {
      const { data: n } = await sbAny(context.supabase).rpc("next_document_number", { _template_id: template_id });
      number = n as string;
    } else {
      const prefix = data.type === "credit_note" ? "CN-" : data.type === "receipt" ? "RCP-" : data.type === "refund_receipt" ? "RFD-" : "INV-";
      number = `${prefix}${Date.now()}`;
    }

    const isNegative = data.type === "credit_note" || data.type === "refund_receipt";
    const sign = isNegative ? -1 : 1;

    const { data: doc, error } = await context.supabase
      .from("billing_documents")
      .insert({
        organization_id: data.organization_id,
        type: data.type,
        status: "draft",
        number,
        template_id,
        invoice_id: data.invoice_id ?? null,
        parent_document_id: data.parent_document_id ?? null,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_address: data.customer_address ?? null,
        customer_tax_id: data.customer_tax_id,
        currency,
        locale: data.locale,
        subtotal_cents: sign * totals.subtotal_cents,
        discount_cents: sign * data.discount_cents,
        tax_cents: sign * totals.tax_cents,
        total_cents: sign * totals.total_cents,
        tax_breakdown: totals.tax_breakdown,
        line_items: data.line_items,
        notes: data.notes,
        due_at: data.due_at ?? null,
        created_by: context.userId,
        metadata: { tax_exempt: taxExempt },
      })
      .select()
      .single();
    if (error) throw error;

    await logHistory(context.supabase, doc.id, data.organization_id, context.userId, "created", { type: data.type });
    return doc;
  });

export const issueBillingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await sbAny(context.supabase).from("billing_documents").select("*").eq("id", data.id).single();
    if (e1) throw e1;
    await assertOrgMember(context.supabase, context.userId, doc.organization_id);
    const { data: updated, error } = await context.supabase
      .from("billing_documents")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    await logHistory(context.supabase, data.id, doc.organization_id, context.userId, "issued");
    return updated;
  });

export const voidBillingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({ id: z.string().uuid(), reason: z.string().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await sbAny(context.supabase).from("billing_documents").select("organization_id").eq("id", data.id).single();
    if (e1 || !doc) throw e1 ?? new Error("Not found");
    await assertOrgMember(context.supabase, context.userId, doc.organization_id);
    const { error } = await sbAny(context.supabase).from("billing_documents").update({ status: "void" }).eq("id", data.id);
    if (error) throw error;
    await logHistory(context.supabase, data.id, doc.organization_id, context.userId, "voided", { reason: data.reason });
    return { ok: true };
  });

export const markDocumentSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({ id: z.string().uuid(), to_email: z.string().email() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await sbAny(context.supabase).from("billing_documents").select("*").eq("id", data.id).single();
    if (e1 || !doc) throw e1 ?? new Error("Not found");
    await assertOrgMember(context.supabase, context.userId, doc.organization_id);
    await sbAny(context.supabase).from("billing_documents").update({ status: doc.status === "draft" ? "sent" : doc.status, sent_at: new Date().toISOString() }).eq("id", data.id);
    await logHistory(context.supabase, data.id, doc.organization_id, context.userId, "emailed", { to: data.to_email });
    return { ok: true };
  });

export const deleteBillingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: doc } = await sbAny(context.supabase).from("billing_documents").select("organization_id, status").eq("id", data.id).single();
    if (!doc) return { ok: true };
    if (doc.status !== "draft") throw new Error("Only draft documents can be deleted");
    await assertOrgMember(context.supabase, context.userId, doc.organization_id);
    const { error } = await sbAny(context.supabase).from("billing_documents").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Tax rates ----------

export const listTaxRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await sbAny(context.supabase).from("tax_rates").select("*").eq("is_active", true).order("name");
    if (error) throw error;
    return data ?? [];
  });
