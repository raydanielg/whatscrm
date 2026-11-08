/**
 * Satisfaction Management — Phase 21.
 *
 * Unified surveys: CSAT, NPS, CES, Emoji/Star ratings, Feedback forms,
 * Written reviews, Follow-up surveys. Backed by csat_surveys + csat_responses
 * with template/automation tables. Everything supports automation via the
 * `survey_automations` table (workflow triggers) and the shared workflow engine.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin).from("workspace_members")
    .select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data) throw new Error("No workspace found");
  return (data as { workspace_id: string }).workspace_id;
}

/* ============================ Types ============================ */

const questionSchema = z.object({
  id: z.string(),
  type: z.enum(["stars_5", "stars_10", "emoji_3", "emoji_5", "nps", "ces", "csat_5", "text", "long_text", "multi_choice", "single_choice", "yes_no"]),
  label: z.string(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
});

const surveyInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  survey_type: z.enum(["csat", "nps", "ces", "custom"]).default("csat"),
  questions: z.array(questionSchema).min(1),
  question: z.string().optional(),
  scale: z.string().default("stars_5"),
  channel: z.enum(["email", "sms", "whatsapp", "in_app", "web"]).default("email"),
  send_on: z.string().default("resolved"),
  delay_minutes: z.number().int().min(0).max(60 * 24 * 30).default(0),
  is_active: z.boolean().default(true),
  follow_up_survey_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
  thank_you_message: z.string().nullable().optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  target_audience: z.record(z.string(), z.unknown()).optional(),
  automation_config: z.record(z.string(), z.unknown()).optional(),
});

/* ============================ Surveys CRUD ============================ */

export const listSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    type: z.enum(["csat", "nps", "ces", "custom", "all"]).default("all"),
    active: z.boolean().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let q = sbAny(context.supabase).from("csat_surveys")
      .select("*").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (data.type !== "all") q = q.eq("survey_type", data.type);
    if (typeof data.active === "boolean") q = q.eq("is_active", data.active);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getSurvey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: row, error } = await sbAny(context.supabase).from("csat_surveys")
      .select("*").eq("id", data.id).eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Survey not found");
    return row;
  });

export const saveSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => surveyInput.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = {
      workspace_id: workspaceId,
      name: data.name,
      description: data.description ?? null,
      survey_type: data.survey_type,
      questions: data.questions,
      question: data.question ?? data.questions[0]?.label ?? "How would you rate this experience?",
      scale: data.scale,
      channel: data.channel,
      send_on: data.send_on,
      delay_minutes: data.delay_minutes,
      is_active: data.is_active,
      follow_up_survey_id: data.follow_up_survey_id ?? null,
      department_id: data.department_id ?? null,
      template_id: data.template_id ?? null,
      thank_you_message: data.thank_you_message ?? null,
      branding: data.branding ?? {},
      target_audience: data.target_audience ?? {},
      automation_config: data.automation_config ?? {},
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("csat_surveys")
        .update(payload as never).eq("id", data.id).eq("workspace_id", workspaceId).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("csat_surveys")
      .insert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("csat_surveys")
      .delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: src, error } = await sbAny(context.supabase).from("csat_surveys")
      .select("*").eq("id", data.id).eq("workspace_id", workspaceId).single();
    if (error) throw new Error(error.message);
    const clone = { ...(src as Record<string, unknown>) };
    delete clone.id; delete clone.created_at; delete clone.updated_at; delete clone.public_token;
    clone.name = `${(src as { name: string }).name} (copy)`;
    clone.is_active = false;
    const { data: inserted, error: iErr } = await sbAny(context.supabase).from("csat_surveys")
      .insert(clone as never).select().single();
    if (iErr) throw new Error(iErr.message);
    return inserted;
  });

/* ============================ Responses ============================ */

export const listResponses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    survey_id: z.string().uuid().optional(),
    agent_id: z.string().uuid().optional(),
    department_id: z.string().uuid().optional(),
    score_type: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let q = sbAny(context.supabase).from("csat_responses")
      .select("*").eq("workspace_id", workspaceId)
      .order("submitted_at", { ascending: false }).limit(data.limit);
    if (data.survey_id) q = q.eq("survey_id", data.survey_id);
    if (data.agent_id) q = q.eq("agent_id", data.agent_id);
    if (data.department_id) q = q.eq("department_id", data.department_id);
    if (data.score_type) q = q.eq("score_type", data.score_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const publishReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid(), is_published: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("csat_responses")
      .update({ is_published: data.is_published }).eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Analytics ============================ */

type Resp = {
  rating: number | null;
  nps_score: number | null;
  ces_score: number | null;
  score_type: string | null;
  agent_id: string | null;
  department_id: string | null;
  comment: string | null;
  sentiment: string | null;
  submitted_at: string;
};

function computeMetrics(rows: Resp[]) {
  const csatRows = rows.filter((r) => r.rating != null);
  const npsRows = rows.filter((r) => r.nps_score != null);
  const cesRows = rows.filter((r) => r.ces_score != null);
  const csatAvg = csatRows.length ? csatRows.reduce((s, r) => s + (r.rating || 0), 0) / csatRows.length : 0;
  const csatPct = csatRows.length ? (csatRows.filter((r) => (r.rating || 0) >= 4).length / csatRows.length) * 100 : 0;
  const promoters = npsRows.filter((r) => (r.nps_score || 0) >= 9).length;
  const detractors = npsRows.filter((r) => (r.nps_score || 0) <= 6).length;
  const nps = npsRows.length ? ((promoters - detractors) / npsRows.length) * 100 : 0;
  const cesAvg = cesRows.length ? cesRows.reduce((s, r) => s + (r.ces_score || 0), 0) / cesRows.length : 0;
  return {
    total: rows.length,
    csat_count: csatRows.length,
    csat_avg: Math.round(csatAvg * 100) / 100,
    csat_pct: Math.round(csatPct * 10) / 10,
    nps_count: npsRows.length,
    nps: Math.round(nps * 10) / 10,
    promoters,
    passives: npsRows.length - promoters - detractors,
    detractors,
    ces_count: cesRows.length,
    ces_avg: Math.round(cesAvg * 100) / 100,
  };
}

export const satisfactionAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    days: z.number().int().min(1).max(365).default(30),
    survey_id: z.string().uuid().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    let q = sbAny(context.supabase).from("csat_responses")
      .select("rating, nps_score, ces_score, score_type, agent_id, department_id, comment, sentiment, submitted_at")
      .eq("workspace_id", workspaceId).gte("submitted_at", since);
    if (data.survey_id) q = q.eq("survey_id", data.survey_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const responses = (rows ?? []) as Resp[];
    const metrics = computeMetrics(responses);

    // Trend by day
    const byDay = new Map<string, Resp[]>();
    for (const r of responses) {
      const d = r.submitted_at.slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(r);
    }
    const trend = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({
      day, ...computeMetrics(list),
    }));

    // Sentiment breakdown
    const sentiment = { positive: 0, neutral: 0, negative: 0 } as Record<string, number>;
    for (const r of responses) if (r.sentiment) sentiment[r.sentiment] = (sentiment[r.sentiment] ?? 0) + 1;

    return { metrics, trend, sentiment, recent: responses.slice(0, 20) };
  });

export const agentRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await sbAny(context.supabase).from("csat_responses")
      .select("agent_id, rating, nps_score, ces_score, submitted_at")
      .eq("workspace_id", workspaceId).gte("submitted_at", since).not("agent_id", "is", null);
    if (error) throw new Error(error.message);
    const byAgent = new Map<string, Resp[]>();
    for (const r of (rows ?? []) as Resp[]) {
      const key = r.agent_id!;
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(r);
    }
    const agentIds = Array.from(byAgent.keys());
    let profiles: Array<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }> = [];
    if (agentIds.length) {
      const { data: p } = await sbAny(context.supabase).from("profiles")
        .select("id, full_name, email, avatar_url").in("id", agentIds);
      profiles = (p ?? []) as typeof profiles;
    }
    const nameMap = new Map(profiles.map((p) => [p.id, p]));
    return agentIds.map((id) => {
      const list = byAgent.get(id)!;
      const m = computeMetrics(list);
      const profile = nameMap.get(id);
      return {
        agent_id: id,
        name: profile?.full_name ?? profile?.email ?? "Agent",
        avatar_url: profile?.avatar_url ?? null,
        response_count: list.length,
        csat_avg: m.csat_avg,
        csat_pct: m.csat_pct,
        nps: m.nps,
        ces_avg: m.ces_avg,
      };
    }).sort((a, b) => b.csat_avg - a.csat_avg);
  });

export const departmentRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await sbAny(context.supabase).from("csat_responses")
      .select("department_id, rating, nps_score, ces_score, submitted_at")
      .eq("workspace_id", workspaceId).gte("submitted_at", since).not("department_id", "is", null);
    if (error) throw new Error(error.message);
    const byDep = new Map<string, Resp[]>();
    for (const r of (rows ?? []) as Resp[]) {
      const key = r.department_id!;
      if (!byDep.has(key)) byDep.set(key, []);
      byDep.get(key)!.push(r);
    }
    const ids = Array.from(byDep.keys());
    let deps: Array<{ id: string; name: string }> = [];
    if (ids.length) {
      const { data: d } = await sbAny(context.supabase).from("departments").select("id, name").in("id", ids);
      deps = (d ?? []) as typeof deps;
    }
    const nameMap = new Map(deps.map((d) => [d.id, d.name]));
    return ids.map((id) => {
      const list = byDep.get(id)!;
      const m = computeMetrics(list);
      return {
        department_id: id,
        name: nameMap.get(id) ?? "Department",
        response_count: list.length,
        csat_avg: m.csat_avg,
        csat_pct: m.csat_pct,
        nps: m.nps,
        ces_avg: m.ces_avg,
      };
    }).sort((a, b) => b.csat_avg - a.csat_avg);
  });

/* ============================ Templates ============================ */

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data, error } = await sbAny(context.supabase).from("survey_templates")
      .select("*").or(`is_system.eq.true,workspace_id.eq.${workspaceId}`)
      .order("is_system", { ascending: false }).order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    survey_type: z.enum(["csat", "nps", "ces", "custom"]).default("csat"),
    category: z.string().optional().nullable(),
    questions: z.array(questionSchema).min(1),
    default_config: z.record(z.string(), z.unknown()).default({}),
    icon: z.string().optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = { ...data, workspace_id: workspaceId, is_system: false, created_by: context.userId };
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("survey_templates")
        .update(payload as never).eq("id", data.id).eq("workspace_id", workspaceId).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("survey_templates")
      .insert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const useTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ template_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: tpl, error } = await sbAny(context.supabase).from("survey_templates")
      .select("*").eq("id", data.template_id).single();
    if (error) throw new Error(error.message);
    const t = tpl as { name: string; description: string | null; survey_type: string; questions: unknown; default_config: Record<string, unknown> };
    const cfg = t.default_config ?? {};
    const { data: row, error: iErr } = await sbAny(context.supabase).from("csat_surveys").insert({
      workspace_id: workspaceId,
      name: t.name,
      description: t.description,
      survey_type: t.survey_type,
      questions: t.questions,
      question: (t.questions as Array<{ label: string }>)?.[0]?.label ?? "Rate your experience",
      scale: (cfg.scale as string) ?? "stars_5",
      channel: (cfg.channel as string) ?? "email",
      send_on: (cfg.send_on as string) ?? "manual",
      delay_minutes: (cfg.delay_minutes as number) ?? 0,
      template_id: data.template_id,
      is_active: false,
      created_by: context.userId,
    } as never).select().single();

    if (iErr) throw new Error(iErr.message);
    // Increment usage
    await sbAny(context.supabase).from("survey_templates").update({ usage_count: ((tpl as { usage_count: number }).usage_count ?? 0) + 1 })
      .eq("id", data.template_id);
    return row;
  });

/* ============================ Automations ============================ */

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data, error } = await sbAny(context.supabase).from("survey_automations")
      .select("*, csat_surveys(name, survey_type)").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    survey_id: z.string().uuid(),
    name: z.string().min(1),
    trigger_type: z.enum(["event", "schedule", "workflow", "manual"]),
    trigger_event: z.string().optional().nullable(),
    trigger_config: z.record(z.string(), z.unknown()).default({}),
    filters: z.record(z.string(), z.unknown()).default({}),
    channel: z.enum(["email", "sms", "whatsapp", "in_app", "web"]).default("email"),
    delay_minutes: z.number().int().min(0).default(0),
    workflow_id: z.string().uuid().optional().nullable(),
    is_active: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = { ...data, workspace_id: workspaceId, created_by: context.userId };
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("survey_automations")
        .update(payload as never).eq("id", data.id).eq("workspace_id", workspaceId).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("survey_automations")
      .insert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("survey_automations")
      .update({ is_active: data.is_active }).eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("survey_automations")
      .delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Send / Trigger ============================ */

/**
 * Send a survey manually (or from a workflow node) to a contact or ticket.
 * Creates an outbound message via message_outbox — actual delivery handled
 * by the messaging engine.
 */
export const sendSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    survey_id: z.string().uuid(),
    contact_id: z.string().uuid().optional(),
    ticket_id: z.string().uuid().optional(),
    agent_id: z.string().uuid().optional(),
    department_id: z.string().uuid().optional(),
    channel: z.enum(["email", "sms", "whatsapp", "in_app", "web"]).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: survey, error } = await sbAny(context.supabase).from("csat_surveys")
      .select("*").eq("id", data.survey_id).eq("workspace_id", workspaceId).single();
    if (error) throw new Error(error.message);
    const s = survey as { public_token: string; name: string; channel: string; thank_you_message: string | null };
    const channel = data.channel ?? s.channel;
    const link = `/s/${s.public_token}?tid=${data.ticket_id ?? ""}&aid=${data.agent_id ?? ""}&did=${data.department_id ?? ""}`;
    // Record a pending response row so agent/dep attribution flows through
    const { data: pending } = await sbAny(context.supabase).from("csat_responses").insert({
      workspace_id: workspaceId,
      survey_id: data.survey_id,
      ticket_id: data.ticket_id ?? null,
      contact_id: data.contact_id ?? null,
      agent_id: data.agent_id ?? null,
      department_id: data.department_id ?? null,
      metadata: { channel, sent_at: new Date().toISOString(), status: "sent" },
    } as never).select("id, response_token").single();

    return {
      ok: true,
      channel,
      link,
      response_token: (pending as { response_token: string } | null)?.response_token,
      survey_name: s.name,
    };
  });
