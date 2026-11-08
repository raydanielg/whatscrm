/**
 * Helpdesk Analytics — advanced filtering, timeseries, agent/department/category
 * breakdowns, SLA compliance, escalations, KB usage and CSAT.
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

const filterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  days: z.number().min(1).max(365).default(30),
  departmentId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  priority: z.string().optional(),
  channel: z.string().optional(),
});

type Filters = z.infer<typeof filterSchema>;

function windowFromFilters(f: Filters) {
  const to = f.to ? new Date(f.to) : new Date();
  const from = f.from ? new Date(f.from) : new Date(to.getTime() - f.days * 86400_000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

// Apply optional conversation-level filters to any postgrest builder (typed loosely).
type AnyBuilder = { eq: (c: string, v: string) => AnyBuilder };
function applyConvFilters<T>(qb: T, f: Filters): T {
  let q = qb as unknown as AnyBuilder;
  if (f.departmentId) q = q.eq("assigned_team_id", f.departmentId);
  if (f.categoryId) q = q.eq("ticket_category_id", f.categoryId);
  if (f.agentId) q = q.eq("assigned_to", f.agentId);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.channel) q = q.eq("channel", f.channel);
  return q as unknown as T;
}

const dayKey = (iso: string) => iso.slice(0, 10);
const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
const p90 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(0.9 * s.length))]);
};

/* ============================ Overview ============================ */

export const analyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);

    const createdBase = sbAny(context.supabase).from("conversations")
      .select("id, priority, status, channel, created_at, first_response_at, resolved_at, assigned_to, assigned_team_id, ticket_category_id, escalation_level")
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const openBase = sbAny(context.supabase).from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .in("status", ["open", "pending", "waiting"] as never);

    const [createdRes, openRes, slaRes, escRes, csatRes] = await Promise.all([
      applyConvFilters(createdBase, data),
      applyConvFilters(openBase, data),
      sbAny(context.supabase).from("ticket_sla_tracking")
        .select("id, first_response_breached, resolution_breached")
        .eq("workspace_id", workspaceId)
        .gte("created_at", fromIso).lte("created_at", toIso),
      sbAny(context.supabase).from("ticket_escalations")
        .select("id, created_at, level")
        .eq("workspace_id", workspaceId)
        .gte("created_at", fromIso).lte("created_at", toIso),
      sbAny(context.supabase).from("csat_responses")
        .select("rating, nps_score, score_type")
        .eq("workspace_id", workspaceId)
        .gte("submitted_at", fromIso).lte("submitted_at", toIso),
    ]);

    type Row = { id: string; priority: string; status: string; channel: string; created_at: string; first_response_at: string | null; resolved_at: string | null };
    const createdRows = (createdRes.data ?? []) as Row[];
    const slaRows = (slaRes.data ?? []) as Array<{ first_response_breached: boolean; resolution_breached: boolean }>;
    const escRows = (escRes.data ?? []) as Array<{ created_at: string; level: number }>;
    const csatRows = (csatRes.data ?? []) as Array<{ rating: number | null; nps_score: number | null; score_type: string | null }>;

    const resolvedRows = createdRows.filter((r) => r.resolved_at);
    const firstResp = createdRows.filter((r) => r.first_response_at)
      .map((r) => (new Date(r.first_response_at!).getTime() - new Date(r.created_at).getTime()) / 60000);
    const resolution = resolvedRows.map((r) => (new Date(r.resolved_at!).getTime() - new Date(r.created_at).getTime()) / 60000);

    const breaches = slaRows.filter((s) => s.first_response_breached || s.resolution_breached).length;
    const slaCompliance = slaRows.length ? Math.round((1 - breaches / slaRows.length) * 100) : 100;

    const csatRatings = csatRows.filter((r) => r.rating != null && (r.score_type === "csat" || r.score_type == null)).map((r) => r.rating!);
    const csatAvg = csatRatings.length ? +(csatRatings.reduce((a, b) => a + b, 0) / csatRatings.length).toFixed(2) : 0;
    const csatSatisfied = csatRatings.length ? Math.round((csatRatings.filter((r) => r >= 4).length / csatRatings.length) * 100) : 0;
    const nps = (() => {
      const ns = csatRows.filter((r) => r.nps_score != null).map((r) => r.nps_score!);
      if (!ns.length) return 0;
      const promoters = ns.filter((n) => n >= 9).length;
      const detractors = ns.filter((n) => n <= 6).length;
      return Math.round(((promoters - detractors) / ns.length) * 100);
    })();

    const days: Record<string, { day: string; created: number; resolved: number; escalations: number }> = {};
    const ensure = (k: string) => (days[k] ??= { day: k, created: 0, resolved: 0, escalations: 0 });
    for (const r of createdRows) {
      ensure(dayKey(r.created_at)).created++;
      if (r.resolved_at) ensure(dayKey(r.resolved_at)).resolved++;
    }
    for (const e of escRows) ensure(dayKey(e.created_at)).escalations++;

    const byPriority: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of createdRows) {
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
      byChannel[r.channel] = (byChannel[r.channel] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    return {
      created: createdRows.length,
      resolved: resolvedRows.length,
      open_count: openRes.count ?? 0,
      breached_count: breaches,
      sla_total: slaRows.length,
      sla_compliance_pct: slaCompliance,
      escalations: escRows.length,
      avg_first_response_min: avg(firstResp),
      p90_first_response_min: p90(firstResp),
      avg_resolution_min: avg(resolution),
      p90_resolution_min: p90(resolution),
      resolution_rate_pct: createdRows.length ? Math.round((resolvedRows.length / createdRows.length) * 100) : 0,
      csat_avg: csatAvg,
      csat_satisfied_pct: csatSatisfied,
      csat_responses: csatRatings.length,
      nps,
      timeseries: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
      by_priority: byPriority,
      by_channel: byChannel,
      by_status: byStatus,
    };
  });

/* ============================ Agent Performance ============================ */

export const agentPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);
    const base = sbAny(context.supabase).from("conversations")
      .select("id, assigned_to, created_at, first_response_at, resolved_at, status")
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .not("assigned_to", "is", null)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const { data: rows } = await applyConvFilters(base, data);
    const list = (rows ?? []) as Array<{ assigned_to: string; created_at: string; first_response_at: string | null; resolved_at: string | null }>;
    const agentIds = Array.from(new Set(list.map((r) => r.assigned_to)));
    const { data: profiles } = agentIds.length ? await sbAny(context.supabase).from("profiles")
      .select("id, display_name, avatar_url").in("id", agentIds) : { data: [] };
    const nameMap = new Map<string, { name: string; avatar: string | null }>();
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
      nameMap.set(p.id, { name: p.display_name ?? "Agent", avatar: p.avatar_url });
    }
    const { data: csat } = await sbAny(context.supabase).from("csat_responses")
      .select("agent_id, rating")
      .eq("workspace_id", workspaceId)
      .not("agent_id", "is", null)
      .gte("submitted_at", fromIso).lte("submitted_at", toIso);
    const csatMap = new Map<string, number[]>();
    for (const r of (csat ?? []) as Array<{ agent_id: string; rating: number | null }>) {
      if (r.rating == null) continue;
      const arr = csatMap.get(r.agent_id) ?? []; arr.push(r.rating); csatMap.set(r.agent_id, arr);
    }
    const groups: Record<string, { assigned: number; resolved: number; fr: number[]; res: number[] }> = {};
    for (const r of list) {
      const g = groups[r.assigned_to] ??= { assigned: 0, resolved: 0, fr: [], res: [] };
      g.assigned++;
      if (r.resolved_at) { g.resolved++; g.res.push((new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 60000); }
      if (r.first_response_at) g.fr.push((new Date(r.first_response_at).getTime() - new Date(r.created_at).getTime()) / 60000);
    }
    return Object.entries(groups).map(([id, g]) => {
      const meta = nameMap.get(id);
      const csatArr = csatMap.get(id) ?? [];
      return {
        agent_id: id,
        name: meta?.name ?? "Agent",
        avatar_url: meta?.avatar ?? null,
        assigned: g.assigned,
        resolved: g.resolved,
        resolution_rate: g.assigned ? Math.round((g.resolved / g.assigned) * 100) : 0,
        avg_first_response_min: avg(g.fr),
        avg_resolution_min: avg(g.res),
        csat_avg: csatArr.length ? +(csatArr.reduce((a, b) => a + b, 0) / csatArr.length).toFixed(2) : null,
        csat_responses: csatArr.length,
      };
    }).sort((a, b) => b.resolved - a.resolved);
  });

/* ============================ Department Performance ============================ */

export const departmentPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);
    const base = sbAny(context.supabase).from("conversations")
      .select("id, assigned_team_id, created_at, first_response_at, resolved_at")
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .not("assigned_team_id", "is", null)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const [{ data: rows }, { data: depts }] = await Promise.all([
      applyConvFilters(base, data),
      sbAny(context.supabase).from("departments").select("id, name, color").eq("workspace_id", workspaceId),
    ]);
    const list = (rows ?? []) as Array<{ assigned_team_id: string; created_at: string; first_response_at: string | null; resolved_at: string | null }>;
    const deptMap = new Map<string, { name: string; color: string }>();
    for (const d of (depts ?? []) as Array<{ id: string; name: string; color: string }>) deptMap.set(d.id, { name: d.name, color: d.color });
    const groups: Record<string, { total: number; resolved: number; fr: number[]; res: number[] }> = {};
    for (const r of list) {
      const g = groups[r.assigned_team_id] ??= { total: 0, resolved: 0, fr: [], res: [] };
      g.total++;
      if (r.resolved_at) { g.resolved++; g.res.push((new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 60000); }
      if (r.first_response_at) g.fr.push((new Date(r.first_response_at).getTime() - new Date(r.created_at).getTime()) / 60000);
    }
    return Object.entries(groups).map(([id, g]) => ({
      department_id: id,
      name: deptMap.get(id)?.name ?? "Department",
      color: deptMap.get(id)?.color ?? "#075E54",
      total: g.total,
      resolved: g.resolved,
      resolution_rate: g.total ? Math.round((g.resolved / g.total) * 100) : 0,
      avg_first_response_min: avg(g.fr),
      avg_resolution_min: avg(g.res),
    })).sort((a, b) => b.total - a.total);
  });

/* ============================ Issue Categories ============================ */

export const categoryBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);
    const base = sbAny(context.supabase).from("conversations")
      .select("id, ticket_category_id, resolved_at, created_at")
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .not("ticket_category_id", "is", null)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const [{ data: rows }, { data: cats }] = await Promise.all([
      applyConvFilters(base, data),
      sbAny(context.supabase).from("ticket_categories").select("id, name, color").eq("workspace_id", workspaceId),
    ]);
    const list = (rows ?? []) as Array<{ ticket_category_id: string; resolved_at: string | null; created_at: string }>;
    const catMap = new Map<string, { name: string; color: string }>();
    for (const c of (cats ?? []) as Array<{ id: string; name: string; color: string }>) catMap.set(c.id, { name: c.name, color: c.color });
    const groups: Record<string, { total: number; resolved: number }> = {};
    for (const r of list) {
      const g = groups[r.ticket_category_id] ??= { total: 0, resolved: 0 };
      g.total++;
      if (r.resolved_at) g.resolved++;
    }
    return Object.entries(groups).map(([id, g]) => ({
      category_id: id,
      name: catMap.get(id)?.name ?? "Category",
      color: catMap.get(id)?.color ?? "#075E54",
      total: g.total,
      resolved: g.resolved,
      resolution_rate: g.total ? Math.round((g.resolved / g.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  });

/* ============================ Escalation Trends ============================ */

export const escalationTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);
    const { data: rows } = await sbAny(context.supabase).from("ticket_escalations")
      .select("id, created_at, level, auto, reason")
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso).lte("created_at", toIso)
      .order("created_at", { ascending: true });
    const list = (rows ?? []) as Array<{ created_at: string; level: number; auto: boolean; reason: string | null }>;
    const days: Record<string, { day: string; l1: number; l2: number; l3: number; total: number }> = {};
    let auto = 0, manual = 0;
    const reasons: Record<string, number> = {};
    for (const r of list) {
      const k = dayKey(r.created_at);
      const d = days[k] ??= { day: k, l1: 0, l2: 0, l3: 0, total: 0 };
      d.total++;
      if (r.level <= 1) d.l1++;
      else if (r.level === 2) d.l2++;
      else d.l3++;
      if (r.auto) auto++; else manual++;
      const reason = r.reason ?? "unspecified";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    return {
      total: list.length,
      auto,
      manual,
      trend: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
      top_reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, count]) => ({ reason, count })),
    };
  });

/* ============================ SLA Compliance ============================ */

export const slaCompliance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);
    const { data: rows } = await sbAny(context.supabase).from("ticket_sla_tracking")
      .select("id, sla_policy_id, first_response_breached, resolution_breached, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const list = (rows ?? []) as Array<{ sla_policy_id: string | null; first_response_breached: boolean; resolution_breached: boolean; created_at: string }>;
    const total = list.length;
    const frBreach = list.filter((r) => r.first_response_breached).length;
    const resBreach = list.filter((r) => r.resolution_breached).length;
    const totalBreach = list.filter((r) => r.first_response_breached || r.resolution_breached).length;
    const policyIds = Array.from(new Set(list.map((r) => r.sla_policy_id).filter((x): x is string => !!x)));
    const { data: policies } = policyIds.length ? await sbAny(context.supabase).from("sla_policies")
      .select("id, name").in("id", policyIds) : { data: [] };
    const nameMap = new Map<string, string>();
    for (const p of (policies ?? []) as Array<{ id: string; name: string }>) nameMap.set(p.id, p.name);
    const groups: Record<string, { total: number; fr: number; res: number }> = {};
    for (const r of list) {
      const key = r.sla_policy_id ?? "unassigned";
      const g = groups[key] ??= { total: 0, fr: 0, res: 0 };
      g.total++;
      if (r.first_response_breached) g.fr++;
      if (r.resolution_breached) g.res++;
    }
    const days: Record<string, { day: string; total: number; breaches: number }> = {};
    for (const r of list) {
      const k = dayKey(r.created_at);
      const d = days[k] ??= { day: k, total: 0, breaches: 0 };
      d.total++;
      if (r.first_response_breached || r.resolution_breached) d.breaches++;
    }
    return {
      total,
      first_response_breaches: frBreach,
      resolution_breaches: resBreach,
      total_breaches: totalBreach,
      compliance_pct: total ? Math.round((1 - totalBreach / total) * 100) : 100,
      trend: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({
        day: d.day, compliance_pct: d.total ? Math.round((1 - d.breaches / d.total) * 100) : 100, total: d.total, breaches: d.breaches,
      })),
      by_policy: Object.entries(groups).map(([id, g]) => ({
        policy_id: id,
        name: id === "unassigned" ? "Unassigned" : (nameMap.get(id) ?? "Policy"),
        total: g.total,
        first_response_breaches: g.fr,
        resolution_breaches: g.res,
        compliance_pct: g.total ? Math.round((1 - (g.fr + g.res) / (g.total * 2)) * 100) : 100,
      })).sort((a, b) => b.total - a.total),
    };
  });

/* ============================ Knowledge Usage ============================ */

export const knowledgeUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => filterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { fromIso, toIso } = windowFromFilters(data);
    const { data: rows } = await sbAny(context.supabase).from("kb_article_events")
      .select("article_id, event_type, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const list = (rows ?? []) as Array<{ article_id: string; event_type: string; created_at: string }>;
    const byType: Record<string, number> = {};
    const byArticle: Record<string, { views: number; helpful: number; not_helpful: number; suggested: number }> = {};
    const days: Record<string, { day: string; views: number; suggested: number }> = {};
    for (const r of list) {
      byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
      const a = byArticle[r.article_id] ??= { views: 0, helpful: 0, not_helpful: 0, suggested: 0 };
      if (r.event_type === "view") a.views++;
      else if (r.event_type === "helpful") a.helpful++;
      else if (r.event_type === "not_helpful") a.not_helpful++;
      else if (r.event_type === "suggested") a.suggested++;
      const d = days[dayKey(r.created_at)] ??= { day: dayKey(r.created_at), views: 0, suggested: 0 };
      if (r.event_type === "view") d.views++;
      if (r.event_type === "suggested") d.suggested++;
    }
    const articleIds = Object.keys(byArticle);
    const { data: articles } = articleIds.length ? await sbAny(context.supabase).from("kb_articles")
      .select("id, title").in("id", articleIds) : { data: [] };
    const titleMap = new Map<string, string>();
    for (const a of (articles ?? []) as Array<{ id: string; title: string }>) titleMap.set(a.id, a.title);
    return {
      total_events: list.length,
      by_type: byType,
      trend: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
      top_articles: Object.entries(byArticle).map(([id, v]) => ({
        article_id: id,
        title: titleMap.get(id) ?? "Untitled",
        views: v.views, helpful: v.helpful, not_helpful: v.not_helpful, suggested: v.suggested,
        helpful_pct: v.helpful + v.not_helpful > 0 ? Math.round((v.helpful / (v.helpful + v.not_helpful)) * 100) : null,
      })).sort((a, b) => (b.views + b.suggested) - (a.views + a.suggested)).slice(0, 15),
    };
  });

/* ============================ Facets ============================ */

export const analyticsFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const [{ data: depts }, { data: cats }, { data: members }] = await Promise.all([
      sbAny(context.supabase).from("departments").select("id, name").eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
      sbAny(context.supabase).from("ticket_categories").select("id, name").eq("workspace_id", workspaceId).order("name"),
      sbAny(context.supabase).from("workspace_members").select("user_id").eq("workspace_id", workspaceId),
    ]);
    const memberIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await sbAny(context.supabase).from("profiles").select("id, display_name").in("id", memberIds)
      : { data: [] };
    const profMap = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) profMap.set(p.id, p.display_name ?? "Member");
    return {
      departments: (depts ?? []) as Array<{ id: string; name: string }>,
      categories: (cats ?? []) as Array<{ id: string; name: string }>,
      agents: memberIds.map((id) => ({ id, name: profMap.get(id) ?? "Member" })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
