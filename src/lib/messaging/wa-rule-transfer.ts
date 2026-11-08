import { z } from "zod";
import {
  WA_TRIGGER_LABEL,
  normalizeMinConfidence,
  type WaTriggerType,
} from "@/lib/messaging/wa-trigger-matching";

export const WA_RULESET_KIND = "wacrm.wa-chatbot.ruleset";
export const WA_RULESET_VERSION = 1;

const triggerTypes = Object.keys(WA_TRIGGER_LABEL) as [WaTriggerType, ...WaTriggerType[]];
const replyTypes = ["text", "image", "video", "document", "audio", "location"] as const;

export const waRuleExportSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trigger_type: z.enum(triggerTypes),
  keywords: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  reply_type: z.enum(replyTypes).default("text"),
  reply_text: z.string().max(8000).nullable().default(null),
  media_url: z.string().max(2000).nullable().default(null),
  media_caption: z.string().max(2000).nullable().default(null),
  enabled: z.boolean().default(true),
  match_case: z.boolean().default(false),
  priority: z.number().int().min(0).max(100000).default(100),
  cooldown_seconds: z.number().int().min(0).max(86400).default(0),
  min_confidence: z.number().min(0).max(1).nullable().default(null),
});

export const waRuleSetSchema = z.object({
  kind: z.literal(WA_RULESET_KIND),
  version: z.literal(WA_RULESET_VERSION),
  exported_at: z.string().optional(),
  source_workspace_id: z.string().uuid().nullable().optional(),
  source_workspace_name: z.string().nullable().optional(),
  rules: z.array(waRuleExportSchema).min(1).max(1000),
});

export type WaRuleExport = z.infer<typeof waRuleExportSchema>;
export type WaRuleSet = z.infer<typeof waRuleSetSchema>;

type AnyRule = Record<string, unknown>;

/** Strip workspace/instance/runtime specific fields so the set is portable. */
export function toExportRule(rule: AnyRule): WaRuleExport {
  return waRuleExportSchema.parse({
    name: rule.name,
    trigger_type: rule.trigger_type,
    keywords: Array.isArray(rule.keywords) ? rule.keywords : [],
    reply_type: rule.reply_type ?? "text",
    reply_text: (rule.reply_text as string | null) ?? null,
    media_url: (rule.media_url as string | null) ?? null,
    media_caption: (rule.media_caption as string | null) ?? null,
    enabled: rule.enabled ?? true,
    match_case: rule.match_case ?? false,
    priority: rule.priority ?? 100,
    cooldown_seconds: rule.cooldown_seconds ?? 0,
    min_confidence:
      rule.min_confidence === null || rule.min_confidence === undefined
        ? null
        : normalizeMinConfidence(rule.min_confidence),
  });
}

export function buildRuleSet(
  rules: AnyRule[],
  meta: { workspaceId?: string | null; workspaceName?: string | null } = {},
): WaRuleSet {
  return {
    kind: WA_RULESET_KIND,
    version: WA_RULESET_VERSION,
    exported_at: new Date().toISOString(),
    source_workspace_id: meta.workspaceId ?? null,
    source_workspace_name: meta.workspaceName ?? null,
    rules: rules.map(toExportRule),
  };
}

export function parseRuleSet(raw: string): WaRuleSet {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  const parsed = waRuleSetSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` (at ${first.path.join(".")})` : "";
    throw new Error(
      `This does not look like a WA Chatbot rule set${where}: ${first?.message ?? "invalid file"}`,
    );
  }
  return parsed.data;
}

/** Turn an imported rule into a DB row for the target workspace. */
export function toInsertRow(
  rule: WaRuleExport,
  opts: { workspaceId: string; sessionId?: string | null; enabled?: boolean; nameSuffix?: string },
) {
  const name = opts.nameSuffix ? `${rule.name} ${opts.nameSuffix}`.trim() : rule.name;
  return {
    workspace_id: opts.workspaceId,
    session_id: opts.sessionId ?? null,
    name: name.slice(0, 200),
    trigger_type: rule.trigger_type,
    keywords: rule.keywords,
    reply_type: rule.reply_type,
    reply_text: rule.reply_text,
    media_url: rule.media_url,
    media_caption: rule.media_caption,
    enabled: opts.enabled ?? rule.enabled,
    match_case: rule.match_case,
    priority: rule.priority,
    cooldown_seconds: rule.cooldown_seconds,
    min_confidence:
      rule.min_confidence === null || rule.min_confidence === undefined
        ? undefined
        : normalizeMinConfidence(rule.min_confidence),
  };
}

export function ruleSetFilename(workspaceName?: string | null) {
  const slug = (workspaceName ?? "workspace")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";
  const date = new Date().toISOString().slice(0, 10);
  return `wa-chatbot-rules-${slug}-${date}.json`;
}

export function downloadRuleSet(set: WaRuleSet, filename: string) {
  const blob = new Blob([JSON.stringify(set, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
