/**
 * Subscription Engine — subscription lifecycle transitions.
 *
 * Owns the state machine for subscriptions and keeps our snapshot in sync
 * with the provider. All persistence uses the service-role client (bypasses
 * RLS) — callers must have already authorized the actor.
 *
 * States: trialing -> active -> past_due -> canceled | unpaid | paused
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emit, persistEvent } from "./events";
import { getBillingProvider } from "./providers";
import type { BillingProviderId, SubscriptionSnapshot } from "./providers/types";
import { sbAny } from "@/lib/supabase/untyped";

export interface CreateSubscriptionInput {
  organization_id: string;
  plan_code: string;
  provider: BillingProviderId;
  provider_customer_id: string;
  provider_subscription_id?: string; // if the provider already created it
  seats?: number;
  trial_days?: number;
}

export async function upsertSubscriptionFromSnapshot(
  supabase: SupabaseClient,
  organization_id: string,
  snap: SubscriptionSnapshot,
): Promise<{ id: string; created: boolean }> {
  const plan = await sbAny(supabase).from("plans").select("id").eq("code", snap.plan_code).maybeSingle();
  if (!plan.data) throw new Error(`Unknown plan_code: ${snap.plan_code}`);

  const existing = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("organization_id", organization_id)
    .maybeSingle();

  const patch = {
    organization_id,
    plan_id: plan.data.id,
    status: snap.status,
    provider: snap.provider,
    provider_customer_id: snap.provider_customer_id,
    provider_subscription_id: snap.provider_subscription_id,
    seats: snap.quantity,
    trial_ends_at: snap.trial_ends_at ?? null,
    current_period_start: snap.current_period_start,
    current_period_end: snap.current_period_end,
    cancel_at: snap.cancel_at ?? null,
    canceled_at: snap.canceled_at ?? null,
  };

  if (existing.data) {
    const { error } = await sbAny(supabase).from("subscriptions").update(patch).eq("id", existing.data.id);
    if (error) throw error;
    const evt = existing.data.status !== snap.status
      ? (snap.status === "canceled" ? "subscription.canceled" as const : "subscription.updated" as const)
      : "subscription.updated" as const;
    await emit({ type: evt, organization_id, data: snap });
    await persistEvent(supabase, { type: evt, organization_id, occurred_at: new Date().toISOString(), data: snap }, { subscription_id: existing.data.id, provider: snap.provider });
    return { id: existing.data.id, created: false };
  }
  const inserted = await sbAny(supabase).from("subscriptions").insert(patch).select("id").single();
  if (inserted.error) throw inserted.error;
  await emit({ type: "subscription.created", organization_id, data: snap });
  await persistEvent(supabase, { type: "subscription.created", organization_id, occurred_at: new Date().toISOString(), data: snap }, { subscription_id: inserted.data.id, provider: snap.provider });
  return { id: inserted.data.id, created: true };
}

export async function cancelSubscription(
  supabase: SupabaseClient,
  organization_id: string,
  opts: { at_period_end?: boolean } = {},
): Promise<SubscriptionSnapshot> {
  const sub = await supabase
    .from("subscriptions")
    .select("id, provider, provider_subscription_id")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (!sub.data?.provider || !sub.data.provider_subscription_id) throw new Error("no_active_subscription");
  const provider = getBillingProvider(sub.data.provider as BillingProviderId);
  const snap = await provider.cancelSubscription(sub.data.provider_subscription_id, opts.at_period_end ?? true);
  await upsertSubscriptionFromSnapshot(supabase, organization_id, snap);
  return snap;
}

export async function changePlanSeats(
  supabase: SupabaseClient,
  organization_id: string,
  quantity: number,
): Promise<SubscriptionSnapshot> {
  const sub = await supabase
    .from("subscriptions")
    .select("id, provider, provider_subscription_id")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (!sub.data?.provider || !sub.data.provider_subscription_id) throw new Error("no_active_subscription");
  const provider = getBillingProvider(sub.data.provider as BillingProviderId);
  const snap = await provider.updateSubscriptionQuantity(sub.data.provider_subscription_id, quantity);
  await upsertSubscriptionFromSnapshot(supabase, organization_id, snap);
  return snap;
}

/** Trials expiring within N days — used by the notifications worker. */
export async function findTrialsEnding(supabase: SupabaseClient, days = 3): Promise<Array<{ id: string; organization_id: string; trial_ends_at: string }>> {
  const now = new Date();
  const soon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, organization_id, trial_ends_at")
    .eq("status", "trialing")
    .gt("trial_ends_at", now.toISOString())
    .lt("trial_ends_at", soon);
  if (error) throw error;
  return (data ?? []) as any;
}
