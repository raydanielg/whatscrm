/**
 * Intelligent Routing Engine — decides how an incoming widget session
 * should be handled AND which agent should own it.
 *
 * Evaluates workspace routing rules in priority order and matches on:
 *   - pages, keywords, country, language
 *   - business hours (open/closed)
 *   - visitor VIP flag, visitor priority
 *   - required skills (agent must have all)
 *   - custom conditions (jsonb, key/value equality on visitor metadata)
 *
 * When the rule (or fallback) picks a human, an agent is selected using a
 * strategy: round_robin, least_busy, department, skill, or auto (skill →
 * least_busy → round_robin). VIP visitors always get least_busy on VIP-
 * capable agents so they see the fastest response.
 *
 * Falls back to `{ route_to: 'ai' }` so the default UX is "AI answers,
 * keyword-triggered handoff to humans".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type RouteTo = "ai" | "department" | "agent" | "queue";
export type RoutingStrategy =
  | "auto"
  | "round_robin"
  | "least_busy"
  | "department"
  | "skill";

export interface RoutingContext {
  workspaceId: string;
  page?: string | null;
  message?: string | null;
  country?: string | null;
  language?: string | null;
  chatbotId?: string | null;
  visitorId?: string | null;
  visitorIsVip?: boolean;
  visitorPriority?: "low" | "normal" | "high" | "urgent" | null;
  visitorMetadata?: Record<string, unknown> | null;
  now?: Date;
}

export interface RoutingDecision {
  ruleId: string | null;
  route_to: RouteTo;
  departmentId: string | null;
  agentId: string | null;
  chatbotId: string | null;
  autoMessage: string | null;
  strategy: RoutingStrategy;
  reason: string;
  queuePosition: number | null;
  estimatedWaitSeconds: number | null;
}

interface RoutingRuleRow {
  id: string;
  priority: number;
  enabled: boolean;
  match_pages: string[];
  match_keywords: string[];
  match_country: string[];
  match_language: string[];
  match_business_hours: boolean | null;
  match_vip: boolean | null;
  match_priority: string[];
  required_skills: string[];
  strategy: string;
  custom_conditions: Record<string, unknown> | null;
  route_to: string;
  department_id: string | null;
  agent_id: string | null;
  chatbot_id: string | null;
  auto_message: string | null;
}

interface AgentRow {
  user_id: string;
  presence: string;
  skills: string[];
  departments: string[];
  languages: string[];
  max_concurrent: number;
  current_load: number;
  last_assigned_at: string | null;
  last_active_at: string | null;
}

function ruleMatches(
  rule: RoutingRuleRow,
  ctx: RoutingContext,
  inHours: boolean,
): boolean {
  if (rule.match_business_hours === true && !inHours) return false;
  if (rule.match_business_hours === false && inHours) return false;

  if (rule.match_vip === true && !ctx.visitorIsVip) return false;
  if (rule.match_vip === false && ctx.visitorIsVip) return false;

  if (rule.match_priority.length) {
    const p = (ctx.visitorPriority ?? "normal").toLowerCase();
    if (!rule.match_priority.map((x) => x.toLowerCase()).includes(p)) return false;
  }

  if (rule.match_pages.length) {
    const page = (ctx.page ?? "").toLowerCase();
    if (!rule.match_pages.some((p) => page.includes(p.toLowerCase()))) return false;
  }
  if (rule.match_keywords.length) {
    const msg = (ctx.message ?? "").toLowerCase();
    if (!rule.match_keywords.some((k) => msg.includes(k.toLowerCase()))) return false;
  }
  if (rule.match_country.length) {
    const c = (ctx.country ?? "").toUpperCase();
    if (!c || !rule.match_country.map((x) => x.toUpperCase()).includes(c)) return false;
  }
  if (rule.match_language.length) {
    const l = (ctx.language ?? "").toLowerCase();
    if (!l || !rule.match_language.map((x) => x.toLowerCase()).includes(l)) return false;
  }

  const conds = rule.custom_conditions ?? {};
  const meta = ctx.visitorMetadata ?? {};
  for (const [k, v] of Object.entries(conds)) {
    if ((meta as Record<string, unknown>)[k] !== v) return false;
  }
  return true;
}

async function isBusinessHoursOpen(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date,
): Promise<boolean> {
  const { data } = await admin
    .from("business_hours")
    .select("day_of_week, start_time, end_time, is_open, timezone")
    .eq("workspace_id", workspaceId);
  if (!data || (data as unknown[]).length === 0) return true;
  const rows = data as Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_open: boolean;
    timezone: string | null;
  }>;
  const tz = rows[0]?.timezone ?? "UTC";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const nowT = `${hh}:${mm}:00`;
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = map[wk] ?? 0;
  const today = rows.find((r) => r.day_of_week === dow && r.is_open);
  if (!today) return false;
  return nowT >= today.start_time && nowT <= today.end_time;
}

function isOnline(a: AgentRow): boolean {
  if (a.presence !== "online") return false;
  return a.current_load < Math.max(1, a.max_concurrent);
}

function agentMatches(
  a: AgentRow,
  opts: {
    departmentId?: string | null;
    language?: string | null;
    requiredSkills?: string[];
  },
): boolean {
  if (opts.departmentId && !(a.departments ?? []).includes(opts.departmentId)) {
    return false;
  }
  if (opts.language && a.languages.length) {
    if (!a.languages.map((x) => x.toLowerCase()).includes(opts.language.toLowerCase())) {
      return false;
    }
  }
  if (opts.requiredSkills && opts.requiredSkills.length) {
    const skills = new Set((a.skills ?? []).map((s) => s.toLowerCase()));
    if (!opts.requiredSkills.every((s) => skills.has(s.toLowerCase()))) return false;
  }
  return true;
}

function selectAgent(
  agents: AgentRow[],
  strategy: RoutingStrategy,
): AgentRow | null {
  if (!agents.length) return null;
  if (strategy === "round_robin") {
    // Least-recently-assigned first.
    return [...agents].sort((a, b) => {
      const av = a.last_assigned_at ? Date.parse(a.last_assigned_at) : 0;
      const bv = b.last_assigned_at ? Date.parse(b.last_assigned_at) : 0;
      return av - bv;
    })[0]!;
  }
  // least_busy / skill / department / auto all favour lowest load, then round-robin tiebreak.
  return [...agents].sort((a, b) => {
    if (a.current_load !== b.current_load) return a.current_load - b.current_load;
    const av = a.last_assigned_at ? Date.parse(a.last_assigned_at) : 0;
    const bv = b.last_assigned_at ? Date.parse(b.last_assigned_at) : 0;
    return av - bv;
  })[0]!;
}

async function loadAgents(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<AgentRow[]> {
  const [{ data: avail }, { data: members }] = await Promise.all([
    admin
      .from("agent_availability")
      .select(
        "user_id, presence, skills, departments, languages, max_concurrent, current_load, last_assigned_at, last_active_at",
      )
      .eq("workspace_id", workspaceId),
    admin
      .from("department_members")
      .select("department_id, user_id")
      .eq("workspace_id", workspaceId),
  ]);
  const memberMap = new Map<string, Set<string>>();
  for (const m of (members ?? []) as { department_id: string; user_id: string }[]) {
    const set = memberMap.get(m.user_id) ?? new Set<string>();
    set.add(m.department_id);
    memberMap.set(m.user_id, set);
  }
  return ((avail ?? []) as AgentRow[]).map((a) => ({
    ...a,
    departments: [
      ...new Set([...(a.departments ?? []), ...Array.from(memberMap.get(a.user_id) ?? [])]),
    ],
  }));
}

async function estimateQueueWait(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<{ position: number; seconds: number }> {
  const { count } = await admin
    .from("handoff_queue")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "waiting");
  const position = (count ?? 0) + 1;
  // Heuristic: 90s per person ahead.
  return { position, seconds: position * 90 };
}

export async function decideRouting(ctx: RoutingContext): Promise<RoutingDecision> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const now = ctx.now ?? new Date();

  const [{ data: rulesData }, inHours, agents, visitor] = await Promise.all([
    admin
      .from("livechat_routing_rules")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .eq("enabled", true)
      .order("priority", { ascending: true }),
    isBusinessHoursOpen(admin, ctx.workspaceId, now).catch(() => true),
    loadAgents(admin, ctx.workspaceId),
    ctx.visitorId
      ? admin
          .from("livechat_visitors")
          .select("is_vip, priority, language, country, metadata")
          .eq("id", ctx.visitorId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Enrich context from visitor row if not provided.
  const v = (visitor as { data: Record<string, unknown> | null }).data ?? null;
  const enriched: RoutingContext = {
    ...ctx,
    visitorIsVip: ctx.visitorIsVip ?? Boolean(v?.is_vip),
    visitorPriority:
      ctx.visitorPriority ??
      ((v?.priority as RoutingContext["visitorPriority"]) ?? "normal"),
    language: ctx.language ?? ((v?.language as string | null) ?? null),
    country: ctx.country ?? ((v?.country as string | null) ?? null),
    visitorMetadata:
      ctx.visitorMetadata ?? ((v?.metadata as Record<string, unknown> | null) ?? null),
  };

  const rules = (rulesData ?? []) as RoutingRuleRow[];
  const matched = rules.find((r) => ruleMatches(r, enriched, inHours)) ?? null;

  // Fast-track VIP visitors even without an explicit rule.
  if (!matched && enriched.visitorIsVip) {
    const pool = agents.filter(
      (a) => isOnline(a) && (a.skills ?? []).map((s) => s.toLowerCase()).includes("vip"),
    );
    const chosen = selectAgent(pool.length ? pool : agents.filter(isOnline), "least_busy");
    if (chosen) {
      return {
        ruleId: null,
        route_to: "agent",
        departmentId: null,
        agentId: chosen.user_id,
        chatbotId: enriched.chatbotId ?? null,
        autoMessage: null,
        strategy: "least_busy",
        reason: "VIP fast-track (least busy)",
        queuePosition: null,
        estimatedWaitSeconds: null,
      };
    }
  }

  if (matched) {
    const routeTo = (["ai", "department", "agent", "queue"] as const).includes(
      matched.route_to as RouteTo,
    )
      ? (matched.route_to as RouteTo)
      : "ai";
    const strategy = ([
      "auto",
      "round_robin",
      "least_busy",
      "department",
      "skill",
    ] as const).includes(matched.strategy as RoutingStrategy)
      ? (matched.strategy as RoutingStrategy)
      : "auto";

    // Explicit agent pinned in the rule wins.
    if (routeTo === "agent" && matched.agent_id) {
      return {
        ruleId: matched.id,
        route_to: "agent",
        departmentId: matched.department_id,
        agentId: matched.agent_id,
        chatbotId: matched.chatbot_id ?? enriched.chatbotId ?? null,
        autoMessage: matched.auto_message,
        strategy,
        reason: "Rule pinned agent",
        queuePosition: null,
        estimatedWaitSeconds: null,
      };
    }

    if (routeTo === "department" || routeTo === "agent") {
      const pool = agents.filter(
        (a) =>
          isOnline(a) &&
          agentMatches(a, {
            departmentId: matched.department_id,
            language: enriched.language ?? null,
            requiredSkills: matched.required_skills,
          }),
      );
      const chosen = selectAgent(pool, strategy);
      if (chosen) {
        return {
          ruleId: matched.id,
          route_to: "agent",
          departmentId: matched.department_id,
          agentId: chosen.user_id,
          chatbotId: matched.chatbot_id ?? enriched.chatbotId ?? null,
          autoMessage: matched.auto_message,
          strategy,
          reason: `${strategy} in ${matched.department_id ? "department" : "workspace"}`,
          queuePosition: null,
          estimatedWaitSeconds: null,
        };
      }
      // No agent available → queue with department context.
      const q = await estimateQueueWait(admin, ctx.workspaceId);
      return {
        ruleId: matched.id,
        route_to: "queue",
        departmentId: matched.department_id,
        agentId: null,
        chatbotId: matched.chatbot_id ?? enriched.chatbotId ?? null,
        autoMessage: matched.auto_message,
        strategy,
        reason: "No agent available — queued",
        queuePosition: q.position,
        estimatedWaitSeconds: q.seconds,
      };
    }

    if (routeTo === "queue") {
      const q = await estimateQueueWait(admin, ctx.workspaceId);
      return {
        ruleId: matched.id,
        route_to: "queue",
        departmentId: matched.department_id,
        agentId: null,
        chatbotId: matched.chatbot_id ?? enriched.chatbotId ?? null,
        autoMessage: matched.auto_message,
        strategy,
        reason: "Rule sends to queue",
        queuePosition: q.position,
        estimatedWaitSeconds: q.seconds,
      };
    }

    return {
      ruleId: matched.id,
      route_to: "ai",
      departmentId: null,
      agentId: null,
      chatbotId: matched.chatbot_id ?? enriched.chatbotId ?? null,
      autoMessage: matched.auto_message,
      strategy,
      reason: "Rule sends to AI",
      queuePosition: null,
      estimatedWaitSeconds: null,
    };
  }

  return {
    ruleId: null,
    route_to: "ai",
    departmentId: null,
    agentId: null,
    chatbotId: enriched.chatbotId ?? null,
    autoMessage: null,
    strategy: "auto",
    reason: "No rule matched — default AI",
    queuePosition: null,
    estimatedWaitSeconds: null,
  };
}

/** Record that an agent just got assigned — powers round-robin fairness. */
export async function markAgentAssigned(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  await admin
    .from("agent_availability")
    .update({
      last_assigned_at: new Date().toISOString(),
      current_load: (
        (
          (
            await admin
              .from("agent_availability")
              .select("current_load")
              .eq("workspace_id", workspaceId)
              .eq("user_id", userId)
              .maybeSingle()
          ).data as { current_load?: number } | null
        )?.current_load ?? 0
      ) + 1,
    } as never)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
}
