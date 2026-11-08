/**
 * Payments service — provider-agnostic operations for one-time charges,
 * refunds, retries, and audit history.
 *
 * All calls go through the `BillingProvider` abstraction: adding a new
 * gateway never changes these server functions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny, type UntypedClient } from "@/lib/supabase/untyped";

import { getBillingProvider } from "./providers";
import type { BillingProviderId, PaymentStatus } from "./providers/types";

/**
 * Map provider-level statuses to the DB enum `billing_payment_status`,
 * which does not include `partially_refunded` or `requires_action`.
 * Partial refunds stay `succeeded`; refunded amount is tracked on the column.
 */
function toDbStatus(
  s: PaymentStatus,
): "pending" | "processing" | "succeeded" | "failed" | "canceled" | "refunded" {
  if (s === "partially_refunded") return "succeeded";
  if (s === "requires_action") return "processing";
  return s;
}

/**
 * Platform-staff gate (superadmin or support). Platform roles live in
 * `user_roles` (enum `app_role`), not `user_role_assignments` (which holds
 * org/workspace role_id links). Checked with the caller's own client.
 */
async function requirePlatformAdmin(ctx: { supabase: unknown; userId: string }) {
  const { assertPlatformStaff } = await import("@/lib/admin/platform-guard.server");
  await assertPlatformStaff(ctx.supabase, ctx.userId);
}

/**
 * Service-role client for cross-org payment rows. Only call AFTER
 * `requirePlatformAdmin` — `billing_payment_attempts` has no UPDATE policy,
 * so user-scoped writes would silently affect zero rows.
 */
async function adminClient(): Promise<UntypedClient> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  return sbAny(supabaseAdmin);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPayment(sb: UntypedClient, id: string): Promise<any> {
  const { data, error } = await sb
    .from("billing_payment_attempts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Payment not found");
  return data;
}

/** Update one payment row; throws if the write errored or matched no row. */
async function updatePayment(
  sb: UntypedClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await sb
    .from("billing_payment_attempts")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to update payment record: ${error.message}`);
  if (!data) throw new Error("Failed to update payment record: no row updated");
}

/** List payments across the tenant (admin) or a specific organization. */
export const listPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid().optional(),
        status: z.string().optional(),
        provider: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("billing_payment_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.organization_id) query = query.eq("organization_id", data.organization_id);
    if (data.status) query = query.eq("status", data.status as any);
    if (data.provider) query = query.eq("provider", data.provider);
    if (data.cursor) query = query.lt("created_at", data.cursor);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/** Refund (full or partial) a captured payment. */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        payment_id: z.string().uuid(),
        amount_cents: z.number().int().positive().optional(),
        reason: z
          .enum(["requested_by_customer", "duplicate", "fraudulent", "other"])
          .default("requested_by_customer"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const sb = await adminClient();
    const payment = await loadPayment(sb, data.payment_id);

    const provider = getBillingProvider(payment.provider as BillingProviderId);
    if (!provider.supports.refunds) {
      throw new Error(`Provider ${payment.provider} does not support refunds`);
    }
    if (data.amount_cents && !provider.supports.partial_refunds) {
      throw new Error(`Provider ${payment.provider} does not support partial refunds`);
    }
    const refund = await provider.refundPayment({
      provider_payment_id: payment.provider_payment_id as string,
      amount_cents: data.amount_cents,
      reason: data.reason,
    });

    const refundedTotal = (payment.refunded_amount_cents ?? 0) + refund.amount_cents;
    const fullyRefunded = refundedTotal >= payment.amount_cents;
    try {
      await updatePayment(sb, data.payment_id, {
        status: fullyRefunded ? "refunded" : "succeeded",
        refunded_amount_cents: refundedTotal,
        refunded_at: refund.created_at,
      });
    } catch (e) {
      // The provider already moved the money — surface that loudly so the
      // record can be reconciled (e.g. via syncPaymentStatus).
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Refund issued at provider but local record not updated (payment ${data.payment_id}): ${msg}`,
      );
    }

    return { refund: refund as any, fully_refunded: fullyRefunded };
  });

/** Retry a failed payment attempt via the same provider. */
export const retryPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ payment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const sb = await adminClient();
    const payment = await loadPayment(sb, data.payment_id);
    if (payment.status === "succeeded") {
      throw new Error("Payment already succeeded");
    }

    const provider = getBillingProvider(payment.provider as BillingProviderId);
    const result = await provider.retryPayment(payment.provider_payment_id as string);

    await updatePayment(sb, data.payment_id, {
      status: toDbStatus(result.status),
      retry_count: (payment.retry_count ?? 0) + 1,
      next_retry_at: null,
      failure_code: result.failure_code ?? null,
      failure_message: result.failure_message ?? null,
      succeeded_at: result.status === "succeeded" ? new Date().toISOString() : null,
    });

    return { status: result.status as string, next_action_url: result.next_action_url ?? null };
  });

/** Fetch fresh payment status from the provider (for reconciliation). */
export const syncPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ payment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<any> => {
    await requirePlatformAdmin(context);
    const sb = await adminClient();
    const payment = await loadPayment(sb, data.payment_id);
    const provider = getBillingProvider(payment.provider as BillingProviderId);
    const fresh = await provider.getPayment(payment.provider_payment_id as string);
    await updatePayment(sb, data.payment_id, {
      status: toDbStatus(fresh.status),
      refunded_amount_cents: fresh.refunded_amount_cents ?? payment.refunded_amount_cents,
      failure_code: fresh.failure_code ?? null,
      failure_message: fresh.failure_message ?? null,
    });
    return JSON.parse(JSON.stringify(fresh));
  });
