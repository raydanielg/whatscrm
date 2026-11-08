import { sbAny } from "@/lib/supabase/untyped";
/**
 * Billing Event Bus (in-process, typed).
 *
 * Every engine emits typed events; other engines/subscribers react. Keeps the
 * system event-driven and modular. In-process by default; can be swapped with
 * a durable queue later without changing callers.
 *
 * Persistence: every emit is also written to `billing_events` via the helper
 * `persistEvent()` when a Supabase client is provided, giving us an audit log.
 */

export type BillingEventType =
  | "customer.created"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.trial_ending"
  | "subscription.renewed"
  | "subscription.expired"
  | "subscription.suspended"
  | "subscription.reactivated"
  | "subscription.grace_started"
  | "invoice.drafted"
  | "invoice.issued"
  | "invoice.due"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.voided"
  | "invoice.refunded"
  | "payment.attempt.created"
  | "payment.attempt.succeeded"
  | "payment.attempt.failed"
  | "usage.recorded"
  | "usage.limit_reached"
  | "quota.approaching"
  | "quota.exceeded"
  | "upgrade.recommended"
  | "coupon.applied";


export interface BillingEvent<T = unknown> {
  type: BillingEventType;
  organization_id: string;
  occurred_at: string;
  data: T;
}

type Handler = (evt: BillingEvent) => void | Promise<void>;

const handlers = new Map<BillingEventType, Set<Handler>>();

export function on(type: BillingEventType, handler: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)!.delete(handler);
}

export async function emit<T>(evt: Omit<BillingEvent<T>, "occurred_at"> & { occurred_at?: string }): Promise<void> {
  const enriched: BillingEvent<T> = {
    ...evt,
    occurred_at: evt.occurred_at ?? new Date().toISOString(),
  };
  const subs = handlers.get(evt.type);
  if (!subs) return;
  await Promise.all([...subs].map((h) => Promise.resolve(h(enriched as BillingEvent)).catch((err) => {
    console.error(`[billing.events] handler failed for ${evt.type}:`, err);
  })));
}

/** Persist an event to `billing_events` for audit. Caller supplies a service-role client. */
export async function persistEvent(
  supabase: { from: (t: string) => any },
  evt: BillingEvent,
  extra: { subscription_id?: string | null; provider?: string | null } = {},
): Promise<void> {
  await sbAny(supabase).from("billing_events").insert({
    organization_id: evt.organization_id,
    subscription_id: extra.subscription_id ?? null,
    provider: extra.provider ?? "internal",
    event_type: evt.type,
    payload: (evt.data ?? {}) as Record<string, unknown>,
  });
}
