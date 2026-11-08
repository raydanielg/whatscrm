/**
 * Payment Engine — orchestrates charge attempts, retries, and refunds
 * against the active BillingProvider. Persists every attempt to
 * `billing_payment_attempts` for a full audit trail and dunning.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emit, persistEvent } from "./events";
import { sbAny } from "@/lib/supabase/untyped";

const RETRY_BACKOFF_HOURS = [1, 24, 72]; // 1h, 1d, 3d — matches typical dunning.

export interface RecordAttemptInput {
  organization_id: string;
  invoice_id?: string;
  subscription_id?: string;
  provider: string;
  provider_payment_id?: string;
  provider_intent_id?: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "canceled" | "refunded";
  failure_code?: string | null;
  failure_message?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordPaymentAttempt(supabase: SupabaseClient, input: RecordAttemptInput): Promise<string> {
  const isFailure = input.status === "failed";
  const previousFailures = isFailure
    ? await countPreviousFailures(supabase, input.invoice_id)
    : 0;
  const retry_count = previousFailures;
  const next_retry_at = isFailure && retry_count < RETRY_BACKOFF_HOURS.length
    ? new Date(Date.now() + RETRY_BACKOFF_HOURS[retry_count] * 60 * 60 * 1000).toISOString()
    : null;

  const row = await supabase
    .from("billing_payment_attempts")
    .insert({
      organization_id: input.organization_id,
      invoice_id: input.invoice_id ?? null,
      subscription_id: input.subscription_id ?? null,
      provider: input.provider,
      provider_payment_id: input.provider_payment_id ?? null,
      provider_intent_id: input.provider_intent_id ?? null,
      amount_cents: input.amount_cents,
      currency: input.currency,
      status: input.status,
      failure_code: input.failure_code ?? null,
      failure_message: input.failure_message ?? null,
      retry_count,
      next_retry_at,
      succeeded_at: input.status === "succeeded" ? new Date().toISOString() : null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (row.error) throw row.error;

  const type =
    input.status === "succeeded"
      ? "payment.attempt.succeeded"
      : input.status === "failed"
        ? "payment.attempt.failed"
        : "payment.attempt.created";
  await emit({ type, organization_id: input.organization_id, data: { attempt_id: row.data.id, invoice_id: input.invoice_id, amount_cents: input.amount_cents } });
  await persistEvent(supabase, { type, organization_id: input.organization_id, occurred_at: new Date().toISOString(), data: { attempt_id: row.data.id } }, { subscription_id: input.subscription_id ?? null, provider: input.provider });

  // Roll up onto invoice.
  if (input.invoice_id) {
    if (input.status === "succeeded") await markInvoicePaid(supabase, input.invoice_id, input.amount_cents);
    if (input.status === "failed") await markInvoiceFailed(supabase, input.invoice_id);
  }
  return row.data.id;
}

async function countPreviousFailures(supabase: SupabaseClient, invoice_id?: string): Promise<number> {
  if (!invoice_id) return 0;
  const { count } = await supabase
    .from("billing_payment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoice_id)
    .eq("status", "failed");
  return count ?? 0;
}

async function markInvoicePaid(supabase: SupabaseClient, invoice_id: string, paid_cents: number): Promise<void> {
  const inv = await sbAny(supabase).from("billing_invoices").select("total_cents, amount_paid_cents, organization_id").eq("id", invoice_id).single();
  if (inv.error) throw inv.error;
  const newPaid = (inv.data.amount_paid_cents ?? 0) + paid_cents;
  const fully = newPaid >= inv.data.total_cents;
  await supabase
    .from("billing_invoices")
    .update({
      amount_paid_cents: newPaid,
      amount_due_cents: Math.max(0, inv.data.total_cents - newPaid),
      status: fully ? "paid" : "open",
      paid_at: fully ? new Date().toISOString() : null,
    })
    .eq("id", invoice_id);
  if (fully) {
    await emit({ type: "invoice.paid", organization_id: inv.data.organization_id, data: { invoice_id } });
  }
}

async function markInvoiceFailed(supabase: SupabaseClient, invoice_id: string): Promise<void> {
  const inv = await sbAny(supabase).from("billing_invoices").select("organization_id").eq("id", invoice_id).single();
  if (inv.error) return;
  await emit({ type: "invoice.payment_failed", organization_id: inv.data.organization_id, data: { invoice_id } });
}

/** Find due retries — called by a scheduled worker. */
export async function findDueRetries(supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from("billing_payment_attempts")
    .select("id, organization_id, invoice_id, provider, amount_cents, currency, retry_count")
    .eq("status", "failed")
    .lt("next_retry_at", new Date().toISOString())
    .lt("retry_count", RETRY_BACKOFF_HOURS.length)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
