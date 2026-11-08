// WhatsApp analytics server functions.
// Aggregates messaging, SLA, agent utilization, categories, sentiment/CSAT, peak hours.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(365).default(30),
});

export interface WhatsAppAnalytics {
  range: { from: string; to: string; days: number };
  messages: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    queued: number;
    inbound: number;
    outbound: number;
    deliveryRate: number;
    readRate: number;
    failureRate: number;
  };
  conversations: {
    total: number;
    open: number;
    pending: number;
    resolved: number;
    snoozed: number;
    resolutionRate: number;
    avgResponseSeconds: number;
    avgResolutionSeconds: number;
    avgDurationSeconds: number;
  };
  csat: { avgScore: number; positive: number; neutral: number; negative: number; sampled: number };
  volume: { date: string; sent: number; delivered: number; read: number; failed: number; inbound: number }[];
  responseTrend: { date: string; avgResponseMinutes: number; avgResolutionMinutes: number }[];
  peakHours: { hour: number; messages: number; conversations: number }[];
  peakDayHour: { day: number; hour: number; messages: number }[];
  agents: {
    userId: string;
    name: string;
    conversations: number;
    messages: number;
    avgResponseMinutes: number;
    resolved: number;
    utilization: number;
  }[];
  categories: { category: string; count: number; avgSentiment: number }[];
  topIssues: { topic: string; count: number }[];
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

export const getWhatsAppAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<WhatsAppAnalytics> => {
    const { supabase } = context;
    const { workspaceId, days } = data;
    const from = daysAgo(days);
    const fromIso = from.toISOString();
    const toIso = new Date().toISOString();

    const [msgsRes, convsRes, intelRes] = await Promise.all([
      supabase
        .from("messages")
        .select(
          "id, conversation_id, direction, status, sent_by, created_at, delivered_at, read_at, failed_reason",
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .eq("is_internal", false)
        .gte("created_at", fromIso)
        .limit(50000),
      supabase
        .from("conversations")
        .select(
          "id, status, assigned_to, created_at, first_response_at, resolved_at, last_message_at, channel",
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .eq("channel", "whatsapp")
        .gte("created_at", fromIso)
        .limit(20000),
      supabase
        .from("conversation_intelligence")
        .select("conversation_id, category, topics, sentiment_score, satisfaction_score, sentiment, analyzed_at")
        .eq("workspace_id", workspaceId)
        .gte("analyzed_at", fromIso)
        .limit(20000),
    ]);

    const msgs = msgsRes.data ?? [];
    const convs = convsRes.data ?? [];
    const intel = intelRes.data ?? [];

    // Messages tallies
    const outbound = msgs.filter((m: any) => m.direction === "outbound");
    const inbound = msgs.filter((m: any) => m.direction === "inbound");
    const sent = outbound.filter((m: any) => ["sent", "delivered", "read"].includes(m.status)).length;
    const delivered = outbound.filter((m: any) => ["delivered", "read"].includes(m.status)).length;
    const read = outbound.filter((m: any) => m.status === "read").length;
    const failed = outbound.filter((m: any) => m.status === "failed").length;
    const queued = outbound.filter((m: any) => m.status === "queued").length;
    const totalOut = outbound.length;
    const deliveryRate = totalOut ? (delivered / totalOut) * 100 : 0;
    const readRate = totalOut ? (read / totalOut) * 100 : 0;
    const failureRate = totalOut ? (failed / totalOut) * 100 : 0;

    // Conversation status
    const open = convs.filter((c: any) => c.status === "open").length;
    const pending = convs.filter((c: any) => c.status === "pending").length;
    const resolved = convs.filter((c: any) => c.status === "resolved").length;
    const snoozed = convs.filter((c: any) => c.status === "snoozed").length;
    const resolutionRate = convs.length ? (resolved / convs.length) * 100 : 0;

    // Response / resolution / duration averages
    let sumResp = 0, cntResp = 0, sumRes = 0, cntRes = 0, sumDur = 0, cntDur = 0;
    for (const c of convs as any[]) {
      if (c.first_response_at && c.created_at) {
        sumResp += (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 1000;
        cntResp++;
      }
      if (c.resolved_at && c.created_at) {
        sumRes += (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 1000;
        cntRes++;
      }
      if (c.last_message_at && c.created_at) {
        sumDur += (new Date(c.last_message_at).getTime() - new Date(c.created_at).getTime()) / 1000;
        cntDur++;
      }
    }
    const avgResponseSeconds = cntResp ? sumResp / cntResp : 0;
    const avgResolutionSeconds = cntRes ? sumRes / cntRes : 0;
    const avgDurationSeconds = cntDur ? sumDur / cntDur : 0;

    // CSAT from intelligence
    const scored = intel.filter((i: any) => i.satisfaction_score != null);
    const avgScore =
      scored.length > 0
        ? scored.reduce((a: number, i: any) => a + Number(i.satisfaction_score), 0) / scored.length
        : 0;
    const positive = intel.filter((i: any) => i.sentiment === "positive").length;
    const neutral = intel.filter((i: any) => i.sentiment === "neutral").length;
    const negative = intel.filter((i: any) => i.sentiment === "negative").length;

    // Volume by day
    const volumeMap = new Map<
      string,
      { sent: number; delivered: number; read: number; failed: number; inbound: number }
    >();
    for (let i = days - 1; i >= 0; i--) {
      volumeMap.set(dayKey(daysAgo(i)), { sent: 0, delivered: 0, read: 0, failed: 0, inbound: 0 });
    }
    for (const m of msgs as any[]) {
      const k = dayKey(m.created_at);
      const rec = volumeMap.get(k);
      if (!rec) continue;
      if (m.direction === "inbound") rec.inbound++;
      else {
        if (["sent", "delivered", "read"].includes(m.status)) rec.sent++;
        if (["delivered", "read"].includes(m.status)) rec.delivered++;
        if (m.status === "read") rec.read++;
        if (m.status === "failed") rec.failed++;
      }
    }
    const volume = Array.from(volumeMap.entries()).map(([date, v]) => ({ date, ...v }));

    // Response trend per day
    const respMap = new Map<string, { resp: number[]; res: number[] }>();
    for (const c of convs as any[]) {
      const k = dayKey(c.created_at);
      let rec = respMap.get(k);
      if (!rec) {
        rec = { resp: [], res: [] };
        respMap.set(k, rec);
      }
      if (c.first_response_at) {
        rec.resp.push((new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60000);
      }
      if (c.resolved_at) {
        rec.res.push((new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 60000);
      }
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const responseTrend = Array.from(volumeMap.keys()).map((date) => {
      const r = respMap.get(date);
      return {
        date,
        avgResponseMinutes: r ? avg(r.resp) : 0,
        avgResolutionMinutes: r ? avg(r.res) : 0,
      };
    });

    // Peak hours + day/hour heatmap
    const hourAgg = new Array(24).fill(0).map(() => ({ messages: 0, conversations: 0 }));
    const heatmap = new Map<string, number>(); // day-hour
    for (const m of msgs as any[]) {
      const d = new Date(m.created_at);
      const h = d.getHours();
      const day = d.getDay();
      hourAgg[h].messages++;
      const key = `${day}-${h}`;
      heatmap.set(key, (heatmap.get(key) ?? 0) + 1);
    }
    for (const c of convs as any[]) {
      const h = new Date(c.created_at).getHours();
      hourAgg[h].conversations++;
    }
    const peakHours = hourAgg.map((v, hour) => ({ hour, ...v }));
    const peakDayHour: { day: number; hour: number; messages: number }[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        peakDayHour.push({ day, hour, messages: heatmap.get(`${day}-${hour}`) ?? 0 });
      }
    }

    // Agent utilization
    const agentMap = new Map<
      string,
      { conversations: Set<string>; messages: number; respTimes: number[]; resolved: number }
    >();
    for (const c of convs as any[]) {
      if (!c.assigned_to) continue;
      let rec = agentMap.get(c.assigned_to);
      if (!rec) {
        rec = { conversations: new Set(), messages: 0, respTimes: [], resolved: 0 };
        agentMap.set(c.assigned_to, rec);
      }
      rec.conversations.add(c.id);
      if (c.first_response_at) {
        rec.respTimes.push(
          (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60000,
        );
      }
      if (c.status === "resolved") rec.resolved++;
    }
    for (const m of msgs as any[]) {
      if (!m.sent_by) continue;
      const rec = agentMap.get(m.sent_by);
      if (rec) rec.messages++;
      else agentMap.set(m.sent_by, { conversations: new Set(), messages: 1, respTimes: [], resolved: 0 });
    }

    const agentIds = Array.from(agentMap.keys());
    const nameMap = new Map<string, string>();
    if (agentIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", agentIds);
      (profiles ?? []).forEach((p: any) => {
        nameMap.set(p.id, p.full_name || p.email || "Unknown");
      });
    }
    const maxMessages = Math.max(1, ...Array.from(agentMap.values()).map((v) => v.messages));
    const agents = Array.from(agentMap.entries())
      .map(([userId, v]) => ({
        userId,
        name: nameMap.get(userId) || "Unknown",
        conversations: v.conversations.size,
        messages: v.messages,
        avgResponseMinutes: avg(v.respTimes),
        resolved: v.resolved,
        utilization: (v.messages / maxMessages) * 100,
      }))
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 15);

    // Categories
    const catMap = new Map<string, { count: number; sentSum: number; sentCount: number }>();
    for (const i of intel as any[]) {
      const c = (i.category as string) || "Uncategorized";
      let rec = catMap.get(c);
      if (!rec) {
        rec = { count: 0, sentSum: 0, sentCount: 0 };
        catMap.set(c, rec);
      }
      rec.count++;
      if (i.sentiment_score != null) {
        rec.sentSum += Number(i.sentiment_score);
        rec.sentCount++;
      }
    }
    const categories = Array.from(catMap.entries())
      .map(([category, v]) => ({
        category,
        count: v.count,
        avgSentiment: v.sentCount ? v.sentSum / v.sentCount : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top issues (topics)
    const topicMap = new Map<string, number>();
    for (const i of intel as any[]) {
      const topics: string[] = Array.isArray(i.topics) ? i.topics : [];
      for (const t of topics) {
        if (!t) continue;
        topicMap.set(t, (topicMap.get(t) ?? 0) + 1);
      }
    }
    const topIssues = Array.from(topicMap.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return {
      range: { from: fromIso, to: toIso, days },
      messages: {
        total: msgs.length,
        sent,
        delivered,
        read,
        failed,
        queued,
        inbound: inbound.length,
        outbound: outbound.length,
        deliveryRate,
        readRate,
        failureRate,
      },
      conversations: {
        total: convs.length,
        open,
        pending,
        resolved,
        snoozed,
        resolutionRate,
        avgResponseSeconds,
        avgResolutionSeconds,
        avgDurationSeconds,
      },
      csat: { avgScore, positive, neutral, negative, sampled: intel.length },
      volume,
      responseTrend,
      peakHours,
      peakDayHour,
      agents,
      categories,
      topIssues,
    };
  });
