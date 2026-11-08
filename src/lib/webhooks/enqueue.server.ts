/**
 * enqueueWebhookEvent — fan out an event to every matching active endpoint
 * in an organization. Idempotent via (endpoint_id, event_id) unique index.
 * Call from anywhere on the server after a business event happens.
 */
export async function enqueueWebhookEvent(
  admin: any,
  args: { organizationId: string; eventType: string; eventId: string; payload: unknown },
): Promise<{ enqueued: number }> {
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, events, max_retries")
    .eq("organization_id", args.organizationId)
    .eq("status", "active");
  if (!endpoints?.length) return { enqueued: 0 };

  const rows = endpoints
    .filter((e: any) =>
      (e.events as string[]).includes("*") ||
      (e.events as string[]).includes(args.eventType),
    )
    .map((e: any) => ({
      endpoint_id: e.id,
      organization_id: args.organizationId,
      event_type: args.eventType,
      event_id: args.eventId,
      payload: args.payload,
      max_attempts: e.max_retries,
    }));
  if (!rows.length) return { enqueued: 0 };

  // ignoreDuplicates is not supported by supabase-js .insert; upsert on the
  // unique index (endpoint_id, event_id) with ignoreDuplicates handles replays.
  const { error } = await admin
    .from("webhook_deliveries")
    .upsert(rows, { onConflict: "endpoint_id,event_id", ignoreDuplicates: true });
  if (error) throw error;
  return { enqueued: rows.length };
}
