/**
 * Cross-tenant invoice listing for the Super Admin Billing page.
 *
 * `listOrgInvoices` (billing.functions.ts) is RLS-scoped to one org the
 * caller belongs to — fine for a tenant's own Billing settings page, but a
 * platform admin isn't a member of every org, so that query would silently
 * return nothing for most tenants. This reads with the admin client instead,
 * after an explicit platform-staff check.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

async function assertPlatformAdmin(supabase: unknown, userId: string) {
  const { data } = await sbAny(supabase)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

export const listAllInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        status: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const admin = sbAny(supabaseAdmin);

    let query = admin
      .from("billing_invoices")
      .select(
        "id, organization_id, number, status, total_cents, amount_paid_cents, amount_due_cents, currency, period_start, period_end, issued_at, due_at, paid_at, hosted_url, pdf_url, organizations(name)",
      )
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    if (data.q?.trim()) {
      const needle = data.q.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(needle);
      query = isUuid
        ? query.or(`number.ilike.%${needle}%,organization_id.eq.${needle}`)
        : query.ilike("number", `%${needle}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Array<{
      id: string;
      organization_id: string;
      number: string | null;
      status: string;
      total_cents: number;
      amount_paid_cents: number;
      amount_due_cents: number;
      currency: string;
      period_start: string | null;
      period_end: string | null;
      issued_at: string | null;
      due_at: string | null;
      paid_at: string | null;
      hosted_url: string | null;
      pdf_url: string | null;
      organizations: { name: string } | null;
    }>;
  });
