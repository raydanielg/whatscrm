/**
 * Server-side half of campaign readiness: gather the snapshot, then apply the
 * same pure rules the wizard applies.
 *
 * The browser is not trusted to have run them. Anything that can turn a draft
 * into queued work goes through `assertCampaignReady` first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCampaignReadiness,
  type CampaignReadiness,
  type ReadinessSender,
  type ReadinessTemplate,
} from "./readiness";
import { CampaignSendError } from "./send-errors";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** The `campaigns` columns readiness needs. */
export interface ReadinessCampaign {
  id: string;
  workspace_id: string;
  channel: string | null;
  template_id: string | null;
  template_variables: Record<string, unknown> | null;
  media_url: string | null;
  segment_id: string | null;
  contact_list_id?: string | null;
  scheduled_at: string | null;
}

export interface ServerReadinessOptions {
  /**
   * Recipients that would actually be queued, once known. Left undefined on
   * the pre-flight pass, where the audience has not been resolved yet — an
   * uncounted audience must not read as an empty one.
   */
  eligibleRecipients?: number | null;
  /** Explicit run time from the caller; falls back to the campaign's own. */
  runAt?: string | null;
  now?: number;
}

/**
 * Load the template and its WhatsApp account, then evaluate.
 *
 * "All contacts in the workspace" is a deliberate audience choice in this app
 * (it is what an unset segment/list means), so audience selection is always
 * satisfied here; emptiness is caught by the recipient count instead.
 */
export async function loadCampaignReadiness(
  supabase: SupabaseClient<Any, Any, Any>,
  campaign: ReadinessCampaign,
  options: ServerReadinessOptions = {},
): Promise<CampaignReadiness> {
  let template: ReadinessTemplate | null = null;
  let sender: ReadinessSender | null = null;

  if (campaign.template_id) {
    const { data } = await (supabase as Any)
      .from("wa_templates")
      .select("id, name, language, status, components, channel_account_id")
      .eq("id", campaign.template_id)
      .eq("workspace_id", campaign.workspace_id)
      .maybeSingle();
    template = (data as ReadinessTemplate | null) ?? null;

    if (template?.channel_account_id) {
      const { data: account } = await (supabase as Any)
        .from("channel_accounts")
        .select("id, status, workspace_id, display_name")
        .eq("id", template.channel_account_id)
        .maybeSingle();
      sender = account
        ? {
            id: (account as Any).id,
            status: (account as Any).status ?? null,
            workspaceId: (account as Any).workspace_id ?? null,
            displayName: (account as Any).display_name ?? null,
          }
        : null;
    }
  }

  const scheduledAt = options.runAt ?? campaign.scheduled_at ?? null;
  const now = options.now ?? Date.now();
  // A run time in the past is simply "send now" as far as the queue is
  // concerned, so only treat this as a scheduled campaign when it is ahead of
  // us. Otherwise a Send Now would be rejected for "scheduling in the past".
  const isScheduled = !!scheduledAt && new Date(scheduledAt).getTime() > now;

  return evaluateCampaignReadiness({
    channel: campaign.channel,
    workspaceId: campaign.workspace_id,
    template,
    sender,
    variables: campaign.template_variables,
    mediaUrl: campaign.media_url,
    audienceSelected: true,
    eligibleRecipients:
      options.eligibleRecipients === undefined ? null : options.eligibleRecipients,
    scheduleMode: isScheduled ? "schedule" : "now",
    scheduledAt,
    now,
  });
}

/**
 * Throw a classified `CampaignSendError` unless the campaign is ready.
 *
 * The thrown kind comes from the first issue, so callers keep the existing
 * configuration-vs-transient distinction rather than getting a generic error.
 */
export async function assertCampaignReady(
  supabase: SupabaseClient<Any, Any, Any>,
  campaign: ReadinessCampaign,
  options: ServerReadinessOptions = {},
): Promise<CampaignReadiness> {
  const readiness = await loadCampaignReadiness(supabase, campaign, options);
  if (!readiness.ready) {
    throw new CampaignSendError(readiness.issues[0].code, readiness.summary);
  }
  return readiness;
}
