// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export const OUTBOUND_CLAIM_KEY = "inbox_delivery_started_at";
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export interface ClaimableMessage {
  id: string;
  status: string;
  direction: string;
  is_internal: boolean;
  deleted_at: string | null;
  provider_message_id: string | null;
  metadata: unknown;
  updated_at: string;
}

export function deliveryMetadata(metadata: unknown): Record<string, unknown> {
  const copy = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) } : {};
  delete copy[OUTBOUND_CLAIM_KEY];
  return copy;
}

/** Atomically reserve a queued row without introducing a new message status.
 * A stale reservation is uncertain: the provider may have accepted the send
 * before the process stopped. Fail it for manual review instead of auto-sending
 * it again. A normal provider failure clears the reservation and can be retried.
 */
export async function claimOutboundMessage(admin: Admin, message: ClaimableMessage) {
  if (message.status !== "queued" || message.direction !== "outbound" ||
    message.is_internal || message.deleted_at || message.provider_message_id) return "skipped" as const;

  const metadata = deliveryMetadata(message.metadata);
  const started = (message.metadata as Record<string, unknown> | null)?.[OUTBOUND_CLAIM_KEY];
  if (started) {
    const age = Date.now() - new Date(String(started)).getTime();
    if (Number.isFinite(age) && age < CLAIM_TIMEOUT_MS) return "skipped" as const;
    return "uncertain" as const;
  }

  const { data, error } = await admin.from("messages")
    .update({ metadata: { ...metadata, [OUTBOUND_CLAIM_KEY]: new Date().toISOString() } })
    .eq("id", message.id)
    .eq("status", "queued")
    .eq("updated_at", message.updated_at)
    .is("metadata->>inbox_delivery_started_at", null)
    .is("deleted_at", null)
    .is("provider_message_id", null)
    .eq("is_internal", false)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? "claimed" as const : "skipped" as const;
}
