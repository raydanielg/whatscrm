import { sbAny } from "@/lib/supabase/untyped";
/**
 * Super-admin webhook replay (server-only).
 *
 * After fixing a gateway misconfiguration (wrong secret, missing env var,
 * broken handler) the deliveries that failed in the meantime can be re-run
 * from the payload stored in `billing_events` — signatures are NOT re-verified
 * because the original delivery was already authenticated (or, for
 * `misconfigured`/`invalid_signature` rows, no payload was stored at all and
 * the delivery is reported as not replayable).
 *
 * Replays are idempotent: an event whose `billing_events` row is already
 * marked processed is skipped, and every attempt is written back to
 * `payment_gateway_webhook_deliveries` (replay_status / replay_count) plus a
 * new synthetic delivery row linked via `replay_of_id`.
 */

export type ReplayableStatus = "failed" | "misconfigured" | "invalid_signature";

export interface ReplayFilter {
  providerId: string;
  from: string;
  to: string;
  statuses?: ReplayableStatus[];
  limit?: number;
}

export interface ReplayCandidate {
  deliveryId: string;
  eventId: string | null;
  eventType: string | null;
  status: string;
  receivedAt: string;
  errorMessage: string | null;
  replayCount: number;
  lastReplayStatus: string | null;
  replayable: boolean;
  reason: string | null;
}

export interface ReplayOutcome extends ReplayCandidate {
  result: "replayed" | "skipped" | "failed";
  resultMessage: string | null;
}

const DEFAULT_STATUSES: ReplayableStatus[] = ["failed", "misconfigured"];

interface DeliveryRow {
  id: string;
  provider_id: string;
  provider_event_id: string | null;
  event_type: string | null;
  status: string;
  error_message: string | null;
  received_at: string;
  replay_count: number | null;
  replay_status: string | null;
}

interface EventRow {
  id: string;
  provider_event_id: string;
  event_type: string;
  payload: unknown;
  processed_at: string | null;
}

/** Deliveries in the window, newest first, annotated with replayability. */
export async function collectReplayCandidates(
  filter: ReplayFilter,
): Promise<{ candidates: ReplayCandidate[]; events: Map<string, EventRow> }> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const statuses = filter.statuses?.length ? filter.statuses : DEFAULT_STATUSES;

  const { data, error } = await supabaseAdmin
    .from("payment_gateway_webhook_deliveries")
    .select(
      "id, provider_id, provider_event_id, event_type, status, error_message, received_at, replay_count, replay_status",
    )
    .eq("provider_id", filter.providerId)
    .in("status", statuses)
    .gte("received_at", filter.from)
    .lte("received_at", filter.to)
    .order("received_at", { ascending: false })
    .limit(limit)
    .returns<DeliveryRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const eventIds = [...new Set(rows.map((r) => r.provider_event_id).filter(Boolean))] as string[];

  const events = new Map<string, EventRow>();
  if (eventIds.length) {
    const { data: evs, error: evErr } = await supabaseAdmin
      .from("billing_events")
      .select("id, provider_event_id, event_type, payload, processed_at")
      .eq("provider", filter.providerId)
      .in("provider_event_id", eventIds)
      .returns<EventRow[]>();
    if (evErr) throw evErr;
    for (const e of evs ?? []) events.set(e.provider_event_id, e);
  }

  // Keep only the newest delivery per event id — older rows are duplicates of
  // the same failure and must not be replayed twice.
  const seen = new Set<string>();
  const candidates: ReplayCandidate[] = rows.map((r) => {
    const eventId = r.provider_event_id;
    const ev = eventId ? events.get(eventId) : undefined;
    let replayable = true;
    let reason: string | null = null;

    if (!eventId) {
      replayable = false;
      reason = "No event id was captured — nothing to replay.";
    } else if (!ev) {
      replayable = false;
      reason = "Payload was never stored (rejected before parsing).";
    } else if (ev.processed_at) {
      replayable = false;
      reason = "Event was already processed successfully.";
    } else if (seen.has(eventId)) {
      replayable = false;
      reason = "Superseded by a newer delivery of the same event.";
    }
    if (eventId) seen.add(eventId);

    return {
      deliveryId: r.id,
      eventId,
      eventType: r.event_type ?? ev?.event_type ?? null,
      status: r.status,
      receivedAt: r.received_at,
      errorMessage: r.error_message,
      replayCount: r.replay_count ?? 0,
      lastReplayStatus: r.replay_status ?? null,
      replayable,
      reason,
    };
  });

  return { candidates, events };
}

/** Re-run every replayable delivery in the window. */
export async function replayDeliveries(
  filter: ReplayFilter,
  actor: { id: string | null; email: string | null },
  options: { deliveryIds?: string[] } = {},
): Promise<{ outcomes: ReplayOutcome[]; replayed: number; failed: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { routeProviderEvent } = await import("./webhook-router.server");

  const { candidates, events } = await collectReplayCandidates(filter);
  const selected = options.deliveryIds?.length
    ? candidates.filter((c) => options.deliveryIds!.includes(c.deliveryId))
    : candidates;

  const outcomes: ReplayOutcome[] = [];

  for (const candidate of selected) {
    if (!candidate.replayable || !candidate.eventId) {
      outcomes.push({ ...candidate, result: "skipped", resultMessage: candidate.reason });
      continue;
    }

    const ev = events.get(candidate.eventId)!;
    const startedAt = Date.now();
    let ok = true;
    let message: string | null = null;

    try {
      await routeProviderEvent(supabaseAdmin, {
        id: ev.provider_event_id,
        type: ev.event_type,
        data: ev.payload,
        provider: filter.providerId,
      });
      await supabaseAdmin
        .from("billing_events")
        .update({ processed_at: new Date().toISOString(), error: null })
        .eq("id", ev.id);
    } catch (err) {
      ok = false;
      message = String((err as Error)?.message ?? err).slice(0, 1000);
      await sbAny(supabaseAdmin).from("billing_events").update({ error: message }).eq("id", ev.id);
    }

    await supabaseAdmin
      .from("payment_gateway_webhook_deliveries")
      .update({
        replayed_at: new Date().toISOString(),
        replay_count: candidate.replayCount + 1,
        replay_status: ok ? "succeeded" : "failed",
        replay_error: message,
        replayed_by: actor.id,
      })
      .eq("id", candidate.deliveryId);

    // Synthetic delivery row so the health panel reflects the replay.
    await sbAny(supabaseAdmin).from("payment_gateway_webhook_deliveries").insert({
      provider_id: filter.providerId,
      provider_event_id: candidate.eventId,
      event_type: candidate.eventType,
      status: ok ? "processed" : "failed",
      http_status: ok ? 200 : 400,
      latency_ms: Date.now() - startedAt,
      signature_verified: true,
      error_message: message,
      replay_of_id: candidate.deliveryId,
      replayed_by: actor.id,
      replayed_at: new Date().toISOString(),
      replay_status: ok ? "succeeded" : "failed",
      metadata: { replay: true, replayed_by_email: actor.email },
    } as never);

    outcomes.push({
      ...candidate,
      result: ok ? "replayed" : "failed",
      resultMessage: message,
    });
  }

  const replayed = outcomes.filter((o) => o.result === "replayed").length;
  const failed = outcomes.filter((o) => o.result === "failed").length;
  const skipped = outcomes.filter((o) => o.result === "skipped").length;

  try {
    const { recordGatewayAudit } = await import("./gateway-audit.server");
    await recordGatewayAudit({
      action: "gateway.webhooks_replayed",
      providerId: filter.providerId,
      actorId: actor.id,
      actorEmail: actor.email,
      summary: `Replayed ${replayed} webhook deliveries (${failed} failed, ${skipped} skipped)`,
      changes: {
        from: filter.from,
        to: filter.to,
        statuses: (filter.statuses ?? DEFAULT_STATUSES).join(","),
        attempted: selected.length,
      },
    });
  } catch (error) {
    console.error("[gateway-webhook-replay] audit failed", error);
  }

  return { outcomes, replayed, failed, skipped };
}
