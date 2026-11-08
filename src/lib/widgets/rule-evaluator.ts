import type { RoutingRule } from "@/lib/widgets/widgets.functions";

export interface VisitorSample {
  url: string;
  language: string;
  /** ISO datetime string for "now". */
  now: string;
  /** IANA tz for business_hours evaluation. Defaults to UTC. */
  timezone?: string;
}

export interface ConditionResult {
  index: number;
  type: string;
  matched: boolean;
  reason: string;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditions: ConditionResult[];
  /** True if this is the first matching rule (the "winner"). */
  winner: boolean;
  action: { chatbotId: string | null; hideWidget: boolean };
}

export interface EvaluationResult {
  rules: RuleResult[];
  winner: RuleResult | null;
}

function safeUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function inBusinessHours(nowIso: string, from: string, to: string, tz?: string): { ok: boolean; local: string } {
  const now = new Date(nowIso);
  const timeZone = tz && tz.trim() ? tz.trim() : "UTC";
  let hh = 0, mm = 0, local = "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    local = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${timeZone}`;
  } catch {
    return { ok: false, local: `invalid tz: ${timeZone}` };
  }
  const cur = hh * 60 + mm;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const start = (fh || 0) * 60 + (fm || 0);
  const end = (th || 0) * 60 + (tm || 0);
  const ok = start <= end ? cur >= start && cur <= end : cur >= start || cur <= end;
  return { ok, local };
}

export function evaluateRoutingRules(rules: RoutingRule[], visitor: VisitorSample): EvaluationResult {
  const url = safeUrl(visitor.url);
  const path = url?.pathname ?? "";
  const lang = (visitor.language || "").toLowerCase();

  const results: RuleResult[] = rules.map((rule) => {
    const conditions: ConditionResult[] = rule.when.map((c, i) => {
      switch (c.type) {
        case "url_contains": {
          const matched = !!c.value && visitor.url.includes(c.value);
          return { index: i, type: c.type, matched, reason: matched ? `URL contains "${c.value}"` : `URL does not contain "${c.value}"` };
        }
        case "url_equals": {
          const matched = visitor.url === c.value;
          return { index: i, type: c.type, matched, reason: matched ? `URL matches exactly` : `URL is not "${c.value}"` };
        }
        case "path_starts_with": {
          const matched = !!c.value && path.startsWith(c.value);
          return { index: i, type: c.type, matched, reason: matched ? `Path starts with "${c.value}"` : `Path "${path}" does not start with "${c.value}"` };
        }
        case "language": {
          const target = (c.value || "").toLowerCase();
          const matched = !!target && (lang === target || lang.startsWith(target + "-"));
          return { index: i, type: c.type, matched, reason: matched ? `Language "${lang}" matches` : `Language "${lang}" ≠ "${target}"` };
        }
        case "business_hours": {
          const r = inBusinessHours(visitor.now, c.from, c.to, c.timezone ?? visitor.timezone);
          return { index: i, type: c.type, matched: r.ok, reason: r.ok ? `Inside ${c.from}–${c.to} (${r.local})` : `Outside ${c.from}–${c.to} (${r.local})` };
        }
        default:
          return { index: i, type: (c as { type: string }).type, matched: false, reason: "Unknown condition type" };
      }
    });

    // Empty conditions = never match (would otherwise catch everything by accident).
    const matched = conditions.length > 0 && conditions.every((c) => c.matched);
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      conditions,
      winner: false,
      action: { chatbotId: rule.chatbotId ?? null, hideWidget: !!rule.hideWidget },
    };
  });

  const winnerIdx = results.findIndex((r) => r.matched);
  if (winnerIdx >= 0) results[winnerIdx].winner = true;
  return { rules: results, winner: winnerIdx >= 0 ? results[winnerIdx] : null };
}
