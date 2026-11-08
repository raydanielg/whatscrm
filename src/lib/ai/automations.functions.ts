/**
 * AI Automations — analyzes CRM entities and produces suggested actions
 * (create task, follow-up, assign agent, move pipeline, notes, tags,
 * status, campaign, upsell). Suggestions can require optional user
 * confirmation before execution.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "./complete.functions";
import type { AIMessage, ChatRequest } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

export const AUTOMATION_TYPES = [
  "create_task",
  "suggest_followup",
  "assign_agent",
  "move_pipeline_stage",
  "create_note",
  "meeting_summary",
  "crm_notes",
  "suggest_tags",
  "generate_labels",
  "update_customer_status",
  "recommend_campaign",
  "detect_upsell",
] as const;

export type AutomationType = (typeof AUTOMATION_TYPES)[number];

export const AUTOMATION_META: Record<
  AutomationType,
  { label: string; description: string; entities: string[] }
> = {
  create_task: {
    label: "Create tasks",
    description: "Create follow-up tasks from conversation context.",
    entities: ["conversation", "lead", "deal"],
  },
  suggest_followup: {
    label: "Suggest follow-ups",
    description: "Recommend when and how to follow up with a customer.",
    entities: ["conversation", "lead", "contact"],
  },
  assign_agent: {
    label: "Assign agents",
    description: "Recommend the best-fit agent for a conversation.",
    entities: ["conversation"],
  },
  move_pipeline_stage: {
    label: "Move pipeline stage",
    description: "Move deals to the next stage when signals warrant it.",
    entities: ["deal"],
  },
  create_note: {
    label: "Create internal notes",
    description: "Add internal notes with key context automatically.",
    entities: ["conversation", "lead", "contact", "deal"],
  },
  meeting_summary: {
    label: "Meeting summaries",
    description: "Summarize meetings and post them as internal notes.",
    entities: ["conversation"],
  },
  crm_notes: {
    label: "CRM notes",
    description: "Write structured CRM notes from interactions.",
    entities: ["contact", "lead"],
  },
  suggest_tags: {
    label: "Suggest tags",
    description: "Suggest tags that describe the customer or deal.",
    entities: ["contact", "lead", "conversation", "deal"],
  },
  generate_labels: {
    label: "Generate labels",
    description: "Suggest inbox labels for the conversation.",
    entities: ["conversation"],
  },
  update_customer_status: {
    label: "Update customer status",
    description: "Recommend status updates (lead status, lifecycle).",
    entities: ["contact", "lead"],
  },
  recommend_campaign: {
    label: "Recommend campaigns",
    description: "Recommend a campaign to enroll the contact in.",
    entities: ["contact", "lead"],
  },
  detect_upsell: {
    label: "Detect upsell",
    description: "Detect upsell / cross-sell opportunities.",
    entities: ["contact", "deal", "conversation"],
  },
};

export type SuggestionStatus =
  "pending" | "approved" | "applied" | "rejected" | "failed" | "expired";

export interface AutomationConfig {
  id: string;
  workspaceId: string;
  automationType: AutomationType;
  enabled: boolean;
  requireConfirmation: boolean;
  autoApplyThreshold: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  updatedAt: string;
}

export interface AutomationSuggestion {
  id: string;
  workspaceId: string;
  automationType: AutomationType;
  entityType: string;
  entityId: string | null;
  title: string;
  summary: string | null;
  rationale: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  confidence: number | null;
  status: SuggestionStatus;
  requiresConfirmation: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appliedResult: any | null;
  errorMessage: string | null;
  model: string | null;
  tokensUsed: number;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapConfig(r: any): AutomationConfig {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    automationType: r.automation_type,
    enabled: !!r.enabled,
    requireConfirmation: r.require_confirmation !== false,
    autoApplyThreshold: r.auto_apply_threshold ?? null,
    config: r.config ?? {},
    updatedAt: r.updated_at,
  };
}
function mapSuggestion(r: any): AutomationSuggestion {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    automationType: r.automation_type,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    title: r.title,
    summary: r.summary ?? null,
    rationale: r.rationale ?? null,
    payload: r.payload ?? {},
    confidence: r.confidence ?? null,
    status: r.status,
    requiresConfirmation: r.requires_confirmation !== false,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    appliedAt: r.applied_at ?? null,
    appliedResult: r.applied_result ?? null,
    errorMessage: r.error_message ?? null,
    model: r.model ?? null,
    tokensUsed: r.tokens_used ?? 0,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------------- Config API ---------------- */

export const listAutomationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AutomationConfig[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("ai_automation_config" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    const map = new Map<string, AutomationConfig>();
    for (const r of (rows ?? []) as unknown[]) {
      const c = mapConfig(r);
      map.set(c.automationType, c);
    }
    // Return one row per known type (default off + require_confirmation)
    return AUTOMATION_TYPES.map(
      (t) =>
        map.get(t) ?? {
          id: `virtual:${t}`,
          workspaceId: data.workspaceId,
          automationType: t,
          enabled: false,
          requireConfirmation: true,
          autoApplyThreshold: 0.85,
          config: {},
          updatedAt: new Date(0).toISOString(),
        },
    );
  });

export const updateAutomationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        automationType: z.enum(AUTOMATION_TYPES),
        enabled: z.boolean().optional(),
        requireConfirmation: z.boolean().optional(),
        autoApplyThreshold: z.number().min(0).max(1).nullable().optional(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AutomationConfig> => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {
      workspace_id: data.workspaceId,
      automation_type: data.automationType,
      updated_by: userId,
    };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.requireConfirmation !== undefined)
      patch.require_confirmation = data.requireConfirmation;
    if (data.autoApplyThreshold !== undefined) patch.auto_apply_threshold = data.autoApplyThreshold;
    if (data.config !== undefined) patch.config = data.config;
    const { data: row, error } = await supabase
      .from("ai_automation_config" as never)
      .upsert(patch as never, { onConflict: "workspace_id,automation_type" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mapConfig(row);
  });

/* ---------------- Suggestions list ---------------- */

export const listSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z
          .enum(["pending", "approved", "applied", "rejected", "failed", "expired", "all"])
          .optional(),
        entityType: z.string().optional(),
        entityId: z.string().uuid().optional(),
        limit: z.number().min(1).max(200).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AutomationSuggestion[]> => {
    const { supabase } = context;
    let q = supabase
      .from("ai_automation_suggestions" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown[]).map(mapSuggestion);
  });

export const rejectSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("ai_automation_suggestions" as never)
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Context aggregation ---------------- */

function safeJsonParse(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const s = trimmed.indexOf("{"),
    e = trimmed.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(trimmed.slice(s, e + 1));
    } catch {}
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadEntity(
  supabase: any,
  workspaceId: string,
  entityType: string,
  entityId: string,
): Promise<{ card: string; extra: string }> {
  if (entityType === "conversation") {
    const { data: conv } = await supabase
      .from("conversations")
      .select(
        "id, subject, channel, status, priority, last_message_at, ai_summary, contact_id, assigned_to",
      )
      .eq("id", entityId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!conv) return { card: "", extra: "" };
    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, body, message_type, created_at")
      .eq("conversation_id", entityId)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .limit(20);
    const transcript = ((msgs ?? []) as any[])
      .reverse()
      .filter((m) => (m.body ?? "").trim())
      .map((m) => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`)
      .join("\n")
      .slice(0, 6000);
    return {
      card: `Conversation ${conv.id}\nSubject: ${conv.subject ?? "(none)"}\nChannel: ${conv.channel}\nStatus: ${conv.status}\nPriority: ${conv.priority}\nAI summary: ${conv.ai_summary ?? "—"}`,
      extra: transcript ? `TRANSCRIPT:\n${transcript}` : "",
    };
  }
  if (entityType === "lead") {
    const { data: lead } = await sbAny(supabase)
      .from("leads")
      .select(
        "id, first_name, last_name, full_name, email, phone, company_name, job_title, status, score, rating, notes, tags, source",
      )
      .eq("id", entityId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!lead) return { card: "", extra: "" };
    return {
      card: `Lead ${lead.full_name ?? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`}\nCompany: ${lead.company_name ?? "—"}\nEmail: ${lead.email ?? "—"} • Phone: ${lead.phone ?? "—"}\nStatus: ${lead.status} • Score: ${lead.score}\nRating: ${lead.rating ?? "—"} • Source: ${lead.source ?? "—"}\nTags: ${(lead.tags ?? []).join(", ") || "—"}\nNotes: ${lead.notes ?? "—"}`,
      extra: "",
    };
  }
  if (entityType === "contact") {
    const { data: c } = await sbAny(supabase)
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, company_id, tags, status, lifecycle_stage, custom_fields",
      )
      .eq("id", entityId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!c) return { card: "", extra: "" };
    return {
      card: `Contact ${c.first_name ?? ""} ${c.last_name ?? ""}\nEmail: ${c.email ?? "—"} • Phone: ${c.phone ?? "—"}\nStatus: ${c.status ?? "—"} • Lifecycle: ${c.lifecycle_stage ?? "—"}\nTags: ${(c.tags ?? []).join(", ") || "—"}`,
      extra: "",
    };
  }
  if (entityType === "deal") {
    const { data: d } = await sbAny(supabase)
      .from("deals")
      .select(
        "id, name, amount, currency, stage_id, pipeline_id, probability, expected_close_date, status, contact_id, tags, notes",
      )
      .eq("id", entityId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!d) return { card: "", extra: "" };
    return {
      card: `Deal "${d.name}"\nAmount: ${d.amount ?? "—"} ${d.currency ?? ""}\nStage: ${d.stage_id ?? "—"} • Probability: ${d.probability ?? "—"}\nExpected close: ${d.expected_close_date ?? "—"} • Status: ${d.status ?? "—"}\nTags: ${(d.tags ?? []).join(", ") || "—"}\nNotes: ${d.notes ?? "—"}`,
      extra: "",
    };
  }
  return { card: "", extra: "" };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------------- Analyze & suggest ---------------- */

const SuggestionOutSchema = z.object({
  suggestions: z
    .array(
      z.object({
        automation_type: z.enum(AUTOMATION_TYPES),
        title: z.string(),
        summary: z.string().optional().nullable(),
        rationale: z.string().optional().nullable(),
        confidence: z.number().min(0).max(1).optional().nullable(),
        payload: z.record(z.unknown()).default({}),
      }),
    )
    .default([]),
});

export const analyzeAndSuggest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        entityType: z.enum(["conversation", "lead", "contact", "deal"]),
        entityId: z.string().uuid(),
        types: z.array(z.enum(AUTOMATION_TYPES)).optional(),
      })
      .parse(v),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ created: AutomationSuggestion[]; skipped: AutomationType[] }> => {
      const { supabase, userId } = context;

      // Load enabled config
      const { data: cfgRows } = await supabase
        .from("ai_automation_config" as never)
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("enabled", true);
      const enabledMap = new Map<AutomationType, AutomationConfig>();
      for (const r of (cfgRows ?? []) as unknown[]) {
        const c = mapConfig(r);
        enabledMap.set(c.automationType, c);
      }

      // Filter to types relevant for this entity + requested
      const applicable = AUTOMATION_TYPES.filter(
        (t) =>
          enabledMap.has(t) &&
          AUTOMATION_META[t].entities.includes(data.entityType) &&
          (!data.types || data.types.includes(t)),
      );

      if (applicable.length === 0) {
        return { created: [], skipped: AUTOMATION_TYPES.slice() };
      }

      const { card, extra } = await loadEntity(
        supabase,
        data.workspaceId,
        data.entityType,
        data.entityId,
      );
      if (!card) throw new Error("Entity not found");

      const typesBlock = applicable
        .map((t) => `- ${t}: ${AUTOMATION_META[t].label} — ${AUTOMATION_META[t].description}`)
        .join("\n");

      const systemPrompt = `You are an AI CRM automation engine. Given a CRM entity and its context, output high-value action suggestions.

Return ONLY strict JSON. No prose. No code fences. Shape:
{
  "suggestions": [
    {
      "automation_type": "<one of the allowed types>",
      "title": "short imperative title",
      "summary": "one-line summary shown to the reviewer",
      "rationale": "1-2 sentence justification from evidence",
      "confidence": 0..1,
      "payload": { ...type-specific fields... }
    }
  ]
}

Payload schemas per type:
- create_task: { "title": string, "description"?: string, "due_in_days"?: int, "priority"?: "low|normal|high|urgent" }
- suggest_followup: { "channel"?: string, "message": string, "when_in_hours"?: int }
- assign_agent: { "criteria": string, "suggested_role"?: "senior|billing|technical|sales", "reason": string }
- move_pipeline_stage: { "to_stage": string, "reason": string }
- create_note: { "body": string }
- meeting_summary: { "body": string, "highlights": string[] }
- crm_notes: { "body": string, "fields_touched"?: string[] }
- suggest_tags: { "tags": string[] }
- generate_labels: { "labels": string[] }
- update_customer_status: { "status": string, "reason": string }
- recommend_campaign: { "campaign_theme": string, "reason": string }
- detect_upsell: { "opportunity": string, "estimated_value"?: number, "currency"?: string, "reason": string }

Only produce a suggestion when it is clearly warranted. Skip entirely when there is insufficient signal. Keep at most 5 suggestions total. Never invent identifiers or PII. Use only the ALLOWED_TYPES.

ALLOWED_TYPES:
${typesBlock}`;

      const userPrompt = [`ENTITY_TYPE: ${data.entityType}`, `ENTITY:\n${card}`, extra]
        .filter(Boolean)
        .join("\n\n");

      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const req: ChatRequest = {
        model: await resolveDefaultModel(data.workspaceId),
        messages,
        temperature: 0.3,
        max_tokens: 1600,
        response_format: "json_object",
      };

      const res = await runChat({
        workspaceId: data.workspaceId,
        userId,
        feature: "automations",
        request: req,
      });

      const parsed = safeJsonParse(res.content || "");
      const validated = SuggestionOutSchema.safeParse(parsed);
      if (!validated.success) {
        return { created: [], skipped: applicable };
      }

      const rowsToInsert = validated.data.suggestions
        .filter((s) => enabledMap.has(s.automation_type))
        .map((s) => {
          const cfg = enabledMap.get(s.automation_type)!;
          const conf = s.confidence ?? null;
          const autoApply =
            !cfg.requireConfirmation ||
            (cfg.autoApplyThreshold !== null && conf !== null && conf >= cfg.autoApplyThreshold);
          return {
            workspace_id: data.workspaceId,
            automation_type: s.automation_type,
            entity_type: data.entityType,
            entity_id: data.entityId,
            title: s.title,
            summary: s.summary ?? null,
            rationale: s.rationale ?? null,
            confidence: conf,
            payload: s.payload ?? {},
            status: autoApply ? "approved" : "pending",
            requires_confirmation: cfg.requireConfirmation,
            created_by_ai: true,
            suggested_by: userId,
            model: res.model,
            tokens_used: res.usage?.total_tokens ?? 0,
          };
        });

      if (rowsToInsert.length === 0) {
        return { created: [], skipped: applicable };
      }

      const { data: inserted, error: insErr } = await supabase
        .from("ai_automation_suggestions" as never)
        .insert(rowsToInsert as never)
        .select("*");
      if (insErr) throw new Error(insErr.message);

      const created = ((inserted ?? []) as unknown[]).map(mapSuggestion);

      // Auto-apply the ones that don't need confirmation
      for (const s of created) {
        if (s.status === "approved") {
          try {
            await applySuggestionInternal(supabase, userId, s);
          } catch {
            // errors are captured on the row inside applySuggestionInternal
          }
        }
      }

      return { created, skipped: [] };
    },
  );

/* ---------------- Apply suggestion ---------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
async function applySuggestionInternal(
  supabase: any,
  userId: string,
  s: AutomationSuggestion,
): Promise<{ ok: boolean; result?: any; error?: string }> {
  try {
    let result: any = null;
    const p = s.payload as Record<string, unknown>;

    switch (s.automationType) {
      case "create_task":
      case "suggest_followup": {
        const title = (p.title as string) ?? s.title;
        const description = (p.description as string) ?? (p.message as string) ?? s.summary ?? null;
        const dueInHours =
          typeof p.when_in_hours === "number"
            ? (p.when_in_hours as number)
            : typeof p.due_in_days === "number"
              ? (p.due_in_days as number) * 24
              : 24;
        const priority = ((p.priority as string) ?? "normal") as string;
        const { data: t, error } = await sbAny(supabase)
          .from("tasks")
          .insert({
            workspace_id: s.workspaceId,
            title,
            description,
            priority,
            due_at: new Date(Date.now() + Math.max(0, dueInHours) * 3_600_000).toISOString(),
            entity_type: s.entityType,
            entity_id: s.entityId,
            created_by: userId,
          })
          .select("id")
          .maybeSingle();
        if (error) throw error;
        result = { task_id: t?.id };
        break;
      }
      case "assign_agent": {
        // Recommendation only — we do not auto-reassign; leave as note-worthy result.
        result = { note: "recommendation stored", criteria: p.criteria };
        break;
      }
      case "move_pipeline_stage": {
        if (s.entityType !== "deal" || !s.entityId) throw new Error("Requires deal");
        const toStage = p.to_stage as string;
        // Try to resolve to_stage as either UUID or stage name
        let stageId = toStage;
        if (!/^[0-9a-f-]{36}$/i.test(toStage)) {
          const { data: st } = await sbAny(supabase)
            .from("deal_stages")
            .select("id")
            .ilike("name", toStage)
            .limit(1)
            .maybeSingle();
          stageId = st?.id ?? toStage;
        }
        const { error } = await sbAny(supabase)
          .from("deals")
          .update({ stage_id: stageId })
          .eq("id", s.entityId)
          .eq("workspace_id", s.workspaceId);
        if (error) throw error;
        result = { stage_id: stageId };
        break;
      }
      case "create_note":
      case "meeting_summary":
      case "crm_notes": {
        const body = (p.body as string) ?? s.summary ?? s.title;
        if (s.entityType === "conversation" && s.entityId) {
          const { error } = await sbAny(supabase).from("conversation_notes").insert({
            workspace_id: s.workspaceId,
            conversation_id: s.entityId,
            author_id: userId,
            body,
          });
          if (error) throw error;
          result = { conversation_note: true };
        } else {
          const { error } = await sbAny(supabase).from("notes").insert({
            workspace_id: s.workspaceId,
            body,
            entity_type: s.entityType,
            entity_id: s.entityId,
            // `notes` has no created_by column; RLS requires author_id = auth.uid().
            author_id: userId,
          });
          if (error) throw error;
          result = { note: true };
        }
        break;
      }
      case "suggest_tags": {
        const tags = (p.tags as string[]) ?? [];
        if (!Array.isArray(tags) || !tags.length) throw new Error("No tags");
        if (s.entityType === "lead" && s.entityId) {
          const { data: cur } = await sbAny(supabase)
            .from("leads")
            .select("tags")
            .eq("id", s.entityId)
            .maybeSingle();
          const merged = Array.from(new Set([...(cur?.tags ?? []), ...tags]));
          const { error } = await sbAny(supabase)
            .from("leads")
            .update({ tags: merged })
            .eq("id", s.entityId);
          if (error) throw error;
        } else if (s.entityType === "contact" && s.entityId) {
          const { data: cur } = await sbAny(supabase)
            .from("contacts")
            .select("tags")
            .eq("id", s.entityId)
            .maybeSingle();
          const merged = Array.from(new Set([...(cur?.tags ?? []), ...tags]));
          const { error } = await sbAny(supabase)
            .from("contacts")
            .update({ tags: merged })
            .eq("id", s.entityId);
          if (error) throw error;
        } else if (s.entityType === "deal" && s.entityId) {
          const { data: cur } = await sbAny(supabase)
            .from("deals")
            .select("tags")
            .eq("id", s.entityId)
            .maybeSingle();
          const merged = Array.from(new Set([...(cur?.tags ?? []), ...tags]));
          const { error } = await sbAny(supabase)
            .from("deals")
            .update({ tags: merged })
            .eq("id", s.entityId);
          if (error) throw error;
        }
        result = { tags };
        break;
      }
      case "generate_labels": {
        const labels = (p.labels as string[]) ?? [];
        if (!Array.isArray(labels) || !labels.length) throw new Error("No labels");
        if (s.entityType !== "conversation" || !s.entityId)
          throw new Error("Requires conversation");
        // Ensure labels exist, then assign
        for (const name of labels) {
          const { data: existing } = await sbAny(supabase)
            .from("conversation_labels")
            .select("id")
            .eq("workspace_id", s.workspaceId)
            .ilike("name", name)
            .maybeSingle();
          let labelId = existing?.id as string | undefined;
          if (!labelId) {
            const { data: created } = await sbAny(supabase)
              .from("conversation_labels")
              .insert({ workspace_id: s.workspaceId, name, color: "#6366f1" })
              .select("id")
              .maybeSingle();
            labelId = created?.id;
          }
          if (labelId) {
            await sbAny(supabase)
              .from("conversation_label_assignments")
              .upsert(
                { workspace_id: s.workspaceId, conversation_id: s.entityId, label_id: labelId },
                { onConflict: "conversation_id,label_id" },
              );
          }
        }
        result = { labels };
        break;
      }
      case "update_customer_status": {
        const status = p.status as string;
        if (!status) throw new Error("No status");
        if (s.entityType === "lead" && s.entityId) {
          const { error } = await sbAny(supabase)
            .from("leads")
            .update({ status })
            .eq("id", s.entityId);
          if (error) throw error;
        } else if (s.entityType === "contact" && s.entityId) {
          const { error } = await sbAny(supabase)
            .from("contacts")
            .update({ status })
            .eq("id", s.entityId);
          if (error) throw error;
        }
        result = { status };
        break;
      }
      case "recommend_campaign": {
        // Recommendation stored on the suggestion; do not enroll automatically.
        result = { recommendation: p.campaign_theme };
        break;
      }
      case "detect_upsell": {
        // Store as an internal note on the entity for the sales team
        const body = `Upsell opportunity: ${p.opportunity ?? s.title}${p.estimated_value ? ` (est. ${p.estimated_value} ${p.currency ?? ""})` : ""}. Reason: ${p.reason ?? s.rationale ?? "—"}`;
        if (s.entityType === "conversation" && s.entityId) {
          await sbAny(supabase).from("conversation_notes").insert({
            workspace_id: s.workspaceId,
            conversation_id: s.entityId,
            author_id: userId,
            body,
          });
        } else {
          await sbAny(supabase).from("notes").insert({
            workspace_id: s.workspaceId,
            body,
            entity_type: s.entityType,
            entity_id: s.entityId,
            author_id: userId,
          });
        }
        result = { note: body };
        break;
      }
    }

    const { error } = await sbAny(supabase)
      .from("ai_automation_suggestions")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_result: result,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", s.id);
    if (error) throw error;
    return { ok: true, result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to apply";
    await sbAny(supabase)
      .from("ai_automation_suggestions")
      .update({ status: "failed", error_message: msg })
      .eq("id", s.id);
    return { ok: false, error: msg };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const applySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_automation_suggestions" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Suggestion not found");
    const s = mapSuggestion(row);
    if (s.status === "applied") return { ok: true, alreadyApplied: true };
    return applySuggestionInternal(supabase, userId, s);
  });
