/**
 * Chat Widgets — embeddable chat widget CRUD & analytics server functions.
 *
 * A "chat widget" wraps a chatbot with install/appearance/routing metadata
 * so the same bot can be embedded on multiple sites with different rules.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_WIDGET_CONFIG,
  mergeWidgetConfig,
  type WidgetConfig,
} from "@/lib/widget/widget-config";
import { DEFAULT_SCHEDULE, mergeSchedule, type WidgetSchedule } from "@/lib/widgets/schedule";

const ScheduleWindowSchema = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});
const ScheduleSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().max(60),
  weeklyHours: z.record(z.string(), z.array(ScheduleWindowSchema).max(6)),
  activeFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  activeUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(200),
  offlineBehavior: z.enum(["hide", "show_offline"]),
  offlineMessage: z.string().max(500),
});

export type RoutingCondition =
  | { type: "url_contains"; value: string }
  | { type: "url_equals"; value: string }
  | { type: "path_starts_with"; value: string }
  | { type: "language"; value: string }
  | { type: "business_hours"; from: string; to: string; timezone?: string };

export interface RoutingRule {
  id: string;
  name: string;
  when: RoutingCondition[]; // AND
  chatbotId: string | null; // override chatbot
  team: string | null; // display-only tag
  hideWidget?: boolean;
}

const RoutingCondSchema: z.ZodType<RoutingCondition> = z.union([
  z.object({ type: z.literal("url_contains"), value: z.string().max(500) }),
  z.object({ type: z.literal("url_equals"), value: z.string().max(500) }),
  z.object({ type: z.literal("path_starts_with"), value: z.string().max(500) }),
  z.object({ type: z.literal("language"), value: z.string().max(10) }),
  z.object({
    type: z.literal("business_hours"),
    from: z.string().max(5),
    to: z.string().max(5),
    timezone: z.string().max(60).optional(),
  }),
]);

const RoutingRuleSchema = z.object({
  id: z.string(),
  name: z.string().max(80),
  when: z.array(RoutingCondSchema).max(10),
  chatbotId: z.string().uuid().nullable(),
  team: z.string().max(60).nullable(),
  hideWidget: z.boolean().optional(),
});

/* ---------- list ---------- */

const ListInput = z.object({ workspaceId: z.string().uuid() });

export const listChatWidgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => ListInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("chat_widgets")
      .select("id, name, chatbot_id, is_active, allowed_domains, schedule, updated_at, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------- get ---------- */

const GetInput = z.object({ widgetId: z.string().uuid() });

export const getChatWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => GetInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("chat_widgets")
      .select("*")
      .eq("id", data.widgetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Widget not found");
    const w = row as {
      id: string;
      workspace_id: string;
      chatbot_id: string | null;
      name: string;
      is_active: boolean;
      config: unknown;
      routing_rules: unknown;
      allowed_domains: string[];
      schedule: unknown;
      created_at: string;
      updated_at: string;
    };
    // Surface the linked bot's status so the UI can warn when the public
    // embed would refuse to start a session (paused/archived bots).
    let chatbotStatus: string | null = null;
    let chatbotName: string | null = null;
    if (w.chatbot_id) {
      const { data: bot } = await context.supabase
        .from("chatbots")
        .select("name, status")
        .eq("id", w.chatbot_id)
        .maybeSingle();
      chatbotStatus = (bot as { status?: string } | null)?.status ?? null;
      chatbotName = (bot as { name?: string } | null)?.name ?? null;
    }

    return {
      id: w.id,
      workspaceId: w.workspace_id,
      chatbotId: w.chatbot_id,
      chatbotStatus,
      chatbotName,
      name: w.name,
      isActive: w.is_active,
      config: mergeWidgetConfig(w.config),
      routingRules: (Array.isArray(w.routing_rules) ? w.routing_rules : []) as RoutingRule[],
      allowedDomains: w.allowed_domains ?? [],
      schedule: mergeSchedule(w.schedule) as WidgetSchedule,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    };
  });

/* ---------- create ---------- */

const CreateInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(80),
  chatbotId: z.string().uuid().nullable(),
});

export const createChatWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Seed appearance from the linked bot so a new widget starts with the
    // bot's branding instead of the generic default.
    let seedConfig: WidgetConfig = DEFAULT_WIDGET_CONFIG;
    if (data.chatbotId) {
      const { data: bot } = await context.supabase
        .from("chatbots")
        .select("widget_config")
        .eq("id", data.chatbotId)
        .maybeSingle();
      if (bot) seedConfig = mergeWidgetConfig((bot as { widget_config: unknown }).widget_config);
    }
    const { data: row, error } = await context.supabase
      .from("chat_widgets")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        chatbot_id: data.chatbotId,
        created_by: context.userId,
        config: seedConfig as unknown as never,
        schedule: DEFAULT_SCHEDULE as unknown as never,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

/* ---------- update ---------- */

const UpdateInput = z.object({
  widgetId: z.string().uuid(),
  patch: z.object({
    name: z.string().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
    chatbotId: z.string().uuid().nullable().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    routingRules: z.array(RoutingRuleSchema).max(50).optional(),
    allowedDomains: z.array(z.string().max(255)).max(50).optional(),
    schedule: ScheduleSchema.optional(),
  }),
});

export const updateChatWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpdateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.isActive !== undefined) patch.is_active = p.isActive;
    if (p.chatbotId !== undefined) patch.chatbot_id = p.chatbotId;
    if (p.config !== undefined) patch.config = p.config;
    if (p.routingRules !== undefined) patch.routing_rules = p.routingRules;
    if (p.allowedDomains !== undefined) patch.allowed_domains = p.allowedDomains;
    if (p.schedule !== undefined) patch.schedule = p.schedule;
    const { error } = await context.supabase
      .from("chat_widgets")
      .update(patch as never)
      .eq("id", data.widgetId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- delete ---------- */

const DeleteInput = z.object({ widgetId: z.string().uuid() });

export const deleteChatWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => DeleteInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("chat_widgets").delete().eq("id", data.widgetId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- analytics ---------- */

const AnalyticsInput = z.object({
  widgetId: z.string().uuid(),
  days: z.number().int().min(1).max(90).default(14),
});

export const getWidgetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AnalyticsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("chat_widget_events")
      .select("event_type, session_id, url, referrer, country, metadata, created_at")
      .eq("widget_id", data.widgetId)
      .gte("created_at", since)
      .limit(10000);
    if (error) throw new Error(error.message);

    type Ev = {
      event_type: string;
      session_id: string | null;
      url: string | null;
      referrer: string | null;
      country: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    };
    const events = (rows ?? []) as Ev[];

    const byDay = new Map<
      string,
      {
        day: string;
        loads: number;
        opens: number;
        messages: number;
        conversions: number;
        sessions: number;
      }
    >();
    const sessionsPerDay = new Map<string, Set<string>>();
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, messages: 0, opens: 0 }));
    const responseTimes: number[] = [];
    const sessionDurations: number[] = [];
    const csatScores: number[] = [];
    const referrerCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const pageCounts = new Map<string, number>();

    // Track first user message + first agent reply per session for response time
    const firstUserMsg = new Map<string, number>();
    const firstAgentReply = new Map<string, number>();
    const sessionStart = new Map<string, number>();
    const sessionEnd = new Map<string, number>();

    for (const ev of events) {
      const day = ev.created_at.slice(0, 10);
      const ts = new Date(ev.created_at).getTime();
      const hour = new Date(ev.created_at).getUTCHours();
      if (!byDay.has(day))
        byDay.set(day, { day, loads: 0, opens: 0, messages: 0, conversions: 0, sessions: 0 });
      if (!sessionsPerDay.has(day)) sessionsPerDay.set(day, new Set());
      const bucket = byDay.get(day)!;
      const meta = ev.metadata ?? {};

      if (ev.event_type === "load") bucket.loads++;
      else if (ev.event_type === "open") {
        bucket.opens++;
        hourly[hour].opens++;
      } else if (ev.event_type === "message") {
        bucket.messages++;
        hourly[hour].messages++;
      } else if (ev.event_type === "conversion") bucket.conversions++;
      else if (ev.event_type === "csat" && typeof meta.rating === "number")
        csatScores.push(meta.rating as number);

      if (ev.session_id) {
        sessionsPerDay.get(day)!.add(ev.session_id);
        if (!sessionStart.has(ev.session_id) || ts < sessionStart.get(ev.session_id)!)
          sessionStart.set(ev.session_id, ts);
        if (!sessionEnd.has(ev.session_id) || ts > sessionEnd.get(ev.session_id)!)
          sessionEnd.set(ev.session_id, ts);

        const from = (meta.from as string | undefined) ?? undefined;
        if (ev.event_type === "message" && from === "user" && !firstUserMsg.has(ev.session_id))
          firstUserMsg.set(ev.session_id, ts);
        if (
          ev.event_type === "message" &&
          (from === "agent" || from === "bot") &&
          !firstAgentReply.has(ev.session_id)
        )
          firstAgentReply.set(ev.session_id, ts);

        if (typeof meta.response_ms === "number") responseTimes.push(meta.response_ms as number);
      }

      if (ev.url) pageCounts.set(ev.url, (pageCounts.get(ev.url) ?? 0) + 1);
      if (ev.referrer) {
        try {
          const host = new URL(ev.referrer).hostname || ev.referrer;
          referrerCounts.set(host, (referrerCounts.get(host) ?? 0) + 1);
        } catch {
          referrerCounts.set(ev.referrer, (referrerCounts.get(ev.referrer) ?? 0) + 1);
        }
      }
      if (ev.country) countryCounts.set(ev.country, (countryCounts.get(ev.country) ?? 0) + 1);
    }
    for (const [day, s] of sessionsPerDay) byDay.get(day)!.sessions = s.size;

    // Derived response times per session (fallback when no response_ms in metadata)
    for (const [sid, userTs] of firstUserMsg) {
      const agentTs = firstAgentReply.get(sid);
      if (agentTs && agentTs > userTs) responseTimes.push(agentTs - userTs);
    }
    for (const [sid, start] of sessionStart) {
      const end = sessionEnd.get(sid);
      if (end && end > start) sessionDurations.push(end - start);
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const median = (xs: number[]) => {
      if (!xs.length) return 0;
      const s = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    const totals = {
      loads: events.filter((e) => e.event_type === "load").length,
      opens: events.filter((e) => e.event_type === "open").length,
      messages: events.filter((e) => e.event_type === "message").length,
      conversions: events.filter((e) => e.event_type === "conversion").length,
      sessions: new Set(events.map((e) => e.session_id).filter(Boolean) as string[]).size,
    };

    const derived = {
      engagementRate: totals.loads ? totals.opens / totals.loads : 0,
      conversionRate: totals.sessions ? totals.conversions / totals.sessions : 0,
      messagesPerSession: totals.sessions ? totals.messages / totals.sessions : 0,
      avgResponseMs: Math.round(avg(responseTimes)),
      medianResponseMs: Math.round(median(responseTimes)),
      avgSessionSec: Math.round(avg(sessionDurations) / 1000),
      csatAvg: csatScores.length ? Number(avg(csatScores).toFixed(2)) : null,
      csatCount: csatScores.length,
    };

    const topEntries = (m: Map<string, number>, n = 10) =>
      Array.from(m.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);

    return {
      totals,
      derived,
      series: Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day)),
      hourly,
      topPages: topEntries(pageCounts).map((x) => ({ url: x.key, count: x.count })),
      topReferrers: topEntries(referrerCounts).map((x) => ({ host: x.key, count: x.count })),
      topCountries: topEntries(countryCounts).map((x) => ({ country: x.key, count: x.count })),
    };
  });

/* ---------- helpers exported to UI ---------- */

export type WidgetConfigPatch = Partial<WidgetConfig>;
