import { sbAny } from "@/lib/supabase/untyped";

/**
 * Campaign transitions used by the workflow engine's marketing nodes.
 *
 * The UI launch path (`enqueueCampaign`) and the cancel path (`cancelCampaign`)
 * are `createServerFn` handlers that need the request's auth context, so they
 * cannot be called from the engine. These helpers apply the same rules directly:
 *
 * - Start never builds recipients or queue rows. It resumes a paused campaign,
 *   the same status change `resumeCampaign` makes. A campaign that has never
 *   been launched must be launched from the Marketing screen.
 * - Stop mirrors `cancelCampaign`: pending queue rows become `cancelled` and the
 *   campaign is paused. With a contact id, only that contact's pending rows are
 *   cancelled and the campaign keeps running.
 *
 * Every query is scoped to `workspaceId`.
 */

type Ctx = { supabase: unknown; workspaceId: string };

const CLOSED_STATUSES = ["completed", "archived", "cancelled"];

export type CampaignWorkflowResult = {
  campaign_id: string;
  status: string;
  changed: boolean;
};

async function loadCampaign(ctx: Ctx, campaignId: string) {
  const { data, error } = await sbAny(ctx.supabase)
    .from("campaigns")
    .select("id, status, approval_status")
    .eq("id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign not found in this workspace.");
  return data as { id: string; status: string; approval_status: string | null };
}

export async function startCampaignForWorkflow(ctx: Ctx, campaignId: string): Promise<CampaignWorkflowResult> {
  const campaign = await loadCampaign(ctx, campaignId);
  if (CLOSED_STATUSES.includes(campaign.status)) {
    throw new Error(`Cannot start a ${campaign.status} campaign.`);
  }
  if (["pending", "rejected"].includes(String(campaign.approval_status ?? ""))) {
    throw new Error("Campaign approval is required before sending.");
  }
  if (campaign.status === "running" || campaign.status === "scheduled") {
    return { campaign_id: campaign.id, status: campaign.status, changed: false };
  }
  if (campaign.status !== "paused") {
    throw new Error("Launch this campaign from the Marketing screen first. A workflow can only start a paused campaign.");
  }

  const { data, error } = await sbAny(ctx.supabase)
    .from("campaigns")
    .update({ status: "running", completed_at: null })
    .eq("id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "paused")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign changed state while starting. Try the step again.");
  return { campaign_id: campaignId, status: "running", changed: true };
}

export async function stopCampaignForWorkflow(
  ctx: Ctx,
  campaignId: string,
  contactId: string | null,
): Promise<CampaignWorkflowResult & { cancelled_queue_rows: number }> {
  const campaign = await loadCampaign(ctx, campaignId);
  const db = sbAny(ctx.supabase);

  if (contactId) {
    const { data, error } = await db
      .from("campaign_dispatch_queue")
      .update({ status: "cancelled" })
      .eq("campaign_id", campaignId)
      .eq("workspace_id", ctx.workspaceId)
      .eq("contact_id", contactId)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(error.message);
    return {
      campaign_id: campaign.id,
      status: campaign.status,
      changed: (data ?? []).length > 0,
      cancelled_queue_rows: (data ?? []).length,
    };
  }

  const { data: cancelled, error: qErr } = await db
    .from("campaign_dispatch_queue")
    .update({ status: "cancelled" })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "pending")
    .select("id");
  if (qErr) throw new Error(qErr.message);

  const { error: cErr } = await db
    .from("campaigns")
    .update({ status: "paused", completed_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("workspace_id", ctx.workspaceId);
  if (cErr) throw new Error(cErr.message);

  return {
    campaign_id: campaignId,
    status: "paused",
    changed: campaign.status !== "paused",
    cancelled_queue_rows: (cancelled ?? []).length,
  };
}
