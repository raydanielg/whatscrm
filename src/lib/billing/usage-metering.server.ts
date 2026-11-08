/**
 * Usage Metering — record + roll up usage events.
 *
 * `record()` is idempotent via `idempotency_key`. Rollups aggregate raw
 * events into per-org / per-meter totals for a period, used by the invoice
 * engine and quota manager.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emit } from "./events";
import { sbAny } from "@/lib/supabase/untyped";

export interface RecordUsageInput {
  organization_id: string;
  meter_code: string;
  quantity?: number;
  occurred_at?: string;
  idempotency_key?: string;
  subscription_id?: string;
  metadata?: Record<string, unknown>;
}

export async function recordUsage(supabase: SupabaseClient, input: RecordUsageInput): Promise<void> {
  const { error } = await sbAny(supabase).from("usage_events").insert({
    organization_id: input.organization_id,
    meter_code: input.meter_code,
    quantity: input.quantity ?? 1,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    idempotency_key: input.idempotency_key ?? null,
    subscription_id: input.subscription_id ?? null,
    metadata: input.metadata ?? {},
  });
  if (error && !error.message.includes("duplicate key")) throw error;
  await emit({ type: "usage.recorded", organization_id: input.organization_id, data: { meter_code: input.meter_code, quantity: input.quantity ?? 1 } });
}

export interface MeterRollup {
  meter_code: string;
  total: number;
}

export async function rollupUsage(
  supabase: SupabaseClient,
  organization_id: string,
  period_start: string,
  period_end: string,
): Promise<MeterRollup[]> {
  const { data, error } = await supabase
    .from("usage_events")
    .select("meter_code, quantity")
    .eq("organization_id", organization_id)
    .gte("occurred_at", period_start)
    .lt("occurred_at", period_end);
  if (error) throw error;
  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    totals.set(row.meter_code, (totals.get(row.meter_code) ?? 0) + Number(row.quantity ?? 0));
  }
  return [...totals].map(([meter_code, total]) => ({ meter_code, total }));
}
