import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  WA_HANDOFF_DEFAULTS,
  type WaHandoffSettings,
} from "./wa-handoff-config";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * WA Chatbot handoff routing — settings, live agent pool and manual routing.
 *
 * All reads use the caller's RLS-scoped client so workspace membership is
 * enforced by the database. Privileged writes (assignment bookkeeping) happen
 * only after that membership check succeeds.
 */

const strategySchema = z.enum(["round_robin", "least_busy", "skill", "auto"]);

export const WA_HANDOFF_STRATEGY_LABEL: Record<
  z.infer<typeof strategySchema>,
  string
> = {
  round_robin: "Round robin",
  least_busy: "Least busy",
  skill: "Skills based",
  auto: "Auto (skills → least busy)",
};

export interface WaHandoffAgent {
  userId: string;
  name: string;
  presence: string;
  skills: string[];
  languages: string[];
  currentLoad: number;
  maxConcurrent: number;
  lastAssignedAt: string | null;
  coolingDownFor: number;
}

export const getWaHandoffOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { workspaceId } = data;

    const [settingsRes, agentsRes, queueRes] = await Promise.all([
      supabase
        .from("wa_handoff_settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("agent_availability")
        .select(
          "user_id, presence, skills, languages, max_concurrent, current_load, last_assigned_at",
        )
        .eq("workspace_id", workspaceId),
      supabase
        .from("handoff_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "waiting"),
    ]);

    const row = settingsRes.data as Record<string, unknown> | null;
    const settings: WaHandoffSettings = row
      ? {
          workspace_id: workspaceId,
          enabled: row.enabled !== false,
          strategy: strategySchema.catch("round_robin").parse(row.strategy),
          required_skills: (row.required_skills ?? []) as string[],
          match_language: row.match_language !== false,
          respect_max_concurrent: row.respect_max_concurrent !== false,
          agent_cooldown_seconds: Number(row.agent_cooldown_seconds ?? 60),
          conversation_cooldown_seconds: Number(row.conversation_cooldown_seconds ?? 300),
          pause_bot_on_handoff: row.pause_bot_on_handoff !== false,
          queue_when_unavailable: row.queue_when_unavailable !== false,
          notify_message: (row.notify_message ?? null) as string | null,
        }
      : { workspace_id: workspaceId, ...WA_HANDOFF_DEFAULTS };

    const rows = (agentsRes.data ?? []) as Array<{
      user_id: string;
      presence: string;
      skills: string[] | null;
      languages: string[] | null;
      max_concurrent: number | null;
      current_load: number | null;
      last_assigned_at: string | null;
    }>;

    let names: Record<string, string> = {};
    if (rows.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in(
          "id",
          rows.map((r) => r.user_id),
        );
      names = Object.fromEntries(
        ((profs ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>).map(
          (p) => [p.id, p.display_name || p.email || "Agent"],
        ),
      );
    }

    const now = Date.now();
    const cooldownMs = Math.max(0, settings.agent_cooldown_seconds) * 1000;
    const agents: WaHandoffAgent[] = rows.map((r) => {
      const last = r.last_assigned_at ? Date.parse(r.last_assigned_at) : 0;
      const remaining =
        cooldownMs > 0 && last > 0
          ? Math.max(0, Math.ceil((last + cooldownMs - now) / 1000))
          : 0;
      return {
        userId: r.user_id,
        name: names[r.user_id] ?? "Agent",
        presence: r.presence ?? "offline",
        skills: r.skills ?? [],
        languages: r.languages ?? [],
        currentLoad: r.current_load ?? 0,
        maxConcurrent: r.max_concurrent ?? 1,
        lastAssignedAt: r.last_assigned_at,
        coolingDownFor: remaining,
      };
    });

    return {
      settings,
      agents,
      waitingInQueue: queueRes.count ?? 0,
    };
  });

const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  enabled: z.boolean(),
  strategy: strategySchema,
  requiredSkills: z.array(z.string().trim().min(1).max(64)).max(20),
  matchLanguage: z.boolean(),
  respectMaxConcurrent: z.boolean(),
  agentCooldownSeconds: z.number().int().min(0).max(86400),
  conversationCooldownSeconds: z.number().int().min(0).max(86400),
  pauseBotOnHandoff: z.boolean(),
  queueWhenUnavailable: z.boolean(),
  notifyMessage: z.string().max(1000).nullable(),
});

export const updateWaHandoffSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await sbAny(supabase).from("wa_handoff_settings").upsert(
      {
        workspace_id: data.workspaceId,
        enabled: data.enabled,
        strategy: data.strategy,
        required_skills: data.requiredSkills,
        match_language: data.matchLanguage,
        respect_max_concurrent: data.respectMaxConcurrent,
        agent_cooldown_seconds: data.agentCooldownSeconds,
        conversation_cooldown_seconds: data.conversationCooldownSeconds,
        pause_bot_on_handoff: data.pauseBotOnHandoff,
        queue_when_unavailable: data.queueWhenUnavailable,
        notify_message: data.notifyMessage,
      } as never,
      { onConflict: "workspace_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const routeSchema = z.object({
  conversationId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  requiredSkills: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  ignoreConversationCooldown: z.boolean().optional(),
});

/** Manually route a WhatsApp conversation to the next eligible agent. */
export const routeWaConversationToAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => routeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS membership check before any privileged write.
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, workspace_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!convo) throw new Error("Conversation not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { routeWaHandoff } = await import("./wa-handoff-routing.server");

    return routeWaHandoff(supabaseAdmin, {
      workspaceId: convo.workspace_id as string,
      conversationId: convo.id as string,
      reason: data.reason ?? "Manual handoff from the WA Chatbot inbox",
      requiredSkills: data.requiredSkills,
      actorId: userId,
      ignoreConversationCooldown: data.ignoreConversationCooldown ?? true,
    });
  });

const targetSchema = z.object({
  conversationId: z.string().uuid(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("agent"), agentId: z.string().uuid() }),
    z.object({ type: z.literal("queue") }),
  ]),
  reason: z.string().max(500).optional(),
  requiredSkills: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

/**
 * Assign a handoff request to an explicit destination — a named agent or the
 * waiting queue — instead of letting the workspace strategy decide.
 */
export const assignWaHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS membership check before any privileged write.
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, workspace_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!convo) throw new Error("Conversation not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { assignWaHandoffToTarget } = await import("./wa-handoff-routing.server");

    return assignWaHandoffToTarget(supabaseAdmin, {
      workspaceId: convo.workspace_id as string,
      conversationId: convo.id as string,
      target: data.target,
      reason:
        data.reason ??
        (data.target.type === "queue"
          ? "Queued from the WA Chatbot inbox"
          : "Assigned from the WA Chatbot inbox"),
      requiredSkills: data.requiredSkills,
      actorId: userId,
    });
  });
