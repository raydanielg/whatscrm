import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WA Chatbot analytics.
 *
 * All reads go through the caller's RLS-scoped client, so a user only ever
 * sees traffic from workspaces they belong to. Everything is aggregated
 * server-side and returned as plain DTOs for charting.
 */

const schema = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(180).default(30),
  sessionId: z.string().uuid().nullable().optional(),
});

export type WaAnalytics = {
  days: number;
  totals: {
    inbound: number;
    outbound: number;
    botReplies: number;
    agentReplies: number;
    conversations: number;
    newConversations: number;
    uniqueContacts: number;
    returningContacts: number;
    failed: number;
    botCoverage: number; // % of inbound messages answered by the bot
    handoffRate: number; // % of threads that needed an agent
    ruleHits: number;
    avgBotResponseMs: number | null;
    medianBotResponseMs: number | null;
    p95BotResponseMs: number | null;
    avgAgentResponseMs: number | null;
  };
  series: Array<{
    date: string;
    inbound: number;
    botReplies: number;
    agentReplies: number;
    contacts: number;
    newConversations: number;
    avgBotResponseMs: number | null;
  }>;
  hourly: Array<{ hour: string; inbound: number }>;
  rules: Array<{
    id: string;
    name: string;
    triggerType: string;
    enabled: boolean;
    hits: number;
    hitsInRange: number;
    share: number;
    lastTriggeredAt: string | null;
  }>;
  triggerTypes: Array<{ type: string; hits: number }>;
  topContacts: Array<{ name: string; messages: number }>;
  responseBuckets: Array<{ bucket: string; count: number }>;
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return Math.round(sorted[idx]);
}

export const getWaChatbotAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }): Promise<WaAnalytics> => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86_400_000);
    const sinceIso = since.toISOString();

    // 1) WhatsApp conversations in this workspace (optionally one instance).
    const { data: convRows, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact_id, created_at, metadata")
      .eq("workspace_id", data.workspaceId)
      .eq("channel", "whatsapp")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(2000);
    if (convErr) throw new Error(convErr.message);

    const conversations = (convRows ?? []).filter((c) => {
      if (!data.sessionId) return true;
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      return meta.wa_session_id === data.sessionId;
    });
    const convIds = conversations.map((c) => c.id);
    const contactByConv = new Map(conversations.map((c) => [c.id, c.contact_id]));

    // 2) Messages in range for those conversations.
    type Msg = {
      id: string;
      conversation_id: string;
      direction: string;
      status: string;
      created_at: string;
      metadata: Record<string, unknown> | null;
    };
    let messages: Msg[] = [];
    if (convIds.length > 0) {
      const chunkSize = 150;
      for (let i = 0; i < convIds.length; i += chunkSize) {
        const chunk = convIds.slice(i, i + chunkSize);
        const { data: rows, error } = await supabase
          .from("messages")
          .select("id, conversation_id, direction, status, created_at, metadata")
          .in("conversation_id", chunk)
          .gte("created_at", sinceIso)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(10_000);
        if (error) throw new Error(error.message);
        messages = messages.concat((rows ?? []) as unknown as Msg[]);
      }
      messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    const isBot = (m: Msg) =>
      (m.metadata as Record<string, unknown> | null)?.source === "wa_bot" ||
      (m.metadata as Record<string, unknown> | null)?.is_bot === true;

    // 3) Per-day buckets.
    const dayMap = new Map<
      string,
      {
        inbound: number;
        botReplies: number;
        agentReplies: number;
        contacts: Set<string>;
        newConversations: number;
        latencies: number[];
      }
    >();
    for (let i = data.days - 1; i >= 0; i--) {
      const key = dayKey(new Date(Date.now() - i * 86_400_000).toISOString());
      dayMap.set(key, {
        inbound: 0,
        botReplies: 0,
        agentReplies: 0,
        contacts: new Set(),
        newConversations: 0,
        latencies: [],
      });
    }
    const bucket = (iso: string) => dayMap.get(dayKey(iso));

    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      inbound: 0,
    }));

    let inbound = 0;
    let outbound = 0;
    let botReplies = 0;
    let agentReplies = 0;
    let failed = 0;
    const uniqueContacts = new Set<string>();
    const contactMessages = new Map<string, number>();
    const answeredThreads = new Set<string>();
    const agentThreads = new Set<string>();
    const botLatencies: number[] = [];
    const agentLatencies: number[] = [];
    const pendingInbound = new Map<string, string>(); // conv -> first unanswered inbound ts

    for (const m of messages) {
      const b = bucket(m.created_at);
      const contactId = contactByConv.get(m.conversation_id);
      if (m.status === "failed") failed += 1;

      if (m.direction === "inbound") {
        inbound += 1;
        if (b) {
          b.inbound += 1;
          if (contactId) b.contacts.add(contactId);
        }
        hourly[new Date(m.created_at).getHours()].inbound += 1;
        if (contactId) {
          uniqueContacts.add(contactId);
          contactMessages.set(contactId, (contactMessages.get(contactId) ?? 0) + 1);
        }
        if (!pendingInbound.has(m.conversation_id)) {
          pendingInbound.set(m.conversation_id, m.created_at);
        }
      } else if (m.direction === "outbound") {
        outbound += 1;
        const bot = isBot(m);
        if (bot) {
          botReplies += 1;
          answeredThreads.add(m.conversation_id);
          if (b) b.botReplies += 1;
        } else {
          agentReplies += 1;
          agentThreads.add(m.conversation_id);
          if (b) b.agentReplies += 1;
        }
        const waitingSince = pendingInbound.get(m.conversation_id);
        if (waitingSince) {
          const delta =
            new Date(m.created_at).getTime() - new Date(waitingSince).getTime();
          if (delta >= 0 && delta < 24 * 3600_000) {
            if (bot) {
              botLatencies.push(delta);
              if (b) b.latencies.push(delta);
            } else {
              agentLatencies.push(delta);
            }
          }
          pendingInbound.delete(m.conversation_id);
        }
      }
    }

    for (const c of conversations) {
      const b = bucket(c.created_at);
      if (b) b.newConversations += 1;
    }

    const series = Array.from(dayMap.entries()).map(([date, v]) => ({
      date,
      inbound: v.inbound,
      botReplies: v.botReplies,
      agentReplies: v.agentReplies,
      contacts: v.contacts.size,
      newConversations: v.newConversations,
      avgBotResponseMs: v.latencies.length
        ? Math.round(v.latencies.reduce((a, x) => a + x, 0) / v.latencies.length)
        : null,
    }));

    // 4) Auto-reply rule hit rates.
    const { data: ruleRows, error: ruleErr } = await supabase
      .from("whatsapp_auto_replies")
      .select("id, name, trigger_type, enabled, hit_count, last_triggered_at, session_id")
      .eq("workspace_id", data.workspaceId);
    if (ruleErr) throw new Error(ruleErr.message);

    const filteredRules = (ruleRows ?? []).filter(
      (r) => !data.sessionId || r.session_id === data.sessionId || r.session_id === null,
    );
    const totalHits = filteredRules.reduce((a, r) => a + (r.hit_count ?? 0), 0);
    const rules = filteredRules
      .map((r) => {
        const inRange =
          r.last_triggered_at && new Date(r.last_triggered_at) >= since
            ? (r.hit_count ?? 0)
            : 0;
        return {
          id: r.id as string,
          name: (r.name as string) ?? "Untitled rule",
          triggerType: (r.trigger_type as string) ?? "contains",
          enabled: Boolean(r.enabled),
          hits: r.hit_count ?? 0,
          hitsInRange: inRange,
          share: pct(r.hit_count ?? 0, totalHits),
          lastTriggeredAt: (r.last_triggered_at as string | null) ?? null,
        };
      })
      .sort((a, b) => b.hits - a.hits);

    const triggerMap = new Map<string, number>();
    for (const r of rules) {
      triggerMap.set(r.triggerType, (triggerMap.get(r.triggerType) ?? 0) + r.hits);
    }
    const triggerTypes = Array.from(triggerMap.entries())
      .map(([type, hits]) => ({ type, hits }))
      .sort((a, b) => b.hits - a.hits);

    // 5) Top contacts by inbound volume.
    const contactIds = Array.from(contactMessages.keys()).slice(0, 500);
    const nameById = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, display_name, first_name, last_name, phone")
        .in("id", contactIds);
      for (const c of contacts ?? []) {
        nameById.set(
          c.id as string,
          (c.display_name as string) ||
            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            (c.phone as string) ||
            "Unknown",
        );
      }
    }
    const topContacts = Array.from(contactMessages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({ name: nameById.get(id) ?? "Unknown", messages: count }));

    // 6) Response-time distribution.
    const buckets = [
      { bucket: "< 5s", max: 5_000 },
      { bucket: "5–30s", max: 30_000 },
      { bucket: "30s–2m", max: 120_000 },
      { bucket: "2–10m", max: 600_000 },
      { bucket: "10m–1h", max: 3_600_000 },
      { bucket: "> 1h", max: Infinity },
    ];
    const responseBuckets = buckets.map((b) => ({ bucket: b.bucket, count: 0 }));
    for (const l of [...botLatencies, ...agentLatencies]) {
      const i = buckets.findIndex((b) => l < b.max);
      responseBuckets[i === -1 ? buckets.length - 1 : i].count += 1;
    }

    const sortedBot = [...botLatencies].sort((a, b) => a - b);
    const returningContacts = Array.from(contactMessages.values()).filter((n) => n > 1).length;

    return {
      days: data.days,
      totals: {
        inbound,
        outbound,
        botReplies,
        agentReplies,
        conversations: conversations.length,
        newConversations: conversations.filter((c) => new Date(c.created_at) >= since).length,
        uniqueContacts: uniqueContacts.size,
        returningContacts,
        failed,
        botCoverage: pct(answeredThreads.size, answeredThreads.size + agentThreads.size),
        handoffRate: pct(agentThreads.size, answeredThreads.size + agentThreads.size),
        ruleHits: totalHits,
        avgBotResponseMs: sortedBot.length
          ? Math.round(sortedBot.reduce((a, x) => a + x, 0) / sortedBot.length)
          : null,
        medianBotResponseMs: quantile(sortedBot, 0.5),
        p95BotResponseMs: quantile(sortedBot, 0.95),
        avgAgentResponseMs: agentLatencies.length
          ? Math.round(agentLatencies.reduce((a, x) => a + x, 0) / agentLatencies.length)
          : null,
      },
      series,
      hourly,
      rules,
      triggerTypes,
      topContacts,
      responseBuckets,
    };
  });
