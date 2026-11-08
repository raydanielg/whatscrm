/**
 * Bulk contact re-match jobs.
 *
 * Reprocesses historical conversations against the workspace's current
 * contact matching rules and re-links each conversation to the correct
 * CRM contact when the rules resolve to a different one.
 *
 * The job is executed inline on the server: it loads a bounded batch of
 * conversations (capped by `max_conversations`), runs `findContactByPhone`
 * for each, and updates `conversations.contact_id` when a better match is
 * found. Progress and counters are written back to `contact_rematch_jobs`
 * so the UI can display run history.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findContactByPhone, loadMatchingRules } from "./phone-matching";
import { sbAny } from "@/lib/supabase/untyped";

const WHATSAPP_PROVIDERS = ["whatsapp_cloud", "twilio", "dialog360", "custom"] as const;

const StartInput = z.object({
  workspaceId: z.string().uuid(),
  scope: z.enum(["whatsapp", "all"]).default("whatsapp"),
  unlinkedOnly: z.boolean().default(false),
  since: z.string().datetime().nullable().optional(),
  maxConversations: z.number().int().min(1).max(20000).default(1000),
});

export type ContactRematchJob = {
  id: string;
  workspace_id: string;
  status: "queued" | "running" | "completed" | "failed";
  scope: "whatsapp" | "all";
  unlinked_only: boolean;
  since: string | null;
  max_conversations: number;
  total_scanned: number;
  total_matched: number;
  total_relinked: number;
  total_unchanged: number;
  total_skipped: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listContactRematchJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contact_rematch_jobs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (rows ?? []) as ContactRematchJob[];
  });

export const startContactRematchJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => StartInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: inserted, error: insertErr } = await sb
      .from("contact_rematch_jobs")
      .insert({
        workspace_id: data.workspaceId,
        created_by: context.userId,
        status: "running",
        scope: data.scope,
        unlinked_only: data.unlinkedOnly,
        since: data.since ?? null,
        max_conversations: data.maxConversations,
        started_at: new Date().toISOString(),
      } as never)
      .select("*")
      .single();
    if (insertErr) throw insertErr;
    const job = inserted as ContactRematchJob;

    try {
      const result = await runRematch(sb, data.workspaceId, {
        scope: data.scope,
        unlinkedOnly: data.unlinkedOnly,
        since: data.since ?? null,
        maxConversations: data.maxConversations,
      });

      const { data: finished, error: updErr } = await sb
        .from("contact_rematch_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          ...result,
        } as never)
        .eq("id", job.id)
        .select("*")
        .single();
      if (updErr) throw updErr;
      return finished as ContactRematchJob;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Re-match failed";
      const { data: failed } = await sb
        .from("contact_rematch_jobs")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", job.id)
        .select("*")
        .single();
      return (failed ?? { ...job, status: "failed", error: message }) as ContactRematchJob;
    }
  });

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

interface RematchOptions {
  scope: "whatsapp" | "all";
  unlinkedOnly: boolean;
  since: string | null;
  maxConversations: number;
}

interface RematchTotals {
  total_scanned: number;
  total_matched: number;
  total_relinked: number;
  total_unchanged: number;
  total_skipped: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runRematch(sb: any, workspaceId: string, opts: RematchOptions): Promise<RematchTotals> {
  const rules = await loadMatchingRules(sb, workspaceId);

  // Restrict to WhatsApp channel accounts when scope=whatsapp.
  let channelAccountIds: string[] | null = null;
  if (opts.scope === "whatsapp") {
    const { data: accts, error } = await sb
      .from("channel_accounts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("provider", WHATSAPP_PROVIDERS as unknown as string[]);
    if (error) throw error;
    channelAccountIds = ((accts ?? []) as { id: string }[]).map((a) => a.id);
    if (channelAccountIds.length === 0) {
      return {
        total_scanned: 0,
        total_matched: 0,
        total_relinked: 0,
        total_unchanged: 0,
        total_skipped: 0,
      };
    }
  }

  const totals: RematchTotals = {
    total_scanned: 0,
    total_matched: 0,
    total_relinked: 0,
    total_unchanged: 0,
    total_skipped: 0,
  };

  const pageSize = 200;
  let offset = 0;
  const remainingCap = () => opts.maxConversations - totals.total_scanned;

  while (remainingCap() > 0) {
    const take = Math.min(pageSize, remainingCap());
    let q = sb
      .from("conversations")
      .select("id, contact_id, channel_account_id, created_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + take - 1);

    if (channelAccountIds) q = q.in("channel_account_id", channelAccountIds);
    if (opts.unlinkedOnly) q = q.is("contact_id", null);
    if (opts.since) q = q.gte("created_at", opts.since);

    const { data: convs, error } = await q;
    if (error) throw error;
    const rows = (convs ?? []) as {
      id: string;
      contact_id: string | null;
      channel_account_id: string | null;
    }[];
    if (rows.length === 0) break;

    for (const conv of rows) {
      totals.total_scanned += 1;

      // Resolve the identifier this conversation was matched on: prefer the
      // linked contact's phone/whatsapp; otherwise fall back to the most
      // recent inbound message's `from` field.
      let identifier: string | null = null;
      if (conv.contact_id) {
        const { data: c } = await sb
          .from("contacts")
          .select("phone, whatsapp")
          .eq("id", conv.contact_id)
          .maybeSingle();
        const contact = (c as { phone: string | null; whatsapp: string | null } | null) ?? null;
        identifier = contact?.whatsapp ?? contact?.phone ?? null;
      }
      if (!identifier) {
        const { data: msg } = await sb
          .from("messages")
          .select("sender_identifier, external_from")
          .eq("conversation_id", conv.id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const m = (msg as { sender_identifier?: string | null; external_from?: string | null } | null) ?? null;
        identifier = m?.sender_identifier ?? m?.external_from ?? null;
      }

      if (!identifier) {
        totals.total_skipped += 1;
        continue;
      }

      const match = await findContactByPhone(sb, workspaceId, identifier, rules);
      if (!match) {
        totals.total_skipped += 1;
        continue;
      }
      totals.total_matched += 1;

      if (match.id === conv.contact_id) {
        totals.total_unchanged += 1;
        continue;
      }

      const previous = conv.contact_id;
      const { error: updErr } = await sb
        .from("conversations")
        .update({ contact_id: match.id, updated_at: new Date().toISOString() })
        .eq("id", conv.id)
        .eq("workspace_id", workspaceId);
      if (updErr) {
        totals.total_skipped += 1;
        continue;
      }
      totals.total_relinked += 1;

      // Best-effort audit trail.
      try {
        await sbAny(sb).from("conversation_activity").insert({
          conversation_id: conv.id,
          workspace_id: workspaceId,
          activity_type: "contact_relinked",
          metadata: {
            source: "bulk_rematch",
            previous_contact_id: previous,
            new_contact_id: match.id,
            identifier,
          },
        } as never);
      } catch {
        /* optional table */
      }
    }

    offset += rows.length;
    if (rows.length < take) break;
  }

  return totals;
}
