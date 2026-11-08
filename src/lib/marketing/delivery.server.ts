import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSendComponents } from "./send-components";
import { loadChannelAccount, loadCredentials } from "@/lib/messaging/registry.server";
import { whatsappCloudProvider } from "@/lib/messaging/providers/whatsapp-cloud.server";
import { CampaignSendError } from "./send-errors";
import { campaignMediaForDelivery } from "./campaign-media.server";

/** The dispatch-queue row this delivery is for. */
export interface DispatchRow {
  id: string;
  workspace_id: string;
  template_id: string | null;
  phone_number: string | null;
  media_url: string | null;
  template_variables: Record<string, unknown> | null;
}

/**
 * Flatten a jsonb variable map to the string parameters Meta accepts.
 *
 * Nulls and objects are dropped rather than stringified into "null" or
 * "[object Object]"; a required variable that disappears this way is then
 * caught by `buildSendComponents` instead of being sent as nonsense.
 */
function toStringMap(source: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
}

/** The `wa_templates` columns a send needs. */
interface TemplateRow {
  id: string;
  name: string;
  language: string;
  status: string;
  channel_account_id: string;
  components: unknown;
}

/**
 * Send one campaign dispatch row through the existing WhatsApp Cloud provider.
 *
 * The sender is the channel account the template belongs to: an approved
 * template is issued against one WABA, so choosing the template chooses the
 * sender. That relationship is re-checked here rather than trusted, because the
 * queue row is written well before it is processed.
 *
 * The caller must claim a queue row before invoking this function.
 *
 * Delivery is AT-LEAST-ONCE, not exactly-once, and cannot be made exactly-once
 * from this side. The WhatsApp Cloud API's /messages endpoint accepts no
 * client-supplied idempotency key — `correlationId` below is our own row id,
 * used for log correlation only, and Meta does not deduplicate on it. So a
 * process that dies between Meta accepting the message and this function
 * returning leaves a sent message with no stored `externalMessageId`, and the
 * retry sends it again.
 *
 * What bounds that: `claim_campaign_dispatch_batch` increments `attempts` when
 * the row is claimed, not when it fails. An interrupted send has therefore
 * already spent an attempt, so the duplicate window is at most
 * `max_attempts - 1` extra sends rather than an unbounded loop, and a row that
 * keeps dying mid-flight is retired by `expire_campaign_dispatch_attempts`.
 * Closing the gap entirely would need a provider-side idempotency key that does
 * not exist today.
 */
export async function deliverCampaignTemplate(
  // The admin client is deliberately untyped at the boundary: this runs against
  // tables the generated Database type does not cover (`wa_templates`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  row: DispatchRow,
) {
  if (!row.template_id) {
    throw new CampaignSendError(
      "template_missing",
      "Choose an approved WhatsApp template before sending.",
    );
  }

  const { data, error } = await admin
    .from("wa_templates")
    .select("id, name, language, status, channel_account_id, components")
    .eq("id", row.template_id)
    .eq("workspace_id", row.workspace_id)
    .maybeSingle();
  if (error) {
    throw new CampaignSendError(
      "persistence",
      `Could not load the campaign template: ${error.message}`,
    );
  }

  const template = data as TemplateRow | null;
  if (!template) {
    throw new CampaignSendError(
      "template_missing",
      "The campaign template no longer exists in this workspace.",
    );
  }
  if (String(template.status).toUpperCase() !== "APPROVED") {
    throw new CampaignSendError(
      "template_not_approved",
      `Template "${template.name}" is ${String(template.status).toLowerCase()}, not approved, so Meta will not deliver it.`,
    );
  }

  const account = await loadChannelAccount(template.channel_account_id);
  if (!account || account.workspaceId !== row.workspace_id) {
    throw new CampaignSendError(
      "sender_invalid",
      "The template's WhatsApp account does not belong to this workspace.",
    );
  }
  if (account.status !== "connected") {
    throw new CampaignSendError(
      "sender_disconnected",
      `The WhatsApp sender ${account.displayName ?? account.phoneNumber ?? ""} is ${account.status ?? "not connected"}. Reconnect it before sending.`.replace(
        /\s+/g,
        " ",
      ),
    );
  }

  const to = String(row.phone_number ?? "").replace(/^\+/, "");
  if (!/^[1-9]\d{6,14}$/.test(to)) {
    throw new CampaignSendError(
      "recipient_invalid",
      "Contact has no valid international WhatsApp number.",
    );
  }

  const components = buildSendComponents(
    template.components,
    // `template_variables` is jsonb, so its value types are genuinely unknown
    // at compile time. Coerced explicitly rather than cast: Meta only accepts
    // string parameters, and a number written by an older caller should render
    // as text instead of failing the send. `buildSendComponents` then rejects
    // any required variable that is still missing.
    toStringMap(row.template_variables),
    await campaignMediaForDelivery(admin, row.media_url, row.workspace_id),
  );

  const result = await whatsappCloudProvider.send(
    {
      to,
      type: "template",
      template: { name: template.name, language: template.language, components },
    },
    {
      account,
      credentials: loadCredentials(account),
      // Our queue-row id. Useful for tracing a send through the provider
      // logs; explicitly NOT an idempotency key — see the note above.
      correlationId: row.id,
      log: () => {},
    },
  );

  if (!result.externalMessageId) {
    throw new CampaignSendError(
      "provider_no_receipt",
      "WhatsApp did not return a message receipt. Check provider logs before retrying.",
    );
  }
  return result;
}
