/**
 * Human-friendly error messages for WhatsApp Forms (Meta Flows).
 *
 * Server functions and Supabase surface terse, developer-oriented errors.
 * These helpers turn an unknown thrown value into a short title plus an
 * actionable description an admin can actually follow.
 *
 * Client-safe: no server-only imports.
 */

export type FlowAction = "publish" | "unpublish" | "create" | "delete" | "send";

export type FriendlyFlowError = {
  title: string;
  description: string;
  /** Raw message, useful for logging / "show details". */
  raw: string;
};

const ACTION_TITLE: Record<FlowAction, string> = {
  publish: "Could not publish this form",
  unpublish: "Could not unpublish this form",
  create: "Could not create this form",
  delete: "Could not delete this form",
  send: "Could not send this form",
};

export function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "details", "hint"]) {
      const v = rec[key];
      if (typeof v === "string" && v.trim()) return v;
    }
    try {
      return JSON.stringify(error).slice(0, 300);
    } catch {
      return "Unknown error";
    }
  }
  return "Unknown error";
}

type Rule = { match: RegExp; description: string };

/** Ordered: first match wins. */
const RULES: Rule[] = [
  {
    match: /(offline|failed to fetch|network ?error|load failed|err_internet|timed? ?out|timeout)/i,
    description: "We could not reach the server. Check your connection and try again in a moment.",
  },
  {
    match: /(unauthori[sz]ed|not authenticated|jwt|session (expired|missing)|401)/i,
    description: "Your session has expired. Sign in again and retry.",
  },
  {
    match: /(forbidden|permission|not allowed|row-level security|rls|403)/i,
    description:
      "You do not have permission to do this in this workspace. Ask an owner or admin to grant you access.",
  },
  {
    match: /(access token|oauthexception|code.?190|invalid[_ ]token)/i,
    description:
      "The WhatsApp access token is expired or invalid. Reconnect the WhatsApp Business account in Settings → Channels, then try again.",
  },
  {
    match:
      /(whatsapp_business_management|whatsapp_business_messaging|missing permission|#(10|200|294))/i,
    description:
      "The connected WhatsApp token is missing the permissions needed to manage Flows. Reconnect the account with full WhatsApp Business management access.",
  },
  {
    match:
      /(no (whatsapp )?(channel|account|credential)|not configured|missing (waba|phone number|credentials))/i,
    description:
      "No WhatsApp Business account is connected for this workspace. Connect one in Settings → Channels before publishing or sending forms.",
  },
  {
    match: /(flow[_ ]?id|not published|draft)/i,
    description:
      "This form is not published on Meta yet. Publish it first, then send it to a customer.",
  },
  {
    match: /(invalid (flow ?)?json|validation|schema|invalid parameter|#100)/i,
    description:
      "Meta rejected the form contents. Review the questions and screens for unsupported fields, then publish again.",
  },
  {
    match:
      /(duplicate|already exists|unique constraint|name should be unique|flow name.*unique|unique.*flow name)/i,
    description:
      "A WhatsApp Flow with this name already exists in your business account. Rename the form and publish again.",
  },
  {
    match: /(rate ?limit|too many requests|429)/i,
    description: "Meta is rate-limiting requests right now. Wait a minute and try again.",
  },
  {
    match: /(24[- ]hour|outside the (allowed )?window|re[- ]?engagement|131047)/i,
    description:
      "The customer is outside the 24-hour messaging window. Send an approved template first to reopen the conversation.",
  },
];

export function explainFlowError(action: FlowAction, error: unknown): FriendlyFlowError {
  const raw = rawErrorMessage(error);
  const rule = RULES.find((r) => r.match.test(raw));
  return {
    title: ACTION_TITLE[action],
    description: rule
      ? rule.description
      : raw && raw !== "Unknown error"
        ? `${raw}. If this keeps happening, reconnect the WhatsApp account and try again.`
        : "Something went wrong. Please try again — if it keeps failing, reconnect the WhatsApp account.",
    raw,
  };
}
