/**
 * WA Chatbot live-handoff assignment engine.
 *
 * When an inbound WhatsApp (QR/Baileys) message triggers a `handoff` rule —
 * or an agent escalates manually — this module picks the agent who should own
 * the conversation and records the assignment.
 *
 * Selection strategies:
 *   - `round_robin`  least-recently-assigned eligible agent
 *   - `least_busy`   lowest current load, round-robin tiebreak
 *   - `skill`        best skill overlap first, then least busy
 *   - `auto`         skill → least busy → round robin
 *
 * Cooldown controls (per workspace, `wa_handoff_settings`):
 *   - `agent_cooldown_seconds`        an agent that was just assigned is
 *                                     skipped until the window elapses, so
 *                                     bursts spread across the team
 *   - `conversation_cooldown_seconds` a thread that was handed off recently is
 *                                     not re-routed again (prevents ping-pong
 *                                     when a customer sends several messages)
 *
 * Everything is best-effort: failures are returned, never thrown, because the
 * caller sits on the webhook ack path.
 */

import {
  selectWaHandoffAgent,
  WA_HANDOFF_DEFAULTS,
  type WaHandoffOutcome,
  type WaHandoffSettings,
  type WaHandoffStrategy,
} from "./wa-handoff-config";
import { sbAny } from "@/lib/supabase/untyped";

export type { WaHandoffOutcome, WaHandoffSettings, WaHandoffStrategy };
export { WA_HANDOFF_DEFAULTS, selectWaHandoffAgent };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

function coerceStrategy(value: unknown): WaHandoffStrategy {
  return value === "least_busy" || value === "skill" || value === "auto"
    ? value
    : "round_robin";
}

/** Load workspace settings, falling back to defaults when no row exists. */
export async function loadWaHandoffSettings(
  db: Db,
  workspaceId: string,
): Promise<WaHandoffSettings> {
  const { data } = await db
    .from("wa_handoff_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return { workspace_id: workspaceId, ...WA_HANDOFF_DEFAULTS };
  return {
    workspace_id: workspaceId,
    enabled: data.enabled !== false,
    strategy: coerceStrategy(data.strategy),
    required_skills: (data.required_skills ?? []) as string[],
    match_language: data.match_language !== false,
    respect_max_concurrent: data.respect_max_concurrent !== false,
    agent_cooldown_seconds: Number(data.agent_cooldown_seconds ?? 60),
    conversation_cooldown_seconds: Number(data.conversation_cooldown_seconds ?? 300),
    pause_bot_on_handoff: data.pause_bot_on_handoff !== false,
    queue_when_unavailable: data.queue_when_unavailable !== false,
    notify_message: (data.notify_message ?? null) as string | null,
  };
}

interface AgentRow {
  user_id: string;
  presence: string;
  skills: string[] | null;
  languages: string[] | null;
  max_concurrent: number | null;
  current_load: number | null;
  last_assigned_at: string | null;
}

async function loadAgents(db: Db, workspaceId: string): Promise<AgentRow[]> {
  const { data } = await db
    .from("agent_availability")
    .select(
      "user_id, presence, skills, languages, max_concurrent, current_load, last_assigned_at",
    )
    .eq("workspace_id", workspaceId);
  return (data ?? []) as AgentRow[];
}

/**
 * Route a WhatsApp conversation to a human agent.
 *
 * Writes: `conversations` (assignee + handoff state + bot pause),
 * `conversation_assignments` (audit trail), `handoff_events` (timeline) and,
 * when nobody is free, `handoff_queue`.
 */
export async function routeWaHandoff(
  db: Db,
  input: {
    workspaceId: string;
    conversationId: string;
    reason?: string;
    language?: string | null;
    requiredSkills?: string[];
    actorId?: string | null;
    ignoreConversationCooldown?: boolean;
  },
): Promise<WaHandoffOutcome> {
  const base: WaHandoffOutcome = {
    status: "skipped",
    agentId: null,
    strategy: "round_robin",
    reason: "",
    queuePosition: null,
    eligibleAgents: 0,
    cooledDownAgents: 0,
  };

  try {
    const settings = await loadWaHandoffSettings(db, input.workspaceId);
    base.strategy = settings.strategy;
    if (!settings.enabled) {
      return { ...base, status: "disabled", reason: "Handoff routing is disabled" };
    }

    const { data: convo } = await db
      .from("conversations")
      .select("id, workspace_id, assigned_to, metadata")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!convo) return { ...base, status: "error", reason: "Conversation not found" };

    const meta = (convo.metadata ?? {}) as Record<string, unknown>;
    const now = Date.now();

    // Conversation-level cooldown — avoid re-routing the same thread.
    if (!input.ignoreConversationCooldown && settings.conversation_cooldown_seconds > 0) {
      const last = typeof meta.wa_handoff_at === "string" ? Date.parse(meta.wa_handoff_at) : 0;
      if (Number.isFinite(last) && last > 0) {
        const elapsed = (now - last) / 1000;
        if (elapsed < settings.conversation_cooldown_seconds) {
          return {
            ...base,
            status: "skipped",
            reason: `Conversation handed off ${Math.round(elapsed)}s ago (cooldown ${settings.conversation_cooldown_seconds}s)`,
          };
        }
      }
    }

    const required = [
      ...new Set([...(settings.required_skills ?? []), ...(input.requiredSkills ?? [])]),
    ];
    const agents = await loadAgents(db, input.workspaceId);
    const picked = selectWaHandoffAgent(
      agents,
      { ...settings, required_skills: required },
      { language: input.language ?? null, now },
    );

    const nowIso = new Date(now).toISOString();
    const nextMeta = {
      ...meta,
      wa_handoff_at: nowIso,
      wa_handoff_strategy: settings.strategy,
      wa_handoff_reason: input.reason ?? "Handoff requested",
      ...(settings.pause_bot_on_handoff ? { wa_bot_paused: true } : {}),
    };

    if (!picked.agent) {
      if (!settings.queue_when_unavailable) {
        await db
          .from("conversations")
          .update({ metadata: nextMeta, handoff_state: "requested" })
          .eq("id", input.conversationId);
        return {
          ...base,
          status: "skipped",
          reason: "No agent available and queueing is off",
          eligibleAgents: picked.eligible,
          cooledDownAgents: picked.cooledDown,
        };
      }

      const { count } = await db
        .from("handoff_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", input.workspaceId)
        .eq("status", "waiting");

      const { data: alreadyQueued } = await db
        .from("handoff_queue")
        .select("id")
        .eq("conversation_id", input.conversationId)
        .eq("status", "waiting")
        .maybeSingle();

      if (!alreadyQueued) {
        await sbAny(db).from("handoff_queue").insert({
          workspace_id: input.workspaceId,
          conversation_id: input.conversationId,
          required_skills: required,
          reason: input.reason ?? "WhatsApp handoff requested",
          status: "waiting",
          requested_by: input.actorId ?? null,
          metadata: { source: "wa-chatbot", strategy: settings.strategy },
        });
      }

      await db
        .from("conversations")
        .update({ metadata: nextMeta, handoff_state: "queued" })
        .eq("id", input.conversationId);

      await sbAny(db).from("handoff_events").insert({
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        kind: "requested",
        actor_id: input.actorId ?? null,
        reason: input.reason ?? "WhatsApp handoff requested",
        metadata: { source: "wa-chatbot", strategy: settings.strategy, queued: true },
      });

      return {
        ...base,
        status: "queued",
        reason: "No agent available — queued",
        queuePosition: (count ?? 0) + 1,
        eligibleAgents: picked.eligible,
        cooledDownAgents: picked.cooledDown,
      };
    }

    const agentId = picked.agent.user_id;

    await db
      .from("conversations")
      .update({
        assigned_to: agentId,
        assigned_at: nowIso,
        handoff_state: "assigned",
        metadata: { ...nextMeta, wa_handoff_agent_id: agentId },
      })
      .eq("id", input.conversationId);

    // Close the previous assignment record, then open a new one.
    await db
      .from("conversation_assignments")
      .update({ is_current: false, unassigned_at: nowIso })
      .eq("conversation_id", input.conversationId)
      .eq("is_current", true);

    await sbAny(db).from("conversation_assignments").insert({
      workspace_id: input.workspaceId,
      conversation_id: input.conversationId,
      assigned_to: agentId,
      assigned_by: input.actorId ?? null,
      reason: input.reason ?? "WhatsApp handoff",
      is_current: true,
    });

    await sbAny(db).from("handoff_events").insert({
      workspace_id: input.workspaceId,
      conversation_id: input.conversationId,
      kind: "assigned",
      to_user_id: agentId,
      from_user_id: (convo.assigned_to as string | null) ?? null,
      actor_id: input.actorId ?? null,
      reason: input.reason ?? "WhatsApp handoff",
      metadata: {
        source: "wa-chatbot",
        strategy: settings.strategy,
        required_skills: required,
        eligible_agents: picked.eligible,
        cooled_down_agents: picked.cooledDown,
      },
    });

    // Fairness bookkeeping — powers round-robin + agent cooldown.
    await db
      .from("agent_availability")
      .update({
        last_assigned_at: nowIso,
        current_load: (picked.agent.current_load ?? 0) + 1,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", agentId);

    return {
      ...base,
      status: "assigned",
      agentId,
      reason: `Assigned via ${settings.strategy}`,
      eligibleAgents: picked.eligible,
      cooledDownAgents: picked.cooledDown,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      reason: err instanceof Error ? err.message : "Handoff routing failed",
    };
  }
}

/**
 * Route a WhatsApp conversation to an explicit destination, bypassing the
 * automatic strategy: either a named agent or straight into the waiting queue.
 *
 * Used by the "Assign to" control in the WA Chatbot inbox. Still writes the
 * same audit trail (`conversation_assignments`, `handoff_events`) and fairness
 * bookkeeping as automatic routing so analytics stay consistent.
 */
export async function assignWaHandoffToTarget(
  db: Db,
  input: {
    workspaceId: string;
    conversationId: string;
    target: { type: "agent"; agentId: string } | { type: "queue" };
    reason?: string;
    requiredSkills?: string[];
    actorId?: string | null;
  },
): Promise<WaHandoffOutcome> {
  const settings = await loadWaHandoffSettings(db, input.workspaceId);
  const base: WaHandoffOutcome = {
    status: "skipped",
    agentId: null,
    strategy: settings.strategy,
    reason: "",
    queuePosition: null,
    eligibleAgents: 0,
    cooledDownAgents: 0,
  };

  try {
    const { data: convo } = await db
      .from("conversations")
      .select("id, workspace_id, assigned_to, metadata")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!convo) return { ...base, status: "error", reason: "Conversation not found" };

    const nowIso = new Date().toISOString();
    const meta = (convo.metadata ?? {}) as Record<string, unknown>;
    const required = [...new Set(input.requiredSkills ?? [])];
    const nextMeta: Record<string, unknown> = {
      ...meta,
      wa_handoff_at: nowIso,
      wa_handoff_strategy: "manual",
      wa_handoff_reason: input.reason ?? "Manual handoff",
      ...(settings.pause_bot_on_handoff ? { wa_bot_paused: true } : {}),
    };

    if (input.target.type === "queue") {
      const { count } = await db
        .from("handoff_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", input.workspaceId)
        .eq("status", "waiting");

      const { data: alreadyQueued } = await db
        .from("handoff_queue")
        .select("id")
        .eq("conversation_id", input.conversationId)
        .eq("status", "waiting")
        .maybeSingle();

      if (!alreadyQueued) {
        const { error } = await sbAny(db).from("handoff_queue").insert({
          workspace_id: input.workspaceId,
          conversation_id: input.conversationId,
          required_skills: required,
          reason: input.reason ?? "Queued manually",
          status: "waiting",
          requested_by: input.actorId ?? null,
          metadata: { source: "wa-chatbot", strategy: "manual" },
        });
        if (error) return { ...base, status: "error", reason: error.message };
      }

      // Queueing clears any current owner so nobody thinks it is handled.
      await db
        .from("conversations")
        .update({ assigned_to: null, handoff_state: "queued", metadata: nextMeta })
        .eq("id", input.conversationId);

      await db
        .from("conversation_assignments")
        .update({ is_current: false, unassigned_at: nowIso })
        .eq("conversation_id", input.conversationId)
        .eq("is_current", true);

      await sbAny(db).from("handoff_events").insert({
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        kind: "requested",
        from_user_id: (convo.assigned_to as string | null) ?? null,
        actor_id: input.actorId ?? null,
        reason: input.reason ?? "Queued manually",
        metadata: { source: "wa-chatbot", strategy: "manual", queued: true },
      });

      return {
        ...base,
        status: "queued",
        reason: alreadyQueued ? "Already waiting in the queue" : "Added to the handoff queue",
        queuePosition: alreadyQueued ? null : (count ?? 0) + 1,
      };
    }

    const agentId = input.target.agentId;
    const { data: agent } = await db
      .from("agent_availability")
      .select("user_id, current_load")
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", agentId)
      .maybeSingle();
    if (!agent) {
      return { ...base, status: "error", reason: "That agent is not part of this workspace" };
    }

    await db
      .from("conversations")
      .update({
        assigned_to: agentId,
        assigned_at: nowIso,
        handoff_state: "assigned",
        metadata: { ...nextMeta, wa_handoff_agent_id: agentId },
      })
      .eq("id", input.conversationId);

    await db
      .from("conversation_assignments")
      .update({ is_current: false, unassigned_at: nowIso })
      .eq("conversation_id", input.conversationId)
      .eq("is_current", true);

    await sbAny(db).from("conversation_assignments").insert({
      workspace_id: input.workspaceId,
      conversation_id: input.conversationId,
      assigned_to: agentId,
      assigned_by: input.actorId ?? null,
      reason: input.reason ?? "Manual handoff",
      is_current: true,
    });

    // A direct assignment resolves any pending queue entry for this thread.
    await db
      .from("handoff_queue")
      .update({ status: "assigned", assigned_to: agentId, assigned_at: nowIso })
      .eq("conversation_id", input.conversationId)
      .eq("status", "waiting");

    await sbAny(db).from("handoff_events").insert({
      workspace_id: input.workspaceId,
      conversation_id: input.conversationId,
      kind: "assigned",
      to_user_id: agentId,
      from_user_id: (convo.assigned_to as string | null) ?? null,
      actor_id: input.actorId ?? null,
      reason: input.reason ?? "Manual handoff",
      metadata: { source: "wa-chatbot", strategy: "manual", manual_target: "agent" },
    });

    await db
      .from("agent_availability")
      .update({
        last_assigned_at: nowIso,
        current_load: (agent.current_load ?? 0) + 1,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", agentId);

    return { ...base, status: "assigned", agentId, reason: "Assigned manually" };
  } catch (err) {
    return {
      ...base,
      status: "error",
      reason: err instanceof Error ? err.message : "Manual handoff failed",
    };
  }
}
