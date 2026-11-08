import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";
import { sbAny } from "@/lib/supabase/untyped";
import { normalizeSendError } from "@/lib/marketing/send-errors";
import {
  claimDispatchBatch,
  failureDisposition,
  finalCampaignStatus,
  releaseClaim,
  type DispatchQueueRow,
} from "@/lib/marketing/dispatch-worker";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Queue-based campaign dispatcher. Called every minute by pg_cron.
 * Uses admin client (bypasses RLS). Every row is scoped to a specific
 * campaign_dispatch_queue entry already owned by a workspace.
 *
 * Rows are claimed by `claim_campaign_dispatch_batch`, a single atomic
 * UPDATE ... FOR UPDATE SKIP LOCKED (see the 20260929120000 migration), so two
 * overlapping cron ticks partition the queue instead of racing for the same
 * rows. The claim also increments `attempts`, which is what bounds a send
 * interrupted between the provider call and the result write.
 */
export const Route = createFileRoute("/api/public/hooks/campaign-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const admin = supabaseAdmin as any;
          const workerId = crypto.randomUUID();
          const BATCH = 500;

          // Terminate anything that has burned every attempt before claiming,
          // so an exhausted row is not re-claimed once per tick forever.
          await sbAny(admin).rpc("expire_campaign_dispatch_attempts" as never, {});

          const { rows, error: claimErr } = await claimDispatchBatch(admin, workerId, BATCH);
          if (claimErr) return json({ ok: false, error: claimErr }, 500);
          if (rows.length === 0) return json({ ok: true, processed: 0 });

          const byCampaign = new Map<string, DispatchQueueRow[]>();
          for (const r of rows) {
            const list = byCampaign.get(r.campaign_id) ?? [];
            list.push(r);
            byCampaign.set(r.campaign_id, list);
          }

          const results = { sent: 0, failed: 0, skipped: 0 };

          for (const [campaignId, batch] of byCampaign.entries()) {
            const { data: campaign } = await admin
              .from("campaigns")
              .select("*")
              .eq("id", campaignId)
              .maybeSingle();
            const status = campaign?.status as string | undefined;
            const runnable =
              !!campaign &&
              ["running", "scheduled"].includes(status ?? "") &&
              !["pending", "rejected"].includes(campaign.approval_status);

            if (!runnable) {
              // A paused campaign is resumable, so its work goes back on the
              // queue and the attempt the claim consumed is refunded. Anything
              // else (cancelled, archived, awaiting approval) is terminal for
              // these rows.
              const resumable = status === "paused" || status === "scheduled";
              await releaseClaim(admin, batch, {
                status: resumable ? "pending" : "skipped",
                delayMs: 60_000,
                refundAttempt: resumable,
              });
              results.skipped += batch.length;
              continue;
            }

            const throttle = Math.max(1, Number(campaign.throttle_per_minute ?? 60));
            const send = batch.slice(0, throttle);
            const defer = batch.slice(throttle);
            if (defer.length > 0) {
              // Never attempted, so the claim's attempt increment is refunded.
              await releaseClaim(admin, defer, {
                status: "pending",
                delayMs: 60_000,
                refundAttempt: true,
              });
            }

            for (const row of send) {
              try {
                const { deliverCampaignTemplate } = await import("@/lib/marketing/delivery.server");
                const delivery = await deliverCampaignTemplate(admin, row as any);
                await admin
                  .from("campaign_dispatch_queue")
                  .update({
                    status: "sent",
                    processed_at: new Date().toISOString(),
                    last_error: null,
                    locked_at: null,
                    locked_by: null,
                  })
                  .eq("id", row.id);

                if (row.recipient_id) {
                  await admin
                    .from("campaign_recipients")
                    .update({
                      status: "sent",
                      sent_at: new Date().toISOString(),
                      // Clear any error left by an earlier failed attempt, so a
                      // delivered recipient never shows a stale failure reason.
                      error_code: null,
                      error_message: null,
                    })
                    .eq("id", row.recipient_id);
                }
                await sbAny(admin)
                  .from("campaign_events")
                  .insert({
                    workspace_id: row.workspace_id,
                    campaign_id: campaignId,
                    event_type: "sent",
                    payload: {
                      contact_id: row.contact_id,
                      variant_id: row.variant_id,
                      external_message_id: delivery.externalMessageId,
                    },
                  });
                results.sent++;
              } catch (err) {
                const failure = normalizeSendError(err);
                // `attempts` was already incremented by the claim, so the row
                // carries the attempts spent including this one.
                const { terminal, retryAt } = failureDisposition({
                  isConfiguration: failure.isConfiguration,
                  attempts: Number(row.attempts ?? 1),
                  maxAttempts: Number(row.max_attempts ?? 3),
                });
                await admin
                  .from("campaign_dispatch_queue")
                  .update({
                    status: terminal ? "failed" : "pending",
                    last_error: failure.message,
                    locked_at: null,
                    locked_by: null,
                    processed_at: terminal ? new Date().toISOString() : null,
                    run_at: retryAt.toISOString(),
                  })
                  .eq("id", row.id);
                if (terminal) {
                  results.failed++;
                  if (row.recipient_id) {
                    await admin
                      .from("campaign_recipients")
                      .update({
                        status: "failed",
                        failed_at: new Date().toISOString(),
                        error_code: failure.kind,
                        error_message: failure.message,
                      })
                      .eq("id", row.recipient_id);
                  }
                }
              }
            }

            const [{ count: sentCount }, { count: failedCount }, { count: openCount }] =
              await Promise.all([
                admin
                  .from("campaign_dispatch_queue")
                  .select("id", { count: "exact", head: true })
                  .eq("campaign_id", campaignId)
                  .eq("status", "sent"),
                admin
                  .from("campaign_dispatch_queue")
                  .select("id", { count: "exact", head: true })
                  .eq("campaign_id", campaignId)
                  .eq("status", "failed"),
                admin
                  .from("campaign_dispatch_queue")
                  .select("id", { count: "exact", head: true })
                  .eq("campaign_id", campaignId)
                  .in("status", ["pending", "processing"]),
              ]);

            const next = finalCampaignStatus({
              sent: sentCount ?? 0,
              failed: failedCount ?? 0,
              open: openCount ?? 0,
            });

            await admin
              .from("campaigns")
              .update({
                sent_count: sentCount ?? 0,
                failed_count: failedCount ?? 0,
                status: next.status,
                completed_at: next.completedAt,
              })
              .eq("id", campaignId);
          }

          return json({ ok: true, ...results });
        } catch (err) {
          return json({ ok: false, error: String((err as Error).message ?? err) }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
