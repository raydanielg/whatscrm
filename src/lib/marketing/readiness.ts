/**
 * The single answer to "can this campaign be scheduled or sent?".
 *
 * Readiness used to be decided in three places that disagreed: the wizard's
 * `canNext`, the send page's `varIssues`, and a handful of `throw new Error`
 * lines inside `enqueueCampaign`. A draft could therefore pass the UI and be
 * rejected mid-run, or — worse — bypass the UI entirely and reach `scheduled`
 * with no sender and no audience.
 *
 * This module is pure and data-only so the exact same rules run in the browser
 * (to disable Schedule / Send Now and name the missing section) and on the
 * server (to reject an incomplete campaign before it is enqueued). Callers
 * gather the snapshot; the rules live here.
 */

import type { CampaignSendFailure } from "./send-errors";
import { validateTemplateVariables } from "./variable-validation";

/** Which part of the wizard the operator has to go back to. */
export type ReadinessSection =
  "channel" | "template" | "sender" | "variables" | "media" | "audience" | "schedule";

/** Human labels, so the Review step and a server error say the same thing. */
export const SECTION_LABEL: Record<ReadinessSection, string> = {
  channel: "Channel",
  template: "Template",
  sender: "WhatsApp sender",
  variables: "Template variables",
  media: "Header media",
  audience: "Audience",
  schedule: "Schedule",
};

export interface ReadinessIssue {
  /** Where to send the operator to fix it. */
  section: ReadinessSection;
  /** Shared taxonomy with the dispatch path's failures. */
  code: CampaignSendFailure;
  /** Actionable, already user-facing. */
  message: string;
}

/** The `wa_templates` subset readiness needs. */
export interface ReadinessTemplate {
  id: string;
  name: string;
  language: string | null;
  status: string | null;
  components: unknown;
  /** The WABA account the template was issued against. */
  channel_account_id?: string | null;
}

/** The channel-account subset readiness needs. */
export interface ReadinessSender {
  id: string;
  status: string | null;
  workspaceId?: string | null;
  displayName?: string | null;
}

export interface CampaignReadinessInput {
  channel: string | null | undefined;
  workspaceId?: string | null;
  template: ReadinessTemplate | null | undefined;
  /** Resolved from the template's `channel_account_id`; null when unresolved. */
  sender: ReadinessSender | null | undefined;
  variables: Record<string, unknown> | null | undefined;
  mediaUrl: string | null | undefined;
  /** True when a segment, list, or "all contacts" has been chosen. */
  audienceSelected: boolean;
  /**
   * Recipients that would actually be queued. `null` means "not counted yet"
   * — the browser often cannot count before enqueue, and an uncounted audience
   * must not be reported as empty.
   */
  eligibleRecipients: number | null;
  scheduleMode: "now" | "schedule";
  /** ISO instant; required when `scheduleMode` is "schedule". */
  scheduledAt?: string | null;
  /** Injected so tests and the server can agree on "the past". */
  now?: number;
}

export interface CampaignReadiness {
  ready: boolean;
  issues: ReadinessIssue[];
  /** Sections with at least one issue, in wizard order. */
  blockedSections: ReadinessSection[];
  /** One line for a toast or a server error message. */
  summary: string;
}

/**
 * A schedule may not be set in the past. A minute of slack absorbs the round
 * trip between the operator picking a time and the server reading it; without
 * it a legitimate "send at 09:00" submitted at 09:00:00.4 is rejected.
 */
export const SCHEDULE_PAST_TOLERANCE_MS = 60_000;

/** Does this template need an uploaded/linked header media file? */
export function templateRequiresMedia(components: unknown): boolean {
  if (!Array.isArray(components)) return false;
  return components.some((component) => {
    const c = component as { type?: unknown; format?: unknown };
    return (
      String(c?.type ?? "").toUpperCase() === "HEADER" &&
      ["IMAGE", "VIDEO", "DOCUMENT"].includes(String(c?.format ?? "").toUpperCase())
    );
  });
}

const SECTION_ORDER: ReadinessSection[] = [
  "channel",
  "template",
  "sender",
  "variables",
  "media",
  "audience",
  "schedule",
];

/**
 * Evaluate every readiness rule and return all failures, not just the first.
 *
 * Returning the full list matters: the Review step shows the operator
 * everything left to do rather than making them re-submit once per problem.
 */
export function evaluateCampaignReadiness(input: CampaignReadinessInput): CampaignReadiness {
  const issues: ReadinessIssue[] = [];
  const add = (section: ReadinessSection, code: CampaignSendFailure, message: string) =>
    issues.push({ section, code, message });

  const channel = String(input.channel ?? "").toLowerCase();
  if (channel !== "whatsapp") {
    add(
      "channel",
      "config_invalid",
      channel
        ? `Channel "${channel}" cannot be dispatched; this campaign must be set to WhatsApp.`
        : "Choose WhatsApp as the campaign channel.",
    );
  }

  const template = input.template ?? null;
  if (!template) {
    add("template", "template_missing", "Select an approved WhatsApp template.");
  } else {
    if (String(template.status ?? "").toUpperCase() !== "APPROVED") {
      add(
        "template",
        "template_not_approved",
        `Template "${template.name}" is ${String(template.status ?? "unknown").toLowerCase()}, not approved. Meta will not deliver it.`,
      );
    }
    if (!String(template.language ?? "").trim()) {
      add(
        "template",
        "config_invalid",
        `Template "${template.name}" has no language code, so Meta cannot resolve which translation to send.`,
      );
    }

    // Variables are only meaningful once a template defines them.
    const { issues: varIssues } = validateTemplateVariables(
      template.components,
      toStringMap(input.variables),
    );
    for (const issue of varIssues) {
      add("variables", "variables_missing", issue.message);
    }

    if (templateRequiresMedia(template.components)) {
      const media = String(input.mediaUrl ?? "").trim();
      if (!media) {
        add(
          "media",
          "config_invalid",
          `Template "${template.name}" has a media header. Upload or link the header file before sending.`,
        );
      } else if (!/^https:\/\//i.test(media)) {
        add(
          "media",
          "config_invalid",
          "The header media must be an HTTPS URL; Meta rejects anything else.",
        );
      }
    }
  }

  // The sender is derived from the template, so only complain about it once a
  // template exists — otherwise every incomplete draft reports two problems
  // for one missing choice.
  if (template) {
    const sender = input.sender ?? null;
    if (!template.channel_account_id) {
      add(
        "sender",
        "sender_invalid",
        `Template "${template.name}" is not linked to a WhatsApp account. Re-sync templates in Settings → Channels.`,
      );
    } else if (!sender) {
      add(
        "sender",
        "sender_invalid",
        "The template's WhatsApp account could not be found in this workspace.",
      );
    } else if (
      input.workspaceId &&
      sender.workspaceId &&
      sender.workspaceId !== input.workspaceId
    ) {
      add(
        "sender",
        "sender_invalid",
        "The template's WhatsApp account belongs to another workspace.",
      );
    } else if (String(sender.status ?? "").toLowerCase() !== "connected") {
      add(
        "sender",
        "sender_disconnected",
        `The WhatsApp sender ${sender.displayName ?? ""} is ${sender.status ?? "not connected"}. Reconnect it in Settings → Channels.`.replace(
          /\s+/g,
          " ",
        ),
      );
    }
  }

  if (!input.audienceSelected) {
    add("audience", "audience_empty", "Choose who this campaign goes to.");
  } else if (input.eligibleRecipients !== null && input.eligibleRecipients <= 0) {
    add(
      "audience",
      "audience_empty",
      "No contact in this audience has a valid, opted-in WhatsApp number.",
    );
  }

  if (input.scheduleMode === "schedule") {
    const raw = String(input.scheduledAt ?? "").trim();
    const at = raw ? new Date(raw).getTime() : Number.NaN;
    if (!raw) {
      add("schedule", "config_invalid", "Pick the date and time to send this campaign.");
    } else if (Number.isNaN(at)) {
      add("schedule", "config_invalid", "The scheduled time is not a valid date.");
    } else if (at < (input.now ?? Date.now()) - SCHEDULE_PAST_TOLERANCE_MS) {
      add(
        "schedule",
        "config_invalid",
        "The scheduled time is in the past. Pick a future time or send now.",
      );
    }
  }

  const blockedSections = SECTION_ORDER.filter((section) =>
    issues.some((issue) => issue.section === section),
  );

  return {
    ready: issues.length === 0,
    issues,
    blockedSections,
    summary: summarize(issues, blockedSections),
  };
}

function summarize(issues: ReadinessIssue[], blocked: ReadinessSection[]): string {
  if (issues.length === 0) return "Ready to send.";
  const first = issues[0];
  if (issues.length === 1) return `${SECTION_LABEL[first.section]}: ${first.message}`;
  const others = blocked.filter((s) => s !== first.section).map((s) => SECTION_LABEL[s]);
  return `${SECTION_LABEL[first.section]}: ${first.message} (also fix: ${others.join(", ")})`;
}

/**
 * Template variables arrive as jsonb, so their value types are unknown here.
 * Coerced the same way `delivery.server.ts` coerces them, so readiness and the
 * actual send agree on which variables count as supplied.
 */
function toStringMap(source: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
}
