import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { partitionRecipients, normalizeWhatsAppNumber } from "./recipient-eligibility";
import { assertCampaignReady } from "./readiness.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * Marketing server functions — queue-based fanout.
 *
 * The dispatcher worker (`/api/public/hooks/campaign-dispatch`) drains the
 * `campaign_dispatch_queue` table with row-level locking. Enqueue simply
 * materializes recipients + queue rows; the worker handles rate limiting,
 * retries, and provider I/O.
 */

const enqueueSchema = z.object({
  campaignId: z.string().uuid(),
  runAt: z.string().datetime().optional(),
});

export const enqueueCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => enqueueSchema.parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const userId = context.userId;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "completed") {
      throw new Error("Cannot enqueue a completed campaign — duplicate it to send again");
    }
    if (campaign.status === "archived" || campaign.status === "cancelled") {
      throw new Error(`Cannot enqueue a ${campaign.status} campaign`);
    }
    if (["pending", "rejected"].includes(campaign.approval_status)) throw new Error("Campaign approval is required before sending.");
    // Running / scheduled campaigns may be re-enqueued to append newly
    // eligible recipients or reschedule pending queue rows. We dedupe
    // against existing campaign_recipients below so the same contact is
    // never queued twice.
    const isAppend = campaign.status === "running" || campaign.status === "scheduled";

    // One canonical gate, shared with the wizard's Review step. Channel,
    // template approval, template language, the sender derived from the
    // template, required variables, media headers and the schedule are all
    // decided by `evaluateCampaignReadiness` — never by the caller. The
    // audience count is not known yet, so it is re-checked below once the
    // eligible recipients have been partitioned.
    await assertCampaignReady(supabase, campaign, { runAt: data.runAt ?? null });

    const wsId: string = campaign.workspace_id;
    let contactIds: string[] = [];

    if (campaign.contact_list_id) {
      const { data: list, error: listError } = await supabase.from("contact_lists").select("id")
        .eq("id", campaign.contact_list_id).eq("workspace_id", wsId).maybeSingle();
      if (listError) throw listError;
      if (!list) throw new Error("Contact list not found in this workspace.");
      const { data: members, error } = await supabase.from("contact_list_members").select("contact_id").eq("list_id", list.id);
      if (error) throw error;
      contactIds = (members ?? []).map((r: Any) => r.contact_id);
    } else if (campaign.segment_id) {
      const { data: rows, error } = await supabase
        .from("segment_members")
        .select("contact_id")
        .eq("segment_id", campaign.segment_id);
      if (error) throw error;
      contactIds = (rows ?? []).map((r: Any) => r.contact_id).filter(Boolean);
    } else {
      const { data: rows, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", wsId)
        .limit(50000);
      if (error) throw error;
      contactIds = (rows ?? []).map((r: Any) => r.id);
    }
    if (contactIds.length === 0) return { ok: true, enqueued: 0, skipped: 0 };

    const { data: consentRows, error: consentError } = await supabase
      .from("consent_records")
      .select("contact_id,status")
      .eq("workspace_id", wsId)
      .in("contact_id", contactIds);
    if (consentError) throw consentError;
    const optedOut = new Set(
      (consentRows ?? [])
        .filter((r: Any) => r.status === "opted_out" || r.status === "unsubscribed")
        .map((r: Any) => r.contact_id as string),
    );
    let targetIds = campaign.respect_opt_out
      ? contactIds.filter((id) => !optedOut.has(id))
      : contactIds;

    // Skip contacts already enqueued for this campaign. This runs on every
    // enqueue, not only appends: a launch that failed part-way leaves the
    // campaign in draft with recipient rows already written, and a retry would
    // otherwise hit campaign_recipients_campaign_id_contact_id_key.
    if (targetIds.length > 0) {
      const { data: existing } = await supabase
        .from("campaign_recipients")
        .select("contact_id")
        .eq("campaign_id", campaign.id)
        .in("contact_id", targetIds);
      const seen = new Set(((existing ?? []) as Any[]).map((r) => r.contact_id as string));
      targetIds = targetIds.filter((id) => !seen.has(id));
    }
    if (targetIds.length === 0) return { ok: true, enqueued: 0, skipped: 0 };

    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, phone, whatsapp, first_name, last_name")
      .eq("workspace_id", wsId)
      .in("id", targetIds);
    if (contactsErr) throw contactsErr;
    const contactList: Array<{ id: string; phone: string | null; whatsapp: string | null }> =
      (contacts ?? []) as Any;

    const { data: variants } = await supabase
      .from("campaign_ab_variants")
      .select("*")
      .eq("campaign_id", campaign.id);

    const runAtIso = data.runAt ?? campaign.scheduled_at ?? new Date().toISOString();

    // Split the audience before anything is queued. A contact with no usable
    // WhatsApp number used to be enqueued anyway and counted in
    // `total_recipients`, then failed one at a time during the run — so the
    // campaign advertised reach it never had. Those contacts are now recorded
    // as skipped, with a reason, and never enter the dispatch queue.
    const { eligible, ineligible } = partitionRecipients(contactList);
    const eligiblePhone = new Map(eligible.map((r) => [r.id, r.phone]));

    if (ineligible.length > 0) {
      const skipped = ineligible.map((r) => ({
        campaign_id: campaign.id,
        contact_id: r.id,
        status: "skipped",
        error_code: r.reason,
        error_message: r.detail,
      }));
      for (let i = 0; i < skipped.length; i += 500) {
        // Non-fatal: the sendable part of the campaign must still go out even
        // if recording the skips fails.
        await supabase.from("campaign_recipients").insert(skipped.slice(i, i + 500) as Any);
      }
    }

    const sendable = contactList.filter((c) => eligiblePhone.has(c.id));
    if (sendable.length === 0) {
      return { ok: true, enqueued: 0, skipped: ineligible.length };
    }

    // Second readiness pass, now that the audience has resolved to a real
    // number. A campaign whose whole audience is unreachable must not reach
    // `scheduled` or `running`: it would sit there with nothing to dispatch.
    // Appends are exempt — the campaign is already live and this batch only
    // adds to it.
    if (!isAppend) {
      await assertCampaignReady(supabase, campaign, {
        runAt: runAtIso,
        eligibleRecipients: sendable.length,
      });
    }

    const CHUNK = 500;
    let enqueued = 0;
    for (let i = 0; i < sendable.length; i += CHUNK) {
      const slice = sendable.slice(i, i + CHUNK);
      const recipientRows = slice.map((c) => ({
        campaign_id: campaign.id,
        contact_id: c.id,
        status: "queued",
      }));
      const { data: insertedRecipients, error: rErr } = await supabase
        .from("campaign_recipients")
        .insert(recipientRows as Any)
        .select("id, contact_id");
      if (rErr) throw rErr;

      // Normalised at partition time, so the queue carries exactly what the
      // provider accepts rather than whatever formatting the CRM stored.
      const phoneById = eligiblePhone;

      const queueRows = ((insertedRecipients ?? []) as Any[]).map((r) => {
        const variant = pickVariant((variants ?? []) as Any[]);
        return {
          workspace_id: wsId,
          campaign_id: campaign.id,
          recipient_id: r.id,
          variant_id: variant?.id ?? null,
          contact_id: r.contact_id,
          phone_number: phoneById.get(r.contact_id) ?? null,
          message_body: variant?.message_body ?? campaign.message_body,
          media_url: variant?.media_url ?? campaign.media_url,
          template_id: variant?.template_id ?? campaign.template_id,
          template_variables: variant?.template_variables ?? campaign.template_variables ?? {},
          priority: 5,
          run_at: runAtIso,
          status: "pending",
        };
      });
      if (queueRows.length > 0) {
        const { error: qErr } = await supabase
          .from("campaign_dispatch_queue")
          .insert(queueRows as Any);
        if (qErr) throw qErr;
        enqueued += queueRows.length;
      }
    }

    const nextStatus = new Date(runAtIso).getTime() > Date.now() ? "scheduled" : "running";

    // `total_recipients` is denormalized. It used to be derived arithmetically
    // (`previous + enqueued` when appending), so any drift became permanent:
    // an audience trimmed after launch, recipients removed, or a re-launch of
    // the same contacts all left the counter too high for good. That is the
    // "campaign says 6 recipients, the audience has 2" report.
    //
    // Count the authoritative campaign_recipients rows instead, so the number
    // re-syncs on every enqueue rather than accumulating error.
    // Deliberately non-fatal. The recipient and dispatch-queue rows are already
    // written by this point, so throwing here would strand the campaign with
    // work queued but status/started_at never set — neither running nor
    // cleanly retryable. A stale counter is much cheaper than a stuck campaign.
    const { count: recipientCount, error: countErr } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id);

    // On append, falling back to `enqueued` would set the total to just this
    // batch's delta and silently UNDERCOUNT — the mirror of the bug being
    // fixed. Fall back to the previous accumulated value instead, and only use
    // `enqueued` for a first run where there is nothing to preserve.
    const previousTotal = campaign.total_recipients ?? 0;
    const resolvedTotal =
      typeof recipientCount === "number" && !countErr
        ? recipientCount
        : isAppend
          ? previousTotal + enqueued
          : enqueued;

    if (countErr) {
      console.warn(
        `[campaigns] recipient recount failed for ${campaign.id}; using fallback total ${resolvedTotal}`,
        countErr,
      );
    }

    const updatePayload: Any = {
      status: nextStatus,
      total_recipients: resolvedTotal,
      scheduled_at: runAtIso,
      // Preserve started_at when appending to an already-running campaign.
      ...(isAppend
        ? {}
        : { started_at: nextStatus === "running" ? new Date().toISOString() : null }),
    };
    const { error: statusError } = await sbAny(supabase).from("campaigns").update(updatePayload).eq("id", campaign.id);

    if (!statusError && !isAppend) {
      try {
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const admin = sbAny(supabaseAdmin);
        const { data: workspace, error: workspaceError } = await admin
          .from("workspaces").select("organization_id").eq("id", wsId).single();
        if (workspaceError) throw workspaceError;
        const { error: notificationError } = await admin.from("notifications").insert({
          user_id: userId,
          organization_id: workspace.organization_id,
          channel: "in_app",
          status: "unread",
          category: "campaign",
          title: nextStatus === "scheduled" ? `Campaign scheduled: ${campaign.name}` : `Campaign started: ${campaign.name}`,
          body: `${resolvedTotal} recipients`,
          action_url: `/campaigns/${campaign.id}`,
          data: { campaign_id: campaign.id, workspace_id: wsId },
        });
        if (notificationError) throw notificationError;
      } catch (notificationError) {
        console.warn("[campaigns] notification failed:", notificationError);
      }
    }

    await sbAny(supabase).from("campaign_events").insert({
      workspace_id: wsId,
      campaign_id: campaign.id,
      event_type: "enqueued",
      payload: { enqueued, actor: userId },
    } as Any);

    return { ok: true, enqueued, skipped: ineligible.length };
  });

function pickVariant<T extends { weight: number }>(variants: T[]): T | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + Number(v.weight || 0), 0) || 1;
  const r = Math.random() * total;
  let acc = 0;
  for (const v of variants) {
    acc += Number(v.weight || 0);
    if (r <= acc) return v;
  }
  return variants[variants.length - 1];
}

const FAILED_STATUSES = ["failed", "error", "rejected", "undelivered"];

export const retryFailedRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        campaignId: z.string().uuid(),
        recipientIds: z.array(z.string().uuid()).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const userId = context.userId;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!campaign) throw new Error("Campaign not found");

    let recQ = supabase
      .from("campaign_recipients")
      .select("id, contact_id, status")
      .eq("campaign_id", data.campaignId);
    if (data.recipientIds && data.recipientIds.length > 0) {
      recQ = recQ.in("id", data.recipientIds);
    } else {
      recQ = recQ.in("status", FAILED_STATUSES);
    }
    const { data: failed, error: fErr } = await recQ.limit(50000);
    if (fErr) throw fErr;

    const failedList = ((failed ?? []) as Any[]).filter((r) =>
      FAILED_STATUSES.includes(String(r.status ?? "").toLowerCase()),
    );
    if (failedList.length === 0) return { ok: true, retried: 0 };

    // Retrying is an enqueue: it creates dispatch-queue rows and can reopen a
    // completed campaign, so it goes through the same gate. Without this, a
    // campaign whose sender was disconnected after the run could be retried
    // into guaranteed failures one recipient at a time.
    await assertCampaignReady(supabase, campaign);

    const contactIds = failedList.map((r) => r.contact_id).filter(Boolean);
    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, phone, whatsapp")
      .in("id", contactIds);
    if (contactsErr) throw contactsErr;
    // Normalised the same way the first enqueue normalised it, so a retry
    // does not re-queue the raw CRM formatting the provider rejects.
    const phoneById = new Map(
      ((contacts ?? []) as Any[]).map((c) => [
        c.id,
        normalizeWhatsAppNumber(c.whatsapp || c.phone),
      ]),
    );

    const nowIso = new Date().toISOString();
    const wsId: string = campaign.workspace_id;

    // Reset recipient rows so the panel reflects the retry immediately.
    const failedIds = failedList.map((r) => r.id);
    const chunk = 500;
    for (let i = 0; i < failedIds.length; i += chunk) {
      const slice = failedIds.slice(i, i + chunk);
      await supabase
        .from("campaign_recipients")
        .update({
          status: "queued",
          error_code: null,
          error_message: null,
          failed_at: null,
        } as Any)
        .in("id", slice);
    }

    const queueRows = failedList.map((r) => ({
      workspace_id: wsId,
      campaign_id: campaign.id,
      recipient_id: r.id,
      contact_id: r.contact_id,
      phone_number: phoneById.get(r.contact_id) ?? null,
      message_body: campaign.message_body,
      media_url: campaign.media_url,
      template_id: campaign.template_id,
      template_variables: campaign.template_variables ?? {},
      priority: 3,
      run_at: nowIso,
      status: "pending",
    }));

    let enqueued = 0;
    for (let i = 0; i < queueRows.length; i += chunk) {
      const slice = queueRows.slice(i, i + chunk);
      const { error: qErr } = await supabase
        .from("campaign_dispatch_queue")
        .insert(slice as Any);
      if (qErr) throw qErr;
      enqueued += slice.length;
    }

    // Reopen the campaign so the dispatcher picks up the requeued rows.
    if (campaign.status === "completed" || campaign.status === "paused") {
      await supabase
        .from("campaigns")
        .update({ status: "running", completed_at: null } as Any)
        .eq("id", campaign.id);
    }

    await sbAny(supabase).from("campaign_events").insert({
      workspace_id: wsId,
      campaign_id: campaign.id,
      event_type: "retry_failed",
      payload: { retried: enqueued, actor: userId },
    } as Any);

    return { ok: true, retried: enqueued };
  });

export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    await supabase
      .from("campaign_dispatch_queue")
      .update({ status: "cancelled" } as Any)
      .eq("campaign_id", data.campaignId)
      .eq("status", "pending");
    await supabase
      .from("campaigns")
      .update({ status: "paused", completed_at: new Date().toISOString() } as Any)
      .eq("id", data.campaignId);
    return { ok: true };
  });

export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await (context.supabase as Any)
      .from("campaigns")
      .update({ status: "paused" } as Any)
      .eq("id", data.campaignId);
    return { ok: true };
  });

export const resumeCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await (context.supabase as Any)
      .from("campaigns")
      .update({ status: "running" } as Any)
      .eq("id", data.campaignId);
    return { ok: true };
  });

export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const { data: c, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw error;
    if (!c) throw new Error("Campaign not found");
    const strip = [
      "id",
      "created_at",
      "updated_at",
      "started_at",
      "completed_at",
      "total_recipients",
      "sent_count",
      "delivered_count",
      "read_count",
      "replied_count",
      "clicked_count",
      "failed_count",
      "opted_out_count",
    ];
    const rest: Any = { ...c };
    for (const k of strip) delete rest[k];
    const { data: dup, error: dupErr } = await supabase
      .from("campaigns")
      .insert({ ...rest, name: `${c.name} (copy)`, status: "draft" } as Any)
      .select()
      .single();
    if (dupErr) throw dupErr;
    return dup;
  });

export const recomputeSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ segmentId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const { data: seg, error } = await supabase
      .from("customer_segments")
      .select("*")
      .eq("id", data.segmentId)
      .maybeSingle();
    if (error) throw error;
    if (!seg) throw new Error("Segment not found");

    let q = sbAny(supabase).from("contacts").select("id").eq("workspace_id", seg.workspace_id);
    const filter = (seg.filter_definition ?? {}) as {
      conditions?: Array<{ field?: string; op?: string; value?: unknown }>;
    };
    for (const cond of filter.conditions ?? []) {
      if (cond.field === "tags" && cond.op === "contains" && Array.isArray(cond.value)) {
        q = q.contains("tags", cond.value as Any);
      }
    }
    const { data: rows, error: qErr } = await q.limit(100000);
    if (qErr) throw qErr;
    const ids = (rows ?? []).map((r: Any) => r.id as string);

    await sbAny(supabase).from("segment_members").delete().eq("segment_id", seg.id);
    if (ids.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize).map((cid: string) => ({
          segment_id: seg.id,
          contact_id: cid,
        }));
        await sbAny(supabase).from("segment_members").insert(chunk as Any);
      }
    }
    await supabase
      .from("customer_segments")
      .update({ member_count: ids.length, last_computed_at: new Date().toISOString() } as Any)
      .eq("id", seg.id);

    return { ok: true, count: ids.length };
  });
