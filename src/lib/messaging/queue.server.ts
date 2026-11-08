/**
 * Outbox worker — drains `message_outbox` in batches.
 *
 * Design:
 *  - producers insert rows (status=queued, next_attempt_at=now())
 *  - `outbox_claim_batch(worker, N)` atomically flips rows to `processing`
 *    with FOR UPDATE SKIP LOCKED so many workers can run concurrently
 *  - success: mark `sent`, save `external_message_id`
 *  - retryable failure: exponential backoff up to `max_attempts` then `dead_letter`
 *  - non-retryable: `failed`
 *
 * Invoked by the public cron endpoint (see api/public/hooks/process-outbox.ts).
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { loadChannelAccount, loadCredentials, getProvider } from "./registry.server";
import type { OutboundPayload, ProviderName } from "./types";
import { ProviderError, computeBackoffMs } from "./errors";
import { log, makeCorrelationId } from "./logger.server";
import { sbAny } from "@/lib/supabase/untyped";

interface OutboxRow {
  id: string;
  workspace_id: string;
  channel_account_id: string;
  conversation_id: string | null;
  message_id: string | null;
  provider: ProviderName;
  to_address: string;
  payload: OutboundPayload;
  attempts: number;
  max_attempts: number;
}

export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  dead: number;
}

export async function drainOutbox(worker: string, batch = 25): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, retried: 0, dead: 0 };
  const { data, error } = await sbAny(supabaseAdmin).rpc("outbox_claim_batch" as never, {
    _worker: worker,
    _limit: batch,
  } as never);
  if (error) throw new Error(`outbox_claim_batch failed: ${error.message}`);
  const rows = (data ?? []) as unknown as OutboxRow[];
  result.claimed = rows.length;

  for (const row of rows) {
    const correlationId = makeCorrelationId();
    try {
      const account = await loadChannelAccount(row.channel_account_id);
      const creds = loadCredentials(account);
      const impl = getProvider(row.provider);
      const sendResult = await impl.send(row.payload, {
        account,
        credentials: creds,
        correlationId,
        log: (level, scope, message, extra) => log({
          workspaceId: row.workspace_id, channelAccountId: row.channel_account_id,
          provider: row.provider, level, scope, message, data: extra, correlationId,
        }),
      });

      await supabaseAdmin
        .from("message_outbox" as never)
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          external_message_id: sendResult.externalMessageId,
          last_error: null,
          last_error_code: null,
        } as never)
        .eq("id", row.id);

      if (row.message_id) {
        await supabaseAdmin
          .from("messages" as never)
          .update({
            status: "sent",
            external_message_id: sendResult.externalMessageId,
            provider: row.provider,
          } as never)
          .eq("id", row.message_id);
      }
      result.sent++;
    } catch (err) {
      const pErr = err instanceof ProviderError ? err : new ProviderError("unknown", String(err));
      const dead = row.attempts >= row.max_attempts || !pErr.retryable;
      if (dead) {
        await supabaseAdmin
          .from("message_outbox" as never)
          .update({
            status: pErr.retryable ? "dead_letter" : "failed",
            failed_at: new Date().toISOString(),
            last_error: pErr.message,
            last_error_code: pErr.code ?? pErr.kind,
          } as never)
          .eq("id", row.id);
        if (row.message_id) {
          await supabaseAdmin
            .from("messages" as never)
            .update({ status: "failed" } as never)
            .eq("id", row.message_id);
        }
        result[pErr.retryable ? "dead" : "failed"]++;
      } else {
        const delay = computeBackoffMs(row.attempts, pErr.retryAfterMs);
        await supabaseAdmin
          .from("message_outbox" as never)
          .update({
            status: "queued",
            next_attempt_at: new Date(Date.now() + delay).toISOString(),
            locked_at: null,
            locked_by: null,
            last_error: pErr.message,
            last_error_code: pErr.code ?? pErr.kind,
          } as never)
          .eq("id", row.id);
        result.retried++;
      }
      await log({
        workspaceId: row.workspace_id, channelAccountId: row.channel_account_id,
        provider: row.provider, level: dead ? "error" : "warn",
        scope: "send", message: pErr.message,
        data: { kind: pErr.kind, code: pErr.code, attempts: row.attempts },
        correlationId,
      });
    }
  }
  return result;
}
