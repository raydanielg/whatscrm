/**
 * Inbox thread deduplication.
 *
 * Every inbound channel (Telegram, Messenger, Instagram, SMS, webchat, ) can
 * receive the SAME logical thread more than once: Meta retries webhooks,
 * Telegram redelivers updates when a 200 is slow, providers fan out events to
 * more than one worker, and a re-sync replays history. The old per-channel
 * "select  then insert" pattern is not atomic — two concurrent deliveries both
 * see "no conversation" and both insert, producing two Inbox threads for one
 * customer, with divergent metadata.
 *
 * This module is the single place that resolves a thread:
 *
 *  - the thread key is always `(workspace_id, channel, external_conversation_id)`,
 *    which is backed by a unique index in the database, so a duplicate insert
 *    fails loudly (23505) instead of silently creating a second thread;
 *  - on that conflict we re-read the winning row and update it, so the losing
 *    racer converges onto the same conversation id;
 *  - `metadata.account_id` is always (re)asserted from the owning provider-row
 *    id, and existing metadata is merged rather than overwritten, so threads
 *    created before an account was linked — or by a different code path — heal
 *    into a consistent value the Inbox selector and unread badges can filter on.
 *
 * `conversations.channel_account_id` is NOT used for non-WhatsApp channels: it
 * has an FK to `channel_accounts`, which only holds WhatsApp rows.
 */
import { sbAny } from "@/lib/supabase/untyped";

/** Structural shape of the service-role client, so every caller's local alias fits. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export interface EnsureThreadInput {
  workspaceId: string;
  /** Inbox channel, e.g. "telegram" | "messenger" | "instagram" | "sms" | "webchat". */
  channel: string;
  /** Stable, provider-scoped thread key, e.g. `tg:<bot_id>:<chat_id>`. */
  externalConversationId: string;
  /** Provider-table row id mirrored into `metadata.account_id`. */
  accountId: string;
  contactId?: string | null;
  /** Direction of the event being applied. Inbound bumps the unread count. */
  inbound: boolean;
  preview?: string | null;
  /** Extra metadata merged into the thread (never clobbers an existing thread wholesale). */
  metadata?: Record<string, unknown>;
  /** Reopen a resolved/closed thread on new activity. Defaults to true. */
  reopen?: boolean;
}

export interface EnsureThreadResult {
  conversationId: string;
  created: boolean;
}

interface ExistingRow {
  id: string;
  unread_count: number | null;
  metadata: Record<string, unknown> | null;
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string | null; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === UNIQUE_VIOLATION) return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("conversations_external_thread_key");
}

async function findThread(
  admin: Admin,
  input: EnsureThreadInput,
): Promise<ExistingRow | null> {
  const { data } = await admin
    .from("conversations")
    .select("id, unread_count, metadata")
    .eq("workspace_id", input.workspaceId)
    .eq("channel", input.channel)
    .eq("external_conversation_id", input.externalConversationId)
    .maybeSingle();
  return (data as ExistingRow | null) ?? null;
}

/**
 * Resolve (and refresh) the single Inbox thread for an external conversation.
 *
 * Safe under concurrent webhook deliveries: at most one row can ever exist per
 * thread key, and every caller ends up with the same conversation id.
 */
export async function ensureInboxThread(
  admin: Admin,
  input: EnsureThreadInput,
): Promise<EnsureThreadResult> {
  const nowIso = new Date().toISOString();
  const preview = (input.preview ?? "").slice(0, 240);
  const reopen = input.reopen !== false;

  const activity = {
    last_message_at: nowIso,
    last_message_preview: preview,
    last_message_from: input.inbound ? "customer" : "agent",
    updated_at: nowIso,
    ...(reopen ? { status: "open" } : {}),
  };

  const applyExisting = async (existing: ExistingRow): Promise<EnsureThreadResult> => {
    const mergedMetadata = {
      ...(existing.metadata ?? {}),
      ...(input.metadata ?? {}),
      // Always re-assert the owning account so older/divergent threads heal.
      account_id: input.accountId,
    };
    // `unread_count` is owned by the `tg_message_after_insert` trigger, which
    // bumps it for every inbound `messages` row. Incrementing here as well
    // double-counted every inbound event (1 message => unread 2).
    const patch: Record<string, unknown> = {
      ...activity,
      metadata: mergedMetadata,
    };
    if (input.contactId) patch.contact_id = input.contactId;

    const { error } = await sbAny(admin).from("conversations").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { conversationId: existing.id, created: false };
  };

  const existing = await findThread(admin, input);
  if (existing) return applyExisting(existing);

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      workspace_id: input.workspaceId,
      channel: input.channel,
      external_conversation_id: input.externalConversationId,
      contact_id: input.contactId ?? null,
      unread_count: 0, // bumped by the message-insert trigger
      status: "open",
      metadata: { ...(input.metadata ?? {}), account_id: input.accountId },
      ...activity,
    })
    .select("id")
    .maybeSingle();

  if (!error && created) {
    return { conversationId: (created as { id: string }).id, created: true };
  }

  // Lost the race against a concurrent delivery — converge on the winner.
  if (isUniqueViolation(error)) {
    const winner = await findThread(admin, input);
    if (winner) return applyExisting(winner);
  }

  throw new Error(error?.message ?? "Failed to create inbox conversation");
}
