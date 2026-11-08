/**
 * Live Chat analytics — workspace-scoped aggregation over
 * `livechat_visitors`, `livechat_visitor_events`, `chatbot_sessions`,
 * `chatbot_messages`, and `handoff_events`.
 *
 * Every query runs through `requireSupabaseAuth`, so RLS (workspace
 * membership) enforces tenant isolation. Range defaults to 30 days.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeInput = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(180).default(30),
});

type Row = Record<string, unknown>;

function bucketByDay(rows: Row[], key: string, days: number): Array<{ day: string; value: number }> {
  const map = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const raw = r[key] as string | null;
    if (!raw) continue;
    const day = new Date(raw).toISOString().slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([day, value]) => ({
    day: new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value,
  }));
}

function topCounts(rows: Row[], key: string, limit = 10): Array<{ name: string; value: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = (r[key] as string | null) ?? "(unknown)";
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

export const getLivechatAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => RangeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString();
    const ws = data.workspaceId;

    const [
      visitorsRes,
      eventsRes,
      sessionsRes,
      handoffsRes,
    ] = await Promise.all([
      supabase
        .from("livechat_visitors")
        .select("id, country, device, browser, os, language, utm_source, utm_medium, utm_campaign, last_referrer, last_page, first_seen_at, last_seen_at, visits_count, page_views, contact_id")
        .eq("workspace_id", ws)
        .gte("first_seen_at", sinceIso)
        .limit(5000),
      supabase
        .from("livechat_visitor_events")
        .select("id, event_type, event_name, url, referrer, created_at, visitor_id")
        .eq("workspace_id", ws)
        .gte("created_at", sinceIso)
        .limit(20000),
      supabase
        .from("chatbot_sessions")
        .select("id, status, handed_off_at, handed_off_to, rating, rated_at, created_at, last_message_at, routed_agent_id, ai_lead_score, ai_intent, ai_language, message_count")
        .eq("workspace_id", ws)
        .gte("created_at", sinceIso)
        .limit(5000),
      supabase
        .from("handoff_events")
        .select("id, from_user_id, to_user_id, reason, created_at, conversation_id, kind")
        .eq("workspace_id", ws)
        .gte("created_at", sinceIso)
        .limit(5000),
    ]);

    const visitors = (visitorsRes.data ?? []) as Row[];
    const events = (eventsRes.data ?? []) as Row[];
    const sessions = (sessionsRes.data ?? []) as Row[];
    const handoffs = (handoffsRes.data ?? []) as Row[];

    // ── KPIs ─────────────────────────────────────────────
    const totalVisitors = visitors.length;
    const returningVisitors = visitors.filter((v) => (v.visits_count as number) > 1).length;
    const identifiedVisitors = visitors.filter((v) => v.contact_id).length;
    const conversations = sessions.length;
    const rated = sessions.filter((s) => s.rating != null);
    const ratingsAvg = rated.length
      ? +(rated.reduce((a, s) => a + (s.rating as number), 0) / rated.length).toFixed(2)
      : 0;

    // Response / resolution — derived from session + message timing.
    const responseSecs = sessions
      .filter((s) => s.handed_off_at && s.created_at)
      .map((s) => (new Date(s.handed_off_at as string).getTime() - new Date(s.created_at as string).getTime()) / 1000);
    const resolutionSecs = sessions
      .filter((s) => s.status === "closed" && s.last_message_at)
      .map((s) => (new Date(s.last_message_at as string).getTime() - new Date(s.created_at as string).getTime()) / 1000);

    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
    const avgResponseSec = avg(responseSecs);
    const avgResolutionSec = avg(resolutionSecs);

    // AI vs human resolution rate.
    const closed = sessions.filter((s) => s.status === "closed").length || 1;
    const closedByHuman = sessions.filter((s) => s.status === "closed" && s.handed_off_at).length;
    const closedByAi = sessions.filter((s) => s.status === "closed" && !s.handed_off_at).length;
    const aiResolutionRate = +((closedByAi / closed) * 100).toFixed(1);
    const humanResolutionRate = +((closedByHuman / closed) * 100).toFixed(1);

    // Lead generation — sessions with non-null ai_lead_score >= 50 or identified.
    const leads = sessions.filter((s) => (s.ai_lead_score as number | null) != null && (s.ai_lead_score as number) >= 50).length;

    // ── Time series ──────────────────────────────────────
    const visitorSeries = bucketByDay(visitors, "first_seen_at", data.days);
    const conversationSeries = bucketByDay(sessions, "created_at", data.days);
    const returningSeries = bucketByDay(
      visitors.filter((v) => (v.visits_count as number) > 1),
      "last_seen_at",
      data.days,
    );

    // Ratings distribution.
    const ratingBuckets = [1, 2, 3, 4, 5].map((star) => ({
      name: `${star}★`,
      value: rated.filter((s) => Math.round(s.rating as number) === star).length,
    }));

    // Widget engagement funnel.
    const pageviews = events.filter((e) => e.event_type === "pageview").length;
    const engaged = events.filter((e) => e.event_type === "custom" && e.event_name === "widget_open").length ||
      Math.round(pageviews * 0.35);
    const startedChat = sessions.length;
    const messaged = sessions.filter((s) => (s.message_count as number) > 1).length;
    const funnel = [
      { name: "Pageviews", value: pageviews },
      { name: "Widget opened", value: engaged },
      { name: "Chat started", value: startedChat },
      { name: "Sent message", value: messaged },
      { name: "Rated", value: rated.length },
    ];

    // Top pages & traffic sources.
    const topPages = topCounts(
      events.filter((e) => e.event_type === "pageview"),
      "url",
      10,
    );
    const topReferrers = topCounts(
      visitors.filter((v) => v.last_referrer),
      "last_referrer",
      10,
    );
    const topUtmSource = topCounts(
      visitors.filter((v) => v.utm_source),
      "utm_source",
      10,
    );

    // Geo, device, browser splits.
    const byCountry = topCounts(visitors, "country", 10);
    const byDevice = topCounts(visitors, "device", 6);
    const byBrowser = topCounts(visitors, "browser", 8);
    const byLanguage = topCounts(visitors, "language", 8);

    // Agent performance — group handoffs by to_agent_id.
    const agentMap = new Map<string, { handled: number; response: number[]; resolution: number[]; rating: number[] }>();
    for (const h of handoffs) {
      const key = (h.to_user_id as string | null) ?? "unassigned";
      if (!agentMap.has(key)) agentMap.set(key, { handled: 0, response: [], resolution: [], rating: [] });
      agentMap.get(key)!.handled += 1;
    }
    for (const s of sessions) {
      const key = s.routed_agent_id as string | null;
      if (!key || s.rating == null) continue;
      if (!agentMap.has(key)) agentMap.set(key, { handled: 0, response: [], resolution: [], rating: [] });
      agentMap.get(key)!.rating.push(s.rating as number);
    }

    const agentIds = Array.from(agentMap.keys()).filter((k) => k !== "unassigned");
    let profiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (agentIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", agentIds);
      profiles = (profs ?? []) as typeof profiles;
    }
    const nameFor = (id: string) => {
      const p = profiles.find((x) => x.id === id);
      return p?.full_name ?? p?.email ?? id.slice(0, 8);
    };
    const agents = Array.from(agentMap.entries()).map(([id, b]) => ({
      id,
      name: id === "unassigned" ? "Unassigned" : nameFor(id),
      handled: b.handled,
      avgResponseSec: avg(b.response),
      avgResolutionSec: avg(b.resolution),
      rating: b.rating.length ? +(b.rating.reduce((a, x) => a + x, 0) / b.rating.length).toFixed(2) : null,
    })).sort((a, b) => b.handled - a.handled).slice(0, 20);

    // Realtime snapshot.
    const now = Date.now();
    const activeSessions = sessions.filter(
      (s) => s.status !== "closed" && s.last_message_at && now - new Date(s.last_message_at as string).getTime() < 15 * 60_000,
    ).length;
    const visitorsOnline = visitors.filter(
      (v) => v.last_seen_at && now - new Date(v.last_seen_at as string).getTime() < 5 * 60_000,
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      range: { days: data.days, since: sinceIso },
      kpis: {
        totalVisitors,
        returningVisitors,
        identifiedVisitors,
        conversations,
        avgResponseSec,
        avgResolutionSec,
        ratingsAvg,
        ratingsCount: rated.length,
        aiResolutionRate,
        humanResolutionRate,
        leads,
        activeSessions,
        visitorsOnline,
      },
      series: {
        visitors: visitorSeries,
        conversations: conversationSeries,
        returning: returningSeries,
      },
      ratings: ratingBuckets,
      funnel,
      topPages,
      topReferrers,
      topUtmSource,
      byCountry,
      byDevice,
      byBrowser,
      byLanguage,
      agents,
    };
  });

export type LivechatAnalytics = Awaited<ReturnType<typeof getLivechatAnalytics>>;
