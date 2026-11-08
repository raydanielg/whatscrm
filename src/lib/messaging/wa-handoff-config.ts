/**
 * WA Chatbot handoff routing — shared types, defaults and the pure agent
 * selection algorithm. Client-safe: no database or server-only imports, so
 * both the UI and the server engine can use it.
 */

export type WaHandoffStrategy = "round_robin" | "least_busy" | "skill" | "auto";

export interface WaHandoffSettings {
  workspace_id: string;
  enabled: boolean;
  strategy: WaHandoffStrategy;
  required_skills: string[];
  match_language: boolean;
  respect_max_concurrent: boolean;
  agent_cooldown_seconds: number;
  conversation_cooldown_seconds: number;
  pause_bot_on_handoff: boolean;
  queue_when_unavailable: boolean;
  notify_message: string | null;
}

export const WA_HANDOFF_DEFAULTS: Omit<WaHandoffSettings, "workspace_id"> = {
  enabled: true,
  strategy: "round_robin",
  required_skills: [],
  match_language: true,
  respect_max_concurrent: true,
  agent_cooldown_seconds: 60,
  conversation_cooldown_seconds: 300,
  pause_bot_on_handoff: true,
  queue_when_unavailable: true,
  notify_message: null,
};

export interface WaHandoffOutcome {
  status: "assigned" | "queued" | "skipped" | "disabled" | "error";
  agentId: string | null;
  strategy: WaHandoffStrategy;
  reason: string;
  queuePosition: number | null;
  eligibleAgents: number;
  cooledDownAgents: number;
}

export interface AgentRow {
  user_id: string;
  presence: string;
  skills: string[] | null;
  languages: string[] | null;
  max_concurrent: number | null;
  current_load: number | null;
  last_assigned_at: string | null;
}

function lower(list: string[] | null | undefined): string[] {
  return (list ?? []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
}

function skillScore(agent: AgentRow, required: string[]): number {
  if (!required.length) return 0;
  const have = new Set(lower(agent.skills));
  return required.filter((s) => have.has(s)).length;
}

function lastAssignedMs(agent: AgentRow): number {
  const v = agent.last_assigned_at ? Date.parse(agent.last_assigned_at) : 0;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Pure selection so the simulator/tests can exercise it without a database.
 * Returns the winner plus how many candidates were filtered by cooldown.
 */
export function selectWaHandoffAgent(
  agents: AgentRow[],
  settings: Pick<
    WaHandoffSettings,
    | "strategy"
    | "required_skills"
    | "match_language"
    | "respect_max_concurrent"
    | "agent_cooldown_seconds"
  >,
  opts: { language?: string | null; now?: number } = {},
): { agent: AgentRow | null; eligible: number; cooledDown: number } {
  const now = opts.now ?? Date.now();
  const required = lower(settings.required_skills);
  const lang = opts.language ? opts.language.toLowerCase() : null;

  let pool = agents.filter((a) => a.presence === "online");

  if (settings.respect_max_concurrent) {
    pool = pool.filter(
      (a) => (a.current_load ?? 0) < Math.max(1, a.max_concurrent ?? 1),
    );
  }
  if (settings.match_language && lang) {
    const withLang = pool.filter((a) => {
      const langs = lower(a.languages);
      return langs.length === 0 || langs.includes(lang);
    });
    // Never starve the queue: fall back to the full pool if nobody speaks it.
    if (withLang.length) pool = withLang;
  }
  if (required.length && (settings.strategy === "skill" || settings.strategy === "auto")) {
    const skilled = pool.filter((a) => skillScore(a, required) === required.length);
    if (skilled.length) pool = skilled;
  } else if (required.length) {
    const skilled = pool.filter((a) => skillScore(a, required) === required.length);
    if (skilled.length) pool = skilled;
  }

  const eligible = pool.length;

  const cooldownMs = Math.max(0, settings.agent_cooldown_seconds) * 1000;
  let cooled = pool;
  let cooledDown = 0;
  if (cooldownMs > 0) {
    cooled = pool.filter((a) => now - lastAssignedMs(a) >= cooldownMs);
    cooledDown = pool.length - cooled.length;
    // If everyone is cooling down we still assign — availability beats fairness.
    if (!cooled.length) cooled = pool;
  }
  if (!cooled.length) return { agent: null, eligible, cooledDown };

  const sorted = [...cooled].sort((a, b) => {
    if (settings.strategy === "skill" || settings.strategy === "auto") {
      const diff = skillScore(b, required) - skillScore(a, required);
      if (diff !== 0) return diff;
    }
    if (settings.strategy !== "round_robin") {
      const load = (a.current_load ?? 0) - (b.current_load ?? 0);
      if (load !== 0) return load;
    }
    return lastAssignedMs(a) - lastAssignedMs(b);
  });

  return { agent: sorted[0] ?? null, eligible, cooledDown };
}

