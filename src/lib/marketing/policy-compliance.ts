/**
 * WhatsApp Cloud API messaging policy compliance helpers.
 * Static checks applied client-side and re-validated server-side at dispatch.
 * https://developers.facebook.com/docs/whatsapp/overview/policy
 */

export type PolicySeverity = "error" | "warning" | "info";

export type PolicyFinding = {
  code: string;
  severity: PolicySeverity;
  title: string;
  detail: string;
};

export type CampaignPolicyInput = {
  category?: "marketing" | "utility" | "authentication" | string | null;
  templateApproved?: boolean;
  body?: string | null;
  audienceHasConsent?: boolean;
  audienceOptedInOnly?: boolean;
  quietHoursRespected?: boolean;
  hasUnsubscribeMechanism?: boolean;
  variableCount?: number;
  attachmentCount?: number;
  scheduledAt?: string | null;
  ratePerMinute?: number | null;
};

const BANNED_PATTERNS: Array<{ code: string; re: RegExp; title: string; detail: string }> = [
  { code: "P-DRUGS", re: /\b(cocaine|heroin|meth|opioid)\b/i, title: "Prohibited substance reference", detail: "WhatsApp prohibits promotion of drugs and controlled substances." },
  { code: "P-WEAPONS", re: /\b(firearms?|ammunition|handgun|rifle)\b/i, title: "Prohibited weapons reference", detail: "Weapons and ammunition content is not allowed." },
  { code: "P-ADULT", re: /\b(porn|escort|adult\s?services?)\b/i, title: "Prohibited adult content", detail: "Adult products/services violate WhatsApp Commerce policy." },
  { code: "P-GAMBLING", re: /\b(casino|betting|lottery|jackpot)\b/i, title: "Regulated gambling content", detail: "Gambling content requires special approval; likely blocked." },
];

const SPAMMY_SIGNALS: Array<{ code: string; re: RegExp; title: string; detail: string }> = [
  { code: "S-CAPS", re: /\b[A-Z]{6,}\b/, title: "Excessive capitalization", detail: "All-caps words look spammy and hurt deliverability." },
  { code: "S-URGENCY", re: /!!!+|urgent!?|act now|hurry|last chance/i, title: "High-pressure urgency", detail: "Aggressive urgency triggers spam heuristics and user blocks." },
  { code: "S-CLICKBAIT", re: /\bfree money\b|guaranteed.*(win|prize)|100%\s?free/i, title: "Clickbait language", detail: "Overpromising phrases increase block/report rate." },
  { code: "S-EMOJI", re: /(\p{Emoji_Presentation}\s*){8,}/u, title: "Excessive emoji", detail: "Long emoji runs reduce readability and trust." },
];

export function checkCampaignPolicy(input: CampaignPolicyInput): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const body = (input.body ?? "").trim();

  if (input.category === "marketing" && !input.audienceOptedInOnly) {
    findings.push({
      code: "C-CONSENT-MKT",
      severity: "error",
      title: "Marketing requires explicit opt-in",
      detail: "Marketing templates may only be sent to contacts with a valid opt-in on record.",
    });
  }

  if (input.audienceHasConsent === false) {
    findings.push({
      code: "C-CONSENT-MISSING",
      severity: "error",
      title: "Audience contains unconsented contacts",
      detail: "Remove suppressed/unsubscribed contacts before dispatch — required for GDPR and WhatsApp policy.",
    });
  }

  if (!input.templateApproved) {
    findings.push({
      code: "C-TEMPLATE",
      severity: "error",
      title: "Template not approved",
      detail: "Only Meta-approved templates can be used for the initial outreach.",
    });
  }

  if (!input.hasUnsubscribeMechanism && input.category === "marketing") {
    findings.push({
      code: "C-OPTOUT",
      severity: "warning",
      title: "No visible opt-out",
      detail: "Include an unsubscribe path (e.g. STOP keyword or quick reply) to keep block rate low.",
    });
  }

  if (input.quietHoursRespected === false) {
    findings.push({
      code: "C-QUIET",
      severity: "warning",
      title: "Send window ignores quiet hours",
      detail: "Sending outside recipient business hours increases block/report rate.",
    });
  }

  if (typeof input.ratePerMinute === "number" && input.ratePerMinute > 600) {
    findings.push({
      code: "C-RATE",
      severity: "warning",
      title: "Rate above safe threshold",
      detail: "Very high burst rates can trigger Meta quality-rating downgrades. Consider spreading dispatch.",
    });
  }

  if (typeof input.variableCount === "number" && input.variableCount === 0 && body.length > 0) {
    findings.push({
      code: "C-PERSONALIZE",
      severity: "info",
      title: "No personalization",
      detail: "Adding a merge field (e.g. {{customer_name}}) typically lifts engagement 15–30%.",
    });
  }

  for (const p of BANNED_PATTERNS) {
    if (p.re.test(body)) findings.push({ code: p.code, severity: "error", title: p.title, detail: p.detail });
  }
  for (const s of SPAMMY_SIGNALS) {
    if (s.re.test(body)) findings.push({ code: s.code, severity: "warning", title: s.title, detail: s.detail });
  }

  if (body.length > 1024) {
    findings.push({
      code: "C-LENGTH",
      severity: "warning",
      title: "Body exceeds 1024 chars",
      detail: "WhatsApp template body is capped at 1024 characters.",
    });
  }

  return findings;
}

export function summarizePolicy(findings: PolicyFinding[]) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  const score = Math.max(0, 100 - errors * 25 - warnings * 8 - infos * 2);
  const status: "blocked" | "review" | "ready" = errors > 0 ? "blocked" : warnings > 0 ? "review" : "ready";
  return { errors, warnings, infos, score, status };
}
