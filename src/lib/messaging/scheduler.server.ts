/**
 * Scheduled-message processor.
 *
 * Reads `scheduled_messages` rows whose `scheduled_for <= now()` and status =
 * 'pending', materializes them into a `messages` row + `message_outbox` row
 * per the conversation's channel account, then marks the schedule row 'sent'
 * (or 'failed' on unrecoverable errors). Called by the public cron endpoint.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { log } from "./logger.server";
import type { OutboundPayload, ProviderName } from "./types";

interface SchedRow {
  id: string;
  workspace_id: string;
  conversation_id: string;
  created_by: string | null;
  body: string;
  message_type: string;
  attachments: unknown;
  metadata: Record<string, unknown> | null;
}

export interface ProcessResult {
  claimed: number;
  sent: number;
  failed: number;
}

export async function processDueScheduled(batch = 50): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, sent: 0, failed: 0 };

  // Atomically claim rows by flipping to 'processing' to prevent double-dispatch.
  const nowIso = new Date().toISOString();
  // First, claim up to `batch` pending rows atomically.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("scheduled_messages" as never)
    .update({ status: "processing" } as never)
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .select(
      "id, workspace_id, conversation_id, created_by, body, message_type, attachments, metadata",
    )
    .limit(batch);
  if (claimErr) throw new Error(`scheduled_messages claim failed: ${claimErr.message}`);
  const rows = (claimed ?? []) as unknown as SchedRow[];
  result.claimed = rows.length;

  for (const row of rows) {
    try {
      // Look up conversation → contact phone + channel account
      const { data: conv } = await supabaseAdmin
        .from("conversations" as never)
        .select("id, workspace_id, contact_id, inbox_id, external_id")
        .eq("id", row.conversation_id)
        .maybeSingle();
      const c = conv as {
        id: string;
        workspace_id: string;
        contact_id: string | null;
        external_id: string | null;
      } | null;
      if (!c) throw new Error("Conversation not found");

      const { data: contact } = await supabaseAdmin
        .from("contacts" as never)
        .select("phone")
        .eq("id", c.contact_id ?? "")
        .maybeSingle();
      const to = (contact as { phone: string | null } | null)?.phone ?? c.external_id;
      if (!to) throw new Error("Recipient phone unknown");

      // Pick the workspace's default WhatsApp channel account.
      const { data: acc } = await supabaseAdmin
        .from("channel_accounts" as never)
        .select("id, provider, status, is_default")
        .eq("workspace_id", row.workspace_id)
        .eq("provider", "whatsapp_cloud")
        .eq("status", "connected")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      const a = acc as { id: string; provider: ProviderName } | null;
      if (!a) throw new Error("No connected WhatsApp channel");

      // Build outbound payload — text or attachment.
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const override = meta.payload as OutboundPayload | undefined;
      const payload: OutboundPayload = override ?? {
        to,
        type: "text",
        text: { body: row.body, preview_url: false },
      };

      // Persist an outgoing message row for UI + link outbox → message.
      const { data: msg, error: mErr } = await supabaseAdmin
        .from("messages" as never)
        .insert({
          workspace_id: row.workspace_id,
          conversation_id: row.conversation_id,
          direction: "outbound",
          message_type: row.message_type,
          body: row.body,
          status: "queued",
          author_id: row.created_by,
          provider: a.provider,
        } as never)
        .select("id")
        .single();
      if (mErr) throw new Error(mErr.message);
      const messageId = (msg as { id: string }).id;

      const { error: oErr } = await supabaseAdmin.from("message_outbox" as never).insert({
        workspace_id: row.workspace_id,
        channel_account_id: a.id,
        conversation_id: row.conversation_id,
        message_id: messageId,
        provider: a.provider,
        to_address: to,
        payload,
        status: "queued",
        idempotency_key: `sched:${row.id}`,
      } as never);
      if (oErr) throw new Error(oErr.message);

      await supabaseAdmin
        .from("scheduled_messages" as never)
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_message_id: messageId,
        } as never)
        .eq("id", row.id);

      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("scheduled_messages" as never)
        .update({ status: "failed", error: message } as never)
        .eq("id", row.id);
      await log({
        workspaceId: row.workspace_id,
        provider: "whatsapp_cloud",
        level: "error",
        scope: "scheduler",
        message,
        data: { scheduled_message_id: row.id },
      });
      result.failed++;
    }
  }

  return result;
}
